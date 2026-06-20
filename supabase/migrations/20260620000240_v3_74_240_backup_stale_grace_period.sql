-- v3.74.240 — ic_backup_stale silences the "no backup ever" warning for
-- brand-new companies. New customers who just signed up and opened their
-- dashboard for the first time were being greeted with a high-severity
-- "Data at risk" alert because the daily backup cron had not run yet —
-- making the product look broken on first impression.
--
-- The check now distinguishes:
--   * Company age < 48 h, no backup yet  → silent (grace period — cron
--     hasn't run yet)
--   * Company age >= 48 h, no backup yet → high severity (cron really is
--     failing for this company)
--   * Backup exists but older than 7 d   → medium (unchanged)
--   * Backup exists but older than 30 d  → high (unchanged)
--
-- The grace window matches the cron schedule: backup-daily runs every 24 h
-- so 48 h is enough headroom for one missed-then-recovered run.
CREATE OR REPLACE FUNCTION public.ic_backup_stale(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_last_success timestamptz;
  v_company_created timestamptz;
BEGIN
  SELECT MAX(created_at) INTO v_last_success
  FROM backup_history
  WHERE company_id = p_company_id
    AND status IN ('success','completed','succeeded');

  -- v3.74.240 — fetch the company creation timestamp so brand-new tenants
  -- aren't flagged before the first daily cron has had a chance to run.
  SELECT created_at INTO v_company_created
  FROM companies
  WHERE id = p_company_id;

  IF v_last_success IS NULL THEN
    -- Grace period: skip the warning entirely for companies <48h old.
    IF v_company_created IS NOT NULL
       AND v_company_created > NOW() - INTERVAL '48 hours' THEN
      RETURN;
    END IF;

    severity := 'high';
    detail := jsonb_build_object(
      'last_success', NULL,
      'hint','No successful backup ever recorded for this company. Data at risk.'
    );
    RETURN NEXT;
  ELSIF v_last_success < NOW() - INTERVAL '7 days' THEN
    severity := CASE WHEN v_last_success < NOW() - INTERVAL '30 days' THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object(
      'last_success', v_last_success,
      'days_ago', EXTRACT(DAY FROM (NOW() - v_last_success)),
      'hint','Last successful backup is older than 7 days. Cron may be failing silently.'
    );
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;
