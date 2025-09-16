import pandas as pd
from sentence_transformers import SentenceTransformer, util
from tqdm import tqdm

# --- Configuration ---
input_csv = "../data/processed/tenders_english_2merkato.csv"        # input file
output_csv = "../data/processed/tenders_english2m_categorized.csv"  # output file
chunk_size = 50000                         # process in chunks
top_k = 3                                  # maximum categories per tender
threshold = 0.2                            # similarity threshold
keyword_override = "feasibility study"     # keyword to override primary categorization
override_category = "Feasibility Study"    # category to assign as primary when keyword is found

# --- Category list ---
categories = [
    "Organizational Development",
    "Gender Analysis",
    "Agriculture and Agro-Processing",
    "Corporate Development",
    "Management Consulting",
    "Accounting and Finance",
    "IT and Infrastructure",
    "Construction and Real Estate",
    "Education and Training",
    "Health and Nutrition",
    "Environment and Climate",
    "Legal and Regulatory",
    "Transport and Logistics",
    "Marketing and Communications",
    "Energy and Utilities",
    "Social Services",
    "Research and Analytics",
    "Public Sector Governance"
]

# --- Load model ---
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# --- Encode category embeddings once ---
category_embeddings = model.encode(categories, convert_to_tensor=True)

# --- Initialize output file ---
header_written = False

# --- Process CSV in chunks ---
for chunk_idx, chunk in enumerate(pd.read_csv(input_csv, chunksize=chunk_size)):
    print(f"\n🔹 Processing chunk {chunk_idx + 1}...")

    # Create text column
    chunk["text"] = chunk["Title_clean"].astype(str) + " " + chunk["Description_clean"].astype(str)

    # Encode tender texts in batch with progress bar
    tender_embeddings = model.encode(
        chunk["text"].tolist(),
        convert_to_tensor=True,
        show_progress_bar=True  # <--- built-in progress bar
    )

    multi_labels = []
    primary_labels = []

    # Iterate tenders with progress bar
    for tender_text, tender_embedding in tqdm(zip(chunk["text"], tender_embeddings), total=len(chunk), desc="Categorizing"):
        tender_text_lower = tender_text.lower()

        # Compute similarity with categories
        similarities = util.cos_sim(tender_embedding, category_embeddings)[0]

        # Sorted indices by similarity descending
        sorted_idx = similarities.argsort(descending=True)

        # Select top_k categories above threshold
        top_categories = [categories[j] for j in sorted_idx if similarities[j] >= threshold][:top_k]
        if not top_categories:
            top_categories = ["Uncategorized"]

        # Primary category = override if keyword found, else top similarity
        if keyword_override in tender_text_lower:
            primary_category = override_category
        else:
            primary_category = top_categories[0]

        multi_labels.append(top_categories)
        primary_labels.append(primary_category)

    # Add results to chunk dataframe
    chunk["Multi-label Categories"] = ["; ".join(x) for x in multi_labels]
    chunk["Primary Category"] = primary_labels

    # Append chunk to CSV
    chunk.to_csv(output_csv, mode="a", index=False, header=not header_written)
    header_written = True

    print(f"✅ Finished chunk {chunk_idx + 1}, saved to {output_csv}")