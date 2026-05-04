-- =====================================================================
-- Phase 0 amendment: tenant_id DEFAULT 1 on all tenant-scoped tables
-- Date:  2026-05-04
--
-- What this does:
--   Adds DEFAULT 1 to the tenant_id column on all 32 tables that the
--   Phase 0 migrations made tenant-scoped. This lets cnc-web v1 callers
--   continue to INSERT/UPSERT without supplying a tenant_id during the
--   /api/db → /api/db-v2 cutover window. The default points every
--   un-stamped row at CNC (tenant_id = 1).
--
--   Companion file: 2026-05-04-phase-0-amendment-restore-old-uniques.sql.
--   Run THIS file FIRST so any concurrent v1 inserts during the SQL
--   Editor session land on the default rather than NOT NULL-failing
--   between the two amendment runs.
--
-- Why this is safe:
--   - All 32 tables already have NOT NULL tenant_id from Phase 0, and
--     every existing row already has tenant_id = 1 (Phase 0 backfill).
--   - DEFAULT only fires when a payload omits tenant_id; explicit NULL
--     in a payload still fails NOT NULL. v2's tenant-stamping behavior
--     is unaffected.
--   - tenants.id = 1 is the CNC tenant row (FK target verified at
--     precondition time below).
--
-- What this does NOT do:
--   - Does not change NOT NULL on tenant_id.
--   - Does not change column types or backfill data.
--   - Does not touch tables outside this list. orders, geocode_cache,
--     and dispatch_decisions intentionally remain untenanted.
--
-- Idempotency: safe to re-run. ALTER COLUMN … SET DEFAULT is a no-op
-- when the default is already 1.
--
-- Rollback (only after v1 is fully decommissioned and every caller
-- supplies tenant_id explicitly):
--
--   begin;
--   alter table public.address_corrections     alter column tenant_id drop default;
--   alter table public.address_notes           alter column tenant_id drop default;
--   alter table public.announcement_reads      alter column tenant_id drop default;
--   alter table public.announcements           alter column tenant_id drop default;
--   alter table public.backups                 alter column tenant_id drop default;
--   alter table public.company_ledger          alter column tenant_id drop default;
--   alter table public.daily_stops             alter column tenant_id drop default;
--   alter table public.delivery_confirmations  alter column tenant_id drop default;
--   alter table public.delivery_overrides      alter column tenant_id drop default;
--   alter table public.dispatch_history_import alter column tenant_id drop default;
--   alter table public.dispatch_logs           alter column tenant_id drop default;
--   alter table public.driver_events           alter column tenant_id drop default;
--   alter table public.driver_favorites        alter column tenant_id drop default;
--   alter table public.driver_notifications    alter column tenant_id drop default;
--   alter table public.driver_routes           alter column tenant_id drop default;
--   alter table public.driver_schedule         alter column tenant_id drop default;
--   alter table public.drivers                 alter column tenant_id drop default;
--   alter table public.error_logs              alter column tenant_id drop default;
--   alter table public.mileage_log             alter column tenant_id drop default;
--   alter table public.order_deletions         alter column tenant_id drop default;
--   alter table public.payroll                 alter column tenant_id drop default;
--   alter table public.pickup_requests         alter column tenant_id drop default;
--   alter table public.poll_responses          alter column tenant_id drop default;
--   alter table public.profiles                alter column tenant_id drop default;
--   alter table public.routing_rules           alter column tenant_id drop default;
--   alter table public.schedule_overrides      alter column tenant_id drop default;
--   alter table public.settlements             alter column tenant_id drop default;
--   alter table public.shift_offers            alter column tenant_id drop default;
--   alter table public.sort_list               alter column tenant_id drop default;
--   alter table public.stop_reconciliation     alter column tenant_id drop default;
--   alter table public.tesla_tokens            alter column tenant_id drop default;
--   alter table public.time_off_requests       alter column tenant_id drop default;
--   commit;
--
-- =====================================================================

begin;

-- Precondition: tenants.id = 1 (CNC) must exist. The default fires on
-- every default-using insert; if the FK target is missing, every such
-- insert FK-fails post-amendment.
do $$
begin
  if not exists (select 1 from public.tenants where id = 1) then
    raise exception 'Amendment precondition failed: tenants.id=1 (CNC) does not exist. Insert the CNC tenant row before running this amendment.';
  end if;
end$$;

-- Defaults — 32 tables, alphabetical.
alter table public.address_corrections     alter column tenant_id set default 1;
alter table public.address_notes           alter column tenant_id set default 1;
alter table public.announcement_reads      alter column tenant_id set default 1;
alter table public.announcements           alter column tenant_id set default 1;
alter table public.backups                 alter column tenant_id set default 1;
alter table public.company_ledger          alter column tenant_id set default 1;
alter table public.daily_stops             alter column tenant_id set default 1;
alter table public.delivery_confirmations  alter column tenant_id set default 1;
alter table public.delivery_overrides      alter column tenant_id set default 1;
alter table public.dispatch_history_import alter column tenant_id set default 1;
alter table public.dispatch_logs           alter column tenant_id set default 1;
alter table public.driver_events           alter column tenant_id set default 1;
alter table public.driver_favorites        alter column tenant_id set default 1;
alter table public.driver_notifications    alter column tenant_id set default 1;
alter table public.driver_routes           alter column tenant_id set default 1;
alter table public.driver_schedule         alter column tenant_id set default 1;
alter table public.drivers                 alter column tenant_id set default 1;
alter table public.error_logs              alter column tenant_id set default 1;
alter table public.mileage_log             alter column tenant_id set default 1;
alter table public.order_deletions         alter column tenant_id set default 1;
alter table public.payroll                 alter column tenant_id set default 1;
alter table public.pickup_requests         alter column tenant_id set default 1;
alter table public.poll_responses          alter column tenant_id set default 1;
alter table public.profiles                alter column tenant_id set default 1;
alter table public.routing_rules           alter column tenant_id set default 1;
alter table public.schedule_overrides      alter column tenant_id set default 1;
alter table public.settlements             alter column tenant_id set default 1;
alter table public.shift_offers            alter column tenant_id set default 1;
alter table public.sort_list               alter column tenant_id set default 1;
alter table public.stop_reconciliation     alter column tenant_id set default 1;
alter table public.tesla_tokens            alter column tenant_id set default 1;
alter table public.time_off_requests       alter column tenant_id set default 1;

-- Assertion: all 32 tenant_id columns now have DEFAULT 1. If this
-- check fails the entire transaction rolls back, leaving the schema
-- exactly as it was before the file ran.
do $$
declare default_count int;
begin
  select count(*) into default_count
  from information_schema.columns
  where table_schema = 'public'
    and column_name  = 'tenant_id'
    and column_default = '1';
  if default_count <> 32 then
    raise exception 'Amendment defaults assertion failed: % tenant_id columns have DEFAULT 1, expected 32. Transaction rolled back.', default_count;
  end if;
end$$;

commit;
