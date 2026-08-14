-- POD audit-hardening: fields backing the chain-of-custody the audit PDF surfaces.
--
-- Split of responsibilities:
--   * delivery_overrides    → reason/why an integrity check was bypassed
--       (geofence bypass reason already lives here; barcode bypass reason joins it)
--   * delivery_confirmations → per-delivery evidence
--       (adds pickup-scan location/time and photo-ID capture)
--
-- Driver-app enforcement (min-2-photos, must-have-note, must-type-reason)
-- happens client-side; this migration only makes the columns exist so the
-- values can be persisted and surfaced in the POD PDF.

------------------------------------------------------------------------
-- delivery_confirmations: pickup scan + photo ID
------------------------------------------------------------------------
alter table public.delivery_confirmations
  add column if not exists pickup_scan_at        timestamptz,
  add column if not exists pickup_scan_lat       double precision,
  add column if not exists pickup_scan_lng       double precision,
  add column if not exists pickup_barcode_scanned boolean default false,
  add column if not exists photo_id_url          text,
  add column if not exists barcode_manual_entry  boolean default false,
  add column if not exists barcode_override_reason text;

comment on column public.delivery_confirmations.pickup_scan_at is
  'When the driver scanned the package in at the pickup location (pharmacy). NULL until step 1 of chain of custody is completed.';

comment on column public.delivery_confirmations.pickup_scan_lat is
  'Driver GPS latitude at pickup scan time. Compared against tenant pharmacy origin for pickup-side geofence.';

comment on column public.delivery_confirmations.pickup_scan_lng is
  'Driver GPS longitude at pickup scan time.';

comment on column public.delivery_confirmations.pickup_barcode_scanned is
  'TRUE if the barcode was actually scanned at pickup (vs manually typed / skipped).';

comment on column public.delivery_confirmations.photo_id_url is
  'Optional supabase-storage URL of a photo-ID scan captured at delivery. Required for controlled substances / policy-flagged patients.';

comment on column public.delivery_confirmations.barcode_manual_entry is
  'TRUE if the barcode was typed manually at delivery rather than scanned. Requires a barcode_override_reason.';

comment on column public.delivery_confirmations.barcode_override_reason is
  'Free-text driver explanation whenever barcode_manual_entry or barcode_overridden is TRUE.';

------------------------------------------------------------------------
-- delivery_overrides: distinguish geofence vs barcode vs photo-min bypasses
------------------------------------------------------------------------
alter table public.delivery_overrides
  add column if not exists override_type text;

comment on column public.delivery_overrides.override_type is
  'What was bypassed: ''geofence'' | ''barcode'' | ''photo_min'' | ''pickup_geofence''. Historical rows without a value are assumed ''geofence'' (the only overrideable step at the time).';

-- Backfill historical rows so the PDF can rely on override_type being non-null
update public.delivery_overrides
   set override_type = 'geofence'
 where override_type is null;

------------------------------------------------------------------------
-- Helpful indexes for the audit PDF / QA dashboard
------------------------------------------------------------------------
create index if not exists idx_delivery_confirmations_pickup_scan_at
  on public.delivery_confirmations (pickup_scan_at desc);

create index if not exists idx_delivery_overrides_type
  on public.delivery_overrides (override_type);
