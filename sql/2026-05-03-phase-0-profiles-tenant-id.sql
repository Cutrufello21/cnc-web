-- =====================================================================
-- Phase 0 — profiles.tenant_id (LYN Rx multi-tenant migration)
-- Date:  2026-05-03
-- Phase: 0 of N (foundation; first table to get tenant_id)
--
-- What this does:
--   - Adds public.profiles.tenant_id (bigint, FK -> public.tenants(id),
--     ON DELETE RESTRICT). Added nullable so the backfill can run.
--   - Backfills every existing profiles row to tenant_id = 1 (CNC,
--     the only tenant that exists in Phase 0).
--   - Asserts no profiles row is left with NULL tenant_id; raises
--     and rolls back the whole transaction if any are missed.
--   - Sets tenant_id NOT NULL after the assertion passes.
--   - Creates idx_profiles_tenant_id on (tenant_id).
--   - Creates idx_profiles_tenant_role on (tenant_id, role) — the hot
--     lookup pattern from RLS policies and pharmacy-portal queries.
--     Skipped automatically if profiles.role does not exist.
--
-- What this does NOT do:
--   - Does not change any RLS policies on profiles (the existing
--     auth.uid()-based policies in supabase/setup.sql still apply).
--   - Does not add tenant_id to any other table.
--   - Does not change /api/db behavior.
--   - Does not enforce tenant scoping anywhere yet — that is the next
--     phase (after profiles.tenant_id exists, current_tenant_id() can
--     start being read out of the JWT and matched against this column).
--
-- Idempotency:
--   - Safe to re-run. Column add, FK add, indexes, and NOT NULL are
--     all guarded so a second run is a no-op rather than an error.
--   - The backfill targets only rows where tenant_id IS NULL, so a
--     second run touches zero rows.
--
-- Rollback:
--   begin;
--     drop index if exists idx_profiles_tenant_role;
--     drop index if exists idx_profiles_tenant_id;
--     alter table public.profiles alter column tenant_id drop not null;
--     alter table public.profiles drop constraint if exists profiles_tenant_id_fkey;
--     alter table public.profiles drop column if exists tenant_id;
--   commit;
--
-- DO NOT RUN AGAINST PRODUCTION WITHOUT BACKUP. Test against staging first.
-- =====================================================================

begin;

-- ---------- 1. Add column (nullable) --------------------------------

alter table public.profiles
  add column if not exists tenant_id bigint;

-- ---------- 2. Add FK (guarded so re-runs don't error) --------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_tenant_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_tenant_id_fkey
      foreign key (tenant_id)
      references public.tenants(id)
      on delete restrict;
  end if;
end$$;

-- ---------- 3. Backfill existing rows to CNC (tenant_id = 1) --------

update public.profiles
   set tenant_id = 1
 where tenant_id is null;

-- ---------- 4. Assert no orphans before locking the column ----------

do $$
declare
  null_count bigint;
begin
  select count(*) into null_count
    from public.profiles
   where tenant_id is null;

  if null_count > 0 then
    raise exception
      'Phase 0 backfill assertion failed: % profiles row(s) still have NULL tenant_id. Transaction rolled back.',
      null_count;
  end if;
end$$;

-- ---------- 5. Lock the column NOT NULL -----------------------------

-- SET NOT NULL is a no-op if already NOT NULL, so this is idempotent.
alter table public.profiles
  alter column tenant_id set not null;

-- ---------- 6. Indexes ----------------------------------------------

create index if not exists idx_profiles_tenant_id
  on public.profiles (tenant_id);

-- Composite (tenant_id, role) for the hot lookup. Only created if a
-- `role` column exists on profiles — keeps this migration safe in any
-- environment whose schema drifted.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'role'
  ) then
    create index if not exists idx_profiles_tenant_role
      on public.profiles (tenant_id, role);
  end if;
end$$;

commit;
