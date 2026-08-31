# India Airfare Intelligence Dashboard - Backend, Database & Scraper Engine

A production-grade **Node.js + Express.js + MongoDB + Puppeteer + node-cron** airfare intelligence engine and REST API for the **India Airfare Price Index & Intelligence Dashboard**, implementing the methodology from *Development of a Real-time Airfare Price Index for India through Automated Web Scraping of Airline and OTA Portals for Augmentation of the CPI*.

---

## 1. Quick Start

### Prerequisites
* **Node.js** (v18+)
* **MongoDB** (Local instance running at `mongodb://127.0.0.1:27017` or configured URI)

### Installation
```bash
npm install
```

### Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Import Base Datasets into MongoDB
```bash
# 1. Import Airport mappings (IATA code <-> City)
npm run import:airports

# 2. Import DGCA Passenger traffic records
npm run import:dgca

# 3. Import Historical base fare observations
npm run import:history

# 4. Seed initial route scrape jobs (BOM-DEL, BOM-BLR, etc.)
npm run seed:jobs
```

### Starting the Server & Scheduler
```bash
npm start
# or: node server/server.js
```
The server will:
1. Connect to MongoDB (`[DB] MongoDB connected`)
2. Start the Express REST API on `http://localhost:5000`
3. Boot the `node-cron` scraper scheduler (`[CRON] Scheduler started`)

---

## 2. Scraping Architecture: Automatic & On-Demand

The system supports **two distinct scraping mechanisms** sharing a single unified scraper service:

```text
                  ┌─────────────────────────────────────┐
                  │           TRIGGER SOURCE            │
                  │                                     │
                  │   A. Scheduled Cron (node-cron)     │
                  │   B. On-Demand User Search          │
                  │   C. Manual Admin API Trigger       │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │       UNIFIED SCRAPER SERVICE       │
                  │     (services/scraper.service.js)   │
                  │                                     │
                  │   • In-Flight Promise Deduplication │
                  │   • Status & Concurrency Locking    │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │          PUPPETEER SCRAPER          │
                  │      (scrapers/indigo.scraper.js)   │
                  │                                     │
                  │   • Indian Currency Parser (INR)    │
                  │   • Strict Resource Cleanup         │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │          MONGODB DATABASE           │
                  │                                     │
                  │   • FareObservation (New Records)   │
                  │   • ScrapeJob (Status Updates)      │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │     EXISTING CALCULATION ENGINE     │
                  │          (lib/engine.js)            │
                  │                                     │
                  │   • Route Medians & Base Prices     │
                  │   • DGCA Passenger Weights          │
                  │   • Weighted India Airfare Index    │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │       PERSIST INDEX SNAPSHOT        │
                  │      (models/IndexSnapshot.js)      │
                  └─────────────────────────────────────┘
```

---

## 3. Database-First Search & On-Demand Scraping Flow

When a user searches via `GET /api/search?q=...`:

1. **MongoDB Check**: The backend queries MongoDB for existing fare observations for the route.
2. **Freshness Evaluation**:
   * If observations exist and are newer than `SEARCH_DATA_MAX_AGE_MINUTES` (default: 60 min) $\rightarrow$ Returns database data immediately (`state: "DATABASE_FRESH"`, `scraped: false`).
3. **On-Demand Scraping**:
   * If data is missing or stale (> 60 min) $\rightarrow$ Automatically triggers Puppeteer for that route.
   * Concurrent requests for the same route/date/source join the in-flight scrape promise (preventing duplicate browsers).
   * Valid observations are inserted into MongoDB.
   * The existing calculation engine recalculates the index and saves an `IndexSnapshot`.
   * Fresh observations and updated index are returned to the user (`state: "SCRAPED"`, `scraped: true`).

---

## 4. API Endpoints

### Core Dashboard & Index Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service and MongoDB connection status |
| `GET` | `/api/dashboard` | Main aggregated dashboard payload |
| `GET` | `/api/index` | Current India Airfare Index value and metadata |
| `GET` | `/api/index/history` | Historical index trend from `IndexSnapshot` documents |
| `GET` | `/api/routes` | Route movements with sorting, filtering, and pagination |
| `GET` | `/api/routes/:route` | Detailed route inspection |
| `GET` | `/api/routes/:route/history` | Timestamped fare observations for a route |
| `GET` | `/api/search` | Database-first search + on-demand scraping (`?q=BOM-DEL&departureDate=2026-09-01`) |
| `GET` | `/api/data/status` | Live database metrics, total observations, and stream health |
| `GET` | `/api/data/quality` | Data quality audit, invalid records, and warnings |
| `POST` | `/api/refresh` | Force index recalculation from MongoDB |

### Scraper Management Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/scraper/status` | Live scraper status (running, current job, observations collected) |
| `POST` | `/api/scraper/run` | Manually trigger scrape for all jobs or a single `jobId` |
| `GET` | `/api/scraper/jobs` | List all configured route scrape jobs |
| `POST` | `/api/scraper/jobs` | Create a new scrape job target |
| `PATCH` | `/api/scraper/jobs/:id` | Enable, disable, or modify a scrape job |
| `DELETE` | `/api/scraper/jobs/:id` | Delete a scrape job |

---

## 5. CLI Commands

```bash
# Run calculation engine unit tests (32 tests)
npm test

# Run Express REST API & Database tests (17 tests)
npm run test:api

# Run scraper directly via CLI
npm run scrape

# Recalculate index directly via CLI from MongoDB
npm run index
```
