-- Backfill payroll.weekly_pay for past weeks so the driver app's Pay History
-- matches what dispatch approved.
--
-- Why: handleApprove (cnc-web) didn't write weekly_pay until the 2026-05-05
-- change. Past weeks have stop counts in payroll but weekly_pay = 0/null,
-- so the driver app fell back to a 2-rate formula (rate_mth/rate_wf) that
-- couldn't represent split per-day rates (Nicholas Wed=$6.50 vs Fri=$8.35).
--
-- This backfill computes weekly_pay from drivers.rate_mon..fri × payroll.mon..fri
-- + will_calls × will_call_rate + office_fee, and uses flat_salary if set.
-- Only fills rows where weekly_pay is currently 0 or NULL — never overwrites
-- a value that was already set.
--
-- Safe to run multiple times.

UPDATE payroll p
SET weekly_pay = ROUND(
  CASE
    WHEN d.flat_salary IS NOT NULL AND d.flat_salary > 0 THEN
      CASE
        WHEN COALESCE(p.mon,0) + COALESCE(p.tue,0) + COALESCE(p.wed,0)
           + COALESCE(p.thu,0) + COALESCE(p.fri,0) > 0
          OR COALESCE(p.will_calls,0) > 0
        THEN d.flat_salary
        ELSE 0
      END
    ELSE
      COALESCE(p.mon,0) * COALESCE(d.rate_mon,0)
      + COALESCE(p.tue,0) * COALESCE(d.rate_tue,0)
      + COALESCE(p.wed,0) * COALESCE(d.rate_wed,0)
      + COALESCE(p.thu,0) * COALESCE(d.rate_thu,0)
      + COALESCE(p.fri,0) * COALESCE(d.rate_fri,0)
      + COALESCE(p.will_calls,0) * COALESCE(d.will_call_rate, 9)
      + CASE
          WHEN COALESCE(p.mon,0) + COALESCE(p.tue,0) + COALESCE(p.wed,0)
             + COALESCE(p.thu,0) + COALESCE(p.fri,0) > 0
          THEN COALESCE(d.office_fee, 0)
          ELSE 0
        END
  END :: numeric,
  2
)
FROM drivers d
WHERE p.driver_name = d.driver_name
  AND (p.weekly_pay IS NULL OR p.weekly_pay = 0);
