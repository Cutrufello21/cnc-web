-- =====================================================================
-- /api/db-v2 parallel-write diff audit table
-- Date:  2026-05-04
--
-- What this does:
--   Creates public.db_v2_diff, the audit log written by the cnc-web
--   parallel-write harness during the /api/db → /api/db-v2 cutover.
--   For every write the client wrapper sends to BOTH endpoints, the
--   harness inserts one row here recording the v1 response, the v2
--   response, and a categorical match_status so we can SQL-query the
--   diff during the cutover bake.
--
--   match_status values:
--     - match               — both endpoints succeeded with equivalent data
--     - mismatch            — both succeeded but data differs
--     - v1_only_succeeded   — v1 200, v2 4xx/5xx
--     - v2_only_succeeded   — v2 200, v1 4xx/5xx
--     - both_failed         — both endpoints returned non-2xx
--
-- What this does NOT do:
--   - Does not enable RLS. The audit table is service-role-only; no client
--     ever reads or writes it directly. The recording endpoint (added
--     Thursday with the harness) is the only writer.
--   - Does not include the request body. v1_response and v2_response are
--     enough to triage; storing the body would duplicate row data and
--     leak PHI into a second table.
--   - Does not get added to /api/db-v2's ALLOWED_V2 whitelist.
--
-- Idempotency: safe to re-run. CREATE TABLE IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS.
--
-- Cleanup: this table is throwaway. Drop it after cutover is confirmed
-- stable (the post-cutover follow-up will include `drop table public.db_v2_diff`).
--
-- =====================================================================

begin;

create table if not exists public.db_v2_diff (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  table_name    text not null,
  operation     text not null,
  v1_response   jsonb,
  v2_response   jsonb,
  match_status  text not null check (match_status in (
                  'match',
                  'mismatch',
                  'v1_only_succeeded',
                  'v2_only_succeeded',
                  'both_failed'
                )),
  user_id       uuid,
  tenant_id     bigint
);

create index if not exists idx_db_v2_diff_status_created
  on public.db_v2_diff (match_status, created_at desc);

commit;
