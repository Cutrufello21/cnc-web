-- Add delivery tracking columns to daily_stops
-- These are additive — no existing data or functionality is affected

ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS status text DEFAULT 'dispatched';
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS photo_urls jsonb;
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE daily_stops ADD COLUMN IF NOT EXISTS delivery_note text;

-- Index for querying by status (pharmacy dashboard will filter on this)
CREATE INDEX IF NOT EXISTS idx_daily_stops_status ON daily_stops (delivery_date, status);

-- Storage bucket for delivery photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-photos', 'delivery-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to delivery-photos bucket
CREATE POLICY "Authenticated users can upload delivery photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'delivery-photos');

-- Allow public read access to delivery photos
CREATE POLICY "Public read access to delivery photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'delivery-photos');
