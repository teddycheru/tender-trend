from fastapi import FastAPI
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
import os
from contextlib import contextmanager
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection context manager
@contextmanager
def get_db_connection():
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME", "tenderlens"),
        user=os.getenv("DB_USER", "tenderlens"),
        password=os.getenv("DB_PASSWORD", "tenderlens"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432")
    )
    try:
        yield conn
    finally:
        conn.close()

# Existing endpoints with transaction management
@app.get("/trends/regions")
async def get_regions():
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT DISTINCT region FROM tenders WHERE region IS NOT NULL")
            regions = [row[0] for row in cursor.fetchall()]
            return regions

@app.get("/trends/sectors")
async def get_sectors():
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT DISTINCT predicted_category FROM tenders WHERE predicted_category IS NOT NULL")
            sectors = [row[0] for row in cursor.fetchall()]
            return sectors

@app.get("/tenders")
async def get_tenders(
    region: str = None,
    sector: str = None,
    keyword: str = None,
    status: str = None,
    publishedStart: str = None,
    publishedEnd: str = None,
    sortBy: str = "published_on",
    sortOrder: str = "asc",
    page: int = 1,
    per_page: int = 100
):
    valid_sort = {"published_on", "created_at", "closing_date", "title"}
    if sortBy not in valid_sort:
        sortBy = "published_on"

    offset = (page - 1) * per_page

    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            conditions = []
            params = []

            if region:
                conditions.append("region = %s")
                params.append(region)
            if sector:
                conditions.append("predicted_category = %s")
                params.append(sector)
            if keyword:
                conditions.append("(title ILIKE %s OR description ILIKE %s)")
                params.extend([f"%{keyword}%", f"%{keyword}%"])
            if status:
                conditions.append("status = %s")
                params.append(status)
            if publishedStart:
                conditions.append("published_on >= %s")
                params.append(publishedStart)
            if publishedEnd:
                conditions.append("published_on <= %s")
                params.append(publishedEnd)

            where_clause = " AND ".join(conditions)
            if where_clause:
                where_clause = "WHERE " + where_clause

            query = sql.SQL(f"""
                SELECT * FROM tenders
                {where_clause}
                ORDER BY {sortBy} { 'DESC' if sortOrder.lower() == 'desc' else 'ASC' }
                LIMIT %s OFFSET %s
            """)

            params.extend([per_page, offset])
            cursor.execute(query, params)
            tenders = cursor.fetchall()

    return {"tenders": tenders, "total": get_total_tenders()}

def get_total_tenders():
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM tenders")
            total = cursor.fetchone()[0]
            return total

@app.get("/trends/regions/counts")
async def get_region_counts():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT region, COUNT(*) AS count
                FROM tenders
                WHERE region IS NOT NULL
                GROUP BY region
            """)
            rows = cursor.fetchall()
            return rows

@app.get("/trends/sectors/counts")
async def get_sector_counts():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT predicted_category, COUNT(*) AS count
                FROM tenders
                WHERE predicted_category IS NOT NULL
                GROUP BY predicted_category
            """)
            rows = cursor.fetchall()
            return rows

@app.get("/trends/months/counts")
async def get_month_counts():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT 
                    EXTRACT(YEAR FROM published_on) AS year,
                    EXTRACT(MONTH FROM published_on) AS month,
                    COUNT(*) AS count
                FROM tenders
                WHERE published_on IS NOT NULL
                GROUP BY EXTRACT(YEAR FROM published_on), EXTRACT(MONTH FROM published_on)
            """)
            rows = cursor.fetchall()
            return rows

# No need for shutdown event since connections are managed per request