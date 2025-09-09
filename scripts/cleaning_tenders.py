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
        # Try lxml if available
        text = BeautifulSoup(text, "lxml").get_text(separator=" ")
    except Exception:
        # Fallback to built-in parser
        text = BeautifulSoup(text, "html.parser").get_text(separator=" ")
    text = html.unescape(text)
    return text

def normalize_text(text: str) -> str:
    """General text normalization."""
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

def clean_text_pipeline(text: str) -> str:
    """Full cleaning pipeline for title/description."""
    text = clean_html(text)
    text = normalize_text(text)
    return text

# ---------------------------
# Main cleaning script
# ---------------------------

def clean_tenders_csv(input_file: str, output_file: str):
    print(f"Loading {input_file}...")
    df = pd.read_csv(input_file)

    # Columns to clean
    text_columns = ["Title", "Description"]

    for col in text_columns:
        print(f"Cleaning column: {col}")
        df[f"{col}_clean"] = df[col].progress_apply(clean_text_pipeline)

    # Optional: fill missing with empty string for other text fields
    df.fillna("", inplace=True)

    print(f"Saving cleaned file to {output_file}")
    df.to_csv(output_file, index=False)

    return df

if __name__ == "__main__":
    input_csv = "../data/raw/tenders.csv"
    output_csv = "../data/processed/tenders_clean.csv"
    df_clean = clean_tenders_csv(input_csv, output_csv)
    print("Cleaning completed ✅")
