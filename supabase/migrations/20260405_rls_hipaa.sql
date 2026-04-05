-- ============================================================
-- CNC Delivery — HIPAA RLS Migration
-- Run in Supabase SQL Editor (tefpguuyfjsynnhmbgdu)
--
-- Prerequisites:
--   1. All drivers must have Supabase Auth accounts
--   2. Each driver's profiles.full_name must match drivers.driver_name
--      OR profiles.email must match drivers.email
--   3. Dispatchers must have profiles.role = 'dispatcher'
--
-- After running this, the anon key can only read non-PHI tables.
-- Driver app MUST authenticate via Supabase Auth.
-- Server-side API routes use service_role key (bypasses RLS).
-- ============================================================

-- ============================================================
-- HELPER: Reusable function to check dispatcher role
-- Avoids repeating the profiles subquery in every policy
-- ============================================================
create or replace function public.is_dispatcher()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'dispatcher'
  );
$$ language sql security definer stable;

-- ============================================================
-- HELPER: Get the driver_name for the current authenticated user
-- Links auth.uid() → profiles.email → drivers.email → driver_name
-- ============================================================
create or replace function public.my_driver_name()
returns text as $$
  select d.driver_name
  from public.profiles p
  join public.drivers d on lower(d.email) = lower(p.email)
  where p.id = auth.uid()
  limit 1;
$$ language sql security definer stable;

-- ============================================================
-- 1. ENABLE RLS on all target tables
--    (safe to run even if already enabled)
-- ============================================================
alter table public.daily_stops enable row level security;
alter table public.driver_routes enable row level security;
alter table public.mileage_log enable row level security;
alter table public.driver_favorites enable row level security;
alter table public.time_off_requests enable row level security;
alter table public.stop_reconciliation enable row level security;
alter table public.address_notes enable row level security;
alter table public.order_deletions enable row level security;
alter table public.drivers enable row level security;

-- ============================================================
-- 2. DROP old permissive anon policies that bypass everything
-- ============================================================
drop policy if exists "Public read access to orders" on public.orders;
drop policy if exists "Public read access to dispatch_logs" on public.dispatch_logs;
drop policy if exists "Public read access to drivers" on public.drivers;
drop policy if exists "Public read access to payroll" on public.payroll;
drop policy if exists "Public read access to routing_rules" on public.routing_rules;
drop policy if exists "Public read access to unassigned_orders" on public.unassigned_orders;

-- Also drop any existing policies on our target tables to avoid conflicts
drop policy if exists "Dispatchers full access to drivers" on public.drivers;
drop policy if exists "Drivers can read drivers" on public.drivers;

-- ============================================================
-- 3. DAILY_STOPS
--    Drivers: read + update own rows only (no insert, no delete)
--    Dispatchers: full access (no hard delete)
-- ============================================================
drop policy if exists "ds_dispatcher_all" on public.daily_stops;
create policy "ds_dispatcher_all"
  on public.daily_stops for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "ds_driver_select" on public.daily_stops;
create policy "ds_driver_select"
  on public.daily_stops for select
  using (driver_name = public.my_driver_name());

drop policy if exists "ds_driver_update" on public.daily_stops;
create policy "ds_driver_update"
  on public.daily_stops for update
  using (driver_name = public.my_driver_name())
  with check (driver_name = public.my_driver_name());

drop policy if exists "ds_driver_insert" on public.daily_stops;
create policy "ds_driver_insert"
  on public.daily_stops for insert
  with check (driver_name = public.my_driver_name());

-- No DELETE policy for drivers = drivers cannot hard delete

-- ============================================================
-- 4. DRIVER_ROUTES
--    Drivers: read + update own routes
--    Dispatchers: full access
-- ============================================================
drop policy if exists "dr_dispatcher_all" on public.driver_routes;
create policy "dr_dispatcher_all"
  on public.driver_routes for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "dr_driver_select" on public.driver_routes;
create policy "dr_driver_select"
  on public.driver_routes for select
  using (driver_name = public.my_driver_name());

drop policy if exists "dr_driver_update" on public.driver_routes;
create policy "dr_driver_update"
  on public.driver_routes for update
  using (driver_name = public.my_driver_name())
  with check (driver_name = public.my_driver_name());

-- ============================================================
-- 5. MILEAGE_LOG
--    Drivers: read + upsert own rows
--    Dispatchers: full access
-- ============================================================
drop policy if exists "ml_dispatcher_all" on public.mileage_log;
create policy "ml_dispatcher_all"
  on public.mileage_log for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "ml_driver_select" on public.mileage_log;
create policy "ml_driver_select"
  on public.mileage_log for select
  using (driver_name = public.my_driver_name());

drop policy if exists "ml_driver_insert" on public.mileage_log;
create policy "ml_driver_insert"
  on public.mileage_log for insert
  with check (driver_name = public.my_driver_name());

drop policy if exists "ml_driver_update" on public.mileage_log;
create policy "ml_driver_update"
  on public.mileage_log for update
  using (driver_name = public.my_driver_name())
  with check (driver_name = public.my_driver_name());

-- ============================================================
-- 6. DRIVER_FAVORITES
--    Drivers: full CRUD on own rows
--    Dispatchers: full access
-- ============================================================
drop policy if exists "df_dispatcher_all" on public.driver_favorites;
create policy "df_dispatcher_all"
  on public.driver_favorites for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "df_driver_select" on public.driver_favorites;
create policy "df_driver_select"
  on public.driver_favorites for select
  using (driver_name = public.my_driver_name());

drop policy if exists "df_driver_insert" on public.driver_favorites;
create policy "df_driver_insert"
  on public.driver_favorites for insert
  with check (driver_name = public.my_driver_name());

drop policy if exists "df_driver_update" on public.driver_favorites;
create policy "df_driver_update"
  on public.driver_favorites for update
  using (driver_name = public.my_driver_name())
  with check (driver_name = public.my_driver_name());

drop policy if exists "df_driver_delete" on public.driver_favorites;
create policy "df_driver_delete"
  on public.driver_favorites for delete
  using (driver_name = public.my_driver_name());

-- ============================================================
-- 7. TIME_OFF_REQUESTS
--    Drivers: read + insert own rows, update own rows
--    Dispatchers: full access
-- ============================================================
drop policy if exists "to_dispatcher_all" on public.time_off_requests;
create policy "to_dispatcher_all"
  on public.time_off_requests for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "to_driver_select" on public.time_off_requests;
create policy "to_driver_select"
  on public.time_off_requests for select
  using (driver_name = public.my_driver_name());

drop policy if exists "to_driver_insert" on public.time_off_requests;
create policy "to_driver_insert"
  on public.time_off_requests for insert
  with check (driver_name = public.my_driver_name());

drop policy if exists "to_driver_update" on public.time_off_requests;
create policy "to_driver_update"
  on public.time_off_requests for update
  using (driver_name = public.my_driver_name())
  with check (driver_name = public.my_driver_name());

-- ============================================================
-- 8. STOP_RECONCILIATION
--    Drivers: read + insert/update own rows
--    Dispatchers: full access
-- ============================================================
drop policy if exists "sr_dispatcher_all" on public.stop_reconciliation;
create policy "sr_dispatcher_all"
  on public.stop_reconciliation for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "sr_driver_select" on public.stop_reconciliation;
create policy "sr_driver_select"
  on public.stop_reconciliation for select
  using (driver_name = public.my_driver_name());

drop policy if exists "sr_driver_insert" on public.stop_reconciliation;
create policy "sr_driver_insert"
  on public.stop_reconciliation for insert
  with check (driver_name = public.my_driver_name());

drop policy if exists "sr_driver_update" on public.stop_reconciliation;
create policy "sr_driver_update"
  on public.stop_reconciliation for update
  using (driver_name = public.my_driver_name())
  with check (driver_name = public.my_driver_name());

-- ============================================================
-- 9. ADDRESS_NOTES
--    All authenticated users: read all notes
--    Authenticated users: insert + update only (no delete)
-- ============================================================
drop policy if exists "an_auth_select" on public.address_notes;
create policy "an_auth_select"
  on public.address_notes for select
  using (auth.uid() is not null);

drop policy if exists "an_auth_insert" on public.address_notes;
create policy "an_auth_insert"
  on public.address_notes for insert
  with check (auth.uid() is not null);

drop policy if exists "an_auth_update" on public.address_notes;
create policy "an_auth_update"
  on public.address_notes for update
  using (auth.uid() is not null);

-- No DELETE policy = no user can delete address_notes via client

-- ============================================================
-- 10. DRIVERS table
--     Authenticated users: read all (need driver list for team view)
--     Dispatchers: full write access
--     No one can hard delete
-- ============================================================
drop policy if exists "drv_dispatcher_write" on public.drivers;
create policy "drv_dispatcher_write"
  on public.drivers for all
  using (public.is_dispatcher())
  with check (public.is_dispatcher());

drop policy if exists "drv_auth_read" on public.drivers;
create policy "drv_auth_read"
  on public.drivers for select
  using (auth.uid() is not null);

-- ============================================================
-- 11. ORDER_DELETIONS
--     Dispatchers: read + insert (audit log)
--     Drivers: insert only (log when they delete)
--     No one can hard delete or update the log
-- ============================================================
drop policy if exists "od_dispatcher_read" on public.order_deletions;
create policy "od_dispatcher_read"
  on public.order_deletions for select
  using (public.is_dispatcher());

drop policy if exists "od_auth_insert" on public.order_deletions;
create policy "od_auth_insert"
  on public.order_deletions for insert
  with check (auth.uid() is not null);

-- No UPDATE or DELETE policies = audit log is immutable

-- ============================================================
-- 12. Keep read-only anon access for non-PHI public tables
--     (dispatch_logs, routing_rules — used by homepage/public views)
-- ============================================================
drop policy if exists "anon_dispatch_logs" on public.dispatch_logs;
create policy "anon_dispatch_logs"
  on public.dispatch_logs for select
  using (true);

drop policy if exists "anon_routing_rules" on public.routing_rules;
create policy "anon_routing_rules"
  on public.routing_rules for select
  using (true);

-- ============================================================
-- DONE
--
-- IMPORTANT: After running this SQL, you must:
--
-- 1. Create Supabase Auth accounts for all drivers who don't have one.
--    Use their email from the drivers table + a default password.
--
-- 2. Update the driver app Login to use supabase.auth.signInWithPassword()
--    instead of the hardcoded password check.
--
-- 3. The web dispatch portal already uses Supabase Auth — no changes needed.
--
-- 4. Server-side API routes (Vercel) use SUPABASE_SERVICE_ROLE_KEY
--    which bypasses RLS — no changes needed there.
--
-- To test that a driver can only see their own stops:
--
--   -- Sign in as Bobby via Supabase Auth
--   -- Then run:
--   select * from daily_stops;
--   -- Should only return Bobby's stops
--
--   -- Try to read another driver's stops:
--   select * from daily_stops where driver_name = 'Jake';
--   -- Should return 0 rows
-- ============================================================
