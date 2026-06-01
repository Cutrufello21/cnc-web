-- Backfill payroll.weekly_pay so the driver app Pay History matches the live
-- dispatcher calc. Stale weekly_pay rows come from edits made after Approve &
-- Send — the old POST handler only updated mon/tue/wed/thu/fri/will_calls,
-- never re-snapshotting weekly_pay. (Patch in api/payroll.js fixes future
-- edits; this script fixes the existing rows.)
--
-- Uses *current* per-driver rates from the drivers table. If any driver's rate
-- changed in the period being backfilled (HISTORY_FLOOR in the driver app is
-- 2026-03-23), those weeks will recompute at the new rate. Run the preview
-- first and eyeball it before applying.

-- ============================================================================
-- STEP 1 — PREVIEW. Shows every row that would change, with old vs new pay.
-- Run this first and inspect. Nothing is written.
-- ============================================================================
WITH computed AS (
  SELECT
    p.id,
    p.driver_name,
    p.week_of,
    p.weekly_pay AS current_pay,
    ROUND((
      CASE
        WHEN COALESCE(d.flat_salary, 0) > 0
             AND ((COALESCE(p.mon,0)+COALESCE(p.tue,0)+COALESCE(p.wed,0)+COALESCE(p.thu,0)+COALESCE(p.fri,0)) > 0
                  OR COALESCE(p.will_calls,0) > 0)
          THEN d.flat_salary
        WHEN COALESCE(d.flat_salary, 0) > 0
          THEN 0
        ELSE
          COALESCE(p.mon,0) * COALESCE(d.rate_mon,0) +
          COALESCE(p.tue,0) * COALESCE(d.rate_tue,0) +
          COALESCE(p.wed,0) * COALESCE(d.rate_wed,0) +
          COALESCE(p.thu,0) * COALESCE(d.rate_thu,0) +
          COALESCE(p.fri,0) * COALESCE(d.rate_fri,0) +
          COALESCE(p.will_calls,0) * COALESCE(d.will_call_rate, 9) +
          CASE
            WHEN (COALESCE(p.mon,0)+COALESCE(p.tue,0)+COALESCE(p.wed,0)+COALESCE(p.thu,0)+COALESCE(p.fri,0)) > 0
                 OR COALESCE(p.will_calls,0) > 0
              THEN COALESCE(d.office_fee, 0)
            ELSE 0
          END
      END
    )::numeric, 2) AS computed_pay
  FROM payroll p
  JOIN drivers d ON d.driver_name = p.driver_name
  WHERE p.week_of >= '2026-03-23'
)
SELECT
  driver_name,
  week_of,
  current_pay,
  computed_pay,
  ROUND((computed_pay - current_pay)::numeric, 2) AS diff
FROM computed
WHERE ABS(computed_pay - COALESCE(current_pay, 0)) > 0.01
ORDER BY week_of DESC, driver_name;

-- ============================================================================
-- STEP 2 — APPLY. Writes the recomputed weekly_pay across every row covered
-- by the preview. Only run this after the preview looks right.
-- ============================================================================
-- WITH computed AS (
--   SELECT
--     p.id,
--     ROUND((
--       CASE
--         WHEN COALESCE(d.flat_salary, 0) > 0
--              AND ((COALESCE(p.mon,0)+COALESCE(p.tue,0)+COALESCE(p.wed,0)+COALESCE(p.thu,0)+COALESCE(p.fri,0)) > 0
--                   OR COALESCE(p.will_calls,0) > 0)
--           THEN d.flat_salary
--         WHEN COALESCE(d.flat_salary, 0) > 0
--           THEN 0
--         ELSE
--           COALESCE(p.mon,0) * COALESCE(d.rate_mon,0) +
--           COALESCE(p.tue,0) * COALESCE(d.rate_tue,0) +
--           COALESCE(p.wed,0) * COALESCE(d.rate_wed,0) +
--           COALESCE(p.thu,0) * COALESCE(d.rate_thu,0) +
--           COALESCE(p.fri,0) * COALESCE(d.rate_fri,0) +
--           COALESCE(p.will_calls,0) * COALESCE(d.will_call_rate, 9) +
--           CASE
--             WHEN (COALESCE(p.mon,0)+COALESCE(p.tue,0)+COALESCE(p.wed,0)+COALESCE(p.thu,0)+COALESCE(p.fri,0)) > 0
--                  OR COALESCE(p.will_calls,0) > 0
--               THEN COALESCE(d.office_fee, 0)
--             ELSE 0
--           END
--       END
--     )::numeric, 2) AS computed_pay
--   FROM payroll p
--   JOIN drivers d ON d.driver_name = p.driver_name
--   WHERE p.week_of >= '2026-03-23'
-- )
-- UPDATE payroll p
-- SET weekly_pay = c.computed_pay
-- FROM computed c
-- WHERE p.id = c.id
--   AND ABS(c.computed_pay - COALESCE(p.weekly_pay, 0)) > 0.01;
