import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import os

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('server.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="TenderTrend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update to Vercel URL after deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Tender(BaseModel):
    id: int
    Title: str
    URL: str
    Closing_Date: str
    Published_On: str
    Region: str
    Sector: str
    status: str
    description: str
    tor_url: str
    created_at: str
    source: str

@app.get("/")
async def root():
    return {"message": "Welcome to TenderTrend API. Try /tenders for data."}

@app.get("/tenders")
async def get_tenders(
    region: Optional[str] = None,
    sector: Optional[str] = None,
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    issueDateStart: Optional[str] = None,
    issueDateEnd: Optional[str] = None,
    deadlineStart: Optional[str] = None,
    deadlineEnd: Optional[str] = None,
    sortBy: str = "Published_On",
    sortOrder: str = "desc",
    page: int = 1,
    per_page: int = 20
):
    logger.debug(f"Request for /tenders with params: region={region}, sector={sector}, keyword={keyword}, status={status}, sortBy={sortBy}, sortOrder={sortOrder}, page={page}, per_page={per_page}")
    try:
        db_path = os.path.join(os.path.dirname(__file__), 'data/processed/tenders.db')
        logger.debug(f"Connecting to database at: {db_path}")
        if not os.path.exists(db_path):
            logger.error(f"Database file {db_path} not found")
            raise HTTPException(status_code=500, detail="Database file not found")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tenders'")
        if not cursor.fetchone():
            logger.error("Table 'tenders' not found")
            raise HTTPException(status_code=500, detail="Table 'tenders' not found")
        
        count_query = "SELECT COUNT(*) FROM tenders WHERE 1=1"
        count_params = []
        if region:
            count_query += " AND Region = ?"
            count_params.append(region)
        if sector:
            count_query += " AND Sector = ?"
            count_params.append(sector)
        if keyword:
            count_query += " AND Title LIKE ?"
            count_params.append(f"%{keyword}%")
        if status and status != 'All':
            count_query += " AND status = ?"
            count_params.append(status)
        if issueDateStart:
            count_query += " AND Published_On >= ?"
            count_params.append(issueDateStart)
        if issueDateEnd:
            count_query += " AND Published_On <= ?"
            count_params.append(issueDateEnd)
        if deadlineStart:
            count_query += " AND Closing_Date >= ?"
            count_params.append(deadlineStart)
        if deadlineEnd:
            count_query += " AND Closing_Date <= ?"
            count_params.append(deadlineEnd)
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]

        query = "SELECT * FROM tenders WHERE 1=1"
        params = []
        if region:
            query += " AND Region = ?"
            params.append(region)
        if sector:
            query += " AND Sector = ?"
            params.append(sector)
        if keyword:
            query += " AND Title LIKE ?"
            params.append(f"%{keyword}%")
        if status and status != 'All':
            query += " AND status = ?"
            params.append(status)
        if issueDateStart:
            query += " AND Published_On >= ?"
            params.append(issueDateStart)
        if issueDateEnd:
            query += " AND Published_On <= ?"
            params.append(issueDateEnd)
        if deadlineStart:
            query += " AND Closing_Date >= ?"
            params.append(deadlineStart)
        if deadlineEnd:
            query += " AND Closing_Date <= ?"
            params.append(deadlineEnd)
        if sortBy in ['Published_On', 'Closing_Date', 'Title']:
            query += f" ORDER BY {sortBy} {sortOrder.upper()}"
        else:
            query += " ORDER BY Published_On DESC"
        query += " LIMIT ? OFFSET ?"
        params.extend([per_page, (page - 1) * per_page])

        logger.debug(f"Executing query: {query} with params: {params}")
        cursor.execute(query, params)
        tenders = cursor.fetchall()
        result = [
            {
                "id": t["id"], "Title": t["Title"], "URL": t["URL"], "Closing_Date": t["Closing_Date"],
                "Published_On": t["Published_On"], "Region": t["Region"], "status": t["status"],
                "description": t["description"], "tor_url": t["tor_url"], "created_at": t["created_at"],
                "source": t["source"], "Sector": t["Sector"]
            } for t in tenders
        ]
        logger.info(f"Fetched {len(tenders)} tenders, total: {total}")
        conn.close()
        return {"tenders": result, "total": total}
    except sqlite3.Error as e:
        logger.error(f"SQLite error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in /tenders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()
            logger.debug("Database connection closed")

@app.get("/trends/regions")
async def get_regions():
    logger.debug("Request for /trends/regions")
    try:
        db_path = os.path.join(os.path.dirname(__file__), 'data/processed/tenders.db')
        logger.debug(f"Connecting to database at: {db_path}")
        if not os.path.exists(db_path):
            logger.error(f"Database file {db_path} not found")
            raise HTTPException(status_code=500, detail="Database file not found")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Region FROM tenders WHERE Region IS NOT NULL")
        regions = [row["Region"] for row in cursor.fetchall()]
        conn.close()
        logger.info(f"Fetched {len(regions)} regions")
        return regions
    except sqlite3.Error as e:
        logger.error(f"SQLite error in /trends/regions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in /trends/regions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/trends/sectors")
async def get_sectors():
    logger.debug("Request for /trends/sectors")
    try:
        db_path = os.path.join(os.path.dirname(__file__), 'data/processed/tenders.db')
        logger.debug(f"Connecting to database at: {db_path}")
        if not os.path.exists(db_path):
            logger.error(f"Database file {db_path} not found")
            raise HTTPException(status_code=500, detail="Database file not found")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Sector FROM tenders WHERE Sector IS NOT NULL")
        sectors = [row["Sector"] for row in cursor.fetchall()]
        conn.close()
        logger.info(f"Fetched {len(sectors)} sectors")
        return sectors
    except sqlite3.Error as e:
        logger.error(f"SQLite error in /trends/sectors: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in /trends/sectors: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/trends/views")
async def get_views():
    logger.debug("Request for /trends/views")
    try:
        return ['regions', 'sectors', 'months', 'tenders']
    except Exception as e:
        logger.error(f"Unexpected error in /trends/views: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")