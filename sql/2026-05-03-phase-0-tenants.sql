-- =====================================================================
-- Phase 0 — Tenants table (LYN Rx multi-tenant migration)
-- Date:  2026-05-03
-- Phase: 0 of N (foundation; no other tables touched yet)
--
-- What this does:
--   - Creates the `tenant_tier` and `tenant_status` enums.
--   - Creates the `tenants` table (the root of multi-tenancy). Every
--     PHI/operational table will eventually carry a `tenant_id` FK
--     pointing here. That work happens in later phases.
--   - Adds a generic `touch_updated_at()` trigger function (reused by
--     future tables) and wires it to `tenants.updated_at`.
--   - Indexes: unique slug (via constraint), status, GIN on feature_flags.
--   - Enables RLS on `tenants`, creates `current_tenant_id()` helper,
--     adds `tenants_self_read` policy, revokes anon access.
--   - Seeds the CNC tenant at id = 1 (founding tier) and bumps the
--     sequence so future tenants start at id >= 2.
--
-- What this does NOT do:
--   - Does not add tenant_id to any other table.
--   - Does not migrate existing data.
--   - Does not change /api/db behavior or any RLS on other tables.
--
-- Rollback:
--   begin;
--     drop policy if exists tenants_self_read on tenants;
--     drop function if exists current_tenant_id();
--     drop trigger  if exists tenants_touch_updated_at on tenants;
--     drop function if exists touch_updated_at();
--     drop table    if exists tenants;
--     drop type     if exists tenant_status;
--     drop type     if exists tenant_tier;
--   commit;
--   -- Note: touch_updated_at() is generic; only drop it in rollback if
--   -- no later migration has started using it. If later phases already
--   -- depend on it, leave the function in place.
--
-- DO NOT RUN AGAINST PRODUCTION WITHOUT BACKUP. Test against staging first.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_tier') then
    create type tenant_tier as enum ('founding', 'starter', 'growth', 'professional', 'enterprise');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_status') then
    create type tenant_status as enum ('active', 'trial', 'suspended', 'archived');
  end if;
end$$;

-- ---------- Table ----------------------------------------------------

create table if not exists tenants (
  id                    bigserial primary key,
  slug                  text          not null,
  display_name          text          not null,
  legal_name            text,
  tier                  tenant_tier   not null default 'starter',
  status                tenant_status not null default 'trial',

  -- Branding
  logo_url              text,
  logo_dark_url         text,
  primary_color         text          not null default '#0C6169',
  accent_color          text,
  font_family           text          not null default 'Inter',

  -- Lifecycle
  trial_ends_at         timestamptz,
  suspended_at          timestamptz,

  -- Contact
  primary_contact_email text,
  primary_contact_phone text,

  -- Locale / ops
  timezone              text          not null default 'America/New_York',
  default_locale        text          not null default 'en-US',
  pharmacy_origins      jsonb         not null default '[]'::jsonb,
  admin_emails          text[]        not null default array[]::text[],

  -- Config
  feature_flags         jsonb         not null default '{}'::jsonb,

  -- Audit
  created_by            uuid references auth.users(id),
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),

  constraint tenants_slug_key              unique (slug),
  constraint tenants_slug_format           check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint tenants_primary_color_format  check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenants_accent_color_format   check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

-- ---------- updated_at trigger --------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenants_touch_updated_at on tenants;
create trigger tenants_touch_updated_at
  before update on tenants
  for each row execute function touch_updated_at();

-- ---------- Indexes -------------------------------------------------

-- slug uniqueness already enforced by the unique constraint above; an
-- explicit btree is created automatically. Add the others:
create index if not exists idx_tenants_status        on tenants (status);
create index if not exists idx_tenants_feature_flags on tenants using gin (feature_flags);

-- ---------- RLS -----------------------------------------------------

alter table tenants enable row level security;

-- Resolve the caller's tenant from the Supabase JWT. Looks first at
-- top-level `tenant_id`, then falls back to `app_metadata.tenant_id`
-- (which is where Supabase puts server-set custom claims). Returns
-- null when no claim is present (e.g. service-role calls — those
-- bypass RLS anyway).
create or replace function current_tenant_id()
returns bigint
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id'
  )::bigint;
$$;

drop policy if exists tenants_self_read on tenants;
create policy tenants_self_read on tenants
  for select
  using (id = current_tenant_id());

-- Anon must not see the tenant directory. Service role still works
-- (RLS bypass). Authenticated users only see their own tenant via the
-- policy above.
revoke all on tenants from anon;

-- ---------- Seed: CNC as founding tenant (id = 1) -------------------

insert into tenants (
  id, slug, display_name, legal_name,
  tier, status,
  primary_color, accent_color, font_family,
  primary_contact_email,
  timezone, default_locale,
  pharmacy_origins,
  admin_emails,
  feature_flags
) values (
  1,
  'cnc',
  'CNC Delivery',
  'CNC Delivery Service',
  'founding',
  'active',
  '#0A2463',
  '#60A5FA',
  'Inter',
  'dom@cncdeliveryservice.com',
  'America/New_York',
  'en-US',
  jsonb_build_array(
    jsonb_build_object(
      'name',    'SHSP',
      'address', '70 Arch St, Akron, OH 44304',
      'lat',     41.08033,
      'lng',     -81.49976
    ),
    jsonb_build_object(
      'name',    'Aultman',
      'address', '2600 6th St SW, Canton, OH 44710',
      'lat',     40.79639,
      'lng',     -81.40365
    )
  ),
  array['dominiccutrufello@gmail.com', 'dom@cncdeliveryservice.com', 'server@cncdelivery.com'],
  jsonb_build_object(
    'tesla',                true,
    'cxt',                  true,
    'dual_pharmacy_chain',  true,
    'road_warrior',         true,
    'ai_dispatch',          true,
    'ai_insights',          true,
    'communications_hub',   true,
    'shift_offers',         true,
    'pickup_requests',      true,
    'analytics_insights',   true,
    'schedule_audit',       true,
    'white_label_branding', true
  )
)
on conflict (id) do nothing;

-- Bump the sequence so the next inserted tenant gets id >= 2.
select setval(
  pg_get_serial_sequence('tenants', 'id'),
  greatest(1, (select coalesce(max(id), 1) from tenants))
);
