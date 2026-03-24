-- ============================================
-- CNC Delivery — Supabase Data Migration
-- Priority 2: Move Google Sheets → Supabase
-- Run in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. DRIVERS
-- ============================================
create table if not exists public.drivers (
  id serial primary key,
  driver_name text not null unique,
  driver_number text not null unique,
  email text unique,
  pharmacy text,                          -- 'SHSP', 'Aultman', 'Both'
  rate_mth numeric(5,2) default 0,        -- per-stop rate Mon/Tue/Thu
  rate_wf numeric(5,2) default 0,         -- per-stop rate Wed/Fri
  office_fee numeric(6,2) default 0,      -- weekly office fee (negative)
  flat_salary numeric(8,2),               -- null = per-stop driver
  active boolean default true,
  created_at timestamptz default now()
);

-- Seed all 16 drivers
insert into public.drivers (driver_name, driver_number, email, rate_mth, rate_wf, office_fee, flat_salary) values
  ('Bobby',    '55493', 'robert.miller315@gmail.com',   7.35, 7.35, -35, null),
  ('Nick',     '55540', 'nickpollack01@gmail.com',      7.00, 7.00, -35, null),
  ('Jake',     '55509', 'jacob@cncdeliveryservice.com', 6.75, 6.75,   0, null),
  ('Adam',     '57104', 'shondeladam@gmail.com',        6.75, 8.25, -35, null),
  ('Josh',     '55903', 'josh@cncdeliveryservice.com',  6.50, 6.50, -35, null),
  ('Theresa',  '55541', 'tcabiness1@gmail.com',         7.00, 7.00, -35, null),
  ('Laura',    '59192', 'laura@cncdeliveryservice.com', 7.00, 7.00, -25, null),
  ('Alex',     '55535', 'ajreed410@gmail.com',          6.75, 6.75, -35, null),
  ('Mike',     '57096', 'chisnellma@gmail.com',         8.25, 8.25,   0, null),
  ('Tara',     '59195', 'taraleaa3@gmail.com',          8.25, 8.25,   0, null),
  ('Nicholas', '21549', 'nicholaseager21@gmail.com',    8.35, 8.35,   0, null),
  ('Dom',      '55500', 'dom@cncdeliveryservice.com',      0,    0,   0, 2500),
  ('Mark',     '55532', 'cutrufellomark@gmail.com',        0,    0,   0, 1550),
  ('Kasey',    '59170', 'kcharvey13@gmail.com',         7.00, 7.00, -25, null),
  ('Rob',      '55000', null,                           6.50, 6.50,   0, null),
  ('Paul',     '55001', null,                              0,    0,   0, 2000)
on conflict (driver_name) do nothing;

-- ============================================
-- 2. ORDERS
-- ============================================
create table if not exists public.orders (
  id serial primary key,
  order_id text unique,
  patient_name text,
  address text,
  city text,
  zip text,
  pharmacy text,                          -- 'SHSP' or 'Aultman'
  driver_name text,
  date_delivered date,
  cold_chain boolean default false,
  source text,                            -- e.g. 'Trellis', 'Manual'
  created_at timestamptz default now()
);

create index if not exists idx_orders_date on public.orders (date_delivered desc);
create index if not exists idx_orders_driver on public.orders (driver_name);
create index if not exists idx_orders_zip on public.orders (zip);
create index if not exists idx_orders_pharmacy on public.orders (pharmacy);

-- ============================================
-- 3. ROUTING RULES
-- ============================================
create table if not exists public.routing_rules (
  id serial primary key,
  zip_code text not null unique,
  mon text default '',                    -- driver name for Monday
  tue text default '',
  wed text default '',
  thu text default '',
  fri text default '',
  route text default '',
  pharmacy text default '',
  created_at timestamptz default now()
);

create index if not exists idx_routing_zip on public.routing_rules (zip_code);

-- ============================================
-- 4. DISPATCH LOGS
-- ============================================
create table if not exists public.dispatch_logs (
  id serial primary key,
  date date not null,
  delivery_day text not null,             -- 'Monday' through 'Friday'
  status text default 'Complete',
  orders_processed int default 0,
  cold_chain int default 0,
  unassigned_count int default 0,
  corrections int default 0,
  shsp_orders int default 0,
  aultman_orders int default 0,
  top_driver text,
  notes text,
  created_at timestamptz default now(),
  unique(date, delivery_day)
);

create index if not exists idx_dispatch_logs_date on public.dispatch_logs (date desc);

-- ============================================
-- 5. PAYROLL (weekly stop counts + pay)
-- ============================================
create table if not exists public.payroll (
  id serial primary key,
  week_of date not null,                  -- Monday of the pay week
  driver_name text not null,
  driver_number text,
  mon int default 0,
  tue int default 0,
  wed int default 0,
  thu int default 0,
  fri int default 0,
  week_total int default 0,
  will_calls int default 0,
  weekly_pay numeric(8,2) default 0,
  created_at timestamptz default now(),
  unique(week_of, driver_name)
);

create index if not exists idx_payroll_week on public.payroll (week_of desc);

-- ============================================
-- 6. UNASSIGNED ORDERS
-- ============================================
create table if not exists public.unassigned_orders (
  id serial primary key,
  date date not null,
  delivery_day text,
  zip text not null,
  address text,
  pharmacy text,
  patient_name text,
  resolved boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_unassigned_date on public.unassigned_orders (date desc);
create index if not exists idx_unassigned_zip on public.unassigned_orders (zip);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on all tables
alter table public.drivers enable row level security;
alter table public.orders enable row level security;
alter table public.routing_rules enable row level security;
alter table public.dispatch_logs enable row level security;
alter table public.payroll enable row level security;
alter table public.unassigned_orders enable row level security;

-- Dispatchers can read/write everything
create policy "Dispatchers full access to drivers"
  on public.drivers for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'));

create policy "Dispatchers full access to orders"
  on public.orders for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'));

create policy "Dispatchers full access to routing_rules"
  on public.routing_rules for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'));

create policy "Dispatchers full access to dispatch_logs"
  on public.dispatch_logs for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'));

create policy "Dispatchers full access to payroll"
  on public.payroll for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'));

create policy "Dispatchers full access to unassigned_orders"
  on public.unassigned_orders for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'dispatcher'));

-- Drivers can read their own orders
create policy "Drivers can read own orders"
  on public.orders for select
  using (
    exists (
      select 1 from public.profiles p
      join public.drivers d on d.email = p.email
      where p.id = auth.uid() and d.driver_name = orders.driver_name
    )
  );

-- Drivers can read their own payroll
create policy "Drivers can read own payroll"
  on public.payroll for select
  using (
    exists (
      select 1 from public.profiles p
      join public.drivers d on d.email = p.email
      where p.id = auth.uid() and d.driver_name = payroll.driver_name
    )
  );

-- Drivers can read drivers list (for dispatch display)
create policy "Drivers can read drivers"
  on public.drivers for select
  using (exists (select 1 from public.profiles where id = auth.uid()));

-- API service role bypasses RLS, so the serverless functions
-- should use SUPABASE_SERVICE_ROLE_KEY (not the anon key)

-- ============================================
-- DONE — Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Add SUPABASE_SERVICE_ROLE_KEY to Vercel env vars
-- 3. Run data import script to backfill from Google Sheets
-- ============================================
