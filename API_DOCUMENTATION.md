# India Airfare Intelligence & CPI Augmentation API
## Frontend Integration Specification & Complete API Reference

> **Base URL:** `http://localhost:5000`  
> **API Mount Path:** `/api`  
> **Content-Type:** `application/json`  
> **CORS Policy:** Permissive for `http://localhost:*` and configured `FRONTEND_URL` (default: `http://localhost:3000`), `credentials: true`.  
> **Active Providers:** **Air India**, **Agoda**, **IRCTC Air**  
> **Interactive Tester:** [http://localhost:5000/api-tester](http://localhost:5000/api-tester)  

---

## Table of Contents

1. [Standard Response Envelope](#1-standard-response-envelope)
2. [Quick Route Directory](#2-quick-route-directory)
3. [Search & Progressive Background Scraping (Primary Frontend Endpoint)](#3-search--progressive-background-scraping)
   - [GET /api/search](#get-apisearch)
   - [GET /api/search/poll](#get-apisearchpoll)
   - [GET /api/search/session/:id](#get-apisearchsessionid)
4. [Route Intelligence Endpoints](#4-route-intelligence-endpoints)
   - [GET /api/routes](#get-apiroutes)
   - [GET /api/routes/:route](#get-apiroutesroute)
   - [GET /api/routes/:route/history](#get-apiroutesroutehistory)
5. [Airfare Index & Master Overview Endpoints](#5-airfare-index--master-overview-endpoints)
   - [GET /api/index](#get-apiindex)
   - [GET /api/index/history](#get-apiindexhistory)
   - [GET /api/dashboard](#get-apidashboard)
6. [CPI Augmentation & Macro-Inflation Endpoints](#6-cpi-augmentation--macro-inflation-endpoints)
   - [GET /api/cpi (or /api/cpi/summary)](#get-apicpi-or-get-apicpisummary)
   - [GET /api/cpi/comparison](#get-apicpicomparison)
   - [GET /api/cpi/decomposition (or /api/cpi/routes)](#get-apicpidecomposition-or-get-apicpiroutes)
   - [GET /api/cpi/simulate](#get-apicpisimulate)
7. [System, Scraper & Data Pipeline Endpoints](#7-system-scraper--data-pipeline-endpoints)
   - [GET /api/health](#get-apihealth)
   - [POST /api/refresh](#post-apirefresh)
   - [GET /api/scraper/status](#get-apiscraperstatus)
   - [GET /api/scraper/jobs](#get-apiscraperjobs)
   - [GET /api/data/status](#get-apidatastatus)
   - [GET /api/data/quality](#get-apidataquality)
8. [Complete TypeScript Type Definitions](#8-complete-typescript-type-definitions)
9. [Frontend React Hooks & Axios Integration Examples](#9-frontend-react-hooks--axios-integration-examples)

---

## 1. Standard Response Envelope

All API endpoints return JSON conforming to consistent envelopes.

### Success Response Envelope
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "ERROR_IDENTIFIER_CODE",
    "message": "Human-readable explanation of the error."
  }
}
```

---

## 2. Quick Route Directory

| # | Method | Endpoint | Category | Description |
|---|:---|:---|:---|:---|
| 1 | `GET` | `/api/search` | Search | **Instant database-first search** + starts background scrape |
| 2 | `GET` | `/api/search/poll` | Search | **Progressive polling** for live streaming flight observations |
| 3 | `GET` | `/api/search/session/:id`| Search | Fetch status and progress of an active background scrape |
| 4 | `GET` | `/api/routes` | Routes | List all tracked corridors with volume weights & sorting |
| 5 | `GET` | `/api/routes/:route` | Routes | Detailed route inspection, 3-way price comparison & observations |
| 6 | `GET` | `/api/routes/:route/history`| Routes | Historical spot fare points for line charts |
| 7 | `GET` | `/api/index` | Index | Headline composite India Airfare Index value (Base 100) |
| 8 | `GET` | `/api/index/history` | Index | Historical time-series points of the national index |
| 9 | `GET` | `/api/dashboard` | Dashboard | Main aggregated dashboard overview payload |
| 10 | `GET` | `/api/cpi/summary` | CPI | Macro-inflation nowcast summary & CPI weights |
| 11 | `GET` | `/api/cpi/comparison`| CPI | Airfare Index vs Headline MOSPI CPI time-series |
| 12 | `GET` | `/api/cpi/decomposition`| CPI | Route-level contribution to Headline & Transport CPI |
| 13 | `GET` | `/api/cpi/simulate` | CPI | Elasticity simulation (e.g. `?shock=10`) |
| 14 | `GET` | `/api/health` | System | Healthcheck and MongoDB connection status |
| 15 | `POST` | `/api/refresh` | System | Recalculates master index and invalidates cache |
| 16 | `GET` | `/api/scraper/status` | Scraper | Runtime status of background scraper workers |
| 17 | `GET` | `/api/scraper/jobs` | Scraper | Active and scheduled scraping targets |
| 18 | `GET` | `/api/data/status` | Data | Pipeline status, collection record counts |
| 19 | `GET` | `/api/data/quality` | Data | Data quality metrics, audits and warnings |

---

## 3. Search & Progressive Background Scraping

The search architecture provides **instant responses (<100ms)** from MongoDB while running multi-provider scraping (**Air India**, **Agoda**, and **IRCTC Air**) in the background.

### `GET /api/search`
Instant Database-First flight search with progressive background scraper integration.

- **Query Parameters:**

| Parameter | Type | Required | Default | Description / Example |
| :--- | :--- | :--- | :--- | :--- |
| `q` or `query` | `string` | Conditional* | `""` | Query text: `"DEL-BOM"`, `"Mumbai to Chennai"`, `"BOM MAA"`, `"Agoda DEL BLR"`, `"IRCTC BOM DEL"` |
| `origin` | `string` | Conditional* | `""` | Direct 3-letter IATA code (e.g. `"BOM"`) |
| `destination` | `string` | Conditional* | `""` | Direct 3-letter IATA code (e.g. `"MAA"`) |
| `departureDate`| `string` | No | Today | Departure date in `YYYY-MM-DD` |
| `days` | `number` | No | `30` | Horizon in days for forward calendar scraping (default: 30) |
| `source` | `string` | No | `"all"` | Provider filter: `"all"`, `"Air India"`, `"Agoda"`, `"IRCTC Air"` |
| `rescrape` | `boolean`| No | `false` | Set to `true` to force trigger fresh background scraper |

*\*Note: Either `q` OR both `origin` and `destination` must be provided.*

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "query": "BOM-MAA",
  "data": {
    "source": "database",
    "scraped": false,
    "isScrapingInProgress": false,
    "sessionId": null,
    "sessionProgress": null,
    "state": "DATABASE_FRESH",
    "route": "BOM-MAA",
    "observationsCount": 7760,
    "latestScrapedAt": "2026-08-31T05:30:00.000Z",
    "priceComparison": {
      "providers": {
        "Agoda": {
          "status": "ok",
          "observationsCount": 1183,
          "minFare": 5647,
          "maxFare": 17421,
          "medianFare": 6652,
          "meanFare": 7333.02
        },
        "Air India": {
          "status": "ok",
          "observationsCount": 1920,
          "minFare": 14690,
          "maxFare": 22043,
          "medianFare": 14690,
          "meanFare": 15078.55
        },
        "IRCTC Air": {
          "status": "ok",
          "observationsCount": 4657,
          "minFare": 6034,
          "maxFare": 158940,
          "medianFare": 9682,
          "meanFare": 11726.02
        }
      },
      "cheapest": "Agoda",
      "spread": {
        "cheapestProvider": "Agoda",
        "expensiveProvider": "Air India",
        "differenceInr": 9043,
        "differencePercent": 61.6
      },
      "comparedAt": "2026-08-31T05:36:10.946Z"
    },
    "routeIndexEngine": {
      "engineStatus": "COMPUTED_VIA_INDEX_ENGINE",
      "methodology": "CPI-Augmented Airfare Index (Laspeyres formula with median representative fare)",
      "route": "BOM-MAA",
      "routeIndex": 153.0367,
      "currentRepresentativeFare": 10180.00,
      "baseRepresentativeFare": 6652.00,
      "baseSource": "HISTORICAL_COLLECTION",
      "isBaselineEstablished": true,
      "weight": 0.084500,
      "contribution": 12.9316,
      "passengerVolume": 1420000,
      "nationalIndex": 118.45,
      "fareStats": {
        "observationsCount": 7760,
        "validObservationsCount": 7760,
        "medianFare": 10180.00,
        "meanFare": 12056.40,
        "minFare": 5647,
        "maxFare": 158940
      }
    },
    "observations": [
      {
        "_id": "66d213456789...",
        "source": "Agoda",
        "airline": "IndiGo",
        "flightNo": "6E-2128",
        "origin": "BOM",
        "destination": "MAA",
        "route": "BOM-MAA",
        "departureDate": "2026-09-05T00:00:00.000Z",
        "departureTime": "07:05",
        "arrivalTime": "08:50",
        "duration": "1h 45m",
        "stops": 0,
        "cabinClass": "Economy",
        "fareType": "Regular",
        "totalFare": 5647,
        "currency": "INR",
        "metadata": {
          "base": 4900,
          "tax": 747
        },
        "scrapedAt": "2026-08-31T05:30:00.000Z"
      }
    ]
  }
}
```

---

### `GET /api/search/poll`
Progressive polling endpoint returning incremental observations, provider status, and engine calculations.

- **Query Parameters:**
  - `sessionId` (`string`, optional): Search session UUID returned by `/api/search`.
  - `q` or `route` (`string`, optional): Route pair (e.g. `"BOM-MAA"`).

---

## 4. Route Intelligence Endpoints

### `GET /api/routes`
List all tracked routes in the representative national airfare basket.

- **Query Parameters:**
  - `search` (`string`, optional): Filter by route or city (e.g. `"mumbai"`, `"DEL"`).
  - `sort` (`string`, optional): `"passengerVolume"`, `"index"`, `"currentFare"`, `"weight"`, `"change24h"`, `"change7d"`.
  - `limit` (`number`, optional): Limit number of returned items (e.g. `20`).

---

### `GET /api/routes/:route`
Detailed inspection of a specific route pair with live observations, median calculations, and 3-way price comparison.

- **Path Parameters:**
  - `route` (`string`, required): e.g. `BOM-MAA` or `DEL-BOM`.

---

### `GET /api/routes/:route/history`
Timestamped historical fare points for plotting price trend charts.

- **Path Parameters:**
  - `route` (`string`, required): e.g. `BOM-MAA`
- **Query Parameters:**
  - `period` (`string`, optional, default: `"30d"`): `"7d"`, `"30d"`, `"90d"`, `"1y"`

---

## 5. Complete TypeScript Type Definitions

Copy these types directly into your frontend codebase (`types/airfare.ts`):

```typescript
export type FlightSource = 'Air India' | 'Agoda' | 'IRCTC Air';

export interface ProviderStats {
  status: 'ok' | 'error';
  observationsCount: number;
  minFare: number | null;
  maxFare: number | null;
  medianFare: number | null;
  meanFare: number | null;
}

export interface PriceSpread {
  cheapestProvider: string;
  expensiveProvider: string;
  differenceInr: number;
  differencePercent: number;
}

export interface PriceComparison {
  providers: Record<string, ProviderStats>;
  cheapest: string | null;
  spread: PriceSpread | null;
  comparedAt: string;
}

export interface RouteIndexEngine {
  engineStatus: string;
  methodology: string;
  route: string;
  routeIndex: number;
  currentRepresentativeFare: number;
  baseRepresentativeFare: number;
  baseSource: string;
  isBaselineEstablished: boolean;
  weight: number;
  contribution: number;
  passengerVolume: number;
  nationalIndex: number;
  fareStats: {
    observationsCount: number;
    validObservationsCount: number;
    medianFare: number;
    meanFare: number;
    minFare: number;
    maxFare: number;
  };
}

export interface FareObservation {
  _id?: string;
  source: FlightSource | string;
  airline: string;
  flightNo?: string;
  origin: string;
  destination: string;
  route: string;
  departureDate: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: string;
  stops?: number;
  cabinClass?: string;
  fareType?: string;
  totalFare: number;
  currency: string;
  metadata?: {
    base?: number;
    tax?: number;
    [key: string]: any;
  };
  scrapedAt: string;
}

export interface SearchSessionProgressItem {
  label: string;
  status: 'pending' | 'scraping' | 'completed' | 'error';
  observationsCount: number;
  completedAt: string | null;
  error: string | null;
}

export interface SearchSession {
  id: string;
  status: 'in_progress' | 'completed' | 'completed_with_warnings' | 'failed';
  progress: Record<string, SearchSessionProgressItem>;
  totalNewObservations: number;
  completedProvidersCount: number;
  totalProvidersCount: number;
  isCompleted: boolean;
}

export interface SearchResponseData {
  source: 'database' | 'background_progressive_scrape';
  scraped: boolean;
  isScrapingInProgress: boolean;
  sessionId: string | null;
  sessionProgress: Record<string, SearchSessionProgressItem> | null;
  state: 'DATABASE_FRESH' | 'DATABASE_STALE' | 'SCRAPING_IN_PROGRESS';
  route: string;
  observationsCount: number;
  latestScrapedAt?: string;
  priceComparison?: PriceComparison;
  routeIndexEngine?: RouteIndexEngine;
  results?: Array<{
    type: string;
    route?: string;
    name?: string;
    code?: string;
    currentFare?: number;
  }>;
  observations: FareObservation[];
}

export interface ApiResponse<T> {
  success: boolean;
  query?: string;
  message?: string;
  data: T;
  session?: SearchSession;
  error?: {
    code: string;
    message: string;
  };
}
```
