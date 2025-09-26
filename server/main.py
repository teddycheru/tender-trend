import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
from databases import Database

# Configure logging
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

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/processed/tenders.db")
database = Database(DATABASE_URL)

class Tender(BaseModel):
    id: int
    Title: str
    Description: str
    Category_Label: str
    URL: str
    Closing_Date: str
    Published_On: str
    Region: str
    Bidding_Status: str
    TOR_Download_Link: str
    Scrape_Timestamp: str
    Issuer: Optional[str] = None

@app.on_event("startup")
async def startup():
    try:
        await database.connect()
        logger.info("Database connected successfully")
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

@app.get("/")
async def root():
    return {"message": "Welcome to TenderTrend API. Try /tenders for data."}

@app.get("/tenders", response_model=List[Tender])
async def get_tenders(
    region: Optional[str] = None,
    category: Optional[str] = None,
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
    logger.debug(f"Request for /tenders with params: region={region}, category={category}, keyword={keyword}, status={status}, sortBy={sortBy}, sortOrder={sortOrder}, page={page}, per_page={per_page}")
    try:
        # Build query for counting total
        count_query = "SELECT COUNT(*) FROM tenders WHERE 1=1"
        count_params = {}
        if region:
            count_query += " AND Region = :region"
            count_params["region"] = region
        if category:
            count_query += " AND Category_Label = :category"
            count_params["category"] = category
        if keyword:
            count_query += " AND Title LIKE :keyword"
            count_params["keyword"] = f"%{keyword}%"
        if status and status != 'All':
            count_query += " AND Bidding_Status = :status"
            count_params["status"] = status
        if issueDateStart:
            count_query += " AND Published_On >= :issueDateStart"
            count_params["issueDateStart"] = issueDateStart
        if issueDateEnd:
            count_query += " AND Published_On <= :issueDateEnd"
            count_params["issueDateEnd"] = issueDateEnd
        if deadlineStart:
            count_query += " AND Closing_Date >= :deadlineStart"
            count_params["deadlineStart"] = deadlineStart
        if deadlineEnd:
            count_query += " AND Closing_Date <= :deadlineEnd"
            count_params["deadlineEnd"] = deadlineEnd

        total = await database.fetch_val(count_query, count_params)

        # Build query for paginated results
        query = "SELECT * FROM tenders WHERE 1=1"
        params = {}
        if region:
            query += " AND Region = :region"
            params["region"] = region
        if category:
            query += " AND Category_Label = :category"
            params["category"] = category
        if keyword:
            query += " AND Title LIKE :keyword"
            params["keyword"] = f"%{keyword}%"
        if status and status != 'All':
            query += " AND Bidding_Status = :status"
            params["status"] = status
        if issueDateStart:
            query += " AND Published_On >= :issueDateStart"
            params["issueDateStart"] = issueDateStart
        if issueDateEnd:
            query += " AND Published_On <= :issueDateEnd"
            params["issueDateEnd"] = issueDateEnd
        if deadlineStart:
            query += " AND Closing_Date >= :deadlineStart"
            params["deadlineStart"] = deadlineStart
        if deadlineEnd:
            query += " AND Closing_Date <= :deadlineEnd"
            params["deadlineEnd"] = deadlineEnd
        if sortBy in ['Published_On', 'Closing_Date', 'Title']:
            query += f" ORDER BY {sortBy} {sortOrder.upper()}"
        else:
            query += " ORDER BY Published_On DESC"
        query += " LIMIT :per_page OFFSET :offset"
        params["per_page"] = per_page
        params["offset"] = (page - 1) * per_page

        logger.debug(f"Executing query: {query} with params: {params}")
        tenders = await database.fetch_all(query, params)
        logger.info(f"Fetched {len(tenders)} tenders, total: {total}")
        return {"tenders": tenders, "total": total}
    except Exception as e:
        logger.error(f"Database query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/trends/regions")
async def get_regions():
    logger.debug("Request for /trends/regions")
    try:
        query = "SELECT DISTINCT Region FROM tenders WHERE Region IS NOT NULL"
        regions = await database.fetch_all(query)
        logger.info(f"Fetched {len(regions)} regions")
        return [row["Region"] for row in regions]
    except Exception as e:
        logger.error(f"Database query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/trends/sectors")
async def get_sectors():
    logger.debug("Request for /trends/sectors")
    try:
        query = "SELECT DISTINCT Category_Label FROM tenders WHERE Category_Label IS NOT NULL"
        sectors = await database.fetch_all(query)
        logger.info(f"Fetched {len(sectors)} sectors")
        return [row["Category_Label"] for row in sectors]
    except Exception as e:
        logger.error(f"Database query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/trends/views")
async def get_views():
    logger.debug("Request for /trends/views")
    try:
        return ['regions', 'sectors', 'months', 'tenders']
    except Exception as e:
        logger.error(f"Unexpected error in /trends/views: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
