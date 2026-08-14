-- Admin-curated reference photos surfaced to drivers on the stop card.
-- Dispatch admins pin up to 3 photos per patient (front door, drop zone,
-- gate code, etc.). Drivers see those pins when tapping the camera icon
-- on a stop card, replacing the previous "all photos at this address"
-- lookup which was noisy at high-volume patients (50+ photos).
--
-- patient_key is normalized:
--   lowercase(patient_name stripped of punctuation) + '|' + zip
-- Same normalizer used by hooks/usePhotoHistory.js in the driver app so
-- keys line up across write (dispatch) and read (driver).
--
-- position: 1|2|3 — display order. UNIQUE per (patient_key, position) so
-- there can be at most 3 pins per patient at any time.

CREATE TABLE IF NOT EXISTS patient_pinned_photos (
  id             BIGSERIAL PRIMARY KEY,
  patient_key    TEXT NOT NULL,
  patient_name   TEXT,            -- denormalized for readability in dispatch UI
  photo_url      TEXT NOT NULL,
  position       SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 3),
  note           TEXT,            -- optional caption e.g. "front door drop"
  pinned_by      TEXT,            -- driver_name of the admin who pinned
  pinned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (patient_key, position)
);

CREATE INDEX IF NOT EXISTS patient_pinned_photos_key_idx
  ON patient_pinned_photos (patient_key);

-- Permissive during rollout. Locks down alongside the broader RLS pass.
ALTER TABLE patient_pinned_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_pinned_photos_all ON patient_pinned_photos;
CREATE POLICY patient_pinned_photos_all ON patient_pinned_photos
  FOR ALL USING (true) WITH CHECK (true);
