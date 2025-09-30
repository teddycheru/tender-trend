import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

def safe_parse_date(date_str):
    if not date_str or pd.isna(date_str):
        return None
    try:
        if isinstance(date_str, str):
            date_str = ''.join(c for c in date_str if not (c.isupper() and c not in 'APMT') or c.isdigit() or c in '-/,. :')
        for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%B %d, %Y', '%d %B %Y']:
            try:
                return pd.to_datetime(date_str, format=fmt, dayfirst=True).date()
            except ValueError:
                continue
        return pd.to_datetime(date_str, dayfirst=False).date()  # Fallback
    except (ValueError, TypeError):
        return None

# Directory containing CSV files
csv_dir = '../data/processed/'
csv_files = ['tenders_english_2merkato.csv', 'tenders_english_2merkato_categorized.csv']

# Read CSV files
dfs = [pd.read_csv(f'{csv_dir}{file}') for file in csv_files]
main_df = dfs[0]  # Detailed data
cat_df = dfs[1]   # Categorized data

# Merge horizontally on 'URL'
merged_df = pd.merge(main_df, cat_df, on='URL', how='left')

# Rename columns to match PostgreSQL schema
merged_df = merged_df.rename(columns={
    'Closing Date': 'Closing_Date',
    'Published On': 'Published_On',
    'Bidding Status': 'status',
    'TOR Download Link': 'tor_url',
    'Scrape Timestamp': 'created_at',
    'Description': 'description',
    'Title_clean_x': 'Title_clean'  # Prefer main_df's Title_clean if it exists
})
# Drop duplicate Title_clean if it comes from cat_df
if 'Title_clean_y' in merged_df.columns:
    merged_df = merged_df.drop(columns=['Title_clean_y'])

# Normalize description: collapse multiple newlines and strip trailing ones
merged_df['description'] = merged_df['description'].fillna('').apply(
    lambda x: '\n'.join(filter(None, (line.strip() for line in x.splitlines()))).rstrip()
)

# Remove duplicate rows based on URL to avoid cardinality violation
merged_df = merged_df.drop_duplicates(subset=['URL'], keep='last')

# Parse dates
merged_df['Closing_Date'] = merged_df['Closing_Date'].apply(safe_parse_date)
merged_df['Published_On'] = merged_df['Published_On'].apply(safe_parse_date)
merged_df['created_at'] = merged_df['created_at'].apply(safe_parse_date)

# Select and reorder columns for PostgreSQL insertion
columns = ['URL', 'Title', 'Closing_Date', 'Published_On', 'created_at', 'Region', 'status', 'description', 'tor_url', 'Language', 'Title_clean', 'Description_clean', 'Predicted_Category']
merged_df = merged_df[columns]

# Connect to PostgreSQL
pg_conn = psycopg2.connect(
    dbname="tenderlens",
    user="tenderlens",
    password="tenderlens",
    host="localhost"
)
pg_cursor = pg_conn.cursor()

# Create table (drop if exists to avoid constraint issues)
pg_cursor.execute("DROP TABLE IF EXISTS tenders")
pg_cursor.execute("""
    CREATE TABLE tenders (
        id SERIAL PRIMARY KEY,
        URL TEXT UNIQUE,
        Title TEXT,
        Closing_Date DATE,
        Published_On DATE,
        created_at DATE,
        Region TEXT,
        status TEXT,
        description TEXT,
        tor_url TEXT,
        Language TEXT,
        Title_clean TEXT,
        Description_clean TEXT,
        Predicted_Category TEXT
    )
""")

# Insert data with ON CONFLICT to handle duplicates
insert_query = """
    INSERT INTO tenders (URL, Title, Closing_Date, Published_On, created_at, Region, status, description, tor_url, Language, Title_clean, Description_clean, Predicted_Category)
    VALUES %s
    ON CONFLICT (URL) DO UPDATE
    SET Title = EXCLUDED.Title,
        Closing_Date = EXCLUDED.Closing_Date,
        Published_On = EXCLUDED.Published_On,
        created_at = EXCLUDED.created_at,
        Region = EXCLUDED.Region,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        tor_url = EXCLUDED.tor_url,
        Language = EXCLUDED.Language,
        Title_clean = EXCLUDED.Title_clean,
        Description_clean = EXCLUDED.Description_clean,
        Predicted_Category = EXCLUDED.Predicted_Category
"""
values = [tuple(row) for row in merged_df.to_numpy()]
execute_values(pg_cursor, insert_query, values)
pg_conn.commit()

print("✅ Data loaded from CSV files to PostgreSQL tenders table successfully.")

# Close connections
pg_cursor.close()
pg_conn.close()