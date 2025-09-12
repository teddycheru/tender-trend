# cleaning_tenders.py

import pandas as pd
import re
import html
from bs4 import BeautifulSoup
from unidecode import unidecode
from tqdm import tqdm

tqdm.pandas()  # Progress bar for pandas apply

# ---------------------------
# Utility functions
# ---------------------------

def clean_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    if pd.isna(text):
        return ""
    try:
        text = BeautifulSoup(text, "lxml").get_text(separator=" ")
    except Exception:
        text = BeautifulSoup(text, "html.parser").get_text(separator=" ")
    text = html.unescape(text)
    return text


def normalize_text(text: str) -> str:
    """General text normalization (for English)."""
    if pd.isna(text):
        return ""

    # Convert to lowercase
    text = text.lower()

    # Remove URLs
    text = re.sub(r"http\S+|www\S+|https\S+", " ", text)

    # Remove non-ascii (accents → plain letters)
    text = unidecode(text)

    # Remove special characters except basic punctuation
    text = re.sub(r"[^a-z0-9\s\.,;:!?\-]", " ", text)

    # Collapse multiple spaces
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def detect_language(text: str) -> str:
    """Very simple heuristic to detect Amharic vs English."""
    if pd.isna(text) or not text.strip():
        return "unknown"
    # Amharic characters are in Unicode range 1200–137F
    if re.search(r"[\u1200-\u137F]", text):
        return "amharic"
    return "english"


def clean_text_pipeline(text: str) -> str:
    """Full cleaning pipeline for title/description."""
    text = clean_html(text)
    lang = detect_language(text)
    if lang == "english":
        text = normalize_text(text)
    return text


# ---------------------------
# Main cleaning script
# ---------------------------

def clean_tenders_csv(input_file: str, output_file: str, chunksize: int = 50000):
    print(f"Processing {input_file} in chunks of {chunksize} rows...")

    first_chunk = True

    for chunk in pd.read_csv(input_file, chunksize=chunksize, on_bad_lines="skip"):
        # Add language column
        chunk["Language"] = chunk["Title"].astype(str).apply(detect_language)

        # Clean selected columns
        for col in ["Title", "Description"]:
            chunk[f"{col}_clean"] = chunk[col].astype(str).progress_apply(clean_text_pipeline)

        # Write incrementally to avoid memory blowup
        chunk.to_csv(output_file, mode="a", index=False, header=first_chunk)
        first_chunk = False

    print(f"✅ Cleaning completed. Saved cleaned file to {output_file}")


if __name__ == "__main__":
    input_csv = "tenders.csv"          # raw file
    output_csv = "tenders_clean.csv"   # cleaned output
    clean_tenders_csv(input_csv, output_csv, chunksize=50000) # 50,000 lines at a time due to memory limitation