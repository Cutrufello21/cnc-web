-- Historical dispatch data for AI suggestion engine.
-- Internal only — no RLS needed. Populated via backfill script
-- from daily_stops + dispatch_logs.

CREATE TABLE dispatch_history_import (
  id bigserial PRIMARY KEY,
  delivery_date date,
  day_of_week text,
  driver_name text,
  zip text,
  city text,
  address text,
  order_id text,
  pharmacy text,
  cold_chain boolean DEFAULT false,
  source text,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON dispatch_history_import (delivery_date);
CREATE INDEX ON dispatch_history_import (driver_name);
CREATE INDEX ON dispatch_history_import (zip);
