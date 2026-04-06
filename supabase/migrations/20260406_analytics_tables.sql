-- ============================================================
-- CNC Delivery — Analytics Data Layer
-- Three tables: monthly_stop_summary, daily_performance_summary, driver_events
-- ============================================================

-- 1. MONTHLY STOP SUMMARY
-- Aggregated monthly metrics per driver per pharmacy
CREATE TABLE IF NOT EXISTS public.monthly_stop_summary (
  id bigint generated always as identity primary key,
  driver_name text not null,
  pharmacy text not null,
  month date not null, -- first day of month (e.g. 2026-04-01)
  total_stops integer default 0,
  delivered integer default 0,
  failed integer default 0,
  cold_chain integer default 0,
  sig_required integer default 0,
  avg_stops_per_day numeric(5,2) default 0,
  working_days integer default 0,
  unique_zips integer default 0,
  unique_cities integer default 0,
  top_zip text,
  top_city text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE(driver_name, pharmacy, month)
);

CREATE INDEX IF NOT EXISTS idx_mss_driver ON public.monthly_stop_summary (driver_name, month desc);
CREATE INDEX IF NOT EXISTS idx_mss_month ON public.monthly_stop_summary (month desc);

-- 2. DAILY PERFORMANCE SUMMARY
-- Daily metrics per driver with timing and mileage
CREATE TABLE IF NOT EXISTS public.daily_performance_summary (
  id bigint generated always as identity primary key,
  driver_name text not null,
  delivery_date date not null,
  delivery_day text, -- Monday, Tuesday, etc.
  pharmacy text,
  total_stops integer default 0,
  delivered integer default 0,
  failed integer default 0,
  cold_chain integer default 0,
  sig_required integer default 0,
  first_delivery_at timestamptz,
  last_delivery_at timestamptz,
  route_duration_min integer, -- minutes between first and last delivery
  miles_driven numeric(6,1),
  avg_stop_duration_min numeric(5,1),
  geofence_overrides integer default 0,
  photos_taken integer default 0,
  signatures_collected integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE(driver_name, delivery_date)
);

CREATE INDEX IF NOT EXISTS idx_dps_driver ON public.daily_performance_summary (driver_name, delivery_date desc);
CREATE INDEX IF NOT EXISTS idx_dps_date ON public.daily_performance_summary (delivery_date desc);

-- 3. DRIVER EVENTS
-- Event telemetry for key driver actions
CREATE TABLE IF NOT EXISTS public.driver_events (
  id bigint generated always as identity primary key,
  driver_name text not null,
  event_type text not null, -- app_open, pharmacy_checkin, route_optimized, stop_delivered, stop_failed, offline_detected, offline_reconnected
  event_data jsonb default '{}',
  delivery_date date,
  gps_lat numeric,
  gps_lng numeric,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_de_driver ON public.driver_events (driver_name, created_at desc);
CREATE INDEX IF NOT EXISTS idx_de_type ON public.driver_events (event_type, created_at desc);
CREATE INDEX IF NOT EXISTS idx_de_date ON public.driver_events (delivery_date);

-- Enable RLS
ALTER TABLE public.monthly_stop_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_performance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_events ENABLE ROW LEVEL SECURITY;

-- Anon policies (temporary, same as other tables)
CREATE POLICY "anon_mss_all" ON public.monthly_stop_summary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_dps_all" ON public.daily_performance_summary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_de_all" ON public.driver_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- NIGHTLY ROLLUP FUNCTION
-- Called by pg_cron at 11 PM ET every night
-- Reads daily_stops, calculates metrics, upserts into summary tables
-- ============================================================

CREATE OR REPLACE FUNCTION public.nightly_rollup()
RETURNS void AS $$
DECLARE
  target_date date;
  rec record;
  month_start date;
BEGIN
  -- Process today's data
  target_date := CURRENT_DATE;

  -- 1. DAILY PERFORMANCE SUMMARY
  INSERT INTO public.daily_performance_summary (
    driver_name, delivery_date, delivery_day, pharmacy,
    total_stops, delivered, failed, cold_chain, sig_required,
    first_delivery_at, last_delivery_at, route_duration_min,
    avg_stop_duration_min, updated_at
  )
  SELECT
    s.driver_name,
    s.delivery_date,
    s.delivery_day,
    mode() WITHIN GROUP (ORDER BY s.pharmacy) as pharmacy,
    COUNT(*) as total_stops,
    COUNT(*) FILTER (WHERE s.status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE s.status = 'failed') as failed,
    COUNT(*) FILTER (WHERE s.cold_chain = true) as cold_chain,
    COUNT(*) FILTER (WHERE s.sig_required = true) as sig_required,
    MIN(s.delivered_at) FILTER (WHERE s.delivered_at IS NOT NULL) as first_delivery_at,
    MAX(s.delivered_at) FILTER (WHERE s.delivered_at IS NOT NULL) as last_delivery_at,
    EXTRACT(EPOCH FROM (
      MAX(s.delivered_at) FILTER (WHERE s.delivered_at IS NOT NULL) -
      MIN(s.delivered_at) FILTER (WHERE s.delivered_at IS NOT NULL)
    ))::integer / 60 as route_duration_min,
    CASE WHEN COUNT(*) FILTER (WHERE s.delivered_at IS NOT NULL) > 1
      THEN (EXTRACT(EPOCH FROM (
        MAX(s.delivered_at) FILTER (WHERE s.delivered_at IS NOT NULL) -
        MIN(s.delivered_at) FILTER (WHERE s.delivered_at IS NOT NULL)
      )) / NULLIF(COUNT(*) FILTER (WHERE s.delivered_at IS NOT NULL) - 1, 0) / 60)::numeric(5,1)
      ELSE NULL
    END as avg_stop_duration_min,
    now() as updated_at
  FROM public.daily_stops s
  WHERE s.delivery_date = target_date
    AND s.status != 'DELETED'
  GROUP BY s.driver_name, s.delivery_date, s.delivery_day
  ON CONFLICT (driver_name, delivery_date)
  DO UPDATE SET
    delivery_day = EXCLUDED.delivery_day,
    pharmacy = EXCLUDED.pharmacy,
    total_stops = EXCLUDED.total_stops,
    delivered = EXCLUDED.delivered,
    failed = EXCLUDED.failed,
    cold_chain = EXCLUDED.cold_chain,
    sig_required = EXCLUDED.sig_required,
    first_delivery_at = EXCLUDED.first_delivery_at,
    last_delivery_at = EXCLUDED.last_delivery_at,
    route_duration_min = EXCLUDED.route_duration_min,
    avg_stop_duration_min = EXCLUDED.avg_stop_duration_min,
    updated_at = now();

  -- 2. MONTHLY STOP SUMMARY — rebuild current month
  month_start := date_trunc('month', target_date)::date;

  DELETE FROM public.monthly_stop_summary WHERE month = month_start;

  INSERT INTO public.monthly_stop_summary (
    driver_name, pharmacy, month,
    total_stops, delivered, failed, cold_chain, sig_required,
    avg_stops_per_day, working_days, unique_zips, unique_cities,
    top_zip, top_city, updated_at
  )
  SELECT
    s.driver_name,
    s.pharmacy,
    month_start,
    COUNT(*) as total_stops,
    COUNT(*) FILTER (WHERE s.status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE s.status = 'failed') as failed,
    COUNT(*) FILTER (WHERE s.cold_chain = true) as cold_chain,
    COUNT(*) FILTER (WHERE s.sig_required = true) as sig_required,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT s.delivery_date), 0), 2) as avg_stops_per_day,
    COUNT(DISTINCT s.delivery_date) as working_days,
    COUNT(DISTINCT s.zip) as unique_zips,
    COUNT(DISTINCT s.city) as unique_cities,
    mode() WITHIN GROUP (ORDER BY s.zip) as top_zip,
    mode() WITHIN GROUP (ORDER BY s.city) as top_city,
    now()
  FROM public.daily_stops s
  WHERE s.delivery_date >= month_start
    AND s.delivery_date < (month_start + interval '1 month')::date
    AND s.status != 'DELETED'
  GROUP BY s.driver_name, s.pharmacy;

  -- Update mileage from mileage_log
  UPDATE public.daily_performance_summary dps
  SET miles_driven = ml.miles
  FROM public.mileage_log ml
  WHERE dps.driver_name = ml.driver_name
    AND dps.delivery_date = ml.delivery_date
    AND dps.delivery_date = target_date;

  -- Update geofence overrides count
  UPDATE public.daily_performance_summary dps
  SET geofence_overrides = sub.cnt
  FROM (
    SELECT driver_name, COUNT(*) as cnt
    FROM public.delivery_overrides
    WHERE created_at::date = target_date
    GROUP BY driver_name
  ) sub
  WHERE dps.driver_name = sub.driver_name
    AND dps.delivery_date = target_date;

  -- Update photos and signatures from delivery_confirmations
  UPDATE public.daily_performance_summary dps
  SET photos_taken = sub.photos, signatures_collected = sub.sigs
  FROM (
    SELECT driver_name,
      COUNT(*) FILTER (WHERE photo_package_url IS NOT NULL) as photos,
      COUNT(*) FILTER (WHERE signature_url IS NOT NULL) as sigs
    FROM public.delivery_confirmations
    WHERE delivery_date = target_date
    GROUP BY driver_name
  ) sub
  WHERE dps.driver_name = sub.driver_name
    AND dps.delivery_date = target_date;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule nightly rollup at 11 PM ET (3 AM UTC next day)
-- Note: pg_cron must be enabled in Supabase Dashboard > Database > Extensions
SELECT cron.schedule(
  'nightly-analytics-rollup',
  '0 3 * * *',
  'SELECT public.nightly_rollup()'
);

-- ============================================================
-- BACKFILL FUNCTION
-- One-time: processes ALL historical daily_stops data
-- Populates monthly_stop_summary for all months
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_monthly_summary()
RETURNS text AS $$
DECLARE
  months_processed integer := 0;
  rows_inserted integer := 0;
BEGIN
  -- Clear existing data
  TRUNCATE public.monthly_stop_summary;

  -- Insert aggregated data for all months
  INSERT INTO public.monthly_stop_summary (
    driver_name, pharmacy, month,
    total_stops, delivered, failed, cold_chain, sig_required,
    avg_stops_per_day, working_days, unique_zips, unique_cities,
    top_zip, top_city
  )
  SELECT
    s.driver_name,
    s.pharmacy,
    date_trunc('month', s.delivery_date)::date as month,
    COUNT(*) as total_stops,
    COUNT(*) FILTER (WHERE s.status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE s.status = 'failed') as failed,
    COUNT(*) FILTER (WHERE s.cold_chain = true) as cold_chain,
    COUNT(*) FILTER (WHERE s.sig_required = true) as sig_required,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT s.delivery_date), 0), 2) as avg_stops_per_day,
    COUNT(DISTINCT s.delivery_date) as working_days,
    COUNT(DISTINCT s.zip) as unique_zips,
    COUNT(DISTINCT s.city) as unique_cities,
    mode() WITHIN GROUP (ORDER BY s.zip) as top_zip,
    mode() WITHIN GROUP (ORDER BY s.city) as top_city
  FROM public.daily_stops s
  WHERE s.status != 'DELETED'
    AND s.driver_name IS NOT NULL
    AND s.pharmacy IS NOT NULL
  GROUP BY s.driver_name, s.pharmacy, date_trunc('month', s.delivery_date)::date;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;

  SELECT COUNT(DISTINCT month) INTO months_processed FROM public.monthly_stop_summary;

  RETURN format('Backfill complete: %s rows inserted across %s months', rows_inserted, months_processed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
