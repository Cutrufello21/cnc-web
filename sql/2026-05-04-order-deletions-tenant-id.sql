-- =====================================================================
-- Phase 0 — Side migration: order_deletions.tenant_id
--          (LYN Rx multi-tenant migration)
-- Date:  2026-05-04
--
-- What this does:
--   Adds tenant_id to public.order_deletions, mirroring the pattern used
--   by sql/2026-05-03-phase-0-bulk-tables-tenant-id.sql for its 29 tables.
--   order_deletions was the only v1 ALLOWED-list table missing from the
--   bulk migration; without this side migration, /api/db-v2 cannot
--   tenant-scope insert operations on it.
--
--   Steps:
--     1. add column tenant_id bigint (nullable)
--     2. add FK -> public.tenants(id) ON DELETE RESTRICT (guarded)
--     3. backfill rows to tenant_id = 1 (CNC)
--     4. assert no NULL tenant_id remain (raises with count if so)
--     5. set tenant_id NOT NULL
--     6. add basic (tenant_id) index for FK lookups
--
-- What this does NOT do:
--   - Does not change RLS policies on order_deletions.
--   - Does not change application code; /api/db-v2 reads tenantScoped:true
--     from its ALLOWED_V2 map for this table and stamps tenant_id at write.
--   - Does not touch any other table.
--
-- Idempotency: safe to re-run. Every step uses IF NOT EXISTS / pg_constraint
-- guards / NULL-only filter / NOT NULL no-op semantics.
--
-- Lock duration: order_deletions is a small append-only log table. ADD COLUMN
-- bigint without DEFAULT is metadata-only. The backfill UPDATE runs against
-- a small row count. Total wall-clock: well under a second.
--
-- Rollback:
--   begin;
--     drop index if exists idx_order_deletions_tenant_id;
--     alter table public.order_deletions alter column tenant_id drop not null;
--     alter table public.order_deletions drop constraint if exists order_deletions_tenant_id_fkey;
--     alter table public.order_deletions drop column if exists tenant_id;
--   commit;
--
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

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'order_deletions'
  ) then
    raise exception
      'Prerequisite missing: public.order_deletions does not exist.';
  end if;
end$$;


-- ---------- order_deletions ------------------------------------------

alter table public.order_deletions add column if not exists tenant_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_deletions_tenant_id_fkey'
      and conrelid = 'public.order_deletions'::regclass
  ) then
    alter table public.order_deletions
      add constraint order_deletions_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end$$;

update public.order_deletions set tenant_id = 1 where tenant_id is null;

do $$
declare null_count bigint;
begin
  select count(*) into null_count from public.order_deletions where tenant_id is null;
  if null_count > 0 then
    raise exception 'Phase 0 backfill assertion failed on order_deletions: % row(s) still have NULL tenant_id. Transaction rolled back.', null_count;
  end if;
end$$;

alter table public.order_deletions alter column tenant_id set not null;

create index if not exists idx_order_deletions_tenant_id on public.order_deletions (tenant_id);

commit;
