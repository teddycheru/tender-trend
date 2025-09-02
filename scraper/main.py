import asyncio
import csv
import os
import random
import time
import sqlite3
from dotenv import load_dotenv
import os

# Load environment variables from .env
load_dotenv()
EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")
BASE_URL = os.getenv("BASE_URL", "https://tender.2merkato.com")

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# Increase CSV field size limit
csv.field_size_limit(10_000_000)

# Global counter for duplicate links
duplicate_count = 0
DUPLICATE_LIMIT = 40  # Stop initial phase after 40 duplicates

def init_db(db_file):
    """Initialize SQLite database for storing tender URLs and page tracking."""
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tenders (
            url TEXT PRIMARY KEY,
            title TEXT,
            scrape_timestamp TEXT,
            page_num INTEGER
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pages (
            page_num INTEGER PRIMARY KEY,
            scraped_timestamp TEXT
        )
    ''')
    conn.commit()
    return conn

async def load_existing_urls(conn):
    """Load existing tender URLs from SQLite database."""
    cursor = conn.cursor()
    cursor.execute("SELECT url FROM tenders")
    existing_urls = {row[0] for row in cursor.fetchall()}
    print(f"Loaded {len(existing_urls)} existing URLs from database")
    return existing_urls

async def get_tender_count(conn):
    """Get the total number of tenders in the database."""
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM tenders")
    return cursor.fetchone()[0]

async def is_page_scraped(conn, page_num):
    """Check if a page has been fully scraped."""
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pages WHERE page_num = ?", (page_num,))
    return cursor.fetchone() is not None

async def get_last_scraped_page(conn):
    """Get the highest page number that has been fully scraped."""
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(page_num) FROM pages")
    result = cursor.fetchone()[0]
    return result if result is not None else 0

async def mark_page_scraped(conn, page_num):
    """Mark a page as fully scraped."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO pages (page_num, scraped_timestamp) VALUES (?, ?)",
        (page_num, time.strftime("%Y-%m-%d %H:%M:%S"))
    )
    conn.commit()

async def save_tender_to_db(conn, url, title, timestamp, page_num):
    """Save a tender URL to the database with its page number."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO tenders (url, title, scrape_timestamp, page_num) VALUES (?, ?, ?, ?)",
        (url, title, timestamp, page_num)
    )
    conn.commit()

async def find_resume_page(conn, base_url, page, log_file):
    """Find the page to resume scraping based on the last scraped page."""
    tender_count = await get_tender_count(conn)
    last_scraped_page = await get_last_scraped_page(conn)

    if tender_count == 0:
        print("No tenders in database, starting from page 1")
        return 1

    # Use the last scraped page + 1, or estimate from tender count
    estimated_pages_scraped = tender_count // 10
    if tender_count % 10 > 0:
        estimated_pages_scraped += 1
    resume_page = max(last_scraped_page + 1, estimated_pages_scraped - 1)
    print(f"Calculated resume page: {resume_page} (last scraped: {last_scraped_page}, tenders: {tender_count})")

    # Verify tenders on the resume page
    cursor = conn.cursor()
    cursor.execute("SELECT url FROM tenders WHERE page_num = ? LIMIT 1", (resume_page,))
    known_tender = cursor.fetchone()

    url = f"{base_url}/tenders?categories=&page={resume_page}®ions=&sources="
    try:
        await page.goto(url, timeout=60000)
        await page.wait_for_load_state('networkidle', timeout=40000)
        tenders = page.locator('h3 a')
        count = await tenders.count()
        print(f"Resume page {resume_page}: Found {count} tenders")

        # Log page content if empty
        if count == 0:
            content = await page.content()
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"Resume page {resume_page} empty, content:\n{content[:2000]}\n")
            await page.screenshot(path=f'resume_page_{resume_page}_debug.png')
            print(f"Resume page {resume_page}: Marked as scraped (empty)")
            await mark_page_scraped(conn, resume_page)
            return resume_page

        # Check for matching tenders
        for i in range(count):
            relative_link = await tenders.nth(i).get_attribute("href", timeout=5000)
            if relative_link:
                full_link = f"{base_url}{relative_link}" if relative_link.startswith('/') else f"{base_url}/{relative_link}"
                if known_tender and full_link == known_tender[0]:
                    print(f"Confirmed resume page {resume_page} (matched tender)")
                    return resume_page

        # No match, but process the page anyway
        print(f"Resume page {resume_page}: No matching tenders, proceeding to scrape")
        return resume_page

    except Exception as e:
        print(f"Error verifying resume page {resume_page}: {e}")
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"Error verifying resume page {resume_page}: {e}\n")
        await mark_page_scraped(conn, resume_page)
        return resume_page

async def scrape_page(page, base_url, page_num, csv_file, log_file, conn, existing_urls, initial_phase=True):
    """Scrape all tenders on a single page and save to CSV, stopping if too many duplicates in initial phase."""
    global duplicate_count
    try:
        url = f"{base_url}/tenders?categories=&page={page_num}®ions=&sources="
        for attempt in range(3):
            try:
                await page.goto(url, timeout=60000)
                await page.wait_for_load_state('networkidle', timeout=40000)
                break
            except (PlaywrightTimeoutError, Exception) as e:
                print(f"Page {page_num}: Attempt {attempt+1} failed to load page: {e}")
                if attempt == 2:
                    with open(log_file, 'a', encoding='utf-8') as f:
                        f.write(f"Page {page_num}: Failed after 3 attempts: {e}\n")
                    await mark_page_scraped(conn, page_num)
                    return not initial_phase
                await asyncio.sleep(2 ** attempt)

        # Check if page has tenders
        tenders = page.locator('h3 a')
        count = await tenders.count()
        if count == 0:
            print(f"Page {page_num}: No tenders found")
            content = await page.content()
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"Page {page_num}: No tenders, content:\n{content[:2000]}\n")
            await page.screenshot(path=f'page_{page_num}_debug.png')
            await mark_page_scraped(conn, page_num)
            return not initial_phase

        print(f"Page {page_num}: Found {count} tenders")

        # Skip fully scraped pages in resume phase
        if not initial_phase and await is_page_scraped(conn, page_num):
            print(f"Page {page_num}: Already fully scraped, skipping")
            return True

        # Extract tender links
        tender_links = []
        for i in range(count):
            try:
                title = await tenders.nth(i).inner_text(timeout=5000)
                relative_link = await tenders.nth(i).get_attribute("href", timeout=5000)
                if relative_link:
                    full_link = f"{base_url}{relative_link}" if relative_link.startswith('/') else f"{base_url}/{relative_link}"
                    if full_link not in existing_urls:
                        tender_links.append((title, full_link))
                    else:
                        if initial_phase:
                            duplicate_count += 1
                            print(f"Page {page_num}: Skipping duplicate tender {title} ({full_link}), Duplicate count: {duplicate_count}")
                            if duplicate_count >= DUPLICATE_LIMIT:
                                print(f"Reached {DUPLICATE_LIMIT} duplicate links, stopping initial phase")
                                return False
                        else:
                            print(f"Page {page_num}: Skipping duplicate tender {title} ({full_link})")
            except Exception as e:
                print(f"Page {page_num}: Error collecting link for tender {i+1}: {e}")
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(f"Page {page_num}: Error collecting link for tender {i+1}: {e}\n")

        # Scrape details for each tender
        page_data = []
        for title, full_link in tender_links:
            print(f"Page {page_num}: Scraping {title} ({full_link})")
            for attempt in range(3):
                try:
                    await page.goto(full_link, timeout=60000)
                    await page.wait_for_load_state('networkidle', timeout=40000)

                    # Scrape details
                    tender_title = "Not found"
                    title_locator = page.locator('h1.text-xl.font-semibold').first
                    if await title_locator.count():
                        tender_title = await title_locator.inner_text(timeout=10000)

                    closing_date = "Not found"
                    closing_date_locator = page.locator('div:has-text("Bid closing date") + div').first
                    if await closing_date_locator.count():
                        closing_date = await closing_date_locator.inner_text(timeout=5000)

                    published_on = "Not found"
                    published_on_locator = page.locator('div:has-text("Published on") + div').first
                    if await published_on_locator.count():
                        published_on_text = await published_on_locator.inner_text(timeout=5000)
                        if '(' in published_on_text and ')' in published_on_text:
                            published_on = published_on_text.split('(')[1].split(')')[0].strip()

                    region = "Not found"
                    region_locator = page.locator('div:has-text("Region") + div a').first
                    if await region_locator.count():
                        region = await region_locator.inner_text(timeout=5000)

                    bidding_status = "Not found"
                    bidding_status_locator = page.locator('div:has-text("Bidding") + div div.inline-flex').first
                    if await bidding_status_locator.count():
                        bidding_status = await bidding_status_locator.inner_text(timeout=5000)

                    description_html = "Not found"
                    description_truncated = "Not found"
                    description_locator = page.locator("div.overflow-x-auto").first
                    if await description_locator.count():
                        description_html = await description_locator.inner_html(timeout=10000)
                        description_truncated = description_html[:200] + "..."

                    tor_download_link = "Not found"
                    tor_download_locator = page.locator('a:has-text("Download")').first
                    if await tor_download_locator.count():
                        href = await tor_download_locator.get_attribute("href", timeout=5000)
                        if href:
                            tor_download_link = f"{base_url}{href}" if href.startswith('/') else href

                    # Add timestamp for when the bid was scraped
                    scrape_timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

                    print(f"Page {page_num}: Title: {tender_title}")
                    print(f"Page {page_num}: Closing Date: {closing_date}")
                    print(f"Page {page_num}: Published On: {published_on}")
                    print(f"Page {page_num}: Region: {region}")
                    print(f"Page {page_num}: Bidding Status: {bidding_status}")
                    print(f"Page {page_num}: Description Snippet: {description_truncated}")
                    print(f"Page {page_num}: TOR Download Link: {tor_download_link}")
                    print(f"Page {page_num}: Scraped On: {scrape_timestamp}\n")

                    page_data.append([tender_title, full_link, closing_date, published_on, region, bidding_status, description_html, tor_download_link, scrape_timestamp])
                    await save_tender_to_db(conn, full_link, tender_title, scrape_timestamp, page_num)
                    existing_urls.add(full_link)
                    break
                except (PlaywrightTimeoutError, Exception) as e:
                    print(f"Page {page_num}: Attempt {attempt+1} failed for {full_link}: {e}")
                    if attempt == 2:
                        print(f"Page {page_num}: Skipping {full_link} after 3 failures")
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"Page {page_num}: Failed to scrape {full_link}: {e}\n")
                        page_data.append([title, full_link, "Error", "Error", "Error", "Error", str(e), "Error", time.strftime("%Y-%m-%d %H:%M:%S")])
                    await asyncio.sleep(2 ** attempt)

            await asyncio.sleep(random.uniform(2, 3))

        # Save to CSV
        if page_data:
            with open(csv_file, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerows(page_data)
            print(f"Page {page_num}: Saved {len(page_data)} new tenders to {csv_file}")

        # Mark page as scraped
        await mark_page_scraped(conn, page_num)
        return True

    except Exception as e:
        print(f"Page {page_num}: Failed to process page: {e}")
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"Page {page_num}: Failed to process page: {e}\n")
        await mark_page_scraped(conn, page_num)
        return not initial_phase

async def update_csv_schema(csv_file, log_file):
    """Update CSV schema to include Scrape Timestamp if needed."""
    if not os.path.exists(csv_file):
        print(f"CSV file {csv_file} does not exist; will create new")
        return

    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            rows = list(reader)

        if not rows:
            print(f"CSV file {csv_file} is empty")
            return

        header = rows[0]
        if "Scrape Timestamp" in header:
            print(f"CSV schema already includes Scrape Timestamp")
            return

        print(f"Updating CSV schema to add Scrape Timestamp")
        header.append("Scrape Timestamp")
        for row in rows[1:]:
            row.append("Not found")

        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        print(f"CSV updated successfully")

    except Exception as e:
        print(f"Error updating CSV {csv_file}: {e}")
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"Error updating CSV {csv_file}: {e}\n")

async def main():
    global duplicate_count
    base_url = BASE_URL
    csv_file = "tenders.csv"
    db_file = "tenders.db"
    log_file = "scrape_errors.log"
    concurrent_pages = 4
    pages_per_session = 10000
    max_pages = 35000
    max_empty_pages = 10

    # Initialize database
    conn = init_db(db_file)

    # Update CSV schema
    await update_csv_schema(csv_file, log_file)

    # Initialize CSV if needed
    if not os.path.exists(csv_file):
        print(f"Creating new CSV {csv_file}")
        with open(csv_file, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["Title", "URL", "Closing Date", "Published On", "Region", "Bidding Status", "Description", "TOR Download Link", "Scrape Timestamp"])

    # Load existing URLs
    existing_urls = await load_existing_urls(conn)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )

        # Login
        page = await context.new_page()
        # Login
        page = await context.new_page()
        for attempt in range(3):
            try:
                print(f"Attempting login (Attempt {attempt+1})")
                await page.goto(f"{BASE_URL}/login", timeout=60000)
                await page.wait_for_load_state('networkidle', timeout=40000)
                email_locator = page.locator('#emailOrMobile')
                await email_locator.wait_for(state='visible', timeout=30000)
                await email_locator.fill(EMAIL)
                await page.fill('input[name="password"]', PASSWORD)
                login_button = page.locator('button:has-text("Login")')
                await login_button.wait_for(state='visible', timeout=10000)
                await login_button.click()
                await page.wait_for_url("**/tenders", timeout=60000)
                print("Login successful")
                break
            except Exception as e:
                print(f"Login attempt {attempt+1} failed: {e}")
                try:
                    content = await page.content()
                    await page.screenshot(path=f'login_debug_attempt_{attempt+1}.png')
                    with open(log_file, 'a', encoding='utf-8') as f:
                        f.write(f"Login attempt {attempt+1} failed: {e}\nPage content:\n{content[:2000]}\n")
                except:
                    print("Failed to log page content")
                if attempt == 2:
                    print("Login failed after 3 attempts; exiting")
                    with open(log_file, 'a', encoding='utf-8') as f:
                        f.write(f"Login failed after 3 attempts: {e}\n")
                    await browser.close()
                    conn.close()
                    return
                await asyncio.sleep(2 ** attempt)

        # Initial phase: Scrape from page 1 until 40 duplicates
        duplicate_count = 0
        page_num = 1
        initial_phase = True
        while page_num <= max_pages and duplicate_count < DUPLICATE_LIMIT:
            tasks = []
            batch_end = min(page_num + concurrent_pages - 1, max_pages)
            for p in range(page_num, batch_end + 1):
                page_task = await context.new_page()
                task = asyncio.create_task(scrape_page(page_task, base_url, p, csv_file, log_file, conn, existing_urls, initial_phase=True))
                tasks.append((task, page_task))

            # Wait for batch
            continue_scraping = False
            for task, page_task in tasks:
                result = await task
                await page_task.close()
                if result and duplicate_count < DUPLICATE_LIMIT:
                    continue_scraping = True

            if not continue_scraping:
                print(f"Stopping initial phase at page {page_num}: No more tenders or reached duplicate limit")
                break

            page_num += concurrent_pages
            await asyncio.sleep(random.uniform(3, 5))

        # If stopped due to duplicates, find resume page and continue
        if duplicate_count >= DUPLICATE_LIMIT:
            print("Switching to resume phase")
            resume_page = await find_resume_page(conn, base_url, page, log_file)
            print(f"Resuming scraping from page {resume_page}")

            # Resume phase: Scrape forward from resume_page
            page_num = resume_page
            pages_processed = 0
            empty_page_count = 0
            while page_num <= max_pages and pages_processed < pages_per_session and empty_page_count < max_empty_pages:
                tasks = []
                batch_end = min(page_num + concurrent_pages - 1, max_pages)
                for p in range(page_num, batch_end + 1):
                    if pages_processed >= pages_per_session:
                        break
                    page_task = await context.new_page()
                    task = asyncio.create_task(scrape_page(page_task, base_url, p, csv_file, log_file, conn, existing_urls, initial_phase=False))
                    tasks.append((task, page_task))
                    pages_processed += 1

                # Wait OSIfor batch
                continue_scraping = False
                for task, page_task in tasks:
                    result = await task
                    await page_task.close()
                    if result:
                        continue_scraping = True
                        empty_page_count = 0
                    else:
                        empty_page_count += 1
                        print(f"Empty page count: {empty_page_count}/{max_empty_pages}")

                if empty_page_count >= max_empty_pages:
                    print(f"Stopping at page {page_num}: {max_empty_pages} consecutive empty pages")
                    break

                page_num += concurrent_pages
                await asyncio.sleep(random.uniform(3, 5))

            print(f"Session complete: Processed {pages_processed} pages, reached page {page_num - 1}")

        await page.close()
        await browser.close()
    conn.close()

if __name__ == "__main__":
    asyncio.run(main())