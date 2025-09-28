import sqlite3
import pandas as pd

# File locations
main_csv = '../data/processed/tenders_english_2merkato.csv'
cat_csv = '../data/processed/tenders_english_2merkato_categorized.csv'
db_path = '../server/data/processed/tenders.db'

# Load both CSVs
df_main = pd.read_csv(main_csv)
df_cat = pd.read_csv(cat_csv)

# Merge on URL (left join to keep all rows from main CSV)
df_merged = pd.merge(
    df_main,
    df_cat[['URL', 'Predicted_Category']],
    on='URL',
    how='left'
)

# Prepare final dataframe for DB
df_final = pd.DataFrame({
    "Title": df_merged["Title_clean"],
    "URL": df_merged["URL"],
    "Closing_Date": df_merged["Closing Date"],
    "Published_On": df_merged["Published On"],
    "Region": df_merged["Region"],
    "status": df_merged["Bidding Status"],       
    "description": df_merged["Description_clean"], 
    "tor_url": df_merged["TOR Download Link"],   
    "created_at": df_merged["Scrape Timestamp"], 
    "source": "2merkato",
    "Sector": df_merged["Predicted_Category"]
})
df_final = df_final.drop_duplicates(subset=["URL"])

# Connect to SQLite database
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create tenders table
cursor.execute("DROP TABLE IF EXISTS tenders")

cursor.execute("DROP TABLE IF EXISTS tenders")

# Create schema manually
cursor.execute('''
CREATE TABLE tenders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Title TEXT,
    URL TEXT UNIQUE,
    Closing_Date TEXT,
    Published_On TEXT,
    Region TEXT,
    status TEXT,
    description TEXT,
    tor_url TEXT,
    created_at TEXT,
    source TEXT,
    Sector TEXT
);
''')

# Insert data without dropping schema
df_final = df_final.head(20000) #limiting number of rows to save memory for Render Deployment
df_final.to_sql('tenders', conn, if_exists='append', index=False)

# Commit and close
conn.commit()
conn.close()

print("Data merged and loaded into tenders.db successfully.")
