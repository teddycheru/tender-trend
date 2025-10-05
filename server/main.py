from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import sql
import os
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, EmailStr, Field
import json
from fastapi.security import OAuth2PasswordBearer

load_dotenv()

app = FastAPI()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tender-trend.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable not set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# DB context
@contextmanager
def get_db_connection():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    try:
        yield conn
    finally:
        conn.close()

# Pydantic models
class UserRegister(BaseModel):
    first_name: str
    last_name: str
    username: str = Field(..., min_length=3, max_length=20)
    company_name: str
    company_description: str
    sectors: List[str]
    region_focus: List[str]
    company_size: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username_or_email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# Utility functions
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Authentication dependency
def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
            db_user = cursor.fetchone()
            if not db_user:
                raise credentials_exception
            return db_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Registration endpoint
@app.post("/auth/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user: UserRegister):
    hashed_pw = hash_password(user.password.strip())
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            try:
                # Insert into PostgreSQL text[] columns directly using Python lists
                cursor.execute(
                    """
                    INSERT INTO users 
                    (first_name, last_name, username, company_name, company_description, sectors, region_focus, company_size, email, password_hash)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        user.first_name,
                        user.last_name,
                        user.username,
                        user.company_name,
                        user.company_description,
                        user.sectors,           
                        user.region_focus,   
                        user.company_size,
                        user.email,
                        hashed_pw
                    )
                )
                new_user = cursor.fetchone()
                conn.commit()
            except psycopg2.errors.UniqueViolation as e:
                conn.rollback()
                if "username" in str(e):
                    raise HTTPException(status_code=400, detail="Username already exists")
                if "email" in str(e):
                    raise HTTPException(status_code=400, detail="Email already registered")
                raise HTTPException(status_code=400, detail="User already exists")
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # Generate token with username as sub
    access_token = create_access_token({"sub": new_user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

# Login endpoint
@app.post("/auth/login", response_model=Token)
def login(user: UserLogin):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM users WHERE email = %s OR username = %s",
                (user.username_or_email, user.username_or_email)
            )
            db_user = cursor.fetchone()
            if not db_user or not verify_password(user.password, db_user["password_hash"]):
                raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token({"sub": db_user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

# Add new public endpoints
@app.get("/public/regions/counts")
async def public_region_counts():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT region, COUNT(*) AS count
                FROM tenders
                WHERE region IS NOT NULL
                GROUP BY region
                ORDER BY count DESC
                LIMIT 10
            """)
            return cursor.fetchall()

@app.get("/public/sectors/counts")
async def public_sector_counts():
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT predicted_category, COUNT(*) AS count
                FROM tenders
                WHERE predicted_category IS NOT NULL
                GROUP BY predicted_category
                ORDER BY count DESC
                LIMIT 10
            """)
            return cursor.fetchall()

@app.get("/public/months/counts")
async def public_month_counts():
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
                ORDER BY year DESC, month DESC
                LIMIT 10
            """)
            results = cursor.fetchall()
            print("Raw month counts:", results)
            return results

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

            # Query for filtered count
            count_query = sql.SQL("SELECT COUNT(*) AS count FROM tenders {}").format(
                sql.SQL(where_clause) if where_clause else sql.SQL("")
            )
            cursor.execute(count_query, params)
            total = cursor.fetchone()['count']

            # Query for filtered tenders
            query = sql.SQL(f"""
                SELECT * FROM tenders
                {where_clause}
                ORDER BY {sortBy} {'DESC' if sortOrder.lower() == 'desc' else 'ASC'}
                LIMIT %s OFFSET %s
            """)
            params.extend([per_page, offset])
            cursor.execute(query, params)
            tenders = cursor.fetchall()

    return {"tenders": tenders, "total": total}

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

# Protected endpoint example
@app.get("/dashboard", response_model=dict)
async def dashboard(current_user: dict = Depends(get_current_user)):
    return {"message": f"Welcome, {current_user['username']}!", "user": current_user}