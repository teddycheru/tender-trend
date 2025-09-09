import pandas as pd
from sentence_transformers import SentenceTransformer, util

# --- Configuration ---
input_csv = "../processed/tenders_clean.csv"        # input file
output_csv = "../processed/tenders_categorized.csv"  # output file
top_k = 3                                # maximum categories per tender
threshold = 0.2                          # similarity threshold
keyword_override = "feasibility study"   # keyword to override primary categorization
override_category = "Feasibility Study"  # category to assign as primary when keyword is found

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

# --- Read tenders CSV and create text column ---
df = pd.read_csv(input_csv)
df["text"] = df["Title_clean"].astype(str) + " " + df["Description_clean"].astype(str)

# --- Encode category embeddings ---
category_embeddings = model.encode(categories, convert_to_tensor=True)

# --- Categorization ---
multi_labels = []
primary_labels = []

for tender_text in df["text"]:
    tender_text_lower = tender_text.lower()
    
    # Embedding-based similarity
    tender_embedding = model.encode(tender_text, convert_to_tensor=True)
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

# --- Add results to dataframe ---
df["Multi-label Categories"] = multi_labels
df["Primary Category"] = primary_labels

# --- Flatten multi-labels to comma-separated string ---
df["Multi-label Categories"] = df["Multi-label Categories"].apply(lambda x: ", ".join(x))

# --- Save to CSV ---
df.to_csv(output_csv, index=False)
print(f"Categorized tenders saved to {output_csv}")