-- ============================================================
-- Create Supabase Auth accounts for all drivers
-- Run AFTER the RLS migration (20260405_rls_hipaa.sql)
--
-- NOTE: Supabase Auth accounts cannot be created via SQL.
-- Use the Supabase Dashboard → Authentication → Users → Add User
-- or use the Admin API via a script.
--
-- Below is the driver list with emails. Create each account with
-- the default password: cc1234 (drivers should change on first login).
--
-- Dispatchers Dom and Paul use password: @Peaceout55
-- ============================================================

-- Driver accounts to create in Supabase Auth Dashboard:
--
-- | Name     | Email                           | Password     | Role       |
-- |----------|---------------------------------|--------------|------------|
-- | Bobby    | robert.miller315@gmail.com      | cc1234       | driver     |
-- | Nick     | nickpollack01@gmail.com          | cc1234       | driver     |
-- | Jake     | jacob@cncdeliveryservice.com     | cc1234       | driver     |
-- | Adam     | shondeladam@gmail.com            | cc1234       | driver     |
-- | Josh     | josh@cncdeliveryservice.com      | cc1234       | driver     |
-- | Theresa  | tcabiness1@gmail.com             | cc1234       | driver     |
-- | Laura    | laura@cncdeliveryservice.com     | cc1234       | driver     |
-- | Alex     | ajreed410@gmail.com              | cc1234       | driver     |
-- | Mike     | chisnellma@gmail.com             | cc1234       | driver     |
-- | Tara     | taraleaa3@gmail.com              | cc1234       | driver     |
-- | Nicholas | nicholaseager21@gmail.com        | cc1234       | driver     |
-- | Kasey    | kcharvey13@gmail.com             | cc1234       | driver     |
-- | Dom      | dom@cncdeliveryservice.com       | @Peaceout55  | dispatcher |
-- | Paul     | (needs email added to drivers)   | @Peaceout55  | dispatcher |
-- | Mark     | cutrufellomark@gmail.com         | cc1234       | driver     |
-- | Rob      | (needs email added to drivers)   | cc1234       | driver     |
--
-- After creating accounts, update profiles table to set roles:

-- Set dispatchers
update public.profiles
set role = 'dispatcher'
where email in ('dom@cncdeliveryservice.com');

-- All other accounts auto-get role = 'driver' via the trigger

-- ============================================================
-- IMPORTANT: Rob and Paul need emails added to the drivers table
-- before they can get Auth accounts:
--
-- update public.drivers set email = 'paul@cncdeliveryservice.com' where driver_name = 'Paul';
-- update public.drivers set email = 'rob@cncdeliveryservice.com' where driver_name = 'Rob';
-- ============================================================
