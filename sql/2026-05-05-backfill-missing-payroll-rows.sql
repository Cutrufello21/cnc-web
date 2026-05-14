-- Backfill missing payroll rows from daily_stops aggregation, then update
-- weekly_pay using each driver's per-day rates.
--
-- Why: dispatch only auto-inserts a payroll row when that exact week is loaded
-- in the Payroll UI. Some weeks (e.g. Nicholas Apr 6–10) have daily_stops
-- activity but never had a payroll row created, so the driver app's Pay
-- History silently skips them. Dispatch itself shows the right number because
-- it derives day stops from daily_stops live, not from the payroll row.
--
-- This script:
--   1. For each (driver, work-week-Monday) with daily_stops activity since
--      2026-03-23 and no payroll row, INSERT a row with mon/tue/wed/thu/fri
--      counts and weekly_pay computed from rate_mon..fri (or flat_salary).
--   2. For existing rows where mon..fri are all zero but daily_stops has
--      activity, UPDATE the day counts and recompute weekly_pay.
--
-- Counts ALL non-DELETED daily_stops rows (matching dispatch's actualStops
-- aggregation in usePayrollData.js), not just status='delivered' — drivers
-- get paid for assigned packages.
--
-- Safe to run multiple times.

-- Step 1: aggregate daily_stops into a per (driver, week) day-count CTE
WITH stop_counts AS (
  SELECT
    driver_name,
    -- Monday of the week the delivery_date falls in (ISO week: Mon=1..Sun=7)
    (delivery_date - ((EXTRACT(ISODOW FROM delivery_date)::int - 1) || ' days')::interval)::date AS week_of,
    EXTRACT(ISODOW FROM delivery_date)::int AS dow
  FROM daily_stops
  WHERE status IS DISTINCT FROM 'DELETED'
    AND delivery_date >= DATE '2026-03-23'
    AND delivery_date < DATE_TRUNC('week', CURRENT_DATE)::date
    AND driver_name IS NOT NULL
),
weekly_counts AS (
  SELECT
    driver_name,
    week_of,
    SUM(CASE WHEN dow = 1 THEN 1 ELSE 0 END)::int AS mon,
    SUM(CASE WHEN dow = 2 THEN 1 ELSE 0 END)::int AS tue,
    SUM(CASE WHEN dow = 3 THEN 1 ELSE 0 END)::int AS wed,
    SUM(CASE WHEN dow = 4 THEN 1 ELSE 0 END)::int AS thu,
    SUM(CASE WHEN dow = 5 THEN 1 ELSE 0 END)::int AS fri
  FROM stop_counts
  GROUP BY driver_name, week_of
)

-- Step 2a: INSERT missing payroll rows
-- Note: payroll table doesn't have tenant_id yet — re-add the column once the
-- phase-0 tenant migration reaches this table.
INSERT INTO payroll (week_of, driver_name, mon, tue, wed, thu, fri, weekly_pay)
SELECT
  wc.week_of,
  wc.driver_name,
  wc.mon, wc.tue, wc.wed, wc.thu, wc.fri,
  ROUND(
    CASE
      WHEN d.flat_salary IS NOT NULL AND d.flat_salary > 0 THEN d.flat_salary
      ELSE
        wc.mon * COALESCE(d.rate_mon, 0)
        + wc.tue * COALESCE(d.rate_tue, 0)
        + wc.wed * COALESCE(d.rate_wed, 0)
        + wc.thu * COALESCE(d.rate_thu, 0)
        + wc.fri * COALESCE(d.rate_fri, 0)
        + CASE WHEN wc.mon + wc.tue + wc.wed + wc.thu + wc.fri > 0
               THEN COALESCE(d.office_fee, 0) ELSE 0 END
    END :: numeric,
    2
  ) AS weekly_pay
FROM weekly_counts wc
JOIN drivers d ON d.driver_name = wc.driver_name
WHERE wc.mon + wc.tue + wc.wed + wc.thu + wc.fri > 0
  AND NOT EXISTS (
    SELECT 1 FROM payroll p
    WHERE p.driver_name = wc.driver_name
      AND p.week_of = wc.week_of
  );

-- Step 2b: UPDATE rows that exist but have zero day counts
WITH stop_counts AS (
  SELECT
    driver_name,
    (delivery_date - ((EXTRACT(ISODOW FROM delivery_date)::int - 1) || ' days')::interval)::date AS week_of,
    EXTRACT(ISODOW FROM delivery_date)::int AS dow
  FROM daily_stops
  WHERE status IS DISTINCT FROM 'DELETED'
    AND delivery_date >= DATE '2026-03-23'
    AND delivery_date < DATE_TRUNC('week', CURRENT_DATE)::date
    AND driver_name IS NOT NULL
),
weekly_counts AS (
  SELECT
    driver_name,
    week_of,
    SUM(CASE WHEN dow = 1 THEN 1 ELSE 0 END)::int AS mon,
    SUM(CASE WHEN dow = 2 THEN 1 ELSE 0 END)::int AS tue,
    SUM(CASE WHEN dow = 3 THEN 1 ELSE 0 END)::int AS wed,
    SUM(CASE WHEN dow = 4 THEN 1 ELSE 0 END)::int AS thu,
    SUM(CASE WHEN dow = 5 THEN 1 ELSE 0 END)::int AS fri
  FROM stop_counts
  GROUP BY driver_name, week_of
)
UPDATE payroll p
SET
  mon = wc.mon,
  tue = wc.tue,
  wed = wc.wed,
  thu = wc.thu,
  fri = wc.fri,
  weekly_pay = ROUND(
    CASE
      WHEN d.flat_salary IS NOT NULL AND d.flat_salary > 0 THEN d.flat_salary
      ELSE
        wc.mon * COALESCE(d.rate_mon, 0)
        + wc.tue * COALESCE(d.rate_tue, 0)
        + wc.wed * COALESCE(d.rate_wed, 0)
        + wc.thu * COALESCE(d.rate_thu, 0)
        + wc.fri * COALESCE(d.rate_fri, 0)
        + COALESCE(p.will_calls, 0) * COALESCE(d.will_call_rate, 9)
        + COALESCE(d.office_fee, 0)
    END :: numeric,
    2
  )
FROM weekly_counts wc
JOIN drivers d ON d.driver_name = wc.driver_name
WHERE p.driver_name = wc.driver_name
  AND p.week_of = wc.week_of
  AND COALESCE(p.mon,0) + COALESCE(p.tue,0) + COALESCE(p.wed,0)
    + COALESCE(p.thu,0) + COALESCE(p.fri,0) = 0
  AND wc.mon + wc.tue + wc.wed + wc.thu + wc.fri > 0;
