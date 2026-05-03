-- Pickup requests — pharmacy staff trigger a "go grab this and return it to the store" run.
-- Distinct from daily_stops to keep delivery analytics clean and to give pickups
-- their own POD requirements (sig from patient on pickup, sig from pharmacy on return).
create table if not exists pickup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  pharmacy text not null,
  pickup_address text not null,
  pickup_city text,
  pickup_zip text,
  pickup_lat double precision,
  pickup_lng double precision,
  patient_name text,
  reason text not null,
  reason_detail text,
  urgency text default 'next_route',
  requested_by text,
  driver_name text,
  delivery_date date,
  status text default 'pending',
  picked_up_at timestamptz,
  returned_at timestamptz,
  pickup_photo_url text,
  pickup_signature_url text,
  return_signature_url text,
  cancelled_reason text
);

create index if not exists idx_pickup_requests_status on pickup_requests(status);
create index if not exists idx_pickup_requests_pharmacy on pickup_requests(pharmacy);
create index if not exists idx_pickup_requests_driver on pickup_requests(driver_name, delivery_date);

-- RLS: pharmacy users can read/write their own pharmacy's rows; dispatchers read/write all.
alter table pickup_requests enable row level security;

-- Anon read (matches existing app pattern). Tighten later when full RLS is rolled out.
drop policy if exists "anon read pickup_requests" on pickup_requests;
create policy "anon read pickup_requests" on pickup_requests for select using (true);
