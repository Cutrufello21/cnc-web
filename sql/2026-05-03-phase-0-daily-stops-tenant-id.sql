-- =====================================================================
-- Phase 0 — daily_stops.tenant_id (LYN Rx multi-tenant migration)
-- Date:  2026-05-03
-- Phase: 0 of N (foundation; the hottest table gets tenant_id)
--
-- What this does:
--   - Verifies prerequisites: public.tenants table exists and a row with
--     id = 1 (CNC, the founding tenant) is present. Raises if missing
--     so this can never run before sql/2026-05-03-phase-0-tenants.sql.
--   - Adds public.daily_stops.tenant_id (bigint, FK -> public.tenants(id),
--     ON DELETE RESTRICT). Added nullable so the backfill can run.
--   - Backfills every existing daily_stops row to tenant_id = 1.
--   - Asserts no daily_stops row is left with NULL tenant_id; raises
--     and rolls back the whole transaction if any are missed.
--   - Sets tenant_id NOT NULL after the assertion passes.
--   - Adds four new tenant-leading indexes:
--       idx_daily_stops_tenant_id           on (tenant_id)
--       idx_daily_stops_tenant_date         on (tenant_id, delivery_date desc)
--       idx_daily_stops_tenant_driver_date  on (tenant_id, driver_name, delivery_date)
--       idx_daily_stops_tenant_date_status  on (tenant_id, delivery_date, status)
--
-- What this does NOT do:
--   - Does not drop any existing index. The current four indexes
--     (idx_daily_stops_date, idx_daily_stops_day, idx_daily_stops_driver,
--     idx_daily_stops_status) stay in place. Pruning the now-redundant
--     ones is a separate later migration so we can confirm the new
--     tenant-leading indexes are actually being chosen by the planner
--     before we remove their single-tenant ancestors.
--   - Does not change RLS policies on daily_stops. The existing
--     ds_dispatcher_all / ds_driver_select / ds_driver_update /
--     ds_driver_insert policies keep working unchanged. They are still
--     tenant-blind — that is fixed in a later phase, not here.
--   - Does not change /api/db behavior or add any tenant scoping to
--     reads/writes anywhere in the application yet.
--   - Does not add a UNIQUE on (tenant_id, order_id, delivery_date) or
--     any other composite key — uniqueness semantics on daily_stops are
--     a separate decision because of historical duplicates.
--
-- Idempotency:
--   - Safe to re-run. Column add, FK add, NOT NULL, and all four
--     CREATE INDEX statements are guarded so a second run is a no-op
--     rather than an error.
--   - The backfill targets only rows where tenant_id IS NULL, so a
--     second run touches zero rows.
--
-- Lock duration / scheduling:
--   - ADD COLUMN tenant_id bigint (no DEFAULT) is a metadata-only
--     change in PostgreSQL — instant, briefly takes ACCESS EXCLUSIVE.
--   - ADD CONSTRAINT FOREIGN KEY runs while the column is still all
--     NULL, so validation is trivial — no full-table scan.
--   - The UPDATE backfill holds row locks across ~128k+ rows. On a
--     warm connection this is on the order of seconds, but it WILL
--     block concurrent writes to the same rows.
--   - ALTER COLUMN ... SET NOT NULL takes ACCESS EXCLUSIVE and scans
--     the table once to verify (~1-2s on this size).
--   - Each CREATE INDEX (non-CONCURRENTLY, because the whole migration
--     is wrapped in a single transaction) takes ACCESS EXCLUSIVE for
--     the duration of the index build. Four indexes on 128k+ rows is
--     on the order of low tens of seconds total.
--   - Run off-hours. Estimated total wall-clock: under a minute, but
--     the table is fully blocked for that minute.
--
-- Rollback:
--   begin;
--     drop index if exists idx_daily_stops_tenant_date_status;
--     drop index if exists idx_daily_stops_tenant_driver_date;
--     drop index if exists idx_daily_stops_tenant_date;
--     drop index if exists idx_daily_stops_tenant_id;
--     alter table public.daily_stops alter column tenant_id drop not null;
--     alter table public.daily_stops drop constraint if exists daily_stops_tenant_id_fkey;
--     alter table public.daily_stops drop column if exists tenant_id;
--   commit;
--
-- DO NOT RUN AGAINST PRODUCTION WITHOUT BACKUP. Test against staging first.
-- =====================================================================

begin;

-- ---------- 0. Prerequisite guard ------------------------------------

-- Refuse to run if the tenants table doesn't exist or CNC (id=1) is
-- missing. Without this, the backfill would silently set every row to
-- tenant_id = 1, then the FK add would fail AFTER the column is in
-- place — leaving the schema in a half-migrated state.
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'tenants'
  ) then
    raise exception
      'Prerequisite missing: public.tenants does not exist. Run sql/2026-05-03-phase-0-tenants.sql first.';
  end if;

  if not exists (select 1 from public.tenants where id = 1) then
    raise exception
      'Prerequisite missing: public.tenants has no row with id = 1 (CNC). The seed in sql/2026-05-03-phase-0-tenants.sql must run before this migration.';
  end if;
end$$;

-- ---------- 1. Add column (nullable) --------------------------------

alter table public.daily_stops
  add column if not exists tenant_id bigint;

-- ---------- 2. Add FK (guarded so re-runs don't error) --------------

-- Done while the column is still all NULL — FK validation is trivial,
-- no table scan.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname  = 'daily_stops_tenant_id_fkey'
      and conrelid = 'public.daily_stops'::regclass
  ) then
    alter table public.daily_stops
      add constraint daily_stops_tenant_id_fkey
      foreign key (tenant_id)
      references public.tenants(id)
      on delete restrict;
  end if;
end$$;

-- ---------- 3. Backfill existing rows to CNC (tenant_id = 1) --------

update public.daily_stops
   set tenant_id = 1
 where tenant_id is null;

-- ---------- 4. Assert no orphans before locking the column ----------

do $$
declare
  null_count bigint;
begin
  select count(*) into null_count
    from public.daily_stops
   where tenant_id is null;

  if null_count > 0 then
    raise exception
      'Phase 0 backfill assertion failed: % daily_stops row(s) still have NULL tenant_id. Transaction rolled back.',
      null_count;
  end if;
end$$;

-- ---------- 5. Lock the column NOT NULL -----------------------------

-- SET NOT NULL is a no-op if already NOT NULL, so this is idempotent.
alter table public.daily_stops
  alter column tenant_id set not null;

-- ---------- 6. Indexes ----------------------------------------------

-- Standalone tenant_id index — supports FK lookups and any planner
-- choice that wants to filter by tenant alone.
create index if not exists idx_daily_stops_tenant_id
  on public.daily_stops (tenant_id);

-- Tenant-leading replacement for idx_daily_stops_date.
create index if not exists idx_daily_stops_tenant_date
  on public.daily_stops (tenant_id, delivery_date desc);

-- Tenant-leading replacement for idx_daily_stops_driver.
create index if not exists idx_daily_stops_tenant_driver_date
  on public.daily_stops (tenant_id, driver_name, delivery_date);

-- Tenant-leading replacement for idx_daily_stops_status.
create index if not exists idx_daily_stops_tenant_date_status
  on public.daily_stops (tenant_id, delivery_date, status);

commit;
