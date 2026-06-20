-- v3.74.242 — require_open_financial_period_db auto-creates a missing
-- accounting period instead of blocking the user, when the requested date
-- is within a sane backward window.
--
-- Why: new tenants typically sign up in the middle of a fiscal year and
-- want to enter back-dated opening balances (capital contributions,
-- initial inventory, opening AR/AP) for months that pre-date their
-- registration. The existing flow created only 12 forward months at
-- seed time, so any back-dated date failed with NO_ACTIVE_FINANCIAL_PERIOD
-- and the customer's first real action with the product looked broken.
--
-- Rule:
--   * If no period covers p_effective_date AND p_effective_date is within
--     the last 24 months from today, silently create the missing period
--     via seed_accounting_periods_for_company (which is idempotent), then
--     re-query. The 24-month window stops typos like '2014' from breeding
--     200 phantom periods.
--   * If still no period after auto-seed → raise the original
--     NO_ACTIVE_FINANCIAL_PERIOD.
--   * Lock/close enforcement is unchanged.
CREATE OR REPLACE FUNCTION public.require_open_financial_period_db(p_company_id uuid, p_effective_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_period RECORD;
BEGIN
  SELECT
    id,
    period_name,
    status,
    is_locked
  INTO v_period
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND p_effective_date BETWEEN period_start AND period_end
  ORDER BY period_start DESC
  LIMIT 1;

  -- v3.74.242 — auto-seed for back-dated entries within 24 months.
  IF NOT FOUND THEN
    IF p_effective_date >= (CURRENT_DATE - INTERVAL '24 months')::date
       AND p_effective_date <= (CURRENT_DATE + INTERVAL '12 months')::date THEN
      PERFORM public.seed_accounting_periods_for_company(
        p_company_id,
        date_trunc('month', p_effective_date)::date,
        1
      );
      SELECT
        id,
        period_name,
        status,
        is_locked
      INTO v_period
      FROM public.accounting_periods
      WHERE company_id = p_company_id
        AND p_effective_date BETWEEN period_start AND period_end
      ORDER BY period_start DESC
      LIMIT 1;
    END IF;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_ACTIVE_FINANCIAL_PERIOD: No accounting period covers date % for company %',
      p_effective_date, p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_period.is_locked, FALSE) OR COALESCE(v_period.status, 'open') IN ('closed', 'locked', 'audit_lock') THEN
    RAISE EXCEPTION
      'FINANCIAL_PERIOD_LOCKED: Period [%] is [%] for date %',
      COALESCE(v_period.period_name, v_period.id::TEXT),
      COALESCE(v_period.status, CASE WHEN v_period.is_locked THEN 'locked' ELSE 'open' END),
      p_effective_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_period.id;
END;
$function$;
