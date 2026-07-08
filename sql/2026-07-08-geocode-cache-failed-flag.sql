-- Track failed geocode lookups so we don't re-query the vendor for known-bad addresses on every dispatch page load.
-- api/geocode.js reads failed_at + FAILED_RETRY_DAYS (30d) to decide whether to retry.

ALTER TABLE geocode_cache
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS geocode_cache_failed_at_idx
  ON geocode_cache (failed_at)
  WHERE failed_at IS NOT NULL;

-- Optional cleanup (run manually after normalized keys have re-populated for a few weeks):
--   DELETE FROM geocode_cache
--   WHERE failed_at IS NULL
--     AND cache_key ~ '(street|avenue|drive|road|boulevard|northwest|northeast|southwest|southeast)';
-- This drops the old fragmented rows so the cache table stays lean.
