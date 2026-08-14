-- Admin marker for "I've looked through this patient's POD photos and none are
-- worth pinning" — so during the 858-patient backlog cleanup they don't keep
-- landing on the same non-pinnable patients over and over.
--
-- One row per patient_key. Same normalizer as pins/dismissals.

CREATE TABLE IF NOT EXISTS patient_pod_reviewed (
  id             BIGSERIAL PRIMARY KEY,
  patient_key    TEXT NOT NULL UNIQUE,
  patient_name   TEXT,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patient_pod_reviewed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_pod_reviewed_all ON patient_pod_reviewed;
CREATE POLICY patient_pod_reviewed_all ON patient_pod_reviewed
  FOR ALL USING (true) WITH CHECK (true);
