-- Resync payroll table from daily_stops to match what the dispatcher view shows.
-- The previous backfill (2026-06-01-payroll-weekly-pay-backfill.sql) used the
-- stale payroll.mon/tue/wed/thu/fri columns as inputs — those columns aren't
-- the source of truth (the dispatcher view counts daily_stops live each load).
-- This script corrects the day-count columns AND recomputes weekly_pay.

-- ============================================================================
-- STEP 1 — PREVIEW. Shows what every row would become.
-- ============================================================================
WITH day_counts AS (
  SELECT
    p.id AS payroll_id,
    p.driver_name,
    p.week_of,
    p.mon AS old_mon, p.tue AS old_tue, p.wed AS old_wed, p.thu AS old_thu, p.fri AS old_fri,
    p.weekly_pay AS old_pay,
    p.will_calls,
    COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of) AS new_mon,
    COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '1 day') AS new_tue,
    COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '2 day') AS new_wed,
    COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '3 day') AS new_thu,
    COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '4 day') AS new_fri
  FROM payroll p
  LEFT JOIN daily_stops ds
    ON ds.driver_name = p.driver_name
    AND ds.delivery_date >= p.week_of
    AND ds.delivery_date <= p.week_of + INTERVAL '4 day'
    AND ds.status != 'DELETED'
  WHERE p.week_of >= '2026-03-23'
  GROUP BY p.id, p.driver_name, p.week_of, p.mon, p.tue, p.wed, p.thu, p.fri, p.weekly_pay, p.will_calls
),
computed AS (
  SELECT
    dc.*,
    ROUND((
      CASE
        WHEN COALESCE(d.flat_salary, 0) > 0
             AND (dc.new_mon + dc.new_tue + dc.new_wed + dc.new_thu + dc.new_fri > 0 OR COALESCE(dc.will_calls,0) > 0)
          THEN d.flat_salary
        WHEN COALESCE(d.flat_salary, 0) > 0
          THEN 0
        ELSE
          dc.new_mon * COALESCE(d.rate_mon, 0) +
          dc.new_tue * COALESCE(d.rate_tue, 0) +
          dc.new_wed * COALESCE(d.rate_wed, 0) +
          dc.new_thu * COALESCE(d.rate_thu, 0) +
          dc.new_fri * COALESCE(d.rate_fri, 0) +
          COALESCE(dc.will_calls, 0) * COALESCE(d.will_call_rate, 9) +
          CASE
            WHEN dc.new_mon + dc.new_tue + dc.new_wed + dc.new_thu + dc.new_fri > 0 OR COALESCE(dc.will_calls, 0) > 0
              THEN COALESCE(d.office_fee, 0)
            ELSE 0
          END
      END
    )::numeric, 2) AS new_pay
  FROM day_counts dc
  JOIN drivers d ON d.driver_name = dc.driver_name
)
SELECT
  driver_name,
  week_of,
  (old_mon + old_tue + old_wed + old_thu + old_fri) AS old_total,
  (new_mon + new_tue + new_wed + new_thu + new_fri) AS new_total,
  old_pay,
  new_pay,
  ROUND((new_pay - COALESCE(old_pay, 0))::numeric, 2) AS pay_diff
FROM computed
WHERE
  -- Only show rows that would change
  ABS(new_pay - COALESCE(old_pay, 0)) > 0.01
  OR new_mon != COALESCE(old_mon, 0)
  OR new_tue != COALESCE(old_tue, 0)
  OR new_wed != COALESCE(old_wed, 0)
  OR new_thu != COALESCE(old_thu, 0)
  OR new_fri != COALESCE(old_fri, 0)
ORDER BY week_of DESC, driver_name;

-- ============================================================================
-- STEP 2 — APPLY. Updates payroll.mon/tue/wed/thu/fri to actual daily_stops
-- counts AND recomputes weekly_pay. Safe: only updates rows where new_pay > 0
-- so flat-salary-driver historical rows (Brad/Paul) where they no longer have
-- flat_salary set aren't accidentally zeroed.
-- ============================================================================
-- WITH day_counts AS (
--   SELECT
--     p.id AS payroll_id,
--     p.driver_name,
--     p.week_of,
--     p.weekly_pay AS old_pay,
--     p.will_calls,
--     COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of) AS new_mon,
--     COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '1 day') AS new_tue,
--     COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '2 day') AS new_wed,
--     COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '3 day') AS new_thu,
--     COUNT(*) FILTER (WHERE ds.delivery_date = p.week_of + INTERVAL '4 day') AS new_fri
--   FROM payroll p
--   LEFT JOIN daily_stops ds
--     ON ds.driver_name = p.driver_name
--     AND ds.delivery_date >= p.week_of
--     AND ds.delivery_date <= p.week_of + INTERVAL '4 day'
--     AND ds.status != 'DELETED'
--   WHERE p.week_of >= '2026-03-23'
--   GROUP BY p.id, p.driver_name, p.week_of, p.weekly_pay, p.will_calls
-- ),
-- computed AS (
--   SELECT
--     dc.payroll_id AS id,
--     dc.new_mon, dc.new_tue, dc.new_wed, dc.new_thu, dc.new_fri,
--     dc.old_pay,
--     ROUND((
--       CASE
--         WHEN COALESCE(d.flat_salary, 0) > 0
--              AND (dc.new_mon + dc.new_tue + dc.new_wed + dc.new_thu + dc.new_fri > 0 OR COALESCE(dc.will_calls,0) > 0)
--           THEN d.flat_salary
--         WHEN COALESCE(d.flat_salary, 0) > 0
--           THEN 0
--         ELSE
--           dc.new_mon * COALESCE(d.rate_mon, 0) +
--           dc.new_tue * COALESCE(d.rate_tue, 0) +
--           dc.new_wed * COALESCE(d.rate_wed, 0) +
--           dc.new_thu * COALESCE(d.rate_thu, 0) +
--           dc.new_fri * COALESCE(d.rate_fri, 0) +
--           COALESCE(dc.will_calls, 0) * COALESCE(d.will_call_rate, 9) +
--           CASE
--             WHEN dc.new_mon + dc.new_tue + dc.new_wed + dc.new_thu + dc.new_fri > 0 OR COALESCE(dc.will_calls, 0) > 0
--               THEN COALESCE(d.office_fee, 0)
--             ELSE 0
--           END
--       END
--     )::numeric, 2) AS new_pay
--   FROM day_counts dc
--   JOIN drivers d ON d.driver_name = dc.driver_name
-- )
-- UPDATE payroll p
-- SET
--   mon = c.new_mon,
--   tue = c.new_tue,
--   wed = c.new_wed,
--   thu = c.new_thu,
--   fri = c.new_fri,
--   week_total = c.new_mon + c.new_tue + c.new_wed + c.new_thu + c.new_fri,
--   weekly_pay = c.new_pay
-- FROM computed c
-- WHERE p.id = c.id
--   AND c.new_pay > 0;  -- skip rows that would zero out a flat-salary historical row
