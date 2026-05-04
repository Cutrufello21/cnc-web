-- =====================================================================
-- Fix: enforce one-driver-per-slot for SignUp polls
-- Date: 2026-05-04
--
-- Problem:
--   announcements.type='signup' polls represent first-come-first-served
--   driver meeting time slots. Today, two drivers can both claim the
--   same slot — only the (announcement_id, driver_id) unique key exists,
--   which prevents one driver from voting twice but does NOT prevent two
--   drivers from picking the same response.
--
-- Why a trigger and not a partial unique index:
--   The discriminator (signup vs. multiple-choice poll) lives on the
--   parent announcements row, and Postgres partial-index predicates
--   cannot reference other tables. A BEFORE-trigger that joins to
--   announcements and rejects same-slot duplicates is the simplest
--   correct enforcement.
--
-- Behavior:
--   - INSERT or UPDATE on poll_responses where parent announcement
--     has type='signup': reject if any other row already has the
--     same (announcement_id, response). Raises with SQLSTATE 23505
--     (unique_violation) so client-side error handling treats it
--     identically to a real unique-constraint violation.
--   - Multiple-choice polls (type='poll' or anything else) are
--     untouched. Multiple drivers may still vote for the same option.
--
-- Effect on existing rows:
--   - The trigger fires only on new writes. Existing rows — including
--     existing same-slot duplicates — are left in place. The migration
--     emits a NOTICE listing how many duplicate slots currently exist
--     so the operator knows manual cleanup is needed before any
--     affected driver can re-vote on a different slot.
--
-- Idempotency:
--   - CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS makes this
--     safe to re-run.
--
-- Rollback:
--
--   begin;
--     drop trigger if exists poll_responses_signup_unique_slot_trigger
--       on public.poll_responses;
--     drop function if exists public.poll_responses_signup_unique_slot();
--   commit;
-- =====================================================================

begin;

-- ---------- 1. Pre-flight: report existing duplicates -----------------

do $$
declare
  dup_slots  int;
  dup_rows   int;
begin
  select
    count(*) filter (where rn > 0),
    coalesce(sum(case when rn > 0 then rn else 0 end), 0)
  into dup_slots, dup_rows
  from (
    select count(*) - 1 as rn
    from public.poll_responses pr
    join public.announcements  a on a.id = pr.announcement_id
    where a.type = 'signup'
    group by pr.announcement_id, pr.response
    having count(*) > 1
  ) sub;

  if dup_slots > 0 then
    raise notice
      'poll_responses signup-slot pre-flight: % slot(s) currently have duplicate votes (% extra row(s) beyond first-claim). Trigger only enforces new writes — existing duplicates remain and need manual cleanup.',
      dup_slots, dup_rows;
  else
    raise notice 'poll_responses signup-slot pre-flight: no existing duplicates.';
  end if;
end$$;

-- ---------- 2. Trigger function ---------------------------------------

create or replace function public.poll_responses_signup_unique_slot()
returns trigger
language plpgsql
as $$
declare
  parent_type text;
  conflict_id uuid;
begin
  select type into parent_type
  from public.announcements
  where id = new.announcement_id;

  if parent_type is distinct from 'signup' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.announcement_id = new.announcement_id
     and old.response is not distinct from new.response then
    return new;
  end if;

  select id into conflict_id
  from public.poll_responses
  where announcement_id = new.announcement_id
    and response = new.response
    and (tg_op = 'INSERT' or id <> old.id)
  limit 1;

  if conflict_id is not null then
    raise exception
      'Slot "%" is already claimed on signup poll %. Each slot is first-come-first-served and may have only one driver.',
      new.response, new.announcement_id
      using errcode = '23505';
  end if;

  return new;
end$$;

-- ---------- 3. Attach trigger -----------------------------------------

drop trigger if exists poll_responses_signup_unique_slot_trigger
  on public.poll_responses;

create trigger poll_responses_signup_unique_slot_trigger
  before insert or update on public.poll_responses
  for each row execute function public.poll_responses_signup_unique_slot();

commit;
