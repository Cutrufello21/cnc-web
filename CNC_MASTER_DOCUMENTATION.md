# CNC Delivery — Master Technical Documentation

> **Generated**: 2026-04-10
> **Covers**: cnc-web (dispatch portal + homepage + pharmacy portal) and cnc-driver (iOS driver app)
> **Purpose**: Complete system reference — sufficient for a new developer to understand, maintain, or rebuild the entire platform.

---

## Table of Contents

1. [Business Context](#1-business-context)
2. [Repository Structure](#2-repository-structure)
3. [Authentication](#3-authentication)
4. [Database Tables](#4-database-tables)
5. [API Endpoints](#5-api-endpoints)
6. [Driver App](#6-driver-app)
7. [Dispatch Portal](#7-dispatch-portal)
8. [Pharmacy Portal](#8-pharmacy-portal)
9. [Homepage](#9-homepage)
10. [Known Issues and Workarounds](#10-known-issues-and-workarounds)
11. [Environment Variables](#11-environment-variables)
12. [Build and Deploy](#12-build-and-deploy)
13. [Critical Rules](#13-critical-rules)

---

## 1. Business Context

### Company Overview

**CNC Delivery Service** is a pharmacy delivery company based in Northeast Ohio. Founded in 2007 by Paul, built by Mark, and run daily by **Dom Cutrufello** for 7 years. The company employs **20+ independent contractor (1099) drivers**, with the longest-tenured driver at 16 years.

### Operations

- **Volume**: 300–600 prescription packages delivered nightly
- **Coverage**: Summit, Stark, Portage, and Tuscarawas counties
- **Lifetime deliveries**: 1.3M+
- **Verified deliveries since 2023**: 215k+
- **Compliance**: HIPAA-compliant, BAA available

### Pharmacy Clients

| Pharmacy | Address |
|----------|---------|
| SHSP (SummitHealth) | 70 Arch St, Akron, OH 44304 |
| Aultman | 2600 6th St SW, Canton, OH 44710 |

### Business Model

Currently operates as a **CXT subcontractor**. Phase 2 goal is direct pharmacy contracts.

### Products

| # | Product | Repo | Stack | Deployment |
|---|---------|------|-------|------------|
| 1 | **CNC Website + Dispatch Portal** | `cnc-web` | React + Vite | Vercel (cncdelivery.com) |
| 2 | **CNC Driver App** | `cnc-driver` | React Native / Expo | iOS TestFlight (`com.cncdelivery.driver`) |
| 3 | **CNC Pharmacy Portal** | `cnc-web` (`/portal/*`) | React + Supabase Auth | Vercel (cncdelivery.com/portal) |

### Users

| Role | Count | Access |
|------|-------|--------|
| Dispatcher/Admin (Dom) | 1 | Dispatch portal, all APIs |
| Drivers | 20+ | Driver app (iOS) |
| Pharmacy staff | Variable | Pharmacy portal (web) |

### Brand

- **Navy**: `#0A2463`
- **Periwinkle**: `#60A5FA`
- **Font**: Inter
- **LOCKED**: No teal, emerald, or gold (those are reserved for LYN, a separate Phase 2 product)

---

## 2. Repository Structure

### cnc-web (`~/Desktop/cnc-web`)

Deployed on Vercel at `cncdelivery.com`. Auto-deploys from GitHub `main` branch.

#### Root Files

```
package.json
server.js
vercel.json
vite.config.js
.env
.env.example
.env.local
```

#### `/api/` — Serverless Functions

All API endpoints use the **service role key** and bypass RLS.

| File | Purpose |
|------|---------|
| `_lib/supabase.js` | Server Supabase client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |
| `_lib/sheets.js` | Google Sheets API integration (JWT auth) |
| `db.js` | Generic DB write proxy (insert/update/delete/upsert any table) |
| `actions.js` | Multi-action handler: email, transfer, mark_correction_sent, roadwarrior, push_routes, push_notify, contact_form |
| `deliver.js` | Mark stops delivered/failed with GPS + photos |
| `dispatch.js` | Fetch dispatch data with stop grouping |
| `driver.js` | Driver app data fetch (stops, totals, week) |
| `geocode.js` | Batch geocode with Census Bureau + cache |
| `optimize-route.js` | Route optimization (Google Routes API -> OSRM -> nearest neighbor fallback) |
| `fleet-optimize.js` | Fleet assignment (Google Fleet Optimization API) |
| `analytics.js` | Comprehensive analytics (dispatch_logs, payroll, orders, daily_stops) |
| `payroll.js` | GET/POST payroll data, auto-calculate pay |
| `reassign.js` | Move stops between drivers (Sheets + Supabase) |
| `routing.js` | ZIP-to-driver routing rules CRUD |
| `sort-list.js` | Sort list CRUD |
| `dispatch-log-decision.js` | Learning engine: log_move, log_optimize, snapshot, get_patterns, auto_log |
| `route-patterns.js` | Historical ZIP transition analysis |
| `auto-dispatch.js` | Automatic stop rebalancing |
| `hq.js` | HQ dashboard aggregation |
| `orders.js` | Paginated order search |
| `order-filters.js` | Filter dropdown options |
| `map-data.js` | Aggregated delivery locations |
| `sheets-view.js` | View DB tables as spreadsheet |
| `ai-insights.js` | Weekly AI analysis (Claude Sonnet via Anthropic API) |
| `backup.js` | Daily backup metadata logging |
| `error-log.js` | Client error logging |
| `advance-day.js` | Cron: advance delivery date + lock recon |
| `upload-settlement.js` | Parse OpenForce Excel settlements |
| `tesla/callback.js` | Tesla OAuth callback |

#### `/src/pages/`

| File | Purpose |
|------|---------|
| `DispatchPage.jsx` | Main dispatch dashboard (routes, analytics, payroll, HQ, orders, drivers, time off) |
| `LoginPage.jsx` | Driver/dispatcher login |
| `DriverPage.jsx` | Driver home (legacy web view) |
| `portal/PortalLogin.jsx` | Pharmacy auth (Supabase `signInWithPassword`, role=pharmacy) |
| `portal/PortalDashboard.jsx` | Today's stats, deliveries table, POD modal |
| `portal/PortalDeliveries.jsx` | Date range + search + filters, full table |
| `portal/PortalPODRecords.jsx` | POD card grid with thumbnails |
| `portal/PortalReports.jsx` | 30-day summary, 6 metrics, CSV export |
| `dispatch-v2/` | Experimental V2 dispatch interface |

#### `/src/components/`

**Homepage Components:**
- `Hero`, `HowItWorks`, `Pillars`, `Technology`, `TechSlides`, `ServiceArea`, `ServiceMap`, `Team`, `Stats`, `FAQ`, `ContactForm`, `CTA`, `Footer`, `Navbar`, `BrandMark`, `BackToTop`

**Dispatch Components:**
- `DriverCard`, `DispatchSummary`, `Analytics` tabs, `Orders`, `Payroll`, `Routing`, `SortList`, `SheetViewer`, `HQDashboard`, `WeatherWidget`, `StopDistribution`, `Heatmap`

**Portal Components:**
- `PortalShell` (sidebar layout)

**Tech Demo Components:**
- `PharmacyPortalDemo`, `DispatchPortalDemo`, `DriverAppDemo`, `CardCarousel`, `TechLocalMap`

**Shared Components:**
- `ProtectedRoute`, `ErrorBoundary`, `ThemeToggle`

#### `/src/context/`

- `AuthContext.jsx` — provides `user`, `profile`, `signOut`, role flags

#### `/src/hooks/`

- `useInView.js` — IntersectionObserver hook for scroll animations

#### `/src/lib/`

- `supabase.js` — Frontend Supabase client (anon key)
- `db.js` — Write helpers that call `/api/db`

#### `/supabase/migrations/`

| Migration | Purpose |
|-----------|---------|
| `20260326_backups_and_error_logs.sql` | Backup + error log tables |
| `20260405_rls_hipaa.sql` | RLS policies for all tables |
| `20260406_analytics_tables.sql` | Pre-aggregated analytics tables |
| `20260408_correction_tracking.sql` | `last_correction_driver` column |

#### `/scripts/`

- `generate-tech-local-routes.mjs` — Mapbox Directions API for animated map route data

---

### cnc-driver (`~/cnc-driver`)

Expo SDK 54, React Native 0.81.5, bundle `com.cncdelivery.driver`

#### Root Files

| File | Purpose |
|------|---------|
| `App.js` | **2797 lines** — entire application (all screens, state, logic) |
| `Dispatch.js` | Dispatch portal (embedded in app) |
| `Analytics.js` | Analytics dashboard (embedded in app) |
| `config.js` | API URL + Mapbox token |
| `crypto.js` | Encryption passthrough (see Known Issues) |
| `constants.js` | Brand colors, pharmacy coordinates, API base URL |
| `package.json` | Dependencies |
| `app.json` | Expo config |
| `eas.json` | EAS build + submit profiles |
| `index.js` | Entry point |
| `babel.config.js` | Babel config |
| `pod-migration.sql` | POD table migration script |

#### `assets/`

```
icon.png
icon-navy-flat.png
icon-navy-3d.png
icon-light-3d.png
icon-dark-3d.png
icon-navy-chrome.png
adaptive-icon.png
splash-icon.png
nav-arrow.png
favicon.png
```

---

## 3. Authentication

### Dispatch Portal (cnc-web)

- **Site-wide password gate**: `@Peaceout55` via `SiteGate` component in `App.jsx`
- No Supabase Auth for dispatchers — the password gate is the only protection
- Once past the gate, all dispatch features are accessible

### Driver App (cnc-driver)

Dual-path login flow in `App.js`:

1. Query `drivers` table by name:
   ```js
   supabase.from('drivers').select('*').ilike('driver_name', name).single()
   ```
2. If driver has email, attempt Supabase Auth:
   ```js
   supabase.auth.signInWithPassword({ email, password })
   ```
3. Fallback legacy passwords:

| User Type | Password |
|-----------|----------|
| Dispatchers (Dom, Dominic) | `@Peaceout55` |
| All drivers | `cc1234` |

- Session persisted to **SecureStore** key: `cnc_driver_name`
- Dispatcher detection: `DISPATCHER_NAMES = ['Dom', 'Dominic']`

### Pharmacy Portal (cnc-web `/portal`)

- **Real Supabase Auth**: `signInWithPassword({ email, password })`
- Requires `profile.role === 'pharmacy'` in `profiles` table
- Session persisted to localStorage:
  - `cnc-user`
  - `cnc-profile`
  - `cnc-token`
- `ProtectedRoute` component enforces role check and restores session on refresh

### RLS Policies (`20260405_rls_hipaa.sql`)

**Helper Functions:**

| Function | Logic |
|----------|-------|
| `is_dispatcher()` | Checks `profiles.role = 'dispatcher'` for current auth user |
| `my_driver_name()` | `profiles.email` -> `drivers.email` -> `driver_name` |

**Per-Table Policies:**

| Table | Dispatcher | Driver |
|-------|-----------|--------|
| `daily_stops` | ALL operations | SELECT/UPDATE/INSERT own rows only (no DELETE) |
| `driver_routes` | ALL | SELECT/UPDATE/INSERT own rows |
| `mileage_log` | ALL | SELECT/UPDATE/INSERT own rows |
| `driver_favorites` | ALL | SELECT/UPDATE/INSERT own rows |
| `time_off_requests` | ALL | SELECT/UPDATE/INSERT own rows |
| `stop_reconciliation` | ALL | SELECT/UPDATE/INSERT own rows |
| `address_notes` | ALL | SELECT/UPDATE/INSERT own rows |
| `order_deletions` | ALL | SELECT/UPDATE/INSERT own rows |
| `drivers` | ALL | SELECT own row + UPDATE `push_token` only |

**Important**: All server-side `/api/` endpoints use the **service role key**, which bypasses RLS entirely. Driver writes flow through `/api/db`.

---

## 4. Database Tables

### `drivers`

| Column | Type | Notes |
|--------|------|-------|
| `driver_name` | text (PK) | Primary identifier |
| `driver_number` | text | Route number |
| `email` | text | For Supabase Auth |
| `pharmacy` | text | Assigned pharmacy |
| `role` | text | 'driver' or 'dispatcher' |
| `pod_enabled` | boolean | Proof-of-delivery enabled |
| `rate_mth` | numeric | MTH pay rate |
| `rate_wf` | numeric | WF pay rate |
| `office_fee` | numeric | Office fee deduction |
| `flat_salary` | numeric | Flat salary option |
| `will_call_rate` | numeric | Will-call pay rate |
| `push_token` | text | Expo push notification token |
| `active` | boolean | Active/inactive flag |

### `daily_stops`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `order_id` | text | Order identifier |
| `delivery_date` | date | Date of delivery |
| `delivery_day` | text | Day name (Mon, Tue, etc.) |
| `driver_name` | text | Assigned driver |
| `driver_number` | text | Driver route number |
| `patient_name` | text | Recipient name |
| `address` | text | Delivery address |
| `city` | text | City |
| `zip` | text | ZIP code |
| `lat` | numeric | Latitude |
| `lng` | numeric | Longitude |
| `status` | text | `'dispatched'` / `'delivered'` / `'failed'` / `'DELETED'` |
| `cold_chain` | boolean | Cold chain required |
| `notes` | text | Stop notes |
| `pharmacy` | text | Source pharmacy |
| `assigned_driver_number` | text | Originally assigned driver number |
| `dispatch_driver_number` | text | Dispatch-assigned driver number |
| `last_correction_driver` | text | Prevents double-send corrections to WFL |
| `sort_order` | integer | Display ordering |
| `pin_color` | text | Map pin color (column referenced but may not exist — see Known Issues) |
| `delivered_at` | timestamptz | Delivery timestamp |
| `failure_reason` | text | Why delivery failed |
| `deleted_at` | timestamptz | Soft-delete timestamp |
| `deleted_by` | text | Who deleted |
| `delivery_note` | text | Driver delivery note |
| `photo_url` | text | Single photo URL (legacy) |
| `photo_urls` | jsonb | Array of photo URLs |
| `signature_url` | text | Signature image URL |
| `barcode` | text | Scanned barcode value |

### `driver_routes`

| Column | Type | Notes |
|--------|------|-------|
| `driver_name` | text (composite PK) | Driver identifier |
| `date` | date (composite PK) | Route date |
| `stop_sequence` | jsonb | JSON array of ordered stop IDs |
| `origin_hospital` | text | Starting pharmacy |
| `end_type` | text | End destination type |
| `end_address` | text | Custom end address |
| `end_lat` | numeric | End latitude |
| `end_lng` | numeric | End longitude |
| `pinned_first_id` | bigint | Pinned first stop |
| `pinned_final_id` | bigint | Pinned last stop |
| `optimized_at` | timestamptz | Last optimization time |
| `is_locked` | boolean | Route locked flag |
| `manually_adjusted` | boolean | Manual adjustment flag |
| `adjusted_at` | timestamptz | Last manual adjustment time |

### `driver_notifications`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `driver_name` | text | Target driver |
| `type` | text | `'route_ready'` / `'transfer_in'` / `'transfer_out'` / `'route_update'` |
| `title` | text | Notification title |
| `body` | text | Notification body |
| `read` | boolean | Read flag |
| `created_at` | timestamptz | Creation time |

### `address_notes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `driver_name` | text | Author driver |
| `address` | text | Address (encrypted) |
| `city` | text | City |
| `zip` | text | ZIP |
| `note` | text | Note content (encrypted) |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update |

### `driver_favorites`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `driver_name` | text | Owner driver |
| `name` | text | Favorite label |
| `address` | text | Address |
| `lat` | numeric | Latitude |
| `lng` | numeric | Longitude |
| `color` | text | Display color |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update |

### `mileage_log`

| Column | Type | Notes |
|--------|------|-------|
| `driver_name` | text (composite PK) | Driver |
| `delivery_date` | date (composite PK) | Date |
| `miles` | numeric | Miles driven |
| `stops_completed` | integer | Stops completed |
| `total_stops` | integer | Total stops assigned |

### `time_off_requests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `driver_name` | text | Requesting driver |
| `start_date` | date | Start of time off |
| `end_date` | date | End of time off |
| `reason` | text | Reason |
| `status` | text | `'pending'` / `'approved'` / `'declined'` |
| `created_at` | timestamptz | Request time |

### `stop_reconciliation`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `week_of` | date | Week start date |
| `driver_name` | text | Driver |
| `day` | text | `'Mon'` through `'Fri'` |
| `actual_stops` | integer | Actual stop count |
| `afternoon_stops` | integer | Afternoon stop count |
| `locked` | boolean | Day locked |
| `approved` | boolean | Approved by dispatcher |

### `delivery_confirmations` (POD)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `stop_id` | bigint | FK to daily_stops.id |
| `order_id` | text | Order identifier |
| `driver_name` | text | Delivering driver |
| `delivered_at` | timestamptz | Delivery timestamp |
| `gps_lat` | numeric | GPS latitude at delivery |
| `gps_lng` | numeric | GPS longitude at delivery |
| `gps_distance_feet` | numeric | Distance from stop in feet |
| `geofence_overridden` | boolean | Geofence override used |
| `photo_package_url` | text | Package photo URL |
| `photo_house_url` | text | House/location photo URL |
| `signature_url` | text | Signature image URL |
| `recipient_name` | text | Who received it |
| `delivery_note` | text | Delivery note |
| `delivery_date` | date | Delivery date |

### `delivery_overrides`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `stop_id` | bigint | FK to daily_stops.id |
| `driver_name` | text | Driver who overrode |
| `gps_distance_feet` | numeric | Distance at override |
| `overridden` | boolean | Override flag |
| `created_at` | timestamptz | Override time |

### `order_deletions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `stop_id` | bigint | FK to daily_stops.id |
| `order_number` | text | Order identifier |
| `patient_name` | text | Patient name (encrypted) |
| `driver_name` | text | Driver at time of deletion |
| `authorized_by` | text | Who authorized |
| `deleted_at` | timestamptz | Deletion time |
| `email_sent` | boolean | Notification email sent |
| `date` | date | Delivery date |

### `sort_list`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `delivery_date` | date | Date |
| `pharmacy` | text | Pharmacy |
| `sort_order` | integer | Display order |
| `display_text` | text | Display label |
| `late_start` | boolean | Late start flag |
| `checked` | boolean | Checked off flag |

### `dispatch_logs`

| Column | Type | Notes |
|--------|------|-------|
| `date` | date (composite PK) | Dispatch date |
| `delivery_day` | text (composite PK) | Day name |
| `status` | text | Dispatch status |
| `orders_processed` | integer | Total orders |
| `cold_chain` | integer | Cold chain count |
| `unassigned_count` | integer | Unassigned stops |
| `corrections` | integer | Corrections made |
| `shsp_orders` | integer | SHSP order count |
| `aultman_orders` | integer | Aultman order count |
| `top_driver` | text | Busiest driver |
| `created_at` | timestamptz | Log time |

### `dispatch_decisions`

| Column | Type | Notes |
|--------|------|-------|
| `delivery_date` | date | Date |
| `delivery_day` | text | Day name |
| `order_id` | text | Order identifier |
| `zip` | text | ZIP code |
| `city` | text | City |
| `pharmacy` | text | Pharmacy |
| `from_driver` | text | Original driver |
| `to_driver` | text | New driver |
| `decision_type` | text | `'final_state'` / `'initial_state'` / `'manual_move'` / `'optimize_accepted'` |
| `context` | text | Decision context |
| `created_at` | timestamptz | Decision time |

### `driver_events`

| Column | Type | Notes |
|--------|------|-------|
| `driver_name` | text | Driver |
| `event_type` | text | Event type |
| `event_data` | jsonb | Event payload |
| `delivery_date` | date | Date |
| `gps_lat` | numeric | GPS latitude |
| `gps_lng` | numeric | GPS longitude |
| `created_at` | timestamptz | Event time |

### `payroll`

| Column | Type | Notes |
|--------|------|-------|
| `week_of` | date | Week start |
| `driver_name` | text | Driver |
| `mon` | integer | Monday stop count |
| `tue` | integer | Tuesday stop count |
| `wed` | integer | Wednesday stop count |
| `thu` | integer | Thursday stop count |
| `fri` | integer | Friday stop count |
| `will_calls` | integer | Will-call count |
| `weekly_pay` | numeric | Calculated weekly pay |
| `sheet_pay` | numeric | Pay from Google Sheet |

### `routing_rules`

| Column | Type | Notes |
|--------|------|-------|
| `zip` | text (PK) | ZIP code |
| `mon` | text | Monday driver assignment |
| `tue` | text | Tuesday driver assignment |
| `wed` | text | Wednesday driver assignment |
| `thu` | text | Thursday driver assignment |
| `fri` | text | Friday driver assignment |

### `profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Supabase Auth user ID |
| `email` | text | User email |
| `role` | text | `'dispatcher'` / `'driver'` / `'pharmacy'` |
| `pharmacy_name` | text | Pharmacy name (for pharmacy role) |
| `full_name` | text | Display name |

### `orders` (legacy import table)

| Column | Type | Notes |
|--------|------|-------|
| `order_id` | text | Order identifier |
| `patient_name` | text | Patient name |
| `address` | text | Address |
| `city` | text | City |
| `zip` | text | ZIP |
| `driver_name` | text | Assigned driver |
| `pharmacy` | text | Pharmacy |
| `cold_chain` | boolean | Cold chain flag |
| `source` | text | Import source |
| `delivery_date` | date | Delivery date |

### `unassigned_orders`

| Column | Type | Notes |
|--------|------|-------|
| `order_id` | text | Order identifier |
| `patient_name` | text | Patient name |
| `address` | text | Address |
| `city` | text | City |
| `zip` | text | ZIP |
| `pharmacy` | text | Pharmacy |
| `delivery_date` | date | Delivery date |

### `geocode_cache`

| Column | Type | Notes |
|--------|------|-------|
| `cache_key` | text (PK) | Lookup key |
| `lat` | numeric | Latitude |
| `lng` | numeric | Longitude |
| `address` | text | Full address |
| `city` | text | City |
| `zip` | text | ZIP |

### `settlements`

| Column | Type | Notes |
|--------|------|-------|
| `week_of` | date | Week |
| `driver_name` | text | Driver |
| `revenue` | numeric | Revenue amount |
| `source` | text | Settlement source |

### `backups`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `created_at` | timestamptz | Backup time |
| `tables` | jsonb | JSON with row counts per table |

### `error_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint (PK) | Auto-increment |
| `type` | text | Error type |
| `message` | text | Error message |
| `stack` | text | Stack trace |
| `metadata` | jsonb | Extra context |
| `created_at` | timestamptz | Log time |

### `company_ledger`

Income/expense tracking with running balance.

### `monthly_stop_summary`

Pre-aggregated per driver/pharmacy/month.

### `daily_performance_summary`

Pre-aggregated per driver/day.

---

## 5. API Endpoints

All endpoints live in `/api/` and are deployed as Vercel serverless functions. Every endpoint uses the **service role key** (bypasses RLS).

---

### `POST /api/db`

Generic database write proxy. Supports any table.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `operation` | string | Yes | `'insert'` / `'update'` / `'delete'` / `'upsert'` |
| `table` | string | Yes | Target table name |
| `data` | object/array | Yes (insert/update/upsert) | Row(s) to write |
| `match` | object | Yes (update/delete) | WHERE clause key-value pairs |
| `onConflict` | string | No | Conflict column(s) for upsert |

**CRITICAL**: The param is `operation`, NOT `action`.

---

### `POST /api/actions`

Multi-action handler. Routes by `action` param.

#### Action: `email`

Send email via Gmail SMTP (nodemailer).

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'email'` | |
| `to` | string | Recipient |
| `subject` | string | Subject line |
| `body` | string | Email body (HTML) |

#### Action: `transfer`

Transfer stops between drivers. Updates `daily_stops` + Google Sheets + sends push notification.

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'transfer'` | |
| `stopIds` | array | Stop IDs to move |
| `fromDriver` | string | Source driver |
| `toDriver` | string | Target driver |
| `toDriverNumber` | string | Target driver number |
| `date` | string | Delivery date |

#### Action: `mark_correction_sent`

Update `last_correction_driver` on a stop to prevent duplicate correction emails to WFL.

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'mark_correction_sent'` | |
| `stopId` | bigint | Stop ID |
| `driverName` | string | Current driver name |

#### Action: `roadwarrior`

Send stops to Road Warrior for external route optimization.

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'roadwarrior'` | |
| `driverName` | string | Driver to optimize |
| `stops` | array | Stops data |

#### Action: `push_routes`

Push optimized routes to Google Sheets for all drivers.

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'push_routes'` | |
| `date` | string | Delivery date |
| `routes` | object | Driver -> stops mapping |

#### Action: `push_notify`

Send Expo push notification to a driver.

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'push_notify'` | |
| `driverName` | string | Target driver |
| `title` | string | Notification title |
| `body` | string | Notification body |
| `type` | string | Notification type |

Notification rules:
- Only sent between **6 AM – 6 PM ET**
- `route_ready` notifications have a **20-hour expiry window**

#### Action: `contact_form`

Process homepage contact form submission.

| Param | Type | Notes |
|-------|------|-------|
| `action` | `'contact_form'` | |
| `name` | string | Sender name |
| `email` | string | Sender email |
| `message` | string | Message body |

#### Action: `send_corrections` (via Apps Script webhook)

Triggers Google Apps Script to email corrections to WFL. Note: the `APPS_SCRIPT_URL` is **hardcoded** in `actions.js` (not an env var).

#### Action: `force_send_all`

Force re-send all stops (full list, not delta) to WFL via Apps Script.

---

### `POST /api/deliver`

Mark stops as delivered or failed.

| Param | Type | Notes |
|-------|------|-------|
| `stopId` | bigint | Stop ID |
| `status` | string | `'delivered'` or `'failed'` |
| `gps_lat` | numeric | GPS latitude |
| `gps_lng` | numeric | GPS longitude |
| `photo_url` | string | Photo URL |
| `photo_urls` | array | Multiple photo URLs |
| `signature_url` | string | Signature URL |
| `delivery_note` | string | Note |
| `failure_reason` | string | Failure reason (if failed) |
| `barcode` | string | Scanned barcode |

Updates `daily_stops` row and optionally inserts into `delivery_confirmations`.

---

### `GET /api/dispatch`

Fetch all dispatch data for a given date with stop grouping.

| Param | Type | Notes |
|-------|------|-------|
| `date` | string | Delivery date |

Returns: grouped stops by driver, unassigned stops, driver metadata.

---

### `GET /api/driver`

Fetch driver-specific data for the app.

| Param | Type | Notes |
|-------|------|-------|
| `driver` | string | Driver name |
| `date` | string | Delivery date |
| `action` | string | `'stops'` / `'totals'` / `'week'` |

Returns: stops for today, weekly totals, or week overview depending on action.

---

### `POST /api/geocode`

Batch geocode addresses using Census Bureau API with caching.

| Param | Type | Notes |
|-------|------|-------|
| `addresses` | array | Array of `{ address, city, zip }` |

Checks `geocode_cache` first, falls back to Census Bureau geocoder, caches results.

---

### `POST /api/optimize-route`

Optimize a single driver's route.

| Param | Type | Notes |
|-------|------|-------|
| `driverName` | string | Driver |
| `stops` | array | Stops with lat/lng |
| `origin` | object | Start point `{ lat, lng }` |
| `destination` | object | End point `{ lat, lng }` |
| `pinnedFirst` | bigint | Pinned first stop ID |
| `pinnedFinal` | bigint | Pinned last stop ID |

**Optimization cascade**:
1. Google Routes API (max 98 intermediate waypoints)
2. OSRM fallback
3. Nearest-neighbor heuristic fallback

Returns optimized stop sequence. Writes to `driver_routes`.

---

### `POST /api/fleet-optimize`

Fleet-wide route assignment using Google Fleet Optimization API.

| Param | Type | Notes |
|-------|------|-------|
| `drivers` | array | Available drivers with start/end locations |
| `stops` | array | All stops to assign |
| `date` | string | Delivery date |

---

### `GET /api/analytics`

Comprehensive analytics queries.

| Param | Type | Notes |
|-------|------|-------|
| `type` | string | Query type |
| `range` | string | Date range |

Types include: dispatch_logs, payroll summaries, order stats, daily_stops aggregations.

**Warning**: Can hit Vercel 10s timeout on large date ranges.

---

### `GET/POST /api/payroll`

| Method | Action |
|--------|--------|
| GET | Fetch payroll for a week (`week_of` param) |
| POST | Save/calculate payroll (auto-calculates `weekly_pay` from driver rates) |

---

### `POST /api/reassign`

Move stops between drivers, updating both Supabase and Google Sheets.

| Param | Type | Notes |
|-------|------|-------|
| `stopIds` | array | Stop IDs |
| `fromDriver` | string | Source driver |
| `toDriver` | string | Target driver |
| `toDriverNumber` | string | Target driver number |
| `date` | string | Delivery date |

---

### `GET/POST/DELETE /api/routing`

CRUD for ZIP-to-driver routing rules.

| Method | Action |
|--------|--------|
| GET | Fetch all routing rules |
| POST | Create/update rule for a ZIP |
| DELETE | Remove rule for a ZIP |

---

### `GET/POST/DELETE /api/sort-list`

CRUD for pharmacy sort lists.

| Method | Action |
|--------|--------|
| GET | Fetch sort list for date + pharmacy |
| POST | Save sort list |
| DELETE | Clear sort list |

---

### `POST /api/dispatch-log-decision`

Learning engine for dispatch decisions.

| Action | Purpose |
|--------|---------|
| `log_move` | Log a manual stop move |
| `log_optimize` | Log an optimization acceptance |
| `snapshot` | Save current state snapshot |
| `get_patterns` | Retrieve learned patterns |
| `auto_log` | Auto-log decisions |
| `initial_state` | Record initial dispatch state |
| `final_state` | Record final dispatch state |

**Known bug**: Uses `.limit(5000)` which may truncate results on high-volume days.

---

### `GET /api/route-patterns`

Historical ZIP transition analysis — which ZIPs are frequently routed together.

| Param | Type | Notes |
|-------|------|-------|
| `zip` | string | ZIP to analyze |
| `days` | integer | Lookback period |

---

### `POST /api/auto-dispatch`

Automatic stop rebalancing across drivers.

| Param | Type | Notes |
|-------|------|-------|
| `date` | string | Delivery date |
| `drivers` | array | Available drivers |

**Floating drivers** (Brad, Kasey) can be reassigned by auto-dispatch.

---

### `GET /api/hq`

HQ dashboard aggregation — top-level metrics across all operations.

---

### `GET /api/orders`

Paginated order search.

| Param | Type | Notes |
|-------|------|-------|
| `page` | integer | Page number |
| `limit` | integer | Results per page |
| `search` | string | Search term |
| `filters` | object | Filter criteria |

---

### `GET /api/order-filters`

Returns dropdown options for order filtering (drivers, pharmacies, statuses, date ranges).

---

### `GET /api/map-data`

Aggregated delivery location data for heatmaps and map visualizations.

---

### `GET /api/sheets-view`

View Supabase tables as spreadsheet-style data (for SheetViewer component).

| Param | Type | Notes |
|-------|------|-------|
| `table` | string | Table name |

---

### `GET /api/ai-insights`

Weekly AI-powered analysis using Claude Sonnet (Anthropic API).

| Param | Type | Notes |
|-------|------|-------|
| `week` | string | Week to analyze |

Sends dispatch data to Claude Sonnet for pattern analysis and recommendations.

---

### `POST /api/backup`

Daily backup metadata logging. Records row counts per table.

**Cron**: Runs daily at 6 AM.

---

### `POST /api/error-log`

Client-side error logging.

| Param | Type | Notes |
|-------|------|-------|
| `type` | string | Error type |
| `message` | string | Error message |
| `stack` | string | Stack trace |
| `metadata` | object | Additional context |

---

### `POST /api/advance-day`

Cron job: advances the delivery date and locks reconciliation for the completed day.

**Cron schedule**:
- 10 PM Mon–Thu
- 4 AM + 9 AM Saturday

---

### `POST /api/upload-settlement`

Parse OpenForce Excel settlement files and import into `settlements` table.

| Param | Type | Notes |
|-------|------|-------|
| `file` | binary | Excel file upload |

---

### `GET /api/tesla/callback`

Tesla OAuth callback handler for fleet integration.

---

## 6. Driver App

The entire driver app lives in a single file: **`App.js` (2,797 lines)**.

### Constants

```js
// Brand colors
BRAND = '#0A2463'        // Navy
GREEN = '#16a34a'        // Success green
GRAY  = '#6B7280'        // Muted gray
BG    = '#F8F9FA'        // Background

// API base
API = 'https://cncdelivery.com/api'

// Dispatcher detection
DISPATCHER_NAMES = ['Dom', 'Dominic']

// Pharmacy coordinates
PH = {
  SHSP:    { lat: 41.08087, lng: -81.50061 },
  Aultman: { lat: 40.7989,  lng: -81.3784 }
}

// WFL dispatch email
BIOTOUCH_EMAIL = 'wfldispatch@biotouchglobal.com'

// IRS mileage rate
IRS_RATE = 0.70
```

### Dark Mode Theme

```js
// Light theme
light: {
  bg: '#F8F9FA',
  card: '#FFFFFF',
  text: '#111827',
  sub: '#6B7280',
  border: '#E5E7EB',
  input: '#F3F4F6',
  accent: '#0A2463',
  accentLight: '#60A5FA',
  success: '#16a34a',
  danger: '#DC2626',
  warning: '#F59E0B',
  overlay: 'rgba(0,0,0,0.5)',
  badge: '#EFF6FF',
  badgeText: '#0A2463'
}

// Dark theme
dark: {
  bg: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  sub: '#94A3B8',
  border: '#334155',
  input: '#1E293B',
  accent: '#60A5FA',
  accentLight: '#93C5FD',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#FBBF24',
  overlay: 'rgba(0,0,0,0.7)',
  badge: '#1E3A5F',
  badgeText: '#93C5FD'
}
```

### State Variables (150+)

**Authentication & User:**
- `driverName` — logged-in driver name
- `driverObj` — full driver record from DB
- `isDispatcher` — boolean, true if name in DISPATCHER_NAMES
- `isLoggedIn` — authentication state
- `loginError` — login error message
- `loginLoading` — login spinner state

**Route & Stops:**
- `stops` — array of today's stops
- `completedStops` — delivered stop IDs
- `failedStops` — failed stop IDs
- `selectedStops` — multi-select for transfers
- `expandedStop` — currently expanded stop card
- `stopSequence` — optimized ordering from driver_routes
- `routeData` — full driver_routes record
- `routeReady` — boolean, route has been pushed
- `pinnedFirst` — pinned first stop ID
- `pinnedFinal` — pinned last stop ID
- `isLocked` — route is locked
- `manuallyAdjusted` — route was manually reordered

**Delivery / POD:**
- `deliveryTarget` — stop being delivered
- `deliveryStatus` — 'delivered' or 'failed'
- `deliveryNote` — text note
- `failureReason` — failure reason text
- `photoPackage` — package photo URI
- `photoHouse` — house/location photo URI
- `signatureData` — signature base64
- `barcodeData` — scanned barcode
- `gpsLat` / `gpsLng` — current GPS
- `gpsDistance` — distance from stop in feet
- `geofenceOk` — within geofence
- `geofenceOverridden` — override used
- `deliveryLoading` — submit spinner

**Transfer:**
- `transferMode` — transfer mode active
- `transferTarget` — target driver for transfer
- `transferDrivers` — available driver list
- `transferLoading` — transfer spinner

**Delete:**
- `deleteMode` — delete mode active
- `deleteStops` — selected stops for deletion
- `deleteLoading` — delete spinner

**Optimization:**
- `optimizing` — optimization in progress
- `optimizeResult` — optimization result
- `showOptimizePreview` — preview modal open

**Reconciliation:**
- `reconData` — reconciliation data
- `reconWeek` — selected week
- `reconEditing` — editing state
- `reconLoading` — loading spinner

**Mileage:**
- `mileageData` — mileage log entries
- `mileageWeek` — selected week
- `todayMiles` — today's miles

**Notifications:**
- `notifications` — notification list
- `unreadCount` — unread badge count
- `showNotifications` — notification panel open

**Address Notes:**
- `addressNotes` — saved notes
- `editingNote` — note being edited

**Favorites:**
- `favorites` — saved favorite locations
- `editingFavorite` — favorite being edited

**Time Off:**
- `timeOffRequests` — request list
- `newTimeOff` — new request form data

**UI State:**
- `activeTab` — current tab index
- `darkMode` — dark mode toggle
- `refreshing` — pull-to-refresh state
- `loading` — global loading
- `error` — global error message
- `showMenu` — hamburger menu open
- `searchQuery` — stop search filter
- `sortBy` — stop sort method
- `filterBy` — stop filter criteria
- `showWeekView` — week overview visible
- `weekData` — week overview data
- `showMap` — map view active
- `mapRegion` — map camera region
- `showSettings` — settings panel
- `showMileage` — mileage tab
- `showRecon` — reconciliation tab
- `connectionStatus` — online/offline indicator

**Offline Queue:**
- `offlineQueue` — queued actions for retry
- `isOffline` — offline state flag

### Major Functions

#### Data Fetching

| Function | Purpose |
|----------|---------|
| `fetchStops()` | Load today's stops from `/api/driver?action=stops` |
| `fetchTotals()` | Load delivery totals from `/api/driver?action=totals` |
| `fetchWeekData()` | Load week overview from `/api/driver?action=week` |
| `fetchRoute()` | Load route from `driver_routes` table |
| `fetchNotifications()` | Load from `driver_notifications` table |
| `fetchAddressNotes()` | Load from `address_notes` table |
| `fetchFavorites()` | Load from `driver_favorites` table |
| `fetchMileage()` | Load from `mileage_log` table |
| `fetchRecon()` | Load from `stop_reconciliation` table |
| `fetchTimeOff()` | Load from `time_off_requests` table |
| `loadTeam()` | Load all active drivers for transfer picker |

#### Core Operations

| Function | Purpose |
|----------|---------|
| `markDelivered(stop, status)` | Begin delivery flow — sets deliveryTarget |
| `commitDelivery()` | Submit delivery to `/api/deliver` with photos/GPS/signature |
| `transferStops()` | Move selected stops via `/api/actions` (action: transfer) |
| `deleteOrders()` | Soft-delete stops via `/api/db` + log to `order_deletions` |
| `runOptimize()` | Optimize route via `/api/optimize-route` |
| `saveRecon()` | Save reconciliation data via `/api/db` |
| `lockRecon()` | Lock reconciliation day |
| `openMaps(stop)` | Open Apple Maps with directions to stop |
| `groupKey(stop)` | Generate grouping key for consolidated address display |

#### Utility

| Function | Purpose |
|----------|---------|
| `encryptForWrite(text)` | Passthrough — no actual encryption (see Known Issues) |
| `formatDate(date)` | Format date for display |
| `calculateDistance(lat1, lng1, lat2, lng2)` | Haversine distance in feet |
| `uploadPhoto(uri)` | Upload photo to Supabase Storage, return URL |
| `requestLocation()` | Get current GPS coordinates |
| `handlePushToken()` | Register Expo push token to `drivers.push_token` |

### Login Flow

1. User enters name (and password if prompted)
2. Query `drivers` table: `supabase.from('drivers').select('*').ilike('driver_name', name).single()`
3. If driver found and has email -> attempt `supabase.auth.signInWithPassword({ email, password })`
4. If no email or auth fails -> check legacy passwords (`@Peaceout55` for dispatchers, `cc1234` for drivers)
5. On success: save `driver_name` to SecureStore, set `isLoggedIn = true`, set `isDispatcher` flag
6. Call `fetchStops()`, `fetchRoute()`, `fetchNotifications()`, `handlePushToken()`

### Delivery Flow

1. Driver taps "Deliver" or "Failed" on a stop card
2. `markDelivered(stop, status)` sets `deliveryTarget` and opens delivery modal
3. GPS location requested via `requestLocation()`
4. Distance calculated from stop lat/lng via `calculateDistance()`
5. If `gpsDistance > 500 feet` -> geofence warning, option to override
6. Driver optionally: takes package photo, house photo, scans barcode, adds signature, writes note
7. `commitDelivery()` submits to `/api/deliver` with all collected data
8. On success: stop status updated locally, removed from active list
9. If offline: action queued to `offlineQueue` for retry

### Transfer Flow

1. Dispatcher enables `transferMode`
2. Taps stops to add to `selectedStops`
3. Selects target driver from `transferDrivers` list (loaded via `loadTeam()`)
4. `transferStops()` calls `/api/actions` with action: `'transfer'`
5. Backend updates `daily_stops.driver_name` + `driver_number`
6. Backend updates Google Sheets
7. Push notification sent to target driver (if 6 AM – 6 PM ET)
8. Both drivers' stop lists refresh

### Delete Flow

1. Dispatcher enables `deleteMode`
2. Taps stops to add to `deleteStops`
3. Confirms deletion
4. For each stop: updates `daily_stops.status = 'DELETED'`, sets `deleted_at` and `deleted_by`
5. Inserts record into `order_deletions` table
6. Optionally sends email notification

### Optimization Flow

1. Driver/dispatcher taps "Optimize Route"
2. `runOptimize()` sends stops to `/api/optimize-route`
3. Backend tries Google Routes API (max 98 waypoints)
4. Falls back to OSRM if Google fails
5. Falls back to nearest-neighbor heuristic if OSRM fails
6. Returns optimized sequence
7. `showOptimizePreview = true` displays before/after comparison
8. On accept: saves to `driver_routes.stop_sequence`
9. Sets `optimized_at` timestamp

### Reconciliation Flow

1. Driver navigates to Recon tab
2. `fetchRecon()` loads `stop_reconciliation` for selected week
3. Displays Mon–Fri grid with `actual_stops` and `afternoon_stops`
4. Driver can edit counts if day is not locked
5. `saveRecon()` upserts via `/api/db`
6. `lockRecon()` sets `locked = true` for a day
7. Dispatcher can set `approved = true`

### POD (Proof of Delivery) Flow

Full flow: **Geofence -> Scan -> Photo -> Note -> Done**

1. **Geofence check**: GPS distance calculated, must be within threshold (or override)
2. **Barcode scan**: Camera opens for barcode scanning (stored as `barcode`)
3. **Package photo**: Camera for package photo (stored as `photo_package_url`)
4. **House photo**: Camera for delivery location (stored as `photo_house_url`)
5. **Signature**: Signature pad capture (stored as `signature_url`)
6. **Delivery note**: Optional text note
7. **Submit**: All data sent to `/api/deliver`, inserted into `delivery_confirmations`

### Offline Mode

- `connectionStatus` tracks network state via NetInfo listener
- When offline (`isOffline = true`):
  - Delivery actions queued to `offlineQueue` array
  - Queue persisted to SecureStore
  - Banner shown: "You're offline — actions will sync when connected"
- When connection restored:
  - Queue replayed in order
  - Failed items remain in queue for next retry
  - Success items removed

### Tabs / Screens (12 total)

| # | Tab | Description |
|---|-----|-------------|
| 1 | **Route** | Today's stops in optimized order, map view toggle |
| 2 | **Deliveries** | Completed/failed deliveries for today |
| 3 | **Week** | Weekly overview with day-by-day totals |
| 4 | **Mileage** | Mileage log with IRS rate calculation |
| 5 | **Recon** | Stop reconciliation grid (Mon–Fri) |
| 6 | **Notes** | Address notes (encrypted) |
| 7 | **Favorites** | Saved favorite locations |
| 8 | **Time Off** | Time off requests |
| 9 | **Notifications** | Push notification history |
| 10 | **Settings** | Dark mode, logout, app info |
| 11 | **Dispatch** | Dispatch portal (dispatcher only, via `Dispatch.js`) |
| 12 | **Analytics** | Analytics dashboard (dispatcher only, via `Analytics.js`) |

### Modals / Bottom Sheets

| Modal | Trigger | Content |
|-------|---------|---------|
| Delivery Modal | Tap deliver/fail on stop | GPS, photos, barcode, signature, note |
| Transfer Sheet | Transfer mode + select driver | Driver picker, confirm button |
| Delete Confirm | Delete mode + confirm | Deletion confirmation with stop list |
| Optimize Preview | After optimization | Before/after route comparison |
| Stop Detail | Tap expanded stop | Full stop info, address notes, map link |
| Barcode Scanner | POD flow step 2 | Camera for barcode scanning |
| Signature Pad | POD flow step 5 | Drawing pad for signature capture |
| Photo Capture | POD flow steps 3-4 | Camera for package/house photos |
| Notification Detail | Tap notification | Full notification content |
| Settings | Menu -> Settings | Theme, about, logout |

### SecureStore Keys (15+)

| Key | Purpose |
|-----|---------|
| `cnc_driver_name` | Persisted logged-in driver name |
| `cnc_dark_mode` | Dark mode preference |
| `cnc_offline_queue` | Queued offline actions |
| `cnc_push_token` | Expo push token |
| `cnc_last_fetch` | Last data fetch timestamp |
| `cnc_stops_cache` | Cached stops for offline |
| `cnc_route_cache` | Cached route for offline |
| `cnc_favorites_cache` | Cached favorites |
| `cnc_notes_cache` | Cached address notes |
| `cnc_mileage_cache` | Cached mileage data |
| `cnc_recon_cache` | Cached reconciliation data |
| `cnc_notifications_cache` | Cached notifications |
| `cnc_week_cache` | Cached week overview |
| `cnc_team_cache` | Cached team/driver list |
| `cnc_settings` | App settings blob |

---

## 7. Dispatch Portal

The dispatch portal lives in `DispatchPage.jsx` and is the primary tool for daily operations.

### Tabs

| Tab | Purpose |
|-----|---------|
| **Routes** | Main dispatch view — driver cards with stops, drag-and-drop reordering, transfers |
| **Analytics** | Charts and metrics (delivery volume, driver performance, pharmacy breakdown) |
| **Payroll** | Weekly payroll calculation and editing |
| **HQ** | High-level dashboard with aggregate metrics |
| **Orders** | Paginated order search with filters |
| **Drivers** | Driver management (rates, status, contact info) |
| **Time Off** | Approve/decline time off requests |

### Key Features

**Route Management:**
- Fetches dispatch data via `GET /api/dispatch?date=YYYY-MM-DD`
- Displays `DriverCard` for each active driver with stop count, pharmacy breakdown
- Drag-and-drop stop reordering within and between drivers
- Pin first/last stops on routes
- Lock/unlock routes

**Send Routes Flow:**
1. Dispatcher reviews all driver assignments
2. Clicks "Send Routes" button
3. Calls `/api/actions` with action `push_routes`
4. Routes pushed to Google Sheets (driver-specific tabs)
5. Push notifications sent to all drivers with routes
6. `driver_notifications` records created (type: `route_ready`)

**Correction Tracking:**
- When a stop is reassigned after initial dispatch, `last_correction_driver` tracks the previous assignment
- "Send Corrections" sends only the delta (changed stops) to WFL via `mark_correction_sent`
- "Force Send All" sends the complete stop list regardless of changes
- Prevents double-sending corrections to WFL

**Stop Distribution:**
- Visual distribution chart showing stops per driver
- `StopDistribution` and `Heatmap` components

**Weather Widget:**
- `WeatherWidget` shows current conditions for delivery area

### Data Flow

1. Google Sheets receives pharmacy data (external input)
2. `/api/dispatch` reads `daily_stops` + `drivers` + `routing_rules`
3. Stops auto-assigned based on `routing_rules` (ZIP -> driver mapping)
4. Dispatcher adjusts via UI (transfers, reorders, deletes)
5. Changes saved to Supabase via `/api/db` and `/api/actions`
6. Routes pushed to drivers via push notifications
7. `dispatch_logs` and `dispatch_decisions` track all changes

---

## 8. Pharmacy Portal

The pharmacy portal provides pharmacy clients with real-time delivery visibility. Located at `/portal/*` routes within cnc-web.

### Pages

#### `PortalLogin.jsx`

- Supabase Auth: `signInWithPassword({ email, password })`
- Validates `profile.role === 'pharmacy'`
- Stores session to localStorage: `cnc-user`, `cnc-profile`, `cnc-token`
- Redirects to `/portal/dashboard` on success

#### `PortalDashboard.jsx`

- **Today's stats**: total deliveries, delivered, in-progress, failed
- **Deliveries table**: today's stops filtered by pharmacy
- **POD modal**: click a delivered stop to view proof-of-delivery (photos, signature, GPS, timestamp)

#### `PortalDeliveries.jsx`

- **Date range picker**: custom start/end date
- **Search**: by patient name, address, order ID
- **Filters**: status, driver, date
- **Full table**: all deliveries with sorting and pagination

#### `PortalPODRecords.jsx`

- **Card grid layout**: each card shows delivery with thumbnail photos
- **Photo viewer**: full-size package and house photos
- **Signature display**: rendered signature image
- **GPS verification**: distance from delivery address shown

#### `PortalReports.jsx`

- **30-day summary**: aggregate metrics over rolling 30 days
- **6 key metrics**: total deliveries, on-time %, failed %, average delivery time, cold chain compliance, POD completion rate
- **CSV export**: download report data as CSV

#### `PortalShell.jsx`

- Sidebar navigation layout wrapping all portal pages
- Links: Dashboard, Deliveries, POD Records, Reports
- User info display and logout button
- Responsive — collapses on mobile

### Auth Flow

1. User navigates to `/portal`
2. `ProtectedRoute` checks localStorage for existing session
3. If no session -> redirect to `/portal/login`
4. If session exists -> validate token, load profile
5. If `profile.role !== 'pharmacy'` -> redirect to login with error
6. Session refresh handled automatically by Supabase client

---

## 9. Homepage

The public-facing homepage at `cncdelivery.com` showcases the company and technology.

### Sections (in scroll order)

#### `Hero.jsx`
- Full-screen hero with company name, tagline, CTA button
- Animated entrance effects

#### `HowItWorks.jsx`
- Step-by-step delivery process explanation
- Icon-driven cards

#### `Pillars.jsx`
- Core value propositions (reliability, technology, compliance, coverage)

#### `Technology.jsx` + Scroll Animation
- **Light-to-dark scroll transition**: driven by `Technology.jsx`
- As user scrolls into the Technology section, background transitions from light to dark
- Navigation colors update via CSS custom properties:
  - `--nav-bg` — navbar background
  - `--nav-text` — navbar text color
  - `--nav-border` — navbar border
- Uses `useInView` hook with IntersectionObserver
- Smooth interpolation based on scroll position

#### `TechSlides.jsx`
- Interactive technology showcase slides
- `PharmacyPortalDemo` — portal interface mockup
- `DispatchPortalDemo` — dispatch interface mockup
- `DriverAppDemo` — driver app interface mockup
- `CardCarousel` — rotating card display

#### `TechLocalMap.jsx`
- Animated delivery route map using Mapbox
- Route data pre-generated by `scripts/generate-tech-local-routes.mjs`

#### `ServiceArea.jsx` + `ServiceMap.jsx`
- Coverage area display (Summit, Stark, Portage, Tuscarawas counties)
- Interactive map showing service boundaries

#### `Team.jsx`
- Team member spotlights

#### `Stats.jsx`
- Key metrics: 1.3M+ deliveries, 215k+ verified, 20+ drivers, 7+ years

#### `FAQ.jsx`
- Frequently asked questions with expandable accordion

#### `ContactForm.jsx`
- Name, email, message fields
- Submits via `/api/actions` with action `contact_form`

#### `CTA.jsx`
- Final call-to-action section

#### Persistent Components
- `Navbar` — sticky nav with scroll-responsive theming
- `Footer` — site footer with links
- `BrandMark` — CNC logo component
- `BackToTop` — scroll-to-top button

---

## 10. Known Issues and Workarounds

### Active Issues

#### `crypto.js` passthrough — No real encryption

`encryptForWrite()` and `decryptForRead()` in `crypto.js` are **passthrough functions** — they return the input unchanged. Real encryption (AES-256) was disabled because the WASM crypto library crashes under Hermes (React Native's JS engine). Address notes and patient names in `order_deletions` are marked as "encrypted" in the schema but are stored in plaintext.

#### `pin_color` column doesn't exist

Code references `pin_color` on `daily_stops` but the column may not exist in the actual database schema. Writes to this column silently fail; reads return `null`.

#### RLS: No DELETE policy for drivers

Drivers have SELECT/UPDATE/INSERT policies but **no DELETE policy** on any table. All deletions must go through `/api/db` (service role key). This is intentional — drivers should never directly delete data.

#### `route_ready` notification 20-hour window expiry

Route-ready push notifications have a TTL of 20 hours. If a driver doesn't open the app within that window, the notification expires and they won't see it. They must pull-to-refresh to discover their route.

#### Mapbox 25 waypoint limit

Mapbox Directions API has a maximum of 25 waypoints per request. Routes with more stops are **chunked** with 1-point overlap between chunks to maintain continuity. This can produce slightly suboptimal routes at chunk boundaries.

#### Google Routes API 98 waypoint maximum

Google Routes API supports a maximum of 98 intermediate waypoints. Routes exceeding this fall back to OSRM or nearest-neighbor.

#### Vercel 10s timeout on analytics

The `/api/analytics` endpoint can hit Vercel's free-tier **10-second function timeout** on large date ranges. Pre-aggregated tables (`monthly_stop_summary`, `daily_performance_summary`) were created to mitigate this.

#### `dispatch-log-decision.js` `.limit(5000)` bug

The dispatch decision log query uses `.limit(5000)` which can **truncate results** on high-volume days or long lookback periods. Patterns analysis may be incomplete.

### Fixed Issues

#### Delete action name mismatch — FIXED

Previously, the delete email notification used action name `send_email` instead of `email`. This has been corrected.

#### Manual stop missing columns — FIXED

Manually added stops were missing required columns: `delivery_day`, `driver_number`, `pharmacy`, `assigned_driver_number`, `dispatch_driver_number`. These are now included in the manual stop creation flow.

### Workarounds

#### Routes-not-ready banner timing

The "Routes not ready" banner in the driver app only appears **after 5:30 PM ET**. Before that time, absence of routes is considered normal.

#### Transfer notification window

Push notifications for transfers are only sent between **6 AM – 6 PM ET**. Transfers outside this window still execute but don't generate notifications.

---

## 11. Environment Variables

### cnc-web — Frontend (Vite)

| Variable | Purpose | Used In |
|----------|---------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `src/lib/supabase.js` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (RLS-enforced) | `src/lib/supabase.js` |
| `VITE_MAPBOX_TOKEN` | Mapbox public token for maps | Homepage map components |

### cnc-web — Backend (Vercel serverless)

| Variable | Purpose | Used In |
|----------|---------|---------|
| `SUPABASE_URL` | Supabase project URL | `api/_lib/supabase.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) | `api/_lib/supabase.js` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google service account credentials (full JSON) | `api/_lib/sheets.js` |
| `GOOGLE_CLIENT_EMAIL` | Google client email (extracted from JSON) | `api/_lib/sheets.js` |
| `GOOGLE_PRIVATE_KEY` | Google private key (extracted from JSON) | `api/_lib/sheets.js` |
| `GOOGLE_ROUTES_API_KEY` | Google Routes API key | `api/optimize-route.js`, `api/fleet-optimize.js` |
| `MAPBOX_TOKEN` | Mapbox server token | `api/` map-related endpoints |
| `MASTER_SHEET_ID` | Google Sheets master spreadsheet ID | `api/_lib/sheets.js` |
| `SHEET_MONDAY` | Monday sheet tab name/ID | `api/_lib/sheets.js` |
| `SHEET_TUESDAY` | Tuesday sheet tab name/ID | `api/_lib/sheets.js` |
| `SHEET_WEDNESDAY` | Wednesday sheet tab name/ID | `api/_lib/sheets.js` |
| `SHEET_THURSDAY` | Thursday sheet tab name/ID | `api/_lib/sheets.js` |
| `SHEET_FRIDAY` | Friday sheet tab name/ID | `api/_lib/sheets.js` |
| `GMAIL_USER` | Gmail address for sending emails | `api/actions.js` |
| `GMAIL_APP_PASSWORD` | Gmail app-specific password | `api/actions.js` |
| `RW_API_KEY` | Road Warrior API key | `api/actions.js` |
| `RW_ACCOUNT_ID` | Road Warrior account ID | `api/actions.js` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Sonnet | `api/ai-insights.js` |
| `CRON_SECRET` | Secret for cron job authentication | `api/advance-day.js`, `api/backup.js` |
| `APPS_SCRIPT_WEBHOOK` | Google Apps Script webhook URL | **Hardcoded** in `api/actions.js` (not actually an env var) |
| `TESLA_CLIENT_ID` | Tesla OAuth client ID | `api/tesla/callback.js` |
| `TESLA_CLIENT_SECRET` | Tesla OAuth client secret | `api/tesla/callback.js` |
| `PORT` | Local server port | `server.js` |

### cnc-driver — Expo App

| Variable | Purpose | Used In |
|----------|---------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | App.js via config |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | App.js via config |
| `MAPBOX_TOKEN` | Mapbox token | **Hardcoded** in `config.js` (not a runtime env var) |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` | Mapbox download token for native SDK | `eas.json` (build-time only) |

---

## 12. Build and Deploy

### cnc-web

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server (Vite) |
| `npm run build` | Production build (Vite) |
| `npm start` | Start Node server (`node server.js`) |

**Deployment**: Auto-deploys on Vercel when pushing to `main` branch on GitHub.

**Vercel Configuration** (`vercel.json`):
- Serverless functions in `/api/`
- Rewrites for SPA routing
- 10-second function timeout (free tier)

### cnc-driver

| Command | Purpose |
|---------|---------|
| `expo start` | Start Expo dev server |
| `eas build --profile development` | Development build |
| `eas build --profile preview` | Preview/TestFlight build |
| `eas build --profile production` | Production build (auto-increment version) |
| `eas submit --platform ios` | Submit to App Store Connect |

**EAS Configuration** (`eas.json`):
- Build profiles: `development`, `preview`, `production`
- `production` profile uses `autoIncrement` for build numbers
- Submit config: ASC API key for automated submission
- `appVersionSource: "remote"` — version managed by EAS, not local

**Bundle ID**: `com.cncdelivery.driver`

### Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/backup` | 6 AM daily | Log table row counts to `backups` |
| `/api/advance-day` | 10 PM Mon–Thu | Advance delivery date, lock recon |
| `/api/advance-day` | 4 AM + 9 AM Saturday | Weekend advance |

All cron jobs are authenticated with `CRON_SECRET`.

---

## 13. Critical Rules

These rules are essential for correct system operation. Violating any of them will cause bugs or data corruption.

### Date Handling

**Always use local time, NEVER `toISOString()`**. JavaScript's `toISOString()` converts to UTC, which shifts the date backward for Eastern Time. Use:
```js
// CORRECT
const today = new Date().toLocaleDateString('en-CA') // "2026-04-10"

// WRONG — will return yesterday's date after 8 PM ET
const today = new Date().toISOString().slice(0, 10)
```

### Payroll Counting

Payroll counts **PACKAGES** (individual rows in `daily_stops`), NOT consolidated stops. Two packages to the same address = 2 stops for payroll. This is a business rule, not a bug.

### API Parameter Names

`/api/db` uses `operation` param, NOT `action`:
```js
// CORRECT
fetch('/api/db', { body: JSON.stringify({ operation: 'update', table: 'daily_stops', ... }) })

// WRONG
fetch('/api/db', { body: JSON.stringify({ action: 'update', ... }) })
```

### Service Role Key

All `/api/` endpoints use the **service role key** which bypasses RLS entirely. All driver writes from the app go through `/api/db` — drivers never write directly to Supabase with the anon key.

### Route Source of Truth

`driver_routes` table is the **source of truth** for stop ordering. The `stop_sequence` JSON array defines the order. Do not rely on `daily_stops.sort_order` for route ordering.

### Mapbox Directions Waypoint Limit

Maximum **25 waypoints** per Mapbox Directions API call. For longer routes, chain requests with **1-point overlap** (last point of chunk N = first point of chunk N+1).

### Google Routes API Waypoint Limit

Maximum **98 intermediate waypoints** per Google Routes API call. Routes exceeding this fall back to OSRM, then nearest-neighbor.

### Vercel Timeout

Vercel free tier has a **10-second function timeout**. Long-running queries (analytics, large batch geocodes) must be optimized or use pre-aggregated tables.

### Apps Script URL

`APPS_SCRIPT_URL` is **hardcoded** in `actions.js`, not stored as an environment variable. If the Apps Script URL changes, the code must be updated directly.

### Transfer Notification Window

Push notifications for transfers only send between **6 AM – 6 PM ET**. Outside this window, transfers execute silently.

### Routes-Not-Ready Banner

The "Routes not ready" banner in the driver app only shows **after 5:30 PM ET**. This is intentional — routes are typically pushed between 3–5 PM.

### Encryption Status

`encryptForWrite()` is a **passthrough** — no real encryption is active. The WASM-based AES-256 library crashes under Hermes. Address notes and patient names in `order_deletions` are stored in plaintext despite schema annotations.

### Manual Stop Required Fields

When creating a manual stop, these columns are **mandatory** (omitting them causes downstream failures):
- `delivery_day`
- `driver_number`
- `pharmacy`
- `assigned_driver_number`
- `dispatch_driver_number`

### Correction Tracking

`last_correction_driver` on `daily_stops` prevents sending duplicate correction emails to WFL. When a stop is reassigned:
1. The system checks if `last_correction_driver !== current driver_name`
2. If different, a correction email is eligible
3. After sending, `mark_correction_sent` updates the field
4. Subsequent checks see the field matches and skip the email

### Floating Drivers

**Brad** and **Kasey** are designated floating drivers. `auto-dispatch` can reassign their stops during rebalancing. Other drivers' stops are not automatically reassigned.

### Road Warrior Integration

Road Warrior driver email mapping is **hardcoded** in `actions.js`:

| Driver | Road Warrior Email |
|--------|--------------------|
| Alex | (hardcoded) |
| Josh | (hardcoded) |
| Laura | (hardcoded) |
| Mark | (hardcoded) |
| Mike | (hardcoded) |
| Nick | (hardcoded) |
| Dom | (hardcoded) |

If a new driver needs Road Warrior, their email must be added to the map in `actions.js`.

---

> **End of CNC Master Documentation**
>
> This document covers the complete technical architecture of CNC Delivery's software platform as of 2026-04-10. It is intended to serve as a single reference for understanding, maintaining, or rebuilding any component of the system.
