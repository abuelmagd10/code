-- v3.60.0 — Phase 4: Proactive Smart Suggestions
-- =====================================================================
-- RPC: ai_get_proactive_alerts(p_language text)
-- Returns up to N proactive alerts the current user is allowed to see.
--
-- Governance (same source of truth as v3.59.1):
--   * SECURITY INVOKER — runs as the caller, full RLS applies.
--   * Each alert has a `resource`. We only return alerts whose resource is
--     in ai_current_user_allowed_resources(). Owner/Admin/GM see all
--     (their allowed-resources list includes every configured resource by
--     virtue of role-based bypass in the higher layer; here we keep the
--     filter strict and let the API layer add the full-access shortcut).
--
-- Safety:
--   * Read-only. No INSERT/UPDATE/DELETE.
--   * Uses indexed columns (status, due_date, company_id).
--   * Returns at most 20 alert rows total to bound work.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ai_get_proactive_alerts(
  p_language text DEFAULT 'ar'
)
RETURNS TABLE (
  alert_key     text,
  alert_type    text,
  severity      text,
  resource      text,
  title         text,
  message       text,
  action_url    text,
  count_value   integer,
  total_amount  numeric,
  metadata      jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
  v_lang    text := CASE WHEN LOWER(COALESCE(p_language, 'ar')) = 'en' THEN 'en' ELSE 'ar' END;
  v_today   date := CURRENT_DATE;
  v_soon    date := CURRENT_DATE + INTERVAL '7 days';
  v_stale   timestamptz := NOW() - INTERVAL '7 days';
BEGIN
  SELECT public.ai_current_user_allowed_resources() INTO v_allowed;

  -- ─── 1. Overdue customer invoices ─────────────────────────────────
  IF 'invoices' = ANY(v_allowed) THEN
    RETURN QUERY
    SELECT
      'overdue_invoices'::text,
      'overdue'::text,
      'critical'::text,
      'invoices'::text,
      CASE v_lang
        WHEN 'en' THEN 'Overdue customer invoices'
        ELSE 'فواتير مبيعات مُتأخّرة'
      END,
      CASE v_lang
        WHEN 'en' THEN
          'You have ' || COUNT(*)::text || ' invoice(s) past their due date — total ' ||
          TO_CHAR(COALESCE(SUM(i.total_amount), 0), 'FM999,999,990.00')
        ELSE
          'لديك ' || COUNT(*)::text || ' فاتورة تجاوزت تاريخ الاستحقاق — الإجمالى ' ||
          TO_CHAR(COALESCE(SUM(i.total_amount), 0), 'FM999,999,990.00')
      END,
      '/invoices'::text,
      COUNT(*)::int,
      COALESCE(SUM(i.total_amount), 0),
      jsonb_build_object('window_days_past_due', GREATEST(0, v_today - MIN(i.due_date)))
    FROM public.invoices i
    WHERE i.status IN ('sent', 'partially_paid')
      AND i.due_date IS NOT NULL
      AND i.due_date < v_today
    HAVING COUNT(*) > 0;
  END IF;

  -- ─── 2. Invoices due soon (next 7 days) ───────────────────────────
  IF 'invoices' = ANY(v_allowed) THEN
    RETURN QUERY
    SELECT
      'due_soon_invoices'::text,
      'due_soon'::text,
      'warning'::text,
      'invoices'::text,
      CASE v_lang
        WHEN 'en' THEN 'Invoices due in the next 7 days'
        ELSE 'فواتير تستحق خلال 7 أيام'
      END,
      CASE v_lang
        WHEN 'en' THEN
          COUNT(*)::text || ' invoice(s) coming due — total ' ||
          TO_CHAR(COALESCE(SUM(i.total_amount), 0), 'FM999,999,990.00')
        ELSE
          COUNT(*)::text || ' فاتورة تقترب من تاريخ الاستحقاق — الإجمالى ' ||
          TO_CHAR(COALESCE(SUM(i.total_amount), 0), 'FM999,999,990.00')
      END,
      '/invoices'::text,
      COUNT(*)::int,
      COALESCE(SUM(i.total_amount), 0),
      jsonb_build_object('window_days', 7)
    FROM public.invoices i
    WHERE i.status IN ('sent', 'partially_paid')
      AND i.due_date IS NOT NULL
      AND i.due_date BETWEEN v_today AND v_soon
    HAVING COUNT(*) > 0;
  END IF;

  -- ─── 3. Overdue supplier bills ────────────────────────────────────
  IF 'bills' = ANY(v_allowed) THEN
    RETURN QUERY
    SELECT
      'overdue_bills'::text,
      'overdue'::text,
      'critical'::text,
      'bills'::text,
      CASE v_lang
        WHEN 'en' THEN 'Overdue supplier bills'
        ELSE 'فواتير موردين مُتأخّرة'
      END,
      CASE v_lang
        WHEN 'en' THEN
          COUNT(*)::text || ' bill(s) past their due date — total ' ||
          TO_CHAR(COALESCE(SUM(b.total_amount), 0), 'FM999,999,990.00')
        ELSE
          COUNT(*)::text || ' فاتورة شراء تجاوزت تاريخ الاستحقاق — الإجمالى ' ||
          TO_CHAR(COALESCE(SUM(b.total_amount), 0), 'FM999,999,990.00')
      END,
      '/bills'::text,
      COUNT(*)::int,
      COALESCE(SUM(b.total_amount), 0),
      jsonb_build_object('window_days_past_due', GREATEST(0, v_today - MIN(b.due_date)))
    FROM public.bills b
    WHERE b.status IN ('sent', 'partially_paid')
      AND b.due_date IS NOT NULL
      AND b.due_date < v_today
    HAVING COUNT(*) > 0;
  END IF;

  -- ─── 4. Stale draft sales orders (>7 days idle) ───────────────────
  IF 'sales_orders' = ANY(v_allowed) THEN
    RETURN QUERY
    SELECT
      'stale_draft_sales_orders'::text,
      'stale'::text,
      'info'::text,
      'sales_orders'::text,
      CASE v_lang
        WHEN 'en' THEN 'Old draft sales orders'
        ELSE 'أوامر بيع قديمة فى المُسودَّة'
      END,
      CASE v_lang
        WHEN 'en' THEN
          COUNT(*)::text || ' draft sales order(s) older than 7 days — review or remove'
        ELSE
          COUNT(*)::text || ' أمر بيع فى المُسودَّة لأكثر من 7 أيام — راجِعها أو احذِفها'
      END,
      '/sales-orders'::text,
      COUNT(*)::int,
      COALESCE(SUM(s.total), 0),
      jsonb_build_object('idle_days', 7)
    FROM public.sales_orders s
    WHERE LOWER(COALESCE(s.status, '')) = 'draft'
      AND s.created_at IS NOT NULL
      AND s.created_at < v_stale
    HAVING COUNT(*) > 0;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ai_get_proactive_alerts(text) IS
  'v3.60.0 Phase 4 - proactive smart suggestions. SECURITY INVOKER; respects RLS and ai_current_user_allowed_resources() as the single source of truth.';

GRANT EXECUTE ON FUNCTION public.ai_get_proactive_alerts(text) TO authenticated;
