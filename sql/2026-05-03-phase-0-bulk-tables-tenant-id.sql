-- =====================================================================
-- Phase 0 — Bulk tenant_id rollout to remaining 29 tables
--          (LYN Rx multi-tenant migration)
-- Date:  2026-05-03
-- Phase: 0 of N (foundation; the last bulk-schema piece of Phase 0)
--
-- What this does:
--   - Verifies prerequisites: public.tenants exists and tenants.id = 1
--     (CNC) is present. Raises if missing.
--   - For each of 29 tables (alphabetical), in one transaction:
--       1. add column tenant_id bigint (nullable)
--       2. add FK -> public.tenants(id) ON DELETE RESTRICT (guarded)
--       3. backfill rows to tenant_id = 1
--       4. assert no NULL tenant_id remain (raises with table+count if so)
--       5. set tenant_id NOT NULL
--   - Drops announcements_pharmacy_check (hardcoded SHSP/Aultman/all);
--     pharmacy validation moves to the application layer
--     (tenant.pharmacy_origins).
--   - Upgrades 16 single-tenant UNIQUE constraints/indexes to be
--     composite with tenant_id (drops old name, creates new with
--     <table>_tenant_<columns>_key naming).
--   - Adds 11 new tenant-leading composite indexes on the 8 high-traffic
--     tables (delivery_confirmations, driver_events, driver_notifications,
--     pickup_requests, error_logs, dispatch_history_import,
--     time_off_requests, dispatch_logs).
--   - Adds basic (tenant_id) indexes on the remaining 21 tables for
--     FK lookups.
--
-- Tables migrated (29):
--   address_corrections, address_notes, announcement_reads, announcements,
--   backups, company_ledger, delivery_confirmations, delivery_overrides,
--   dispatch_history_import, dispatch_logs, driver_events,
--   driver_favorites, driver_notifications, driver_routes,
--   driver_schedule, drivers, error_logs, mileage_log, payroll,
--   pickup_requests, poll_responses, routing_rules, schedule_overrides,
--   settlements, shift_offers, sort_list, stop_reconciliation,
--   tesla_tokens, time_off_requests
--
-- What this does NOT do:
--   - Does not change RLS policies on any of these tables. All existing
--     policies remain tenant-blind. Locking down RLS is a later phase.
--   - Does not change /api/db behavior or any application code.
--   - Does not touch daily_stops or profiles (those are separate Phase 0
--     migrations that must be run first).
--   - Does not drop any pre-existing non-unique index. Pruning the
--     now-redundant single-tenant indexes is a follow-up migration after
--     we confirm the new tenant-leading indexes are being chosen.
--   - Does not touch the FK-chain unique constraints that don't use
--     text identifiers and are already isolated through their parent FK
--     (announcement_reads_announcement_id_driver_id_key,
--      poll_responses_announcement_id_driver_id_key).
--   - Does not touch the application-level CHECK constraints that aren't
--     tenant-specific (announcements_priority_check,
--      announcements_type_check, shift_offers_status_check,
--      time_off_requests_status_check).
--
-- Idempotency:
--   - Safe to re-run. Every ADD COLUMN uses IF NOT EXISTS. Every FK is
--     guarded by a pg_constraint check. Every backfill targets only
--     NULL rows. Every SET NOT NULL is a no-op on already-NOT-NULL
--     columns. Every DROP CONSTRAINT/INDEX uses IF EXISTS. Every
--     CREATE INDEX uses IF NOT EXISTS. Every new UNIQUE constraint is
--     guarded by a pg_constraint check.
--
-- Lock duration / scheduling:
--   - 29 tables. Most are under 1000 rows. The largest besides
--     daily_stops are: drivers, driver_routes, mileage_log, payroll,
--     settlements, sort_list, delivery_confirmations.
--   - Each ADD COLUMN bigint (no DEFAULT) is metadata-only — instant.
--   - Each ADD FK runs against an all-NULL column — trivial validation.
--   - Each backfill UPDATE holds row locks; small tables are instant,
--     mid-size ones (mileage_log, payroll, settlements) take seconds.
--   - Each SET NOT NULL takes ACCESS EXCLUSIVE briefly to verify.
--   - Each CREATE INDEX (non-CONCURRENTLY, because the migration is
--     wrapped in a single transaction) takes ACCESS EXCLUSIVE for the
--     duration of the build. On these table sizes, indexes build in
--     well under a second each.
--   - The DROP/ADD UNIQUE constraint pairs each rebuild a unique index;
--     a few seconds total.
--   - Estimated total wall-clock: under 2 minutes on production
--     hardware. The whole transaction holds locks across all 29 tables
--     for that entire window. Run off-hours.
--
-- Rollback (exhaustive — drop new objects in reverse, restore originals):
--
--   begin;
--
--     -- Drop new basic (tenant_id) indexes (21 tables):
--     drop index if exists idx_address_corrections_tenant_id;
--     drop index if exists idx_address_notes_tenant_id;
--     drop index if exists idx_announcement_reads_tenant_id;
--     drop index if exists idx_announcements_tenant_id;
--     drop index if exists idx_backups_tenant_id;
--     drop index if exists idx_company_ledger_tenant_id;
--     drop index if exists idx_delivery_overrides_tenant_id;
--     drop index if exists idx_driver_favorites_tenant_id;
--     drop index if exists idx_driver_routes_tenant_id;
--     drop index if exists idx_driver_schedule_tenant_id;
--     drop index if exists idx_drivers_tenant_id;
--     drop index if exists idx_mileage_log_tenant_id;
--     drop index if exists idx_payroll_tenant_id;
--     drop index if exists idx_poll_responses_tenant_id;
--     drop index if exists idx_routing_rules_tenant_id;
--     drop index if exists idx_schedule_overrides_tenant_id;
--     drop index if exists idx_settlements_tenant_id;
--     drop index if exists idx_shift_offers_tenant_id;
--     drop index if exists idx_sort_list_tenant_id;
--     drop index if exists idx_stop_reconciliation_tenant_id;
--     drop index if exists idx_tesla_tokens_tenant_id;
--
--     -- Drop new tenant-leading composite indexes:
--     drop index if exists idx_delivery_confirmations_tenant_driver_date;
--     drop index if exists idx_delivery_confirmations_tenant_stop;
--     drop index if exists idx_driver_events_tenant_driver_created;
--     drop index if exists idx_driver_notifications_tenant_driver_created;
--     drop index if exists idx_pickup_requests_tenant_driver_date;
--     drop index if exists idx_pickup_requests_tenant_status;
--     drop index if exists idx_error_logs_tenant_created;
--     drop index if exists idx_dispatch_history_import_tenant_date;
--     drop index if exists idx_time_off_requests_tenant_driver;
--     drop index if exists idx_time_off_requests_tenant_date_off;
--     drop index if exists idx_dispatch_logs_tenant_date;
--
--     -- Drop new tenant-composite UNIQUE constraints, restore originals:
--     alter table public.address_notes drop constraint if exists address_notes_tenant_driver_address_key;
--     create unique index if not exists idx_address_notes_unique on public.address_notes (driver_name, address);
--
--     alter table public.dispatch_logs drop constraint if exists dispatch_logs_tenant_date_delivery_day_key;
--     alter table public.dispatch_logs add constraint dispatch_logs_date_delivery_day_key unique (date, delivery_day);
--
--     alter table public.driver_routes drop constraint if exists driver_routes_tenant_driver_name_date_key;
--     alter table public.driver_routes add constraint driver_routes_driver_name_date_key unique (driver_name, date);
--
--     alter table public.driver_schedule drop constraint if exists driver_schedule_tenant_driver_name_key;
--     alter table public.driver_schedule add constraint driver_schedule_driver_name_key unique (driver_name);
--
--     alter table public.drivers drop constraint if exists drivers_tenant_driver_name_key;
--     alter table public.drivers add constraint drivers_driver_name_key unique (driver_name);
--     alter table public.drivers drop constraint if exists drivers_tenant_driver_number_key;
--     alter table public.drivers add constraint drivers_driver_number_key unique (driver_number);
--     alter table public.drivers drop constraint if exists drivers_tenant_email_key;
--     alter table public.drivers add constraint drivers_email_key unique (email);
--
--     alter table public.mileage_log drop constraint if exists mileage_log_tenant_driver_date_key;
--     create unique index if not exists idx_mileage_unique on public.mileage_log (driver_name, delivery_date);
--
--     alter table public.payroll drop constraint if exists payroll_tenant_week_of_driver_name_key;
--     alter table public.payroll add constraint payroll_week_of_driver_name_key unique (week_of, driver_name);
--
--     alter table public.routing_rules drop constraint if exists routing_rules_tenant_zip_pharmacy_key;
--     alter table public.routing_rules add constraint routing_rules_zip_pharmacy_key unique (zip_code, pharmacy);
--
--     alter table public.schedule_overrides drop constraint if exists schedule_overrides_tenant_driver_name_date_key;
--     alter table public.schedule_overrides add constraint schedule_overrides_driver_name_date_key unique (driver_name, date);
--
--     alter table public.settlements drop constraint if exists settlements_tenant_week_of_driver_name_key;
--     alter table public.settlements add constraint settlements_week_of_driver_name_key unique (week_of, driver_name);
--
--     alter table public.shift_offers drop constraint if exists shift_offers_tenant_driver_name_date_key;
--     alter table public.shift_offers add constraint shift_offers_driver_name_date_key unique (driver_name, date);
--
--     alter table public.sort_list drop constraint if exists sort_list_tenant_delivery_date_pharmacy_driver_name_key;
--     alter table public.sort_list add constraint sort_list_delivery_date_pharmacy_driver_name_key unique (delivery_date, pharmacy, driver_name);
--
--     alter table public.stop_reconciliation drop constraint if exists stop_reconciliation_tenant_driver_name_week_of_day_key;
--     alter table public.stop_reconciliation add constraint stop_reconciliation_driver_name_week_of_day_key unique (driver_name, week_of, day);
--
--     alter table public.tesla_tokens drop constraint if exists tesla_tokens_tenant_driver_name_key;
--     alter table public.tesla_tokens add constraint tesla_tokens_driver_name_key unique (driver_name);
--
--     -- Restore the dropped CHECK constraint:
--     alter table public.announcements
--       add constraint announcements_pharmacy_check check (pharmacy in ('SHSP', 'Aultman', 'all'));
--
--     -- Drop NOT NULL, FK, and column on every table:
--     alter table public.address_corrections     alter column tenant_id drop not null;
--     alter table public.address_corrections     drop constraint if exists address_corrections_tenant_id_fkey;
--     alter table public.address_corrections     drop column if exists tenant_id;
--     alter table public.address_notes           alter column tenant_id drop not null;
--     alter table public.address_notes           drop constraint if exists address_notes_tenant_id_fkey;
--     alter table public.address_notes           drop column if exists tenant_id;
--     alter table public.announcement_reads      alter column tenant_id drop not null;
--     alter table public.announcement_reads      drop constraint if exists announcement_reads_tenant_id_fkey;
--     alter table public.announcement_reads      drop column if exists tenant_id;
--     alter table public.announcements           alter column tenant_id drop not null;
--     alter table public.announcements           drop constraint if exists announcements_tenant_id_fkey;
--     alter table public.announcements           drop column if exists tenant_id;
--     alter table public.backups                 alter column tenant_id drop not null;
--     alter table public.backups                 drop constraint if exists backups_tenant_id_fkey;
--     alter table public.backups                 drop column if exists tenant_id;
--     alter table public.company_ledger          alter column tenant_id drop not null;
--     alter table public.company_ledger          drop constraint if exists company_ledger_tenant_id_fkey;
--     alter table public.company_ledger          drop column if exists tenant_id;
--     alter table public.delivery_confirmations  alter column tenant_id drop not null;
--     alter table public.delivery_confirmations  drop constraint if exists delivery_confirmations_tenant_id_fkey;
--     alter table public.delivery_confirmations  drop column if exists tenant_id;
--     alter table public.delivery_overrides      alter column tenant_id drop not null;
--     alter table public.delivery_overrides      drop constraint if exists delivery_overrides_tenant_id_fkey;
--     alter table public.delivery_overrides      drop column if exists tenant_id;
--     alter table public.dispatch_history_import alter column tenant_id drop not null;
--     alter table public.dispatch_history_import drop constraint if exists dispatch_history_import_tenant_id_fkey;
--     alter table public.dispatch_history_import drop column if exists tenant_id;
--     alter table public.dispatch_logs           alter column tenant_id drop not null;
--     alter table public.dispatch_logs           drop constraint if exists dispatch_logs_tenant_id_fkey;
--     alter table public.dispatch_logs           drop column if exists tenant_id;
--     alter table public.driver_events           alter column tenant_id drop not null;
--     alter table public.driver_events           drop constraint if exists driver_events_tenant_id_fkey;
--     alter table public.driver_events           drop column if exists tenant_id;
--     alter table public.driver_favorites        alter column tenant_id drop not null;
--     alter table public.driver_favorites        drop constraint if exists driver_favorites_tenant_id_fkey;
--     alter table public.driver_favorites        drop column if exists tenant_id;
--     alter table public.driver_notifications    alter column tenant_id drop not null;
--     alter table public.driver_notifications    drop constraint if exists driver_notifications_tenant_id_fkey;
--     alter table public.driver_notifications    drop column if exists tenant_id;
--     alter table public.driver_routes           alter column tenant_id drop not null;
--     alter table public.driver_routes           drop constraint if exists driver_routes_tenant_id_fkey;
--     alter table public.driver_routes           drop column if exists tenant_id;
--     alter table public.driver_schedule         alter column tenant_id drop not null;
--     alter table public.driver_schedule         drop constraint if exists driver_schedule_tenant_id_fkey;
--     alter table public.driver_schedule         drop column if exists tenant_id;
--     alter table public.drivers                 alter column tenant_id drop not null;
--     alter table public.drivers                 drop constraint if exists drivers_tenant_id_fkey;
--     alter table public.drivers                 drop column if exists tenant_id;
--     alter table public.error_logs              alter column tenant_id drop not null;
--     alter table public.error_logs              drop constraint if exists error_logs_tenant_id_fkey;
--     alter table public.error_logs              drop column if exists tenant_id;
--     alter table public.mileage_log             alter column tenant_id drop not null;
--     alter table public.mileage_log             drop constraint if exists mileage_log_tenant_id_fkey;
--     alter table public.mileage_log             drop column if exists tenant_id;
--     alter table public.payroll                 alter column tenant_id drop not null;
--     alter table public.payroll                 drop constraint if exists payroll_tenant_id_fkey;
--     alter table public.payroll                 drop column if exists tenant_id;
--     alter table public.pickup_requests         alter column tenant_id drop not null;
--     alter table public.pickup_requests         drop constraint if exists pickup_requests_tenant_id_fkey;
--     alter table public.pickup_requests         drop column if exists tenant_id;
--     alter table public.poll_responses          alter column tenant_id drop not null;
--     alter table public.poll_responses          drop constraint if exists poll_responses_tenant_id_fkey;
--     alter table public.poll_responses          drop column if exists tenant_id;
--     alter table public.routing_rules           alter column tenant_id drop not null;
--     alter table public.routing_rules           drop constraint if exists routing_rules_tenant_id_fkey;
--     alter table public.routing_rules           drop column if exists tenant_id;
--     alter table public.schedule_overrides      alter column tenant_id drop not null;
--     alter table public.schedule_overrides      drop constraint if exists schedule_overrides_tenant_id_fkey;
--     alter table public.schedule_overrides      drop column if exists tenant_id;
--     alter table public.settlements             alter column tenant_id drop not null;
--     alter table public.settlements             drop constraint if exists settlements_tenant_id_fkey;
--     alter table public.settlements             drop column if exists tenant_id;
--     alter table public.shift_offers            alter column tenant_id drop not null;
--     alter table public.shift_offers            drop constraint if exists shift_offers_tenant_id_fkey;
--     alter table public.shift_offers            drop column if exists tenant_id;
--     alter table public.sort_list               alter column tenant_id drop not null;
--     alter table public.sort_list               drop constraint if exists sort_list_tenant_id_fkey;
--     alter table public.sort_list               drop column if exists tenant_id;
--     alter table public.stop_reconciliation     alter column tenant_id drop not null;
--     alter table public.stop_reconciliation     drop constraint if exists stop_reconciliation_tenant_id_fkey;
--     alter table public.stop_reconciliation     drop column if exists tenant_id;
--     alter table public.tesla_tokens            alter column tenant_id drop not null;
--     alter table public.tesla_tokens            drop constraint if exists tesla_tokens_tenant_id_fkey;
--     alter table public.tesla_tokens            drop column if exists tenant_id;
--     alter table public.time_off_requests       alter column tenant_id drop not null;
--     alter table public.time_off_requests       drop constraint if exists time_off_requests_tenant_id_fkey;
--     alter table public.time_off_requests       drop column if exists tenant_id;
--
--   commit;
--
-- DO NOT RUN AGAINST PRODUCTION WITHOUT BACKUP. Test against staging first.
-- =====================================================================

begin;

-- ---------- 0. Prerequisite guard ------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) then
    raise exception
      'Prerequisite missing: public.tenants does not exist. Run sql/2026-05-03-phase-0-tenants.sql first.';
  end if;

  if not exists (select 1 from public.tenants where id = 1) then
    raise exception
      'Prerequisite missing: public.tenants has no row with id = 1 (CNC). The seed in sql/2026-05-03-phase-0-tenants.sql must run before this migration.';
  end if;
end$$;


-- =====================================================================
-- SECTION 1: Add tenant_id column + FK + backfill + assert + NOT NULL
--            for each of the 29 tables, alphabetically.
-- =====================================================================

-- ---------- address_corrections --------------------------------------

alter table public.address_corrections add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'address_corrections_tenant_id_fkey' and conrelid = 'public.address_corrections'::regclass) then
    alter table public.address_corrections
      add constraint address_corrections_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.address_corrections set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.address_corrections where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on address_corrections: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.address_corrections alter column tenant_id set not null;

-- ---------- address_notes --------------------------------------------

alter table public.address_notes add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'address_notes_tenant_id_fkey' and conrelid = 'public.address_notes'::regclass) then
    alter table public.address_notes
      add constraint address_notes_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.address_notes set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.address_notes where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on address_notes: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.address_notes alter column tenant_id set not null;

-- ---------- announcement_reads ---------------------------------------

alter table public.announcement_reads add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'announcement_reads_tenant_id_fkey' and conrelid = 'public.announcement_reads'::regclass) then
    alter table public.announcement_reads
      add constraint announcement_reads_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.announcement_reads set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.announcement_reads where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on announcement_reads: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.announcement_reads alter column tenant_id set not null;

-- ---------- announcements --------------------------------------------

alter table public.announcements add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_tenant_id_fkey' and conrelid = 'public.announcements'::regclass) then
    alter table public.announcements
      add constraint announcements_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.announcements set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.announcements where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on announcements: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.announcements alter column tenant_id set not null;

-- ---------- backups --------------------------------------------------

alter table public.backups add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'backups_tenant_id_fkey' and conrelid = 'public.backups'::regclass) then
    alter table public.backups
      add constraint backups_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.backups set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.backups where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on backups: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.backups alter column tenant_id set not null;

-- ---------- company_ledger -------------------------------------------

alter table public.company_ledger add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_ledger_tenant_id_fkey' and conrelid = 'public.company_ledger'::regclass) then
    alter table public.company_ledger
      add constraint company_ledger_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.company_ledger set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.company_ledger where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on company_ledger: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.company_ledger alter column tenant_id set not null;

-- ---------- delivery_confirmations -----------------------------------

alter table public.delivery_confirmations add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_confirmations_tenant_id_fkey' and conrelid = 'public.delivery_confirmations'::regclass) then
    alter table public.delivery_confirmations
      add constraint delivery_confirmations_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.delivery_confirmations set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.delivery_confirmations where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on delivery_confirmations: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.delivery_confirmations alter column tenant_id set not null;

-- ---------- delivery_overrides ---------------------------------------

alter table public.delivery_overrides add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_overrides_tenant_id_fkey' and conrelid = 'public.delivery_overrides'::regclass) then
    alter table public.delivery_overrides
      add constraint delivery_overrides_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.delivery_overrides set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.delivery_overrides where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on delivery_overrides: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.delivery_overrides alter column tenant_id set not null;

-- ---------- dispatch_history_import ----------------------------------

alter table public.dispatch_history_import add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_history_import_tenant_id_fkey' and conrelid = 'public.dispatch_history_import'::regclass) then
    alter table public.dispatch_history_import
      add constraint dispatch_history_import_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.dispatch_history_import set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.dispatch_history_import where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on dispatch_history_import: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.dispatch_history_import alter column tenant_id set not null;

-- ---------- dispatch_logs --------------------------------------------

alter table public.dispatch_logs add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_logs_tenant_id_fkey' and conrelid = 'public.dispatch_logs'::regclass) then
    alter table public.dispatch_logs
      add constraint dispatch_logs_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.dispatch_logs set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.dispatch_logs where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on dispatch_logs: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.dispatch_logs alter column tenant_id set not null;

-- ---------- driver_events --------------------------------------------

alter table public.driver_events add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_events_tenant_id_fkey' and conrelid = 'public.driver_events'::regclass) then
    alter table public.driver_events
      add constraint driver_events_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.driver_events set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.driver_events where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on driver_events: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.driver_events alter column tenant_id set not null;

-- ---------- driver_favorites -----------------------------------------

alter table public.driver_favorites add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_favorites_tenant_id_fkey' and conrelid = 'public.driver_favorites'::regclass) then
    alter table public.driver_favorites
      add constraint driver_favorites_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.driver_favorites set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.driver_favorites where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on driver_favorites: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.driver_favorites alter column tenant_id set not null;

-- ---------- driver_notifications -------------------------------------

alter table public.driver_notifications add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_notifications_tenant_id_fkey' and conrelid = 'public.driver_notifications'::regclass) then
    alter table public.driver_notifications
      add constraint driver_notifications_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.driver_notifications set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.driver_notifications where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on driver_notifications: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.driver_notifications alter column tenant_id set not null;

-- ---------- driver_routes --------------------------------------------

alter table public.driver_routes add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_routes_tenant_id_fkey' and conrelid = 'public.driver_routes'::regclass) then
    alter table public.driver_routes
      add constraint driver_routes_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.driver_routes set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.driver_routes where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on driver_routes: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.driver_routes alter column tenant_id set not null;

-- ---------- driver_schedule ------------------------------------------

alter table public.driver_schedule add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_schedule_tenant_id_fkey' and conrelid = 'public.driver_schedule'::regclass) then
    alter table public.driver_schedule
      add constraint driver_schedule_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.driver_schedule set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.driver_schedule where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on driver_schedule: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.driver_schedule alter column tenant_id set not null;

-- ---------- drivers --------------------------------------------------

alter table public.drivers add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_tenant_id_fkey' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.drivers set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.drivers where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on drivers: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.drivers alter column tenant_id set not null;

-- ---------- error_logs -----------------------------------------------

alter table public.error_logs add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'error_logs_tenant_id_fkey' and conrelid = 'public.error_logs'::regclass) then
    alter table public.error_logs
      add constraint error_logs_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.error_logs set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.error_logs where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on error_logs: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.error_logs alter column tenant_id set not null;

-- ---------- mileage_log ----------------------------------------------

alter table public.mileage_log add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mileage_log_tenant_id_fkey' and conrelid = 'public.mileage_log'::regclass) then
    alter table public.mileage_log
      add constraint mileage_log_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.mileage_log set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.mileage_log where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on mileage_log: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.mileage_log alter column tenant_id set not null;

-- ---------- payroll --------------------------------------------------

alter table public.payroll add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_tenant_id_fkey' and conrelid = 'public.payroll'::regclass) then
    alter table public.payroll
      add constraint payroll_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.payroll set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.payroll where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on payroll: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.payroll alter column tenant_id set not null;

-- ---------- pickup_requests ------------------------------------------

alter table public.pickup_requests add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pickup_requests_tenant_id_fkey' and conrelid = 'public.pickup_requests'::regclass) then
    alter table public.pickup_requests
      add constraint pickup_requests_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.pickup_requests set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.pickup_requests where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on pickup_requests: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.pickup_requests alter column tenant_id set not null;

-- ---------- poll_responses -------------------------------------------

alter table public.poll_responses add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'poll_responses_tenant_id_fkey' and conrelid = 'public.poll_responses'::regclass) then
    alter table public.poll_responses
      add constraint poll_responses_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.poll_responses set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.poll_responses where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on poll_responses: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.poll_responses alter column tenant_id set not null;

-- ---------- routing_rules --------------------------------------------

alter table public.routing_rules add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'routing_rules_tenant_id_fkey' and conrelid = 'public.routing_rules'::regclass) then
    alter table public.routing_rules
      add constraint routing_rules_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.routing_rules set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.routing_rules where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on routing_rules: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.routing_rules alter column tenant_id set not null;

-- ---------- schedule_overrides ---------------------------------------

alter table public.schedule_overrides add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_overrides_tenant_id_fkey' and conrelid = 'public.schedule_overrides'::regclass) then
    alter table public.schedule_overrides
      add constraint schedule_overrides_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.schedule_overrides set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.schedule_overrides where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on schedule_overrides: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.schedule_overrides alter column tenant_id set not null;

-- ---------- settlements ----------------------------------------------

alter table public.settlements add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settlements_tenant_id_fkey' and conrelid = 'public.settlements'::regclass) then
    alter table public.settlements
      add constraint settlements_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.settlements set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.settlements where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on settlements: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.settlements alter column tenant_id set not null;

-- ---------- shift_offers ---------------------------------------------

alter table public.shift_offers add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shift_offers_tenant_id_fkey' and conrelid = 'public.shift_offers'::regclass) then
    alter table public.shift_offers
      add constraint shift_offers_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.shift_offers set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.shift_offers where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on shift_offers: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.shift_offers alter column tenant_id set not null;

-- ---------- sort_list ------------------------------------------------

alter table public.sort_list add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sort_list_tenant_id_fkey' and conrelid = 'public.sort_list'::regclass) then
    alter table public.sort_list
      add constraint sort_list_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.sort_list set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.sort_list where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on sort_list: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.sort_list alter column tenant_id set not null;

-- ---------- stop_reconciliation --------------------------------------

alter table public.stop_reconciliation add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stop_reconciliation_tenant_id_fkey' and conrelid = 'public.stop_reconciliation'::regclass) then
    alter table public.stop_reconciliation
      add constraint stop_reconciliation_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.stop_reconciliation set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.stop_reconciliation where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on stop_reconciliation: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.stop_reconciliation alter column tenant_id set not null;

-- ---------- tesla_tokens ---------------------------------------------

alter table public.tesla_tokens add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tesla_tokens_tenant_id_fkey' and conrelid = 'public.tesla_tokens'::regclass) then
    alter table public.tesla_tokens
      add constraint tesla_tokens_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.tesla_tokens set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.tesla_tokens where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on tesla_tokens: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.tesla_tokens alter column tenant_id set not null;

-- ---------- time_off_requests ----------------------------------------

alter table public.time_off_requests add column if not exists tenant_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_off_requests_tenant_id_fkey' and conrelid = 'public.time_off_requests'::regclass) then
    alter table public.time_off_requests
      add constraint time_off_requests_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.time_off_requests set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.time_off_requests where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on time_off_requests: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.time_off_requests alter column tenant_id set not null;


-- =====================================================================
-- SECTION 2: Drop the hardcoded pharmacy CHECK on announcements.
-- Validation moves to the application layer (tenant.pharmacy_origins).
-- =====================================================================

alter table public.announcements drop constraint if exists announcements_pharmacy_check;


-- =====================================================================
-- SECTION 3: Upgrade single-tenant UNIQUE constraints/indexes to be
--            composite with tenant_id.
--
-- Pattern per upgrade:
--   1. drop constraint if exists <old_name>     (handles real constraints)
--   2. drop index      if exists public.<old_name>  (handles unique-index-only)
--   3. add constraint <new_name> unique (tenant_id, ...) inside a guard
--
-- The DROP INDEX after DROP CONSTRAINT is a defensive no-op when the
-- constraint dropped its own index; it only does work when the original
-- was a CREATE UNIQUE INDEX (idx_address_notes_unique, idx_mileage_unique).
-- =====================================================================

-- ---------- address_notes (driver_name, address) ---------------------
alter table public.address_notes drop constraint if exists idx_address_notes_unique;
drop index if exists public.idx_address_notes_unique;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'address_notes_tenant_driver_address_key' and conrelid = 'public.address_notes'::regclass) then
    alter table public.address_notes
      add constraint address_notes_tenant_driver_address_key unique (tenant_id, driver_name, address);
  end if;
end$$;

-- ---------- dispatch_logs (date, delivery_day) -----------------------
alter table public.dispatch_logs drop constraint if exists dispatch_logs_date_delivery_day_key;
drop index if exists public.dispatch_logs_date_delivery_day_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_logs_tenant_date_delivery_day_key' and conrelid = 'public.dispatch_logs'::regclass) then
    alter table public.dispatch_logs
      add constraint dispatch_logs_tenant_date_delivery_day_key unique (tenant_id, date, delivery_day);
  end if;
end$$;

-- ---------- driver_routes (driver_name, date) ------------------------
alter table public.driver_routes drop constraint if exists driver_routes_driver_name_date_key;
drop index if exists public.driver_routes_driver_name_date_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_routes_tenant_driver_name_date_key' and conrelid = 'public.driver_routes'::regclass) then
    alter table public.driver_routes
      add constraint driver_routes_tenant_driver_name_date_key unique (tenant_id, driver_name, date);
  end if;
end$$;

-- ---------- driver_schedule (driver_name) ----------------------------
alter table public.driver_schedule drop constraint if exists driver_schedule_driver_name_key;
drop index if exists public.driver_schedule_driver_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_schedule_tenant_driver_name_key' and conrelid = 'public.driver_schedule'::regclass) then
    alter table public.driver_schedule
      add constraint driver_schedule_tenant_driver_name_key unique (tenant_id, driver_name);
  end if;
end$$;

-- ---------- drivers (driver_name) ------------------------------------
alter table public.drivers drop constraint if exists drivers_driver_name_key;
drop index if exists public.drivers_driver_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_tenant_driver_name_key' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_tenant_driver_name_key unique (tenant_id, driver_name);
  end if;
end$$;

-- ---------- drivers (driver_number) ----------------------------------
alter table public.drivers drop constraint if exists drivers_driver_number_key;
drop index if exists public.drivers_driver_number_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_tenant_driver_number_key' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_tenant_driver_number_key unique (tenant_id, driver_number);
  end if;
end$$;

-- ---------- drivers (email) ------------------------------------------
alter table public.drivers drop constraint if exists drivers_email_key;
drop index if exists public.drivers_email_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_tenant_email_key' and conrelid = 'public.drivers'::regclass) then
    alter table public.drivers
      add constraint drivers_tenant_email_key unique (tenant_id, email);
  end if;
end$$;

-- ---------- mileage_log (driver_name, delivery_date) -----------------
alter table public.mileage_log drop constraint if exists idx_mileage_unique;
drop index if exists public.idx_mileage_unique;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mileage_log_tenant_driver_date_key' and conrelid = 'public.mileage_log'::regclass) then
    alter table public.mileage_log
      add constraint mileage_log_tenant_driver_date_key unique (tenant_id, driver_name, delivery_date);
  end if;
end$$;

-- ---------- payroll (week_of, driver_name) ---------------------------
alter table public.payroll drop constraint if exists payroll_week_of_driver_name_key;
drop index if exists public.payroll_week_of_driver_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_tenant_week_of_driver_name_key' and conrelid = 'public.payroll'::regclass) then
    alter table public.payroll
      add constraint payroll_tenant_week_of_driver_name_key unique (tenant_id, week_of, driver_name);
  end if;
end$$;

-- ---------- routing_rules (zip_code, pharmacy) -----------------------
alter table public.routing_rules drop constraint if exists routing_rules_zip_pharmacy_key;
drop index if exists public.routing_rules_zip_pharmacy_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'routing_rules_tenant_zip_pharmacy_key' and conrelid = 'public.routing_rules'::regclass) then
    alter table public.routing_rules
      add constraint routing_rules_tenant_zip_pharmacy_key unique (tenant_id, zip_code, pharmacy);
  end if;
end$$;

-- ---------- schedule_overrides (driver_name, date) -------------------
alter table public.schedule_overrides drop constraint if exists schedule_overrides_driver_name_date_key;
drop index if exists public.schedule_overrides_driver_name_date_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_overrides_tenant_driver_name_date_key' and conrelid = 'public.schedule_overrides'::regclass) then
    alter table public.schedule_overrides
      add constraint schedule_overrides_tenant_driver_name_date_key unique (tenant_id, driver_name, date);
  end if;
end$$;

-- ---------- settlements (week_of, driver_name) -----------------------
alter table public.settlements drop constraint if exists settlements_week_of_driver_name_key;
drop index if exists public.settlements_week_of_driver_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settlements_tenant_week_of_driver_name_key' and conrelid = 'public.settlements'::regclass) then
    alter table public.settlements
      add constraint settlements_tenant_week_of_driver_name_key unique (tenant_id, week_of, driver_name);
  end if;
end$$;

-- ---------- shift_offers (driver_name, date) -------------------------
alter table public.shift_offers drop constraint if exists shift_offers_driver_name_date_key;
drop index if exists public.shift_offers_driver_name_date_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shift_offers_tenant_driver_name_date_key' and conrelid = 'public.shift_offers'::regclass) then
    alter table public.shift_offers
      add constraint shift_offers_tenant_driver_name_date_key unique (tenant_id, driver_name, date);
  end if;
end$$;

-- ---------- sort_list (delivery_date, pharmacy, driver_name) ---------
alter table public.sort_list drop constraint if exists sort_list_delivery_date_pharmacy_driver_name_key;
drop index if exists public.sort_list_delivery_date_pharmacy_driver_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sort_list_tenant_delivery_date_pharmacy_driver_name_key' and conrelid = 'public.sort_list'::regclass) then
    alter table public.sort_list
      add constraint sort_list_tenant_delivery_date_pharmacy_driver_name_key unique (tenant_id, delivery_date, pharmacy, driver_name);
  end if;
end$$;

-- ---------- stop_reconciliation (driver_name, week_of, day) ----------
alter table public.stop_reconciliation drop constraint if exists stop_reconciliation_driver_name_week_of_day_key;
drop index if exists public.stop_reconciliation_driver_name_week_of_day_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stop_reconciliation_tenant_driver_name_week_of_day_key' and conrelid = 'public.stop_reconciliation'::regclass) then
    alter table public.stop_reconciliation
      add constraint stop_reconciliation_tenant_driver_name_week_of_day_key unique (tenant_id, driver_name, week_of, day);
  end if;
end$$;

-- ---------- tesla_tokens (driver_name) -------------------------------
alter table public.tesla_tokens drop constraint if exists tesla_tokens_driver_name_key;
drop index if exists public.tesla_tokens_driver_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tesla_tokens_tenant_driver_name_key' and conrelid = 'public.tesla_tokens'::regclass) then
    alter table public.tesla_tokens
      add constraint tesla_tokens_tenant_driver_name_key unique (tenant_id, driver_name);
  end if;
end$$;


-- =====================================================================
-- SECTION 4: New tenant-leading composite indexes for the 8 high-traffic
--            tables. These do NOT replace the existing single-tenant
--            indexes — that pruning is a future migration.
-- =====================================================================

-- delivery_confirmations
create index if not exists idx_delivery_confirmations_tenant_driver_date
  on public.delivery_confirmations (tenant_id, driver_name, delivery_date desc);
create index if not exists idx_delivery_confirmations_tenant_stop
  on public.delivery_confirmations (tenant_id, stop_id);

-- driver_events
create index if not exists idx_driver_events_tenant_driver_created
  on public.driver_events (tenant_id, driver_name, created_at desc);

-- driver_notifications
create index if not exists idx_driver_notifications_tenant_driver_created
  on public.driver_notifications (tenant_id, driver_name, created_at desc);

-- pickup_requests
create index if not exists idx_pickup_requests_tenant_driver_date
  on public.pickup_requests (tenant_id, driver_name, delivery_date);
create index if not exists idx_pickup_requests_tenant_status
  on public.pickup_requests (tenant_id, status);

-- error_logs
create index if not exists idx_error_logs_tenant_created
  on public.error_logs (tenant_id, created_at desc);

-- dispatch_history_import
create index if not exists idx_dispatch_history_import_tenant_date
  on public.dispatch_history_import (tenant_id, delivery_date);

-- time_off_requests
create index if not exists idx_time_off_requests_tenant_driver
  on public.time_off_requests (tenant_id, driver_name);
create index if not exists idx_time_off_requests_tenant_date_off
  on public.time_off_requests (tenant_id, date_off);

-- dispatch_logs
create index if not exists idx_dispatch_logs_tenant_date
  on public.dispatch_logs (tenant_id, date desc);


-- =====================================================================
-- SECTION 5: Basic (tenant_id) indexes for the remaining 21 tables.
-- These support FK lookups and tenant-only scans on tables whose
-- access patterns don't justify a tenant-leading composite (yet).
-- =====================================================================

create index if not exists idx_address_corrections_tenant_id  on public.address_corrections  (tenant_id);
create index if not exists idx_address_notes_tenant_id        on public.address_notes        (tenant_id);
create index if not exists idx_announcement_reads_tenant_id   on public.announcement_reads   (tenant_id);
create index if not exists idx_announcements_tenant_id        on public.announcements        (tenant_id);
create index if not exists idx_backups_tenant_id              on public.backups              (tenant_id);
create index if not exists idx_company_ledger_tenant_id       on public.company_ledger       (tenant_id);
create index if not exists idx_delivery_overrides_tenant_id   on public.delivery_overrides   (tenant_id);
create index if not exists idx_driver_favorites_tenant_id     on public.driver_favorites     (tenant_id);
create index if not exists idx_driver_routes_tenant_id        on public.driver_routes        (tenant_id);
create index if not exists idx_driver_schedule_tenant_id      on public.driver_schedule      (tenant_id);
create index if not exists idx_drivers_tenant_id              on public.drivers              (tenant_id);
create index if not exists idx_mileage_log_tenant_id          on public.mileage_log          (tenant_id);
create index if not exists idx_payroll_tenant_id              on public.payroll              (tenant_id);
create index if not exists idx_poll_responses_tenant_id       on public.poll_responses       (tenant_id);
create index if not exists idx_routing_rules_tenant_id        on public.routing_rules        (tenant_id);
create index if not exists idx_schedule_overrides_tenant_id   on public.schedule_overrides   (tenant_id);
create index if not exists idx_settlements_tenant_id          on public.settlements          (tenant_id);
create index if not exists idx_shift_offers_tenant_id         on public.shift_offers         (tenant_id);
create index if not exists idx_sort_list_tenant_id            on public.sort_list            (tenant_id);
create index if not exists idx_stop_reconciliation_tenant_id  on public.stop_reconciliation  (tenant_id);
create index if not exists idx_tesla_tokens_tenant_id         on public.tesla_tokens         (tenant_id);

commit;
