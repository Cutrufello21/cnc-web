-- Track which driver each stop was last emailed to WFL as a correction.
-- Send Corrections skips rows where this matches the current
-- assigned_driver_number (already told WFL about this assignment).
-- If the stop gets moved again, the values diverge and a new
-- correction email will be generated.

alter table public.daily_stops
  add column if not exists last_correction_driver text;

comment on column public.daily_stops.last_correction_driver is
  'Driver number last sent to WFL in a correction email. Used to avoid double-sending the same reassignment.';
