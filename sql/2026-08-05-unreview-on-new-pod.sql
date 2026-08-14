-- When new POD photos land for a patient that was previously marked
-- "Reviewed" in the dispatch Patient POD Library, un-mark them so they
-- resurface in the "Needs review" filter. Otherwise a patient reviewed
-- months ago stays hidden even as new (possibly better) reference shots
-- accumulate.
--
-- Fires when photo_url or photo_urls transitions from NULL to populated
-- on daily_stops (either UPDATE or INSERT). Patient key derivation matches
-- the JS normalizer in dispatch (DispatchV2PatientPodLibrary /
-- PatientPodLibrary): lowercase, strip non-alphanumeric except space,
-- collapse whitespace, trim → "<clean-name>|<zip>".

CREATE OR REPLACE FUNCTION unreview_on_new_pod_photo()
RETURNS TRIGGER AS $$
DECLARE
  was_empty     BOOLEAN;
  is_populated  BOOLEAN;
  clean_name    TEXT;
  clean_zip     TEXT;
  key           TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    was_empty := TRUE;
  ELSE
    was_empty := (OLD.photo_url IS NULL AND (OLD.photo_urls IS NULL OR OLD.photo_urls = ''));
  END IF;

  is_populated := (NEW.photo_url IS NOT NULL) OR (NEW.photo_urls IS NOT NULL AND NEW.photo_urls <> '');

  IF was_empty AND is_populated AND NEW.patient_name IS NOT NULL AND NEW.zip IS NOT NULL THEN
    -- Match the JS normalizer: lowercase, drop punctuation, collapse whitespace, trim.
    clean_name := trim(regexp_replace(regexp_replace(lower(NEW.patient_name), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'));
    clean_zip  := trim(NEW.zip);
    IF clean_name <> '' AND clean_zip <> '' THEN
      key := clean_name || '|' || clean_zip;
      DELETE FROM patient_pod_reviewed WHERE patient_key = key;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_stops_unreview_on_new_pod ON daily_stops;
CREATE TRIGGER daily_stops_unreview_on_new_pod
  AFTER INSERT OR UPDATE OF photo_url, photo_urls ON daily_stops
  FOR EACH ROW EXECUTE FUNCTION unreview_on_new_pod_photo();
