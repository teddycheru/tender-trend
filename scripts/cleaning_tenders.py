import pandas as pd
import re
import html
from bs4 import BeautifulSoup
from unidecode import unidecode
from tqdm import tqdm

tqdm.pandas()

# ---------------------------
# Utility functions
# ---------------------------

def clean_html(text: str) -> str:
    if pd.isna(text):
        return ""
    try:
        text = BeautifulSoup(text, "lxml").get_text(separator=" ")
    except Exception:
        text = BeautifulSoup(text, "html.parser").get_text(separator=" ")
    return html.unescape(text)

def normalize_text(text: str) -> str:
    if pd.isna(text):
        return ""
    text = text.lower()
    text = re.sub(r"http\S+|www\S+|https\S+", " ", text)
    text = unidecode(text)
    text = re.sub(r"[^a-z0-9\s\.,;:!?\-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def detect_language(text: str) -> str:
    if pd.isna(text) or not text.strip():
        return "unknown"
    if re.search(r"[\u1200-\u137F]", text):
        return "amharic"
    return "english"

def clean_text_pipeline(text: str) -> str:
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
    first_amharic = True
    first_english = True

    amharic_file = "../data/processed/tenders_amharic.csv"
    english_file = "../data/processed/tenders_english.csv"

    for chunk in pd.read_csv(input_file, chunksize=chunksize, on_bad_lines="skip"):
        # Detect language
        chunk["Language"] = chunk["Title"].astype(str).apply(detect_language)

        # Clean columns
        for col in ["Title", "Description"]:
            chunk[f"{col}_clean"] = chunk[col].astype(str).progress_apply(clean_text_pipeline)

        # Write main cleaned CSV
        chunk.to_csv(output_file, mode="a", index=False, header=first_chunk)
        first_chunk = False

        # Filter and write Amharic tenders
        amharic_chunk = chunk[chunk["Language"] == "amharic"]
        if not amharic_chunk.empty:
            amharic_chunk.to_csv(amharic_file, mode="a", index=False, header=first_amharic)
            first_amharic = False

        # Filter and write English tenders
        english_chunk = chunk[chunk["Language"] == "english"]
        if not english_chunk.empty:
            english_chunk.to_csv(english_file, mode="a", index=False, header=first_english)
            first_english = False

    print(f"✅ Cleaning completed.")
    print(f"Saved full cleaned CSV to: {output_file}")
    print(f"Saved Amharic tenders to: {amharic_file}")
    print(f"Saved English tenders to: {english_file}")


if __name__ == "__main__":
    input_csv = "../data/raw/tenders_2merkato.csv"          # raw file
    output_csv = "../data/processed/tenders_clean_2merkato.csv"   # cleaned output
    clean_tenders_csv(input_csv, output_csv, chunksize=50000)  # smaller chunks for memory efficiency
