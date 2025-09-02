# TenderTrend

A web scraping and analysis tool for tender opportunities from https://tender.2merkato.com. This project includes a Playwright-based web scraper, data processing scripts, and a Next.js/FastAPI web app.

## Directory Structure
- `scraper/`: Web scraping scripts using Playwright.
- `data/raw/`: Raw scraped data (CSV files).
- `data/processed/`: Cleaned data for analysis or web app.
- `server/`: FastAPI backend with SQLite database.
- `client/`: Next.js frontend for displaying tenders and trends.

## Setup
1. **Install Python dependencies**:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   playwright install