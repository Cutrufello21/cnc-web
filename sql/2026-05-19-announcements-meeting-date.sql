-- Adds a dedicated meeting day to announcements so meeting/sign-up items can
-- render on the driver calendar independently of expires_at (which controls
-- when an item leaves the feed). For sign-ups, each driver's picked slot
-- (poll_responses.response) is shown as the time on this date.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS meeting_date DATE;
