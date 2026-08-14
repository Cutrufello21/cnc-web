-- Non-destructive "hide from library" list. Dispatch admins mark blurry /
-- irrelevant / wrong-address POD photos as dismissed so they stop cluttering
-- the Patient POD Library grid. The underlying delivery record and photo
-- file are untouched — the driver app's pinned-reference flow is unaffected.
--
-- Reversible: the dispatch UI has a "Show dismissed" toggle that lets an
-- admin un-dismiss anything they hid by mistake.

CREATE TABLE IF NOT EXISTS dismissed_pod_photos (
  id             BIGSERIAL PRIMARY KEY,
  photo_url      TEXT NOT NULL UNIQUE,
  patient_key    TEXT,
  dismissed_by   TEXT,
  dismissed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dismissed_pod_photos_patient_idx
  ON dismissed_pod_photos (patient_key);

ALTER TABLE dismissed_pod_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dismissed_pod_photos_all ON dismissed_pod_photos;
CREATE POLICY dismissed_pod_photos_all ON dismissed_pod_photos
  FOR ALL USING (true) WITH CHECK (true);
