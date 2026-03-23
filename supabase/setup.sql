-- ============================================
-- CNC Delivery — Supabase Auth Setup
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('dispatcher', 'driver')),
  driver_id text,          -- e.g. '55500' for Dom, matches cnc-dispatch driver IDs
  driver_number text,      -- same as driver_id, kept for clarity
  pharmacy text,           -- 'SHSP', 'Aultman', or 'Both'
  created_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table public.profiles enable row level security;

-- 3. RLS Policies
-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Dispatchers can read all profiles (needed for driver management)
create policy "Dispatchers can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dispatcher'
    )
  );

-- 4. Auto-create profile on signup via trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'driver')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- AFTER running the SQL above:
--
-- 1. Create Dom's account in Supabase Auth dashboard:
--    Email: dom@cncdeliveryservice.com
--    Password: (set a strong password)
--
-- 2. Then update his profile to dispatcher:
--    UPDATE public.profiles
--    SET role = 'dispatcher',
--        full_name = 'Dom Cutrufello',
--        driver_id = '55500',
--        pharmacy = 'Both'
--    WHERE email = 'dom@cncdeliveryservice.com';
--
-- 3. Create driver accounts as needed. They'll auto-get role='driver'.
--    You can update their driver_id and pharmacy after:
--
--    Example for Bobby:
--    UPDATE public.profiles
--    SET full_name = 'Bobby Miller',
--        driver_id = '55493',
--        pharmacy = 'SHSP'
--    WHERE email = 'robert.miller315@gmail.com';
-- ============================================
