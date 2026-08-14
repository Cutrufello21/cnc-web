-- Adds driver-supplied audit fields to delivery_overrides.
-- The driver app now requires a reason whenever they bypass the
-- geofence check on POD step 1. `update_location` distinguishes
-- "I'm here — update location" (true) from "Override — don't update" (false).

alter table public.delivery_overrides
  add column if not exists reason text,
  add column if not exists update_location boolean default false;
