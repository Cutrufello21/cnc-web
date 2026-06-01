-- Patient notes — dispatcher/pharmacy can attach a persistent note to a
-- patient. Travels with the patient across orders so future drivers see
-- the same context (e.g. "leave at side door", "call upon arrival").
--
-- patient_key is the normalized patient name (lowercased, punctuation
-- stripped, words sorted alphabetically) so "Joel E Huey" and
-- "Huey, Joel E" collapse to the same row. Mirrors normalizeKey() in
-- src/pages/portal/PortalPatients.jsx and src/lib/patientNotes.js.
--
-- Multi-tenant: tenant_id defaults to 1 (CNC). FK to tenants is not
-- added here because the live DB hasn't received the phase-0 tenants
-- migration yet — add the FK in a follow-up after that lands.

create table if not exists patient_notes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     bigint not null default 1,
  patient_key   text not null,
  patient_name  text not null,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    text,
  updated_by    text,
  unique (tenant_id, patient_key)
);

create index if not exists idx_patient_notes_tenant_key
  on patient_notes (tenant_id, patient_key);

-- Self-contained updated_at trigger so this migration works whether or
-- not the phase-0 touch_updated_at() function has been created yet.
create or replace function patient_notes_touch_updated_at_fn()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patient_notes_touch_updated_at on patient_notes;
create trigger patient_notes_touch_updated_at
  before update on patient_notes
  for each row execute function patient_notes_touch_updated_at_fn();

alter table patient_notes enable row level security;

-- Anon read matches the rest of the app (pickup_requests, etc.) for
-- the pre-RLS-rollout window. Writes still go through /api/db
-- (service role) so the anon policy doesn't widen the write surface.
drop policy if exists "anon read patient_notes" on patient_notes;
create policy "anon read patient_notes" on patient_notes for select using (true);
