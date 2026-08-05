-- Persist Google's confidence signal alongside the cached lat/lng so a
-- cache hit still knows whether the original match was rooftop-accurate
-- or a soft ZIP/city fallback. Without this a misspelled address
-- (e.g. "Cyprus Ct" -> Wadsworth centroid) looks identical to a real
-- rooftop hit on subsequent reads.
--
-- location_type: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE'
--   (Google Geocoding API; null for census/other sources)
-- partial_match: TRUE when Google flagged the result as a fuzzy match
--   (again, null for census)

ALTER TABLE geocode_cache
  ADD COLUMN IF NOT EXISTS location_type TEXT,
  ADD COLUMN IF NOT EXISTS partial_match BOOLEAN;
