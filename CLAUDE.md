# CNC Web — Master Document (2026-05-03)

## Web Platform
- **Tech:** React 18 + Vite, Vercel serverless functions
- **Repo:** `~/Desktop/cnc-web/` → `github.com/Cutrufello21/cnc-web`
- **Domain:** cncdelivery.com
- **Database:** Supabase (ref: `tefpguuyfjsynnhmbgdu`) — 128k+ orders, shared with driver app
- **Auth:** Supabase Auth + `profiles` table (`role`: dispatcher / driver / pharmacy, plus `pharmacy_name`)
- **Site gate:** the marketing root (`/`) sits behind a sessionStorage password (`@Peaceout55`) until launch
- **Single dispatcher:** Dom is the only dispatch portal user today

## Architecture
- **Two codebases, one Supabase:** driver app at `~/cnc-driver/` (separate CLAUDE.md), web at `~/Desktop/cnc-web/`. Both write to the same tables.
- **DB writes:** Most client writes route through `/api/db` (service-role key, bypasses RLS). Direct supabase client is read-mostly. **Same `/api/db` bypass exists in the driver app — this is the central RLS tradeoff for the LYN Rx migration.**
- **API surface:** 43 Vercel functions in `api/` (incl. `api/tesla/`, `api/_lib/`). All server-side Supabase calls go through `api/_lib/supabase.js` which uses `SUPABASE_SERVICE_ROLE_KEY` — every endpoint bypasses RLS.
- **Deploy:** `npx vercel --prod`. Vercel free-tier 10s function timeout still in effect — `analytics.js` and `coverage-data.js` are paginated/limited because of it.

## Routes (App.jsx)
- `/` — marketing HomePage (gated)
- `/privacy`, `/support`, `/hipaa` — legal pages
- `/login` — dispatcher / driver login (`LoginPage`)
- `/portal` — pharmacy login (`PortalLogin`)
- `/portal/dashboard | /deliveries | /pod-records | /reports | /patients | /orders | /pickups`
- `/dispatch` — main dispatch portal (`DispatchPage`)
- `/dispatch-v2` — newer dispatch shell (active dev: `DispatchV2Routes`, drivers, sort list, routing rules, settings)
- `/mobile` — `MobileDispatch` for mid-day phone moves
- `/driver` — fallback driver web page (drivers use the native app, not this)

## Dispatch Portal — `/dispatch`

Sidebar nav (4 sections, 9 views):

**Dispatch**
- **HQ** — `HQDashboard.jsx` + `HQDriverProgress.jsx`. Live ops: KPI cards (this week orders, avg/night, active drivers, SHSP/Aultman split), 14-day volume bar chart, top-10 driver leaderboard, dispatch_log table with CC/unassigned columns, weekly mileage. Realtime subscription on `daily_stops` with 60s polling fallback.
- **Routes** — `RoutesView.jsx` (orchestrator) + `dispatch-v2/DispatchV2Routes.jsx`. Build routes, assign drivers, send routes (auto-optimizes on send via `optimize-route.js`). Hosts `RoutingEditor`, `SortList`, `UnassignedSection`, `UnassignedZips`, AI suggest/apply via `/api/ai-dispatch`.

**Records** *(new section since 2026-04-14)*
- **Pickups** — `Pickups.jsx`. Pickup-request inbox (status tabs: pending / assigned / completed), 45s auto-refresh. Assigns driver + delivery_date via `/api/db` on `pickup_requests`. Sends push via `/api/actions`.
- **POD** — `PODRecords.jsx`. Date / pharmacy / driver-filtered POD gallery — photos, signatures, geofence pass/fail badges, barcode validation, bulk PDF export. Reads `daily_stops` + `delivery_confirmations`.
- **Orders** — `Orders.jsx`. Order management view.

**Team**
- **Drivers** — `Drivers.jsx` + `DriverCard.jsx`. Driver management, rates.
- **Schedule** *(internal key `timeoff`)* — `Schedule.jsx` orchestrator with four panels:
  - `ScheduleBuilder.jsx` — click-cycle weekly schedule grid (Mon–Fri); cycles Off → SHSP AM → Aultman AM → SHSP PM → SHSP AM+PM → Off.
  - `ScheduleWeekGrid.jsx` — 2-week roster grid with override cycling, time-off rendering, "Offer Shift" modal. Writes `schedule_overrides` and `shift_offers` via `/api/db`.
  - `ScheduleAudit.jsx` — analyzes 90 days of dispatch history vs `routing_rules`, flags critical/high/low mismatches with confidence %. Calls `/api/rules-audit`; applies fixes via `/api/rules-apply`.
  - `SchedulePending.jsx` — time-off approve/deny panel; updates `time_off_requests`, notifies driver via `/api/actions`. Sidebar nav badge counts pending.
- **Comms** — `Communications.jsx`. Announcements CRUD (announcement / meeting / note / poll / signup / update). Scheduler, expiry, pharmacy/driver targeting, poll results, read receipts. Touches `announcements`, `poll_responses`, `announcement_reads`.

**Finance**
- **Payroll** — `Payroll.jsx` orchestrator with sub-tabs:
  - `PayrollTable.jsx` — editable Mon–Fri stop-count grid, rates, will-calls, office fees, weekly pay.
  - `PayrollRecon.jsx` — driver-submitted reconciliation; approve syncs actuals via `/api/payroll`. Writes `stop_reconciliation`.
  - `PayrollInsights.jsx` — read-only AI insights from `/api/ai-insights`, included in approval email.
  - `PLTab.jsx` — company P&L ledger (`company_ledger` inserts).
  - Driven by `usePayrollData()` hook.
- **Analytics** — `Analytics.jsx` orchestrator with sub-tabs Overview / Trends / Drivers / Geography / Pharmacy / Insights. Charts via `AnalyticsCharts.jsx` (BarChart, TrendChart, LineChart). `AnalyticsInsights.jsx` adds seasonality, driver turnover (6-month), cold-chain by day, ZIP growth/decline, contract-rate calculator, driver-pay simulator. Calls `/api/analytics`.

Other dispatch-side pieces wired into Routes view: `DeliveryMap.jsx`, `DispatchMap.jsx`, `DriverCard.jsx`, `DispatchSummary.jsx`, `Heatmap.jsx`, `RecentLog.jsx`, `Revenue.jsx`, `SheetViewer.jsx`, `StopDistribution.jsx`, `TimeOff.jsx`, `WarningBanner.jsx`, `WeatherWidget.jsx`, `WeeklyGrid.jsx`.

## Dispatch v2 — `/dispatch-v2`
Newer modular shell (`DispatchV2Shell.jsx`) replacing parts of `DispatchPage`. Pages live in `src/pages/dispatch-v2/`:
- `DispatchV2Routes.jsx` — main routes view (this is what `/dispatch-v2` mounts)
- `DispatchV2Drivers.jsx`, `DispatchV2SortList.jsx`, `DispatchV2RoutingRules.jsx`, `DispatchV2Settings.jsx`, `DispatchV2Login.jsx`

`DispatchV2Routes.handleSendAll` is canonical: optimizes each driver's route (uses `home_address` as end, or round-trip to pharmacy if unset), updates `sort_order` on `daily_stops`, writes `driver_routes`, sends emails + push.

## Pharmacy Portal — `/portal`

Authenticates via `PortalLogin.jsx` against Supabase Auth + `profiles`. Profile carries `role='pharmacy'` and `pharmacy_name`; dispatchers (`role='dispatcher'`, `pharmacy_name='all'`) can also enter the portal as admin. Layout shell: `PortalShell.jsx`.

Pages:
- **PortalDashboard** — today's deliveries, real-time progress, driver routes, ETA. Filters `daily_stops` by `pharmacy` column (defaults to `'SHSP'` for admin if no pharmacy selected). Stop deletion via `/api/db`.
- **PortalDeliveries** — historical delivery search (default 7-day), 100/page, batch-fetch `delivery_confirmations`. Pharmacy-filtered.
- **PortalPODRecords** — POD gallery for delivered orders on a specific date with photo/geofence/barcode badges.
- **PortalReports** — 30-day analytics (volume, day-of-week, top ZIPs, leaderboard), CSV export, paginated 1000 rows/batch.
- **PortalPatients** *(new)* — patient lookup across all dates; normalizes names; shows delivery count, frequency, last delivery, next pending.
- **PortalOrders** *(new, admin-only)* — CSV order upload (Trellis with Dest* preference). Calls `/api/upload-orders`. Pharmacy options hardcoded: `SHSP`, `Aultman`.
- **PortalPickups** *(new)* — pickup request form + list. Inserts `pickup_requests` rows via `/api/db`. Mapbox autocomplete for pickup address. Defaults to user's `pharmacy_name`, or `'SHSP'` for admin.

**Multi-tenant readiness:** all portal pages filter by the `pharmacy` column when not admin — but the fallback default is hardcoded `'SHSP'` in 6 places (Dashboard, Deliveries, PODRecords, Reports, Patients, Pickups). PortalShell does not enforce isolation; it relies on each page filtering correctly.

## Marketing Site (cncdelivery.com)
Public components in `src/components/`. The homepage is composed of these sections (light → dark scroll animation driven by `Technology.jsx`, nav colors via CSS vars `--nav-bg/--nav-text/--nav-border`):

`Hero` · `HeroMap` · `TrustBar` · `Pillars` · `HowItWorks` · `ServiceArea` · `ServiceMap` · `Stats` · `Technology` · `TechSlides` · `TechLocalMap` · `DriverAppDemo` · `DispatchPortalDemo` · `PharmacyPortalDemo` · `CardCarousel` · `About` · `Team` · `FAQ` · `ContactForm` · `CTA` · `Footer` + `Navbar` · `BackToTop` · `BrandMark` · `ThemeToggle`.

Hardcoded CNC copy (must be config-driven for white-label):
- "CNC Delivery Service" / "CNC Delivery" — `Footer`, `Team`, `About`, `BrandMark`
- "Founded by Paul Cutrufello in 2007" — `About`, `Team`
- "Akron, Ohio" / "Northeast Ohio" / "Summit County" — `Hero`, `About`, `ServiceArea`, `Footer`, `Pillars`, `TrustBar`, `Stats`, `FAQ`
- "200+ ZIP codes" — `TrustBar`, `og.jsx`
- City list ("Akron, Barberton, Cuyahoga Falls, Stow, Hudson, Green, Norton") — `ServiceArea`, `FAQ`
- Email `dom@cncdeliveryservice.com` — `About`, `Footer`, `ContactForm`
- Personal names (Paul, Dominic, Mark, Mia, Kelly) — `Team`

`ServiceMap`/`TechLocalMap` use Mapbox with route lines from Akron to NE Ohio cities (data in `techLocalRoutes.json`, generated by `scripts/generate-tech-local-routes.mjs`).

## Hooks (`src/hooks/`)
- **`useDispatchData`** — fetches dispatch view data from Supabase, normalizes addresses, computes delivery date.
- **`useDispatchActions`** — sends routes / corrections / call-ins to Apps Script; manages preview state.
- **`useRouteActions`** — extracted from `DispatchV2Routes`; SICI/WFL corrections, stop transfers, resend.
- **`usePayrollData`** — payroll/settlement loader; reconciliation, time-off, AI insights.
- **`useInView`** — IntersectionObserver hook for marketing-site lazy animations.

## `src/lib/`
- **`db.js`** — client wrapper for `/api/db`. Exports `dbInsert`, `dbUpdate`, `dbDelete`, `dbUpsert`. Every supabase write from React goes through this.
- **`supabase.js`** — anon-key client (read-only path).
- **`getDeliveryDate.js`** — current delivery date `YYYY-MM-DD`, advances at 6 PM ET. Mirrors driver-app logic exactly.
- **`podPdf.js`** — generates POD PDFs; embeds photos/signatures, computes GPS distance, cold-chain compliance.
- **`zipCoords.js`** — NE Ohio ZIP centroid lookup (44xxx range).

## API Endpoints (`api/`)

### Cron jobs (`vercel.json`)
- **`/api/backup`** — daily 6am ET; row counts to `backups`, prunes to last 30
- **`/api/advance-day`** — Mon–Thu 10pm ET, Sat 4am & 9am ET; locks weekly recon, counts next-day stops
- **`/api/release-schedule`** — weekly Sunday 4pm ET; pushes 2-week schedule to drivers
- **`/api/eod-summary`** — Mon–Fri 11pm ET; emails daily summary via Apps Script

### Generic write proxy
- **`api/db.js`** ⚠️ POST. `{ table, operation, data, match, onConflict }`. Operations: `insert`, `update`, `delete`, `upsert`. **Bypasses RLS via service role**. Auth: Supabase JWT or `API_SECRET`. Whitelisted tables (21):
  `time_off_requests, delivery_confirmations, driver_routes, daily_stops, driver_notifications, stop_reconciliation, driver_favorites, mileage_log, address_notes, order_deletions, drivers, routing_rules, schedule_overrides, shift_offers, driver_schedule, announcements, poll_responses, announcement_reads, geocode_cache, address_corrections, pickup_requests`
  (`pickup_requests` was added 2026-04-30 with the new pickups feature.)

### Dispatch / routing
- **`optimize-route.js`** — Google Route Optimization API → Routes API → nearest-neighbor. Reads/writes `geocode_cache`. Hardcoded SHSP/Aultman pharmacy origins.
- **`fleet-optimize.js`** — Route Optimization API: assigns AND optimizes across drivers. Hardcoded SHSP/Aultman/Brad/Kasey.
- **`auto-dispatch.js`** — preview/apply auto-optimize with rebalancing. Hardcoded Brad/Kasey (floaters), Paul (excluded), MAX_STOPS_PER_DRIVER=45.
- **`auto-assign.js`** — moves off-duty drivers' stops to available drivers using `routing_rules` + schedule.
- **`reassign.js`** — move stops between drivers in BOTH Supabase and Google Sheets.
- **`actions.js`** — multi-action: `approve`, `email`, `transfer`, `mark_correction_sent`, `roadwarrior`, `email_route`, `push_notify`, `notify_delete`, `announce`, `list_announcements`, `list_announcement_reads`, `push_routes`, `contact_form`. Hardcoded `wfldispatch@biotouchglobal.com` (BIOTOUCH_EMAIL), `dom@cncdeliveryservice.com`, Road Warrior driver-email map.
- **`dispatch.js`** — auto-detects delivery date, returns grouped stops + unassigned.
- **`dispatch-log-decision.js`** — actions: `log_move`, `log_optimize`, `snapshot`, `snapshot_initial`, `get_patterns`, `auto_log`, `log_sort_list`. Powers the learning engine (`dispatch_decisions`).
- **`routing.js` / `route-patterns.js` / `rules-apply.js` / `rules-audit.js` / `sort-list.js`** — `routing_rules` CRUD, ZIP transition analysis, schedule audit pipeline, sort list management.

### AI
- **`ai-dispatch.js`** — Claude Sonnet 4 (`claude-sonnet-4-20250514`), max_tokens 16384. Reads daily_stops, routing_rules, dispatch_history_import, drivers, dispatch_decisions, driver_schedule, time_off_requests. Hardcoded SHSP/Aultman.
- **`ai-insights.js`** — Claude Sonnet 4, max_tokens 800. Weekly ops insights for payroll email.
- **Env:** `ANTHROPIC_API_KEY`.

### Geocoding / maps
- **`geocode.js`** — Supabase cache → Google → Census Bureau → ZIP centroid. Caches in `geocode_cache`.
- **`map-data.js`** — heat-map aggregation by address, geocoded.
- **`coverage-data.js`** *(new)* — ZIP-level heat-map data, 6 months, paginated 1000/query.

### Orders / records
- **`orders.js`** — paginated order list.
- **`order-filters.js`** — filter dropdowns (drivers, sources, cities, years).
- **`upload-orders.js`** *(new)* — Trellis/OpenForce CSV parser; auto-detects columns; inserts `daily_stops`. Service-role.
- **`upload-settlement.js`** — OpenForce settlement Excel; upserts `settlements`. NAME_MAP hardcoded.
- **`pod-upload.js`** *(new)* — POD photo/PDF upload to Supabase Storage `POD` bucket.
- **`sample-pod-pdf.js`** *(new)* — sample POD PDF for demo/preview.
- **`deliver.js`** — mark stop delivered/failed, batch mode, undo, save notes, upload POD. Hardcoded `dominiccutrufello@gmail.com`.
- **`eod-summary.js`** *(new)* — daily delivery summary email via Apps Script. Hardcoded `dominiccutrufello@gmail.com`.

### Reporting
- **`analytics.js`** — KPIs, volume trend, driver stats, seasonality, ZIP growth, pay. Limited to 6 months because of Vercel 10s timeout. Reads `daily_performance_summary` (with `daily_stops` fallback).
- **`hq.js`** — HQ dashboard payload.
- **`payroll.js`** — GET calculates weekly pay; POST updates day stops/will-calls/weekly pay.
- **`driver.js`** — driver-app payload (`?email=…`): today's stops, week total, daily breakdown.
- **`sheets-view.js`** — mirrors Supabase tables as Sheets tabs; computed tabs: ZIP Analytics, Patient Analytics, Location Intelligence.

### Comms / misc
- **`announcements.js`** *(new)* — fetch active announcements with poll/read counts.
- **`error-log.js`** *(new)* — POST writes `error_logs`, optional Apps Script email. Hardcoded `dom@cncdeliveryservice.com`.
- **`og.jsx`** — Open Graph image (Vercel `@vercel/og`, edge runtime). Hardcoded "CNC Delivery, 200+ ZIPs, since 2007".

### Tesla *(new)*
- **`tesla/callback.js`** — OAuth callback; stores tokens in `tesla_tokens`.
- **`tesla/navigate.js`** — POST address to driver's Tesla; refreshes token if needed.
- **`tesla/status.js`** — connection / vehicle status.
- **Env:** `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`. **CNC-only feature.**

### `_lib/`
- **`auth.js`** — `requireAuth()` / `requireDriver()` / `requireApiKey()`. Accepts JWT or `API_SECRET`. Hardcoded `server@cncdelivery.com`.
- **`supabase.js`** — service-role client. **Every server-side Supabase touch goes through this — RLS is bypassed app-wide.**
- **`sheets.js`** — Google Sheets API helpers; reads `MASTER_SHEET_ID`, `SHEET_MONDAY..FRIDAY`.

## Database Touches by Endpoint

| Table | Read by | Written by |
|-------|---------|-----------|
| `daily_stops` | dispatch, driver, orders, hq, analytics, deliver, map-data, coverage-data, ai-dispatch, ai-insights, fleet-optimize, auto-assign, auto-dispatch, route-patterns, rules-audit, eod-summary | deliver, reassign, fleet-optimize, auto-assign, auto-dispatch, upload-orders, `/api/db` (update/delete) |
| `drivers` | hq, driver, analytics, ai-dispatch, fleet-optimize, auto-assign, auto-dispatch, release-schedule, rules-audit | `/api/db` (update) |
| `driver_routes` | dispatch, hq | `/api/db` (upsert) |
| `routing_rules` | dispatch-suggest, rules-audit, ai-dispatch, fleet-optimize, auto-assign, auto-dispatch | rules-apply, routing, `/api/db` |
| `payroll` | analytics, hq, driver, payroll | payroll |
| `stop_reconciliation` | advance-day, payroll | advance-day, `/api/db` |
| `dispatch_logs` | analytics, hq, driver | dispatch-log-decision |
| `dispatch_decisions` | ai-dispatch | dispatch-log-decision, release-schedule |
| `dispatch_history_import` | ai-dispatch, rules-audit | scripts only |
| `delivery_confirmations` | portal/* (POD), `PODRecords` | `/api/db` (insert), deliver |
| `geocode_cache` | geocode, optimize-route | geocode, optimize-route, `/api/db` |
| `announcements` | announcements, comms | `/api/db` |
| `poll_responses`, `announcement_reads` | announcements | `/api/db` |
| `pickup_requests` | Pickups, PortalPickups | `/api/db` |
| `schedule_overrides`, `shift_offers`, `driver_schedule` | Schedule, ai-dispatch, rules-audit | `/api/db` |
| `time_off_requests` | hq, Schedule, ai-dispatch | `/api/db` |
| `tesla_tokens` | tesla/navigate | tesla/callback, tesla/navigate |
| `error_logs` | — | error-log |
| `backups` | — | backup |
| `settlements` | — | upload-settlement |
| `company_ledger` | PLTab | PLTab (direct supabase client — outlier) |

## Supabase Schema — Web-Specific & Recent

The driver-app CLAUDE.md owns the canonical core-schema list (`daily_stops`, `drivers`, `driver_routes`, `geocode_cache`, etc.). Web-side additions / web-relevant tables not covered there:

| Table | Purpose | Origin |
|-------|---------|--------|
| `pickup_requests` | Pharmacy "go grab this and bring it back" runs. Distinct from `daily_stops` for clean delivery analytics + own POD requirements (sig at pickup, sig at return). | `sql/2026-04-30-pickup-requests.sql` |
| `announcements` / `poll_responses` / `announcement_reads` | Comms tab CRUD with poll + read receipts | dispatch portal |
| `routing_rules` | ZIP + day-of-week → driver mapping; the source of truth that ScheduleAudit and ai-dispatch compare against | dispatch portal |
| `dispatch_history_import` | 90-day historical assignments for AI training; populated from `daily_stops`, `dispatch_logs`, BioTouch correction emails. Internal-only, no RLS. | `20260410_dispatch_history_import.sql` |
| `dispatch_decisions` | Learning-engine log: every manual move, optimize accept/reject, sort-list edit, schedule release | dispatch-log-decision.js |
| `monthly_stop_summary` / `daily_performance_summary` / `driver_events` | Aggregated metrics, nightly pg_cron 3am UTC | `20260406_analytics_tables.sql` |
| `error_logs` / `backups` | Client error capture + daily row-count snapshot | `20260326_backups_and_error_logs.sql` |
| `address_corrections` | Driver-submitted address fixes | `/api/db` insert |
| `address_notes` | Per-address notes (encrypted in driver app) | `/api/db` upsert |
| `settlements` | Weekly OpenForce settlement upload | upload-settlement.js |
| `tesla_tokens` | OAuth tokens per driver | tesla/* |
| `company_ledger` | P&L line items | PLTab.jsx (direct supabase client) |

`pickup_requests` columns: `id, created_at, pharmacy, pickup_address/city/zip/lat/lng, patient_name, reason, reason_detail, urgency (default 'next_route'), requested_by, driver_name, delivery_date, status (default 'pending'), picked_up_at, returned_at, pickup_photo_url, pickup_signature_url, return_signature_url, cancelled_reason`. Indexes: `status`, `pharmacy`, `(driver_name, delivery_date)`. RLS is enabled; an anon-read policy is in place — **the comment in the migration explicitly says "tighten later when full RLS is rolled out."**

### Migrations on disk
- `supabase/migrations/20260326_backups_and_error_logs.sql`
- `supabase/migrations/20260405_rls_hipaa.sql` — HIPAA RLS scaffolding (driver profiles matched by name/email; dispatcher role required)
- `supabase/migrations/20260406_analytics_tables.sql`
- `supabase/migrations/20260408_correction_tracking.sql` — `daily_stops.last_correction_driver` (avoid double-sending the same WFL correction)
- `supabase/migrations/20260410_dispatch_history_import.sql`
- `sql/2026-04-30-pickup-requests.sql` *(new)*

Plus `supabase/allow_anon_reads.sql`, `supabase/create-driver-accounts.sql`, `supabase/migration.sql`, `supabase/setup.sql`, and the JS migration scripts (`backfill-daily-stops.js`, `backfill.js`, `backup.js`, `gmail-auto-import.js`, `migrate-orders-to-daily-stops.js`).

## RLS / Security Notes
- **Service-role bypass** — every write in this repo flows through `api/db.js` (whitelist of 21 tables) or a typed endpoint, all using the service-role key. **RLS is effectively off** for any table touched server-side.
- **Anon read** is enabled broadly (`supabase/allow_anon_reads.sql`, `pickup_requests` migration). Pharmacy portal data isolation is enforced **client-side** by adding `.eq('pharmacy', pharmacyName)` — not by RLS.
- **HIPAA migration `20260405_rls_hipaa.sql`** is the partial start of locking this down but is not the global state.
- **PHI encryption is driver-app-side only**: address and patient_name fields on `daily_stops` are encrypted by the driver app (`crypto.js` libsodium) before write. The web portal **reads them assuming plaintext** — this works today because the driver app encrypts/decrypts on its own writes, but the dispatch portal touches the same rows; verify any new web write does not stomp encrypted fields with plaintext.
- **Site password gate** at `/` (`@Peaceout55`) is sessionStorage only — it's a soft launch gate, not security.

## One-off Scripts (`scripts/`)
- `backfill-dispatch-history.mjs` — populates `dispatch_history_import` from 90 days of `daily_stops`
- `backfill-orders-driver.mjs` — syncs `orders.driver_name` to final `daily_stops` assignment
- `fix-zip-phone-swap.mjs` — one-time cleanup where phone digits leaked into zip
- `generate-tech-local-routes.mjs` — Mapbox road-snapped loops for marketing slide
- `import-correction-emails.mjs` — scrapes Gmail Sent for BioTouch correction emails into `dispatch_history_import`
- `restore-cold-chain-from-csv.mjs`, `restore-zips-from-csv.mjs`, `restore-zips-via-geocode.mjs`, `resync-from-csv.mjs` — Trellis CSV → `daily_stops` recovery scripts (used during the 2026-04-25 data event)

## Design System
- **Brand:** BRAND `#0A2463`, GREEN `#16a34a`, DARK `#0D1B2A`, GRAY `#6B7280`
- CNC = navy `#0A2463` + periwinkle `#60A5FA` + Inter. No teal/emerald/gold (those are LYN Rx).
- Light → dark scroll animation on the marketing homepage driven by `Technology.jsx`.

## Hospitals / Pharmacies
- **SHSP:** 41.08033, -81.49976 (70 Arch St, Akron, OH 44304)
- **Aultman:** 40.79639, -81.40365 (2600 6th St SW, Canton, OH 44710)

## Deploy
```bash
npx vercel --prod
```
SQL changes: paste from `sql/` or `supabase/migrations/` into the Supabase SQL editor.

## Known Issues
- **`/api/db` service-role bypass** — single largest RLS hole; every write goes through this. Mirrors the same hole in the driver app.
- **Site password gate** is sessionStorage-only and trivially bypassable; remove or replace before public launch.
- **Vercel free-tier 10s function timeout** — `analytics.js` capped at 6 months, `coverage-data.js` paginates aggressively, `optimize-route.js` has a 15s wall-clock that already exceeds the limit and will hard-cut on cold starts.
- **`PLTab.jsx` writes `company_ledger` via direct supabase client**, not `/api/db`. References undefined `uploading` / `handleUpload` symbols (broken upload path).
- **Hardcoded fallbacks to `'SHSP'`** in 6 portal pages (`PortalDashboard`, `PortalDeliveries`, `PortalPODRecords`, `PortalReports`, `PortalPatients`, `PortalPickups`, plus `PortalShell`) — single-tenant assumption baked in.
- **Hardcoded pharmacy dropdown** (`SHSP`, `Aultman`) in `PortalOrders`.
- **Marketing copy is CNC-specific** across ~10 components — needs config-driving for any non-CNC tenant.
- **Email sending** still routes through Apps Script URLs (deliver, eod-summary, error-log, actions).
- **Google Cloud free trial:** ~46 days remaining (expires ~2026-06-18) — same clock as the driver app.
- **Tesla integration is CNC-only** in the web codebase too.

## LYN Rx Multi-Tenant Migration Notes (web-side)

Companion to the driver-app migration notes — see `~/cnc-driver/CLAUDE.md` for the canonical plan. Web-side specifics:

### The biggest fix: `/api/db`
Same problem as the driver app. The web client uses `src/lib/db.js` (`dbInsert/dbUpdate/dbDelete/dbUpsert`) for **every write**. Whitelist enforcement on table+operation is good, but there is **no tenant scoping** — any authenticated session can write to any pharmacy's row.

Two paths:
- Rewrite `/api/db` to derive `tenant_id` from the JWT and inject it into every write (and reject mismatches on `match`).
- Or deprecate `/api/db` in favor of typed per-table endpoints that enforce tenant scoping server-side.

Either way, **don't ship LYN Rx with the current `/api/db` shape**.

### CNC-specific things in the web codebase that need feature flags / config

**Endpoints**
- `actions.js` — `BIOTOUCH_EMAIL` (`wfldispatch@biotouchglobal.com`), Road Warrior driver-email map, Apps Script webhook URL. Wrap behind `tenant.cxtEnabled` / `tenant.roadWarriorEnabled`.
- `tesla/*` — CNC-only; feature flag `tenant.teslaEnabled`.
- `release-schedule.js` — emits "CNC Delivery" branding in driver schedule notifications.
- `optimize-route.js`, `fleet-optimize.js`, `auto-assign.js`, `auto-dispatch.js`, `ai-dispatch.js`, `ai-insights.js`, `rules-audit.js` — hardcoded `SHSP` / `Aultman` strings in pharmacy routing logic. Move pharmacy list and dual-pharmacy chain to per-tenant config.
- `og.jsx` — hardcoded "CNC Delivery, 200+ ZIPs, since 2007".
- Hardcoded admin emails: `dominiccutrufello@gmail.com` (deliver, eod-summary), `dom@cncdeliveryservice.com` (actions, error-log), `server@cncdelivery.com` (auth).

**Dispatch portal**
- `ScheduleBuilder` cycles through `SHSP AM → Aultman AM → SHSP PM → SHSP AM+PM` — pharmacy enum is hardcoded.
- Sidebar "CNC" pill in `DispatchPage`.
- `Communications`, `HQDashboard`, `RoutingEditor`, `AnalyticsCharts`, `ScheduleWeekGrid` reference `SHSP`/`Aultman` directly.
- "Demo Driver", "Paul", "Mark", "Dom", "Brad", "Kasey", "Unassigned" appear as magic strings — same problem as the driver app.

**Pharmacy portal**
- Hardcoded `'SHSP'` admin fallback in 6 pages (see Known Issues).
- `PortalOrders` pharmacy dropdown is `['SHSP', 'Aultman']` literal.
- `PortalShell` shows `pharmacyName` from profile; will need a tenant logo/color override layer for true white-labeling.

**Marketing site**
- Almost every section has CNC copy. For LYN Rx, the marketing site stays CNC-branded — `cncdelivery.com` continues to be the CNC tenant's public site. LYN Rx tenants will get either their own marketing pages or a shared "Powered by LYN Rx Platform" landing page.

### Schema changes likely needed
Same list as the driver-app CLAUDE.md — add `tenant_id` to every PHI-bearing or operational table. Web-specific additions to that list:
- `announcements`, `poll_responses`, `announcement_reads` — Comms is per-tenant.
- `pickup_requests` — already has `pharmacy` text column; should become `tenant_id` FK.
- `error_logs`, `backups` — tenant column for per-tenant ops visibility.
- `company_ledger`, `settlements` — tenant-scoped finance.
- `tesla_tokens` — per-tenant + per-driver.
- `geocode_cache` — can stay shared (no PHI).

### Pharmacy portal as the multi-tenant template
`profiles.role='pharmacy'` + `profiles.pharmacy_name` is already the de-facto tenant model on the web side. The pattern is:
1. Login matches user → profile.
2. Profile carries `pharmacy_name`.
3. Every page query filters `eq('pharmacy', pharmacyName)`.
4. Admin (`pharmacy_name='all'` or `role='dispatcher'`) sees everything.

For LYN Rx, generalize: `pharmacy_name` becomes `tenant_id`, the `eq` becomes RLS-enforced, the admin role becomes "platform admin" (Dom + LYN Rx superadmin only). The muscle memory of "every query has a pharmacy filter" is already there in 6 portal pages — replicate that as the tenant scope and migrate it down into RLS.

### White-label tenant branding (web-side)

Aligned with the driver-app plan: single platform — **"LYN Rx Platform"** — that re-skins per tenant after login. CNC stays as `tenant_id = 1`, the founding tenant.

- **Dispatch portal:** sidebar pill, brand colors, login screen, OG image read from `useTenant()` (a new hook reading `tenants` table on auth). No raw `#0A2463` constants; nothing hardcoded "CNC".
- **Pharmacy portal:** `PortalShell` reads `tenant.display_name`, `tenant.logo_url`, `tenant.primary_color` and themes accordingly. Login → tenant lookup before rendering.
- **Marketing sites:** stay tenant-specific. `cncdelivery.com` remains CNC-only marketing. New tenants get a shared platform landing page or their own subdomain.
- **`tenants` table needs branding columns:** `display_name`, `logo_url`, `primary_color`, `accent_color`, plus `feature_flags` (jsonb: `tesla`, `cxt`, `dual_pharmacy_chain`, `road_warrior`, `marketing_site`).
- **CNC tenant config:** navy `#0A2463`, periwinkle `#60A5FA`, Inter, display name "CNC Delivery".
- **LYN Rx tenant default:** teal `#0C6169`, Inter, display name "LYN Rx".
- **White-label is a Professional/Enterprise tier feature** for non-CNC tenants. CNC gets it free as the founding tenant.
