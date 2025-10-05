import psycopg2
from psycopg2.extras import RealDictCursor
import os

database_url = os.getenv('DATABASE_URL')
if not database_url:
    print("ERROR: DATABASE_URL not set. Export it first.")
    exit(1)

try:
    conn = psycopg2.connect(database_url)
    cursor = conn.cursor()

    # Check table existence
    cursor.execute("SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenders');")
    table_exists = cursor.fetchone()[0]
    print(f"Table 'tenders' exists: {table_exists}")
    

    if table_exists:
        # Count total rows
        cursor.execute("SELECT COUNT(*) FROM tenders;")
        total = cursor.fetchone()[0]
        print(f"Total rows in tenders: {total}")

        # Sample 5 rows
        cursor.execute("SELECT * FROM tenders LIMIT 5;")
        rows = cursor.fetchall()
        print("Sample rows:")
        for row in rows:
            print(row)

    cursor.close()
    conn.close()
    print("✅ Check complete.")
except psycopg2.Error as e:
    print(f"ERROR: Database connection or query failed: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")