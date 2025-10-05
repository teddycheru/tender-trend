#!/usr/bin/env python3
"""
Memory-safe CSV -> Postgres loader for Render (512MB).
- Stores categorized CSV in a disk-backed sqlite DB (indexed).
- Streams main CSV in chunks, enriches each chunk from sqlite, and
  upserts into Postgres using execute_values per chunk.
"""

import os
import sys
import csv
import sqlite3
import gc
import time
from pathlib import Path
import re

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# ----------------- CONFIG -----------------
CSV_DIR = Path('../data/processed')
MAIN_CSV = CSV_DIR / 'tenders_english_2merkato.csv'
CAT_CSV = CSV_DIR / 'tenders_english_2merkato_categorized.csv'
SQLITE_DB = Path('./_categories_cache.db')   # disk-backed cache for predicted categories
CHUNK_SIZE = 500                             # tune down if memory pressure remains
SQLITE_BATCH = 1000                          # inserts into sqlite in batches
SQLITE_IN_CLAUSE = 500                       # max items per "IN (...)" query to sqlite (<=999)
# Load Postgres URL from env (falls back to your example)
DATABASE_URL = os.getenv("DATABASE_URL")
LOG_FILE = Path("./load_progress.log")
# ------------------------------------------

# Postgres table schema columns (order matters for insert)
COLUMNS = ['URL', 'Title', 'Closing_Date', 'Published_On', 'created_at',
           'Region', 'status', 'description', 'tor_url', 'Language',
           'Title_clean', 'Description_clean', 'Predicted_Category']

# Helpful header-matching utils (case-insensitive)
def find_header(headers, keywords):
    """Return first header containing all keywords (list) or None."""
    low = [h.lower() if isinstance(h, str) else '' for h in headers]
    for h, lh in zip(headers, low):
        if all(k in lh for k in keywords):
            return h
    return None

def any_header(headers, substrs):
    """Return first header containing any of substrs"""
    low = [h.lower() if isinstance(h, str) else '' for h in headers]
    for h, lh in zip(headers, low):
        for s in substrs:
            if s in lh:
                return h
    return None

# ---------------- sqlite functions ----------------
def build_category_sqlite(cat_csv_path: Path, sqlite_path: Path):
    """
    Stream the categorized CSV into a disk-backed sqlite DB with table:
      categories(URL TEXT PRIMARY KEY, Predicted_Category TEXT)
    This avoids loading all categories into memory.
    """
    if sqlite_path.exists():
        try:
            sqlite_path.unlink()  # remove old cache
        except Exception:
            pass

    conn = sqlite3.connect(str(sqlite_path))
    cur = conn.cursor()
    cur.execute("CREATE TABLE categories (URL TEXT PRIMARY KEY, Predicted_Category TEXT)")
    conn.commit()

    # Open CSV with csv.DictReader for low-memory streaming
    with cat_csv_path.open('r', encoding='utf-8', errors='replace', newline='') as fh:
        reader = csv.DictReader(fh)
        headers = reader.fieldnames or []
        # Find which headers represent URL and Predicted_Category
        url_col = find_header(headers, ['url']) or any_header(headers, ['link', 'url'])
        pred_col = find_header(headers, ['predicted', 'category']) or any_header(headers, ['predicted', 'category'])
        if url_col is None:
            raise RuntimeError("Could not find a URL-like column in categorized CSV headers: " + repr(headers))
        if pred_col is None:
            # if there is no predicted column, we still build empty table (no classifications)
            print("Warning: Could not find Predicted_Category column in categorized CSV. SQLite will be empty.")
            conn.commit()
            cur.execute("CREATE INDEX IF NOT EXISTS idx_url ON categories(URL)")
            conn.commit()
            conn.close()
            return

        batch = []
        inserted = 0
        for row in reader:
            url = row.get(url_col, '').strip()
            pred = row.get(pred_col, None)
            if url == '':
                continue
            batch.append((url, pred))
            if len(batch) >= SQLITE_BATCH:
                cur.executemany("INSERT OR REPLACE INTO categories (URL, Predicted_Category) VALUES (?,?)", batch)
                conn.commit()
                inserted += len(batch)
                batch = []
        if batch:
            cur.executemany("INSERT OR REPLACE INTO categories (URL, Predicted_Category) VALUES (?,?)", batch)
            conn.commit()
            inserted += len(batch)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_url ON categories(URL)")
    conn.commit()
    cur.close()
    conn.close()
    print(f"[sqlite] Categories cached to {sqlite_path} (rows inserted ~{inserted})")


def fetch_predicted_map(sqlite_conn: sqlite3.Connection, urls):
    """Return a dict URL->Predicted_Category for the given list of URLs (queries in batches)."""
    results = {}
    cur = sqlite_conn.cursor()
    # split into batches to avoid sqlite param limit (default 999)
    for i in range(0, len(urls), SQLITE_IN_CLAUSE):
        batch = urls[i:i + SQLITE_IN_CLAUSE]
        placeholders = ','.join('?' * len(batch))
        query = f"SELECT URL, Predicted_Category FROM categories WHERE URL IN ({placeholders})"
        cur.execute(query, batch)
        for url, pred in cur.fetchall():
            results[url] = pred
    cur.close()
    return results

# ---------------- date cleaning (vectorized) ----------------
def clean_date_series(s: pd.Series) -> pd.Series:
    dt_series = pd.to_datetime(s, errors="coerce", dayfirst=True)
    return dt_series.apply(lambda x: x.date() if pd.notnull(x) else None)

# ---------------- main processing ----------------
def main():
    start_time = time.time()
    if not MAIN_CSV.exists():
        print("Main CSV not found:", MAIN_CSV)
        sys.exit(1)
    if not CAT_CSV.exists():
        print("Categorized CSV not found:", CAT_CSV)
        # still proceed (Predicted_Category will be None)
    print("Building sqlite cache of categorized CSV (on-disk)...")
    build_category_sqlite(CAT_CSV, SQLITE_DB)

    # connect sqlite for lookups
    sqlite_conn = sqlite3.connect(str(SQLITE_DB))

    # connect postgres
    print("Connecting to Postgres...")
    pg_conn = psycopg2.connect(DATABASE_URL)
    pg_cursor = pg_conn.cursor()

    # Recreate table
    print("Dropping and recreating tenders table (Postgres)...")
    pg_cursor.execute("""
        CREATE TABLE IF NOT EXISTS tenders (
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
    pg_conn.commit()

    insert_query = """
        INSERT INTO tenders (URL, Title, Closing_Date, Published_On, created_at, Region, status, description, tor_url, Language, Title_clean, Description_clean, Predicted_Category)
        VALUES %s
        ON CONFLICT (URL) DO NOTHING
    """

    print("Streaming and processing main CSV in chunks...")
    processed_rows = 0
    chunk_no = 0

    # Read main CSV in low-memory chunks. Use dtype=str to avoid pandas type inference memory spikes.
    for chunk in pd.read_csv(MAIN_CSV, chunksize=CHUNK_SIZE, dtype=str, encoding='utf-8', low_memory=True):
        chunk_no += 1
        print(f"Processing chunk #{chunk_no} (rows: {len(chunk)})")

        # --- normalize/rename columns only if present ---
        rename_map = {
            'Closing Date': 'Closing_Date',
            'Published On': 'Published_On',
            'Bidding Status': 'status',
            'TOR Download Link': 'tor_url',
            'Scrape Timestamp': 'created_at',
            'Description': 'description',
            'Title_clean': 'Title_clean'
        }
        # only rename keys that exist in chunk.columns
        real_rename = {k: v for k, v in rename_map.items() if k in chunk.columns}
        if real_rename:
            chunk = chunk.rename(columns=real_rename)

        # ensure all columns expected exist in this chunk (create missing with None)
        for col in COLUMNS:
            if col not in chunk.columns:
                chunk[col] = None  # create missing columns to keep order later

        # Keep only the columns we care about (reduce memory)
        # Ensure all expected columns exist
        for col in COLUMNS:
            if col not in chunk.columns:
                chunk[col] = None

        # Reorder columns strictly as COLUMNS
        chunk = chunk[COLUMNS]

        chunk = chunk[COLUMNS]  # reorder to canonical column order

        # Normalize description (strip empty lines)
        chunk['description'] = chunk['description'].fillna('').astype(str).apply(
            lambda x: '\n'.join(filter(None, (line.strip() for line in x.splitlines()))).rstrip()
        )

        # Clean dates vectorized -> ISO strings or None
        chunk['Closing_Date'] = clean_date_series(chunk['Closing_Date'])
        chunk['Published_On'] = clean_date_series(chunk['Published_On'])
        chunk['created_at'] = clean_date_series(chunk['created_at'])

        # Enrich Predicted_Category from sqlite cache
        urls = chunk['URL'].fillna('').astype(str).tolist()
        # prepare unique urls only (de-duplicate to reduce sqlite queries)
        unique_urls = list(dict.fromkeys([u for u in urls if u]))
        predicted_map = {}
        if unique_urls:
            predicted_map = fetch_predicted_map(sqlite_conn, unique_urls)

        # map predicted categories into chunk (fast vectorized map)
        chunk['Predicted_Category'] = chunk['URL'].map(predicted_map).where(chunk['URL'].notna(), None)

        # Drop duplicates in-this-chunk by URL (keep last)
        chunk = chunk.drop_duplicates(subset=['URL'], keep='last')

        # Replace NaN/NA with None (so psycopg2 sends NULL)
        chunk = chunk.where(pd.notnull(chunk), None).astype(object)

        # Convert to list of tuples for execute_values
        rows = [tuple(row) for row in chunk[COLUMNS].to_numpy()]

        if rows:
            # insert this chunk to Postgres
            try:
                execute_values(pg_cursor, insert_query, rows, page_size=1000)
                pg_conn.commit()
                processed_rows += len(rows)
                print(f"  -> inserted/upserted {len(rows)} rows (total so far: {processed_rows})")
                
                with LOG_FILE.open("a") as f:
                    f.write(f"{processed_rows} rows successfully loaded\n")
            except Exception as e:
                pg_conn.rollback()
                print("Postgres error inserting chunk:", e)
                # optionally print first few rows for debugging
                raise

        # free memory for this chunk
        del chunk, rows, unique_urls, predicted_map, urls
        gc.collect()

    print("All chunks processed. Closing connections.")
    pg_cursor.close()
    pg_conn.close()
    sqlite_conn.close()

    # remove sqlite cache if you want
    try:
        if SQLITE_DB.exists():
            SQLITE_DB.unlink()
            print("Removed temporary sqlite cache:", SQLITE_DB)
    except Exception:
        pass

    elapsed = time.time() - start_time
    print(f"✅ Done. Total rows processed: {processed_rows}. Elapsed: {elapsed:.1f}s")


if __name__ == '__main__':
    main()
