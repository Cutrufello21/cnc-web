# CNC Delivery — Master Document (2026-04-14)

## Web Platform
- **Tech:** React + Vite on Vercel
- **Repo:** `~/Desktop/cnc-web/` → `github.com/Cutrufello21/cnc-web`
- **Domain:** cncdelivery.com
- **Database:** Supabase (ref: tefpguuyfjsynnhmbgdu) — 128k+ orders
- **Auth:** Supabase Auth, profiles table (dispatcher/driver roles)
- **DB writes:** All through /api/db (service role, bypasses RLS) — client supabase is read-only
- **Single user:** Dom is the only dispatch portal user currently

## Driver App
- **Tech:** React Native / Expo SDK 54, monolithic `App.js` (~2800 lines)
- **Repo:** `~/cnc-driver/` → `github.com/Cutrufello21/cnc-driver`
- **Bundle ID:** `com.cncdelivery.driver`
- **Latest Build:** #79 on TestFlight

## Route Optimization Stack
| Priority | Engine | Handles | Auth |
|----------|--------|---------|------|
| 1 | Google Route Optimization API | Any size, traffic-aware | OAuth (service account) |
| 2 | Google Routes API (batched) | ≤24 per batch | API key |
| 3 | Nearest-neighbor | Unlimited (no road data) | None |

- **Service Account:** `cnc-dispatch@cnc-dispatch.iam.gserviceaccount.com`
- **Project:** `cnc-dispatch` (Google Cloud)
- **Env vars:** `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_ROUTES_API_KEY` on Vercel

## Route Optimization Flow

### On Dispatch (automatic)
1. Dom hits Send All on dispatch (DispatchV2Routes.jsx → handleSendAll)
2. System optimizes each driver's route — uses driver's `home_address` as end point, or round trip to pharmacy if none set
3. Updates `sort_order` on `daily_stops`
4. Sends emails + push notifications with optimized order

### On Driver App (manual)
1. Driver opens app → sees pre-optimized route
2. Can tap ⚡ to re-optimize with: Home / Pharmacy / Custom end
3. Can tap ↕ to reverse route order
4. Can drag to manually reorder

## Dispatch Portal Features
- **HQ Dashboard** — live progress (Supabase realtime), volume chart, driver leaderboard
- **Routes** — build routes, assign drivers, send routes (auto-optimizes on send)
- **Payroll** — auto-syncs from daily_stops packages. Revenue, P&L, company ledger.
- **Analytics** — Overview, Trends (MoM + YoY), Drivers, Geography, Pharmacy, Insights
- **Orders** — order management
- **Drivers** — driver management, rates
- **Time Off** — approve/deny requests

## Pharmacy Portal (cncdelivery.com/portal)
- Supabase Auth, pharmacy role required
- Dashboard, Deliveries, POD Records, Reports
- All queries filter by pharmacy — no data leakage

## Key API Endpoints
- **optimize-route.js** — Route Optimization API primary, Routes API fallback, nearest-neighbor fallback. Timeout 15s, traffic retry.
- **geocode.js** — Google → Census Bureau → ZIP center fallback, Supabase cache
- **deliver.js** — Mark stops delivered with GPS
- **reassign.js** — Move stops between drivers
- **actions.js** — Transfers, Road Warrior, email, push
- **db.js** — Generic DB write proxy (service role). Uses `operation` not `action` param.
- **analytics.js** — Dispatch logs, payroll, driver analytics (limited to 6 months to avoid timeout)
- **payroll.js** — Auto-creates rows, syncs from daily_stops
- **dispatch-log-decision.js** — Learning engine snapshots + auto_log

## Supabase Schema (Key Tables)
| Table | Purpose |
|-------|---------|
| `daily_stops` | One row per PACKAGE. Core table for routes, payroll, analytics |
| `drivers` | driver_name, number, pharmacy, active, rates, push_token, home_address, home_lat, home_lng |
| `driver_routes` | stop_sequence array, origin, end config, pinned stops, lock state |
| `geocode_cache` | Persistent geocoding cache |
| `payroll` | Weekly pay data, auto-synced from daily_stops |
| `stop_reconciliation` | Driver weekly summary overrides |
| `company_ledger` | Income/expense tracking with running balance |
| `dispatch_logs` | Authoritative monthly trends |
| `dispatch_decisions` | Learning engine (manual moves, optimize accept/reject) |
| `time_off_requests` | Driver time off |
| `driver_favorites` | Saved addresses per driver |
| `mileage_log` | Daily mileage tracking |
| `monthly_stop_summary` | Per driver/pharmacy/month rollup |
| `daily_performance_summary` | Per driver/day rollup (nightly pg_cron at 3 AM UTC) |

## Data Flow
- daily_stops = one row per package (NOT per stop). Multiple packages to same address = multiple rows.
- Payroll counts packages (rows in daily_stops), not consolidated stops.
- Routes page shows "X STOPS (Y PKG)" — stops are unique addresses, PKG is total packages.
- Auto dispatch log: handleSendRoutes → snapshot + auto_log → generates dispatch_logs entry

## Design System
- **Brand:** BRAND=#0A2463, GREEN=#16a34a, DARK=#0D1B2A, GRAY=#6B7280
- CNC = navy #0A2463 + periwinkle #60A5FA + Inter. No teal/emerald/gold (those are LYN).

## Hospitals
- SHSP: 41.0534, -81.5185 (70 Arch St, Akron, OH 44304)
- Aultman: 40.7989, -81.3784 (2600 6th St SW, Canton, OH 44710)

## Deploy
```bash
npx vercel --prod
```

## Homepage
- Light→dark scroll animation driven by Technology.jsx
- Nav colors via CSS vars (--nav-bg/--nav-text/--nav-border)
- ServiceMap: Mapbox animated map with route lines from Akron to cities

## Roadmap (Not Yet Built)
**High:** Photo POD, signature capture, barcode scan, live ETA sharing
**Medium:** Smart re-routing, delivery history, driver chat, will call alerts
**Nice to have:** Voice commands, route replay, weather, gas tracker, leaderboard

## Known Issues
- Auth bypass active for pre-build-78 driver apps — remove after 2026-04-21
- Vercel free tier: 10s function timeout. Analytics limited to 6 months.
- Google Cloud free trial: $300 credit, 65 days remaining
- EAS build credits: 100% used this month
- Email sending still via Apps Script URLs
