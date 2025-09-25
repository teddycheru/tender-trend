import pandas as pd
import re
from sentence_transformers import SentenceTransformer, util
from tqdm.auto import tqdm

# -----------------------------
# Config
# -----------------------------
INPUT_CSV = "../data/processed/tenders_english_2merkato.csv"
OUTPUT_CSV = "../data/processed/tenders_english_2merkato_categorized.csv"
CHUNKSIZE = 50000
SEMANTIC_THRESHOLD = 0.35
MODEL_NAME = "all-mpnet-base-v2"

# -----------------------------
# Load embedding model
# -----------------------------
print("Loading embedding model:", MODEL_NAME)
model = SentenceTransformer(MODEL_NAME)

# -----------------------------
# Categories and Keywords
# -----------------------------
FINAL_CATEGORIES = {


    "IT Consultancy": "IT systems analysis, software architecture advice, ICT strategy, system integration, implementation advisory.",
    "Financial & Audit Consultancy": "Financial audits, accounting advisory, forensic audit, budget & financial management consultancy.",
    "Legal Consultancy": "Legal advisory, contract review, compliance, litigation support.",
    "Technical Consultancy": "Engineering consultancy, feasibility studies, technical assessments, construction supervision.",
    "IT and Infrastructure": "ICT equipment, electronics, computers, laptops, servers, networking, software licenses, cloud services, CCTV, scanners, tablets, POS, and IT maintenance.",
    "Digital Services": "Web portals, e-procurement, mobile/web app development, AI customization, cybersecurity, digital strategy and software implementation.",
    "Telecommunications": "Fiber optics, telecom devices, mobile networks, optical tools, network monitoring, and telecom infrastructure.",
    "Networking and Communications Equipment": "Routers, switches, firewalls, load balancers, contact center hardware, PBX, and VOIP systems.",
    "Office Equipment and Furniture": "Office desks, chairs, cabinets, shelves, filing systems, printers, photocopiers, toners, stationery and general office consumables.",
    "Printing and Publishing": "Books, reports, brochures, flyers, calendars, notebooks, printing services, promotional printing and publishing.",
    "Construction and Real Estate": "Building construction, roads, bridges, civil works, renovations, site development, housing and infrastructure projects.",
    "Building Materials": "Cement, steel, sanitary ware, doors, windows, tiles, concrete, pipes, roofing and construction raw materials.",
    "Surveying and Geospatial": "Total stations, GPS devices, mapping, land surveys, geotechnical investigations, borehole surveying and mapping services.",
    "Architecture and Design": "Architectural design, interior decoration, landscape design, blueprints, supervision, and design consulting.",
    "Facilities Management": "Janitorial services, security/guarding, parking services, property upkeep and facility management.",
    "Energy and Utilities": "Generators, transformers, power lines, electrical distribution, utility meters, diesel engines, fuses and breakers.",
    "Renewable Energy": "Solar panels, solar pumps, hydropower, wind turbines, hybrid systems, and green energy assessments.",
    "Oil, Gas and Petrochemicals": "Fuel depots, jet fuel supply, petroleum products, lubricants, pipelines and petrochemical services.",
    "Water and Sanitation": "Water supply schemes, boreholes, well drilling, latrines, wastewater treatment, irrigation and WASH projects.",
    "Cold Chain & Refrigeration": "Cold rooms, cold boxes, commercial refrigerators, freezers and cold-storage/cold-chain equipment.",
    "Health and Nutrition": "Public health programs, nutrition initiatives, hospital services, maternal & child health, wellness programs.",
    "Pharmaceuticals and Medical Supplies": "Medicines, vaccines, syringes, bandages, medical consumables, lab reagents and pharmaceutical supplies.",
    "Medical Equipment and Accessories": "Laboratory equipment, diagnostic machines (X-ray/CT/MRI), ICU equipment, surgical instruments, prosthetics and biomedical devices.",
    "Education and Training": "School construction, learning blocks, education materials, vocational training, curriculum and academic facilities.",
    "Training Services": "Workshops, capacity building, certification programs, teacher training and professional development services.",
    "Research and Development": "Feasibility studies, baseline surveys, lab research, R&D projects and scientific studies.",
    "Agriculture and Agro-Processing": "Seeds, fertilizers, tractors, irrigation pumps, livestock, poultry supplies, agro-processing equipment and farm inputs.",
    "Food and Beverage Services": "Catering, cooking kits/demonstration kits, food commodities, packaged foods, beverages and school feeding supplies.",
    "Fisheries and Aquaculture": "Fish farming, aquaculture equipment, fish ponds, seafood processing and fishing gear.",
    "Accounting and Finance": "Budget consulting, accounting books, auditing, fiscal services and financial advisory.",
    "Investment and Asset Management": "Investment advisory, asset management, treasury, wholesale financing and financial instruments.",
    "Organizational Development": "Governance reviews, HR services, institutional assessments and capacity-building programs.",
    "Corporate Services": "Rebranding, company registration, compliance, administrative and outsourcing services.",
    "Vehicles and Automotive": "Cars, motorcycles, trucks, spare parts, tyres, fleet procurement, vehicle maintenance and automotive accessories.",
    "Industrial Equipment and Machinery": "Pumps, generators, excavators, heavy machinery, electro-mechanical equipment and factory lines.",
    "Textiles and Apparel": "Uniforms, safety clothes, footwear, garments, sewing machines, textile materials and tailoring supplies.",
    "Mining and Minerals": "Mining equipment, mineral ore, drilling rigs, lab equipment for mining and extraction services.",
    "Chemicals and Materials": "Industrial chemicals, reagents, fertilizers, cleaning agents, laboratory kits and hazardous materials (if applicable).",
    "Metal and Metal Working": "Steel structures, welding, metal fabrication, aluminum products and metalworking services.",
    "Wood and Wood Working": "Timber, carpentry supplies, woodworking tools, furniture wood and carpentry services.",
    "Hospitality and Tourism": "Hotel services, lodging, hall rental, conference rooms, tourism packages, event catering and tourism services.",
    "Social Services": "NGO programs, humanitarian assistance, relief supplies, community development and social protection programs.",
    "Packaging and Labelling": "Packaging materials, boxes, labels, adhesive plasters, packaging equipment and labelling services."
}

FINAL_KEYWORD_MAP = {
    "Consultancy": ["consultancy", "consultant", "consulting", "advisory", "assessment", "study", "review", "evaluation"],  # Removed overlapping like 'audit', 'feasibility' to prefer specifics
    "Management Consultancy": ["business strategy", "market access", "export development", "organizational consulting", "organizational strategy", "process improvement", "management consultancy"],
    "IT Consultancy": ["it systems analysis", "software architecture", "ict strategy", "system integration", "implementation advisory", "it consultancy", "ict consultancy"],
    "Financial & Audit Consultancy": ["financial audit", "accounting advisory", "forensic audit", "budget consultancy", "financial management consultancy", "audit", "financial advisory", "financial consultancy"],
    "Legal Consultancy": ["legal advisory", "contract review", "compliance consultancy", "litigation support", "legal consultancy"],
    "Technical Consultancy": ["engineering consultancy", "feasibility study", "technical assessment", "construction supervision", "technical consultancy", "feasibility"],
    "Textiles and Apparel": ["uniform", "uniforms", "safety shoe", "safety shoes", "safety clothes", "glove", "garment", "fabric", "sewing", "footwear"],
    "Office Equipment and Furniture": ["furniture", "desk", "chair", "cabinet", "shelf", "filing", "stationery", "toner", "printer", "photocopier", "curtain", "workstation", "notebook", "pen", "marker", "envelope"],
    "Printing and Publishing": ["printing", "book", "brochure", "calendar", "greeting card", "flyer", "notebook", "promotional printing", "publishing"],
    "Medical Equipment and Accessories": ["medical equipment", "x-ray", "ct scan", "mri", "lab reagent", "diagnostic", "hospital bed", "surgical", "prosthetic", "orthotic", "biomedical", "medical device", "icu"],
    "Pharmaceuticals and Medical Supplies": ["medicine", "drug", "vaccine", "pharmaceutical", "syringe", "bandage", "reagent", "pharma"],
    "Water and Sanitation": ["water supply", "water well", "borehole", "drilling", "latrine", "toilet", "wastewater", "sewerage", "irrigation", "sludge", "well drilling"],
    "Cold Chain & Refrigeration": ["cold room", "cold box", "refrigerator", "freezer", "cold storage"],
    "Food and Beverage Services": ["cooking kit", "cooking demonstration", "catering", "food commodity", "salt", "rice", "tomato paste", "sugar", "beverage", "restaurant"],
    "Fisheries and Aquaculture": ["fish", "fish pond", "aquaculture", "fishing", "seafood"],
    "Construction and Real Estate": ["construction", "building", "road", "bridge", "civil work", "renovation", "site development", "apartment", "superstructure", "airfield"],
    "Building Materials": ["cement", "concrete", "tile", "door", "window", "sanitary", "roofing", "pipe", "steel"],
    "Surveying and Geospatial": ["total station", "gps", "levelling", "survey", "mapping", "geotechnical", "borehole survey"],
    "Architecture and Design": ["architectural", "interior", "design", "landscape", "plan", "blueprint", "supervision"],
    "Facilities Management": ["janitorial", "cleaning service", "sanitation service", "waste management", "guarding service","security guard", "manpower security", 
    "physical security", "parking service", "premises upkeep", "building upkeep", "facility upkeep", "building maintenance", "furniture maintenance", "office equipment maintenance", "ac maintenance", "hvac maintenance"],
    "Energy and Utilities": ["generator", "diesel generator", "transformer", "power line", "fuse", "circuit breaker", "power distribution", "utility meter", "diesel"],
    "Renewable Energy": ["solar", "solar panel", "solar pump", "wind turbine", "hydro", "hybrid pump", "renewable"],
    "Oil, Gas and Petrochemicals": ["fuel depot", "jet fuel", "lubricant", "petroleum"],
    "IT and Infrastructure": ["ict", "electronics", "computer", "laptop", "desktop", "server", "network", "software", "license", "scanner", "hard disk", "cctv", "tablet", "television", "tv", "monitor", "projector"],
    "Digital Services": ["web portal", "e-procurement", "app development", "ai", "digital strategy", "cybersecurity", "software implementation"],
    "Telecommunications": ["telecom", "fiber optic", "optical fiber", "mobile network", "internet service", "optical"],
    "Networking and Communications Equipment": ["router", "switch", "firewall", "load balancer", "contact center", "pbx", "pos"],
    "Vehicles and Automotive": ["vehicle", "car", "motorcycle", "truck", "tyre", "tire", "spare part", "fleet", "engine oil", "battery", "gps vehicle", "automobile", "sedan", "station wagon"],
    "Industrial Equipment and Machinery": ["machinery", "pump", "excavator", "dozer", "grader", "drill", "trenching machine", "heavy equipment", "air conditioner"],
    "Mining and Minerals": ["mining", "mineral", "ore", "drilling rig"],
    "Chemicals and Materials": ["chemical", "reagent", "fertilizer", "cleaning agent", "sanitizer", "kit"],
    "Metal and Metal Working": ["steel", "welding", "metal fabrication", "aluminum"],
    "Wood and Wood Working": ["wood", "timber", "carpentry", "woodworking"],
    "Hospitality and Tourism": ["hotel", "hall rent", "hall rental", "lodge", "resort", "conference room", "tourism", "event organizing"],
    "Social Services": ["project", "ngo", "humanitarian", "relief", "program", "community development"],
    "Packaging and Labelling": ["packaging", "labelling", "label", "box", "adhesive plaster", "shelf"],
    "Accounting and Finance": ["budget", "financial mechanism", "accounting", "audit", "auditing", "financial"],
    "Investment and Asset Management": ["treasury bill", "investment", "asset management", "wholesale financing"],
    "Organizational Development": ["governance review", "hr", "institutional assessment", "capacity building"],
    "Corporate Services": ["rebranding", "company registration", "compliance", "administrative service"]
}

KEYWORD_PRIORITY = list(FINAL_CATEGORIES.keys())

# Define consultancy and general subsets
CONSULTANCY_CATEGORIES = [
    "Technical Consultancy", "Legal Consultancy", "Financial & Audit Consultancy", 
    "IT Consultancy", "Management Consultancy", "Consultancy"  # Specifics before general
]
GENERAL_CATEGORIES = [cat for cat in FINAL_CATEGORIES if cat not in CONSULTANCY_CATEGORIES]

# Boilerplate patterns (expanded with more from examples)
BOILERPLATE_PATTERNS = [
    r"invites?\s+eligible\s+bidders?\s+for\s+the\s+procurement\s+of",
    r"now\s+invites?\s+sealed\s+bids?\s+from\s+eligible",
    r"would\s+like\s+to\s+invite\s+interested\s+and\s+eligible",
    r"invites\s+interested\s+and\s+eligible",
    r"seeks\s+expressions?\s+of\s+interest",
    r"notify\s+tender\s+award\s+on",
    r"intends?\s+to\s+apply\s+part\s+of\s+the\s+proceeds",
    r"has\s+received\s+financing\s+from",
    r"invites\s+sealed\s+bids?\s+from",
    r"we\s+invite\s+you\s+to\s+submit\s+a\s+proposal",
    r"would\s+like\s+to\s+prequalify",
    r"seeking\s+a\s+service\s+provider\s+for",
    r"would\s+like\s+to\s+hire",
    r"looks\s+for\s+consultancy\s+service\s+for",
    r"here\s+now\s+invites\s+sealed\s+bids?\s+from",
    r"invites\s+to\s+all\s+interested\s+&\s+eligible\s+bidders/suppliers\s+for\s+the\s+purchase\s+of"
]
BOILERPLATE_RE = re.compile("|".join(BOILERPLATE_PATTERNS), flags=re.IGNORECASE)
CONSULTANCY_RE = re.compile(
    r"\b(consult(ancy|ant|ants|ing)?|advis(or|ory|ing)?|evaluation|assessment|feasibility|review|audit)\b",
    re.IGNORECASE
)

# -----------------------------
# Helper functions
# -----------------------------
def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    x = text.lower()
    x = re.sub(r"[\"\']", " ", x)
    x = re.sub(r"\d+", " ", x)
    x = re.sub(r"[^a-z0-9\s\-]", " ", x)
    x = re.sub(r"\s+", " ", x).strip()
    return x

def extract_project_text(title: str) -> str:
    """Strip organization name using boilerplate and keep project portion."""
    match = BOILERPLATE_RE.search(title)
    if match:
        return title[match.end():].strip()
    return title

def keyword_forced_category(text, keyword_map, keyword_priority=None):
    text = text.lower()
    matches = []
    cats = keyword_priority if keyword_priority else keyword_map.keys()
    for cat in cats:
        kws = keyword_map.get(cat, [])
        for kw in kws:
            if re.search(r'\b' + re.escape(kw.lower()) + r'\b', text):
                matches.append((cat, len(kw)))
    if matches:
        # pick the keyword with the longest match
        matches.sort(key=lambda x: x[1], reverse=True)
        return matches[0][0]
    return None

def categorize_row(title: str, model, category_embeddings, category_names,
                   final_keyword_map, keyword_priority, semantic_threshold=0.35) -> str:
    """Categorize tender after boilerplate stripping and consultancy detection."""
    project_text = extract_project_text(title)
    cleaned_title = clean_text(project_text)

    is_consultancy = bool(CONSULTANCY_RE.search(cleaned_title))

    # 1. Keyword forced
    forced = keyword_forced_category(cleaned_title, final_keyword_map, keyword_priority)
    if forced:
        return f"Consultancy - {forced}" if is_consultancy else forced

    # 2. Semantic similarity fallback
    text_emb = model.encode(cleaned_title, convert_to_tensor=True)
    sims = util.cos_sim(text_emb, category_embeddings).flatten()
    best_idx = int(sims.argmax())
    if sims[best_idx] < semantic_threshold:
        return "Consultancy - Uncategorized" if is_consultancy else "Uncategorized"

    return f"Consultancy - {category_names[best_idx]}" if is_consultancy else category_names[best_idx]

# -----------------------------
# Precompute category embeddings
# -----------------------------
print("Precomputing category embeddings...")
category_names = list(FINAL_CATEGORIES.keys())
category_texts = [FINAL_CATEGORIES[cat] for cat in category_names]
category_embeddings = model.encode(category_texts, convert_to_tensor=True)

# -----------------------------
# Process CSV in chunks
# -----------------------------
def process_chunk(df_chunk):
    df_chunk["Predicted_Category"] = df_chunk["Title_clean"].apply(
        lambda t: categorize_row(
            t,
            model=model,
            category_embeddings=category_embeddings,
            category_names=category_names,
            final_keyword_map=FINAL_KEYWORD_MAP,
            keyword_priority=KEYWORD_PRIORITY,
            semantic_threshold=SEMANTIC_THRESHOLD
        )
    )
    return df_chunk

def run_pipeline():
    reader = pd.read_csv(INPUT_CSV, chunksize=CHUNKSIZE)
    total_chunks = (sum(1 for _ in open(INPUT_CSV)) // CHUNKSIZE) + 1
    first_chunk = True

    for i, chunk in enumerate(reader, start=1):
        print(f"Processing chunk {i}/{total_chunks}", end="\r")

        # Clean titles
        chunk["Title_clean"] = chunk["Title"].apply(clean_text)

        # Process chunk to assign categories
        chunk_result = process_chunk(chunk)

        # Keep only required columns
        output_chunk = chunk_result[["URL", "Title_clean", "Predicted_Category"]]

        # Save to CSV
        if first_chunk:
            output_chunk.to_csv(OUTPUT_CSV, index=False, mode="w")
            first_chunk = False
        else:
            output_chunk.to_csv(OUTPUT_CSV, index=False, mode="a", header=False)

    print("\nCategorization complete. Saved to", OUTPUT_CSV)

if __name__ == "__main__":
    run_pipeline()