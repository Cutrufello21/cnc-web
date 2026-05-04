-- =====================================================================
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!                                                                 !!
-- !!     CUTOVER SCAFFOLD ONLY  —  DROP BEFORE TENANT 2 ONBOARDS     !!
-- !!                                                                 !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- This file restores the 16 single-tenant UNIQUE constraints/indexes
-- that the Phase 0 bulk migration replaced with tenant-composite
-- versions. They keep cnc-web's v1 /api/db writes alive during the
-- /api/db → /api/db-v2 cutover window, where v1 callers send no
-- tenant_id and reference OLD constraint names in onConflict strings.
--
-- The OLD constraints DO NOT include tenant_id. Today, with CNC as
-- the only tenant (every row has tenant_id = 1), a single-column
-- unique like (driver_name) is logically equivalent to the new
-- (tenant_id, driver_name) — both forbid the same set of duplicates.
--
-- The moment a SECOND tenant inserts any row into any of the 14
-- tables below, the OLD constraints will block legitimate cross-
-- tenant duplicates that the NEW constraints correctly permit. For
-- example, LYN Rx (tenant 2) tries to insert a driver named "Adam"
-- while CNC (tenant 1) already has one — the NEW constraint allows
-- it; the OLD constraint rejects it with 23505.
--
-- ┌───────────────────────────────────────────────────────────────────┐
-- │  COPY-PASTE-READY DROP SQL                                        │
-- │  Run this BEFORE tenant 2 inserts any row into any of these       │
-- │  tables. Best run as part of the same migration that onboards     │
-- │  tenant 2's first user.                                           │
-- └───────────────────────────────────────────────────────────────────┘
--
--   begin;
--   drop index    if exists public.idx_address_notes_unique;
--   alter table   public.dispatch_logs       drop constraint if exists dispatch_logs_date_delivery_day_key;
--   alter table   public.driver_routes       drop constraint if exists driver_routes_driver_name_date_key;
--   alter table   public.driver_schedule     drop constraint if exists driver_schedule_driver_name_key;
--   alter table   public.drivers             drop constraint if exists drivers_driver_name_key;
--   alter table   public.drivers             drop constraint if exists drivers_driver_number_key;
--   alter table   public.drivers             drop constraint if exists drivers_email_key;
--   drop index    if exists public.idx_mileage_unique;
--   alter table   public.payroll             drop constraint if exists payroll_week_of_driver_name_key;
--   alter table   public.routing_rules       drop constraint if exists routing_rules_zip_pharmacy_key;
--   alter table   public.schedule_overrides  drop constraint if exists schedule_overrides_driver_name_date_key;
--   alter table   public.settlements         drop constraint if exists settlements_week_of_driver_name_key;
--   alter table   public.shift_offers        drop constraint if exists shift_offers_driver_name_date_key;
--   alter table   public.sort_list           drop constraint if exists sort_list_delivery_date_pharmacy_driver_name_key;
--   alter table   public.stop_reconciliation drop constraint if exists stop_reconciliation_driver_name_week_of_day_key;
--   alter table   public.tesla_tokens        drop constraint if exists tesla_tokens_driver_name_key;
--   commit;
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- =====================================================================
--
-- Phase 0 amendment: restore single-tenant UNIQUE constraints/indexes
-- Date:  2026-05-04
--
-- What this does:
--   Re-adds the 16 single-column / non-tenant-leading UNIQUE
--   constraints and indexes that the Phase 0 bulk migration dropped
--   when it created the tenant-composite replacements. Each restored
--   OLD unique runs ALONGSIDE its NEW tenant-composite counterpart.
--
--   Companion file: 2026-05-04-phase-0-amendment-tenant-id-defaults.sql.
--   Run that file FIRST.
--
--   14 of the 16 are constraints (ALTER TABLE … ADD CONSTRAINT).
--   2 are unique indexes (CREATE UNIQUE INDEX): idx_address_notes_unique
--   and idx_mileage_unique. Both forms work with PostgREST onConflict.
--   They are restored in their original form for fidelity.
--
-- Why this is safe today:
--   With CNC as the only tenant, every row has tenant_id = 1, so the
--   OLD single-column constraints are already satisfied by the NEW
--   tenant-composite constraints' enforcement. ADD CONSTRAINT will
--   succeed without any data violation.
--
-- Why this is unsafe tomorrow:
--   Once a second tenant exists, the OLD constraints become a
--   cross-tenant collision blocker. See the prominent banner above
--   for the drop-this-first warning.
--
-- Idempotency: safe to re-run. Each ADD CONSTRAINT is wrapped in a
--   pg_constraint existence check; each CREATE UNIQUE INDEX uses
--   IF NOT EXISTS.
--
-- =====================================================================

begin;

-- Precondition: bulk migration's 16 NEW tenant-composite uniques must
-- exist. Otherwise this amendment is regressing, not amending.
do $$
declare new_count int;
begin
  select count(*) into new_count
  from pg_constraint c
  where c.contype = 'u'
    and c.conname in (
      'address_notes_tenant_driver_address_key',
      'dispatch_logs_tenant_date_delivery_day_key',
      'driver_routes_tenant_driver_name_date_key',
      'driver_schedule_tenant_driver_name_key',
      'drivers_tenant_driver_name_key',
      'drivers_tenant_driver_number_key',
      'drivers_tenant_email_key',
      'mileage_log_tenant_driver_date_key',
      'payroll_tenant_week_of_driver_name_key',
      'routing_rules_tenant_zip_pharmacy_key',
      'schedule_overrides_tenant_driver_name_date_key',
      'settlements_tenant_week_of_driver_name_key',
      'shift_offers_tenant_driver_name_date_key',
      'sort_list_tenant_delivery_date_pharmacy_driver_name_key',
      'stop_reconciliation_tenant_driver_name_week_of_day_key',
      'tesla_tokens_tenant_driver_name_key'
    );
  if new_count <> 16 then
    raise exception 'Amendment precondition failed: % of 16 NEW tenant-composite uniques found. Run sql/2026-05-03-phase-0-bulk-tables-tenant-id.sql first.', new_count;
  end if;
end$$;


-- ---------- address_notes (driver_name, address) ---------------------
-- Originally a unique INDEX (idx_address_notes_unique), not a constraint.
-- Restored as an index for fidelity to pre-migration state.
create unique index if not exists idx_address_notes_unique
  on public.address_notes (driver_name, address);

-- ---------- dispatch_logs (date, delivery_day) -----------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_logs_date_delivery_day_key' and conrelid = 'public.dispatch_logs'::regclass) then
    alter table public.dispatch_logs
      add constraint dispatch_logs_date_delivery_day_key unique (date, delivery_day);
  end if;
end$$;

-- ---------- driver_routes (driver_name, date) ------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_routes_driver_name_date_key' and conrelid = 'public.driver_routes'::regclass) then
    alter table public.driver_routes
      add constraint driver_routes_driver_name_date_key unique (driver_name, date);
  end if;
end$$;

-- ---------- driver_schedule (driver_name) ----------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_schedule_driver_name_key' and conrelid = 'public.driver_schedule'::regclass) then
    alter table public.driver_schedule
      add constraint driver_schedule_driver_name_key unique (driver_name);
  end if;
end$$;

-- ---------- drivers (driver_name) ------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_driver_name_key' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_driver_name_key unique (driver_name);
  end if;
end$$;

-- ---------- drivers (driver_number) ----------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_driver_number_key' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_driver_number_key unique (driver_number);
  end if;
end$$;

-- ---------- drivers (email) ------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_email_key' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_email_key unique (email);
  end if;
end$$;

-- ---------- mileage_log (driver_name, delivery_date) -----------------
-- Originally a unique INDEX (idx_mileage_unique), not a constraint.
create unique index if not exists idx_mileage_unique
  on public.mileage_log (driver_name, delivery_date);

-- ---------- payroll (week_of, driver_name) ---------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_week_of_driver_name_key' and conrelid = 'public.payroll'::regclass) then
    alter table public.payroll
      add constraint payroll_week_of_driver_name_key unique (week_of, driver_name);
  end if;
end$$;

-- ---------- routing_rules (zip_code, pharmacy) -----------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'routing_rules_zip_pharmacy_key' and conrelid = 'public.routing_rules'::regclass) then
    alter table public.routing_rules
      add constraint routing_rules_zip_pharmacy_key unique (zip_code, pharmacy);
  end if;
end$$;

-- ---------- schedule_overrides (driver_name, date) -------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_overrides_driver_name_date_key' and conrelid = 'public.schedule_overrides'::regclass) then
    alter table public.schedule_overrides
      add constraint schedule_overrides_driver_name_date_key unique (driver_name, date);
  end if;
end$$;

-- ---------- settlements (week_of, driver_name) -----------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settlements_week_of_driver_name_key' and conrelid = 'public.settlements'::regclass) then
    alter table public.settlements
      add constraint settlements_week_of_driver_name_key unique (week_of, driver_name);
  end if;
end$$;

-- ---------- shift_offers (driver_name, date) -------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shift_offers_driver_name_date_key' and conrelid = 'public.shift_offers'::regclass) then
    alter table public.shift_offers
      add constraint shift_offers_driver_name_date_key unique (driver_name, date);
  end if;
end$$;

-- ---------- sort_list (delivery_date, pharmacy, driver_name) ---------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sort_list_delivery_date_pharmacy_driver_name_key' and conrelid = 'public.sort_list'::regclass) then
    alter table public.sort_list
      add constraint sort_list_delivery_date_pharmacy_driver_name_key unique (delivery_date, pharmacy, driver_name);
  end if;
end$$;

-- ---------- stop_reconciliation (driver_name, week_of, day) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stop_reconciliation_driver_name_week_of_day_key' and conrelid = 'public.stop_reconciliation'::regclass) then
    alter table public.stop_reconciliation
      add constraint stop_reconciliation_driver_name_week_of_day_key unique (driver_name, week_of, day);
  end if;
end$$;

-- ---------- tesla_tokens (driver_name) -------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tesla_tokens_driver_name_key' and conrelid = 'public.tesla_tokens'::regclass) then
    alter table public.tesla_tokens
      add constraint tesla_tokens_driver_name_key unique (driver_name);
  end if;
end$$;


-- Assertion 1: all 14 OLD ADD-CONSTRAINT uniques must exist.
do $$
declare old_constraint_count int;
begin
  select count(*) into old_constraint_count
  from pg_constraint c
  where c.contype = 'u'
    and c.conname in (
      'dispatch_logs_date_delivery_day_key',
      'driver_routes_driver_name_date_key',
      'driver_schedule_driver_name_key',
      'drivers_driver_name_key',
      'drivers_driver_number_key',
      'drivers_email_key',
      'payroll_week_of_driver_name_key',
      'routing_rules_zip_pharmacy_key',
      'schedule_overrides_driver_name_date_key',
      'settlements_week_of_driver_name_key',
      'shift_offers_driver_name_date_key',
      'sort_list_delivery_date_pharmacy_driver_name_key',
      'stop_reconciliation_driver_name_week_of_day_key',
      'tesla_tokens_driver_name_key'
    );
  if old_constraint_count <> 14 then
    raise exception 'Amendment OLD-constraints assertion failed: % of 14 found. Transaction rolled back.', old_constraint_count;
  end if;
end$$;

-- Assertion 2: both OLD unique indexes must exist.
do $$
declare old_index_count int;
begin
  select count(*) into old_index_count
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('idx_address_notes_unique', 'idx_mileage_unique');
  if old_index_count <> 2 then
    raise exception 'Amendment OLD-indexes assertion failed: % of 2 found. Transaction rolled back.', old_index_count;
  end if;
end$$;

commit;
