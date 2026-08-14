-- Driver-controlled route endpoint: whether the optimizer ends the route
-- at their home vs sends them back to the pharmacy.
--
-- The driver app has an in-app toggle for this; this column is where the
-- app persists the choice so the dispatcher's send flow can read it.
--
-- Values:
--   'home'     → optimize to end at drivers.home_lat/home_lng
--   'pharmacy' → round-trip: end back at the origin pharmacy
--   NULL       → not set; web falls back to 'home' when home coords exist,
--                'pharmacy' otherwise

alter table public.drivers
  add column if not exists route_end_preference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'drivers_route_end_preference_check'
       and conrelid = 'public.drivers'::regclass
  ) then
    alter table public.drivers
      add constraint drivers_route_end_preference_check
      check (route_end_preference is null or route_end_preference in ('home', 'pharmacy'));
  end if;
end $$;

comment on column public.drivers.route_end_preference is
  'Driver-selected endpoint for the daily route: ''home'' | ''pharmacy'' | NULL (unset). Written by the driver app''s in-app toggle; read by the web dispatcher when calling /api/optimize-route.';
