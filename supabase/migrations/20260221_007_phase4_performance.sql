-- ════════════════════════════════════════════════════════════════════
-- PHASE 4: الأداء وقابلية التوسع - Performance & Scalability
-- ════════════════════════════════════════════════════════════════════
-- التاريخ: 2026-02-21
-- المرحلة: 4 من 4

-- ────────────────────────────────────────────────────────────────────
-- 1. فهارس أداء إضافية للجداول الكبيرة
--    تُسرّع الاستعلامات الأكثر تكراراً في نظام ERP
-- ────────────────────────────────────────────────────────────────────

-- GL Queries: الاستعلام الأساسي لدفتر الأستاذ العام
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_je_gl_core
  ON public.journal_entries (company_id, status, entry_date DESC)
  WHERE status = 'posted'
    AND (is_deleted IS NULL OR is_deleted = FALSE)
    AND deleted_at IS NULL;

-- GL Lines: ربط السطور بالحسابات مع الفترة
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jel_account_entry
  ON public.journal_entry_lines (account_id, journal_entry_id)
  INCLUDE (debit_amount, credit_amount, description);

-- Dashboard: إحصائيات الفواتير الشهرية
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_dashboard
  ON public.invoices (company_id, invoice_date DESC, status)
  INCLUDE (total_amount, paid_amount, tax_amount)
  WHERE status IN ('sent', 'partially_paid', 'paid')
    AND (is_deleted IS NULL OR is_deleted = FALSE);

-- Dashboard: إحصائيات المشتريات
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bills_dashboard
  ON public.bills (company_id, bill_date DESC, status)
  INCLUDE (total_amount, paid_amount)
  WHERE status NOT IN ('draft', 'cancelled');

-- Payroll: جلب دفعات الرواتب بسرعة
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_runs_period
  ON public.payroll_runs (company_id, period_year, period_month, status);

-- Payments: ربط المدفوعات بالفواتير
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_invoice_company
  ON public.payments (company_id, invoice_id, payment_date DESC)
  WHERE (is_deleted IS NULL OR is_deleted = FALSE);

-- FIFO: كلفة المخزون حسب المنتج
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fifo_lots_product_active
  ON public.fifo_cost_lots (company_id, product_id, remaining_quantity DESC)
  WHERE remaining_quantity > 0;

-- Audit Logs: بحث سريع حسب الجدول والإجراء
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_perf
  ON public.audit_logs (company_id, target_table, action, created_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- 2. RPC: get_gl_account_summary
--    تجميع GL على مستوى الحسابات في DB (بدلاً من الذاكرة)
--    يُستخدم لميزان المراجعة والتقارير السريعة
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_gl_account_summary(
  p_company_id  UUID,
  p_from_date   DATE DEFAULT '0001-01-01',
  p_to_date     DATE DEFAULT '9999-12-31',
  p_account_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  account_id       UUID,
  account_code     TEXT,
  account_name     TEXT,
  account_type     TEXT,
  sub_type         TEXT,
  opening_balance  NUMERIC(15,2),
  total_debit      NUMERIC(15,2),
  total_credit     NUMERIC(15,2),
  closing_balance  NUMERIC(15,2),
  transaction_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH period_movements AS (
    SELECT
      jel.account_id,
      ROUND(SUM(jel.debit_amount)::NUMERIC,  2) AS period_debit,
      ROUND(SUM(jel.credit_amount)::NUMERIC, 2) AS period_credit,
      COUNT(*) AS txn_count
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date BETWEEN p_from_date AND p_to_date
      AND (p_account_id IS NULL OR jel.account_id = p_account_id)
    GROUP BY jel.account_id
  ),
  pre_period_movements AS (
    SELECT
      jel.account_id,
      ROUND(SUM(jel.debit_amount - jel.credit_amount)::NUMERIC, 2) AS pre_net
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date < p_from_date
      AND (p_account_id IS NULL OR jel.account_id = p_account_id)
    GROUP BY jel.account_id
  )
  SELECT
    coa.id                                                               AS account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.sub_type,
    ROUND((COALESCE(coa.opening_balance, 0) + COALESCE(pp.pre_net, 0))::NUMERIC, 2) AS opening_balance,
    COALESCE(pm.period_debit,  0)                                        AS total_debit,
    COALESCE(pm.period_credit, 0)                                        AS total_credit,
    ROUND((
      COALESCE(coa.opening_balance, 0)
      + COALESCE(pp.pre_net, 0)
      + COALESCE(pm.period_debit,  0)
      - COALESCE(pm.period_credit, 0)
    )::NUMERIC, 2)                                                       AS closing_balance,
    COALESCE(pm.txn_count, 0)                                           AS transaction_count
  FROM public.chart_of_accounts coa
  LEFT JOIN period_movements    pm ON pm.account_id = coa.id
  LEFT JOIN pre_period_movements pp ON pp.account_id = coa.id
  WHERE coa.company_id = p_company_id
    AND coa.is_active = TRUE
    AND (p_account_id IS NULL OR coa.id = p_account_id)
    AND (
      COALESCE(pm.txn_count, 0) > 0
      OR ABS(COALESCE(coa.opening_balance, 0) + COALESCE(pp.pre_net, 0)) >= 0.01
    )
  ORDER BY coa.account_code;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. RPC: get_gl_transactions_paginated
--    Pagination حقيقي لسطور دفتر الأستاذ العام في DB
--    يُجنّب تحميل ملايين السطور في الذاكرة
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_gl_transactions_paginated(
  p_company_id  UUID,
  p_account_id  UUID,
  p_from_date   DATE DEFAULT '0001-01-01',
  p_to_date     DATE DEFAULT '9999-12-31',
  p_page        INT DEFAULT 1,
  p_page_size   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_offset         INT;
  v_total_count    BIGINT;
  v_opening_bal    NUMERIC(15,2) := 0;
  v_transactions   JSONB;
  v_account_info   JSONB;
BEGIN
  -- التحقق من الصفحة وحجمها
  p_page      := GREATEST(1, p_page);
  p_page_size := LEAST(200, GREATEST(10, p_page_size)); -- الحد الأقصى 200 سطر
  v_offset    := (p_page - 1) * p_page_size;

  -- معلومات الحساب
  SELECT jsonb_build_object(
    'id',           coa.id,
    'code',         coa.account_code,
    'name',         coa.account_name,
    'type',         coa.account_type,
    'sub_type',     coa.sub_type,
    'opening_base', COALESCE(coa.opening_balance, 0)
  ) INTO v_account_info
  FROM public.chart_of_accounts coa
  WHERE coa.id = p_account_id AND coa.company_id = p_company_id;

  IF v_account_info IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: الحساب % غير موجود', p_account_id;
  END IF;

  -- الرصيد الافتتاحي: opening_balance + حركات ما قبل الفترة
  SELECT ROUND((
    COALESCE((v_account_info->>'opening_base')::NUMERIC, 0) +
    COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  )::NUMERIC, 2) INTO v_opening_bal
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id = p_account_id
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
    AND je.deleted_at IS NULL
    AND je.entry_date < p_from_date;

  -- إجمالي عدد السطور في الفترة
  SELECT COUNT(*) INTO v_total_count
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id = p_account_id
    AND je.company_id = p_company_id
    AND je.status = 'posted'
    AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
    AND je.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from_date AND p_to_date;

  -- جلب السطور مع الرصيد الجاري محسوباً في DB
  SELECT jsonb_agg(t ORDER BY t->>'date', t->>'entry_number') INTO v_transactions
  FROM (
    SELECT jsonb_build_object(
      'line_id',       jel.id,
      'date',          je.entry_date,
      'entry_number',  je.entry_number,
      'description',   COALESCE(jel.description, je.description, ''),
      'reference_type', je.reference_type,
      'reference_id',  je.reference_id,
      'debit',         ROUND(COALESCE(jel.debit_amount, 0)::NUMERIC, 2),
      'credit',        ROUND(COALESCE(jel.credit_amount, 0)::NUMERIC, 2),
      'running_balance', ROUND((
        v_opening_bal +
        SUM(jel2.debit_amount - jel2.credit_amount) OVER (
          ORDER BY je2.entry_date, je2.entry_number, jel2.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
      )::NUMERIC, 2)
    ) AS t
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    -- Self-join for running balance window
    JOIN public.journal_entry_lines jel2 ON jel2.account_id = p_account_id
    JOIN public.journal_entries je2 ON je2.id = jel2.journal_entry_id
      AND je2.company_id = p_company_id
      AND je2.status = 'posted'
      AND (je2.is_deleted IS NULL OR je2.is_deleted = FALSE)
      AND je2.deleted_at IS NULL
      AND je2.entry_date BETWEEN p_from_date AND p_to_date
    WHERE jel.account_id = p_account_id
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date BETWEEN p_from_date AND p_to_date
      AND jel.id = jel2.id  -- اشتراط تطابق السطر
    ORDER BY je.entry_date, je.entry_number, jel.id
    LIMIT p_page_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'account',          v_account_info,
    'opening_balance',  v_opening_bal,
    'transactions',     COALESCE(v_transactions, '[]'::JSONB),
    'pagination', jsonb_build_object(
      'page',       p_page,
      'page_size',  p_page_size,
      'total',      v_total_count,
      'pages',      CEIL(v_total_count::NUMERIC / p_page_size),
      'has_next',   v_offset + p_page_size < v_total_count,
      'has_prev',   p_page > 1
    ),
    'period', jsonb_build_object(
      'from', p_from_date,
      'to',   p_to_date
    )
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 4. RPC: get_trial_balance
--    ميزان المراجعة كاملاً في استعلام DB واحد
--    بدلاً من جلب كل السطور وتجميعها في الذاكرة
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_company_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  account_code    TEXT,
  account_name    TEXT,
  account_type    TEXT,
  debit_balance   NUMERIC(15,2),
  credit_balance  NUMERIC(15,2)
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH account_balances AS (
    SELECT
      coa.id,
      coa.account_code,
      coa.account_name,
      coa.account_type,
      ROUND((
        COALESCE(coa.opening_balance, 0) +
        COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
      )::NUMERIC, 2) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date <= p_as_of_date
    WHERE coa.company_id = p_company_id
      AND coa.is_active = TRUE
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.opening_balance
    HAVING ABS(COALESCE(coa.opening_balance, 0) + COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) >= 0.01
  )
  SELECT
    account_code,
    account_name,
    account_type,
    CASE WHEN net_balance > 0 THEN ROUND(net_balance, 2) ELSE 0 END AS debit_balance,
    CASE WHEN net_balance < 0 THEN ROUND(ABS(net_balance), 2) ELSE 0 END AS credit_balance
  FROM account_balances
  ORDER BY account_code;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 5. RPC: get_dashboard_kpis
--    جلب KPIs الداشبورد الأساسية في استعلام DB واحد
--    يحل محل 6 استعلامات منفصلة في dashboard-stats API
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_company_id UUID,
  p_from_date  DATE,
  p_to_date    DATE
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  invoice_stats AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN status IN ('paid','partially_paid') THEN paid_amount ELSE 0 END), 0)::NUMERIC, 2) AS paid_amount,
      ROUND(COALESCE(SUM(CASE WHEN status IN ('sent','partially_paid') THEN total_amount - paid_amount ELSE 0 END), 0)::NUMERIC, 2) AS receivables,
      COUNT(*) FILTER (WHERE status NOT IN ('draft','cancelled')) AS invoice_count
    FROM public.invoices
    WHERE company_id = p_company_id
      AND invoice_date BETWEEN p_from_date AND p_to_date
      AND (is_deleted IS NULL OR is_deleted = FALSE)
  ),
  bill_stats AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN status NOT IN ('draft','cancelled') THEN total_amount ELSE 0 END), 0)::NUMERIC, 2) AS total_purchases,
      ROUND(COALESCE(SUM(CASE WHEN status IN ('received','partially_paid') THEN total_amount - paid_amount ELSE 0 END), 0)::NUMERIC, 2) AS payables,
      COUNT(*) FILTER (WHERE status NOT IN ('draft','cancelled')) AS bill_count
    FROM public.bills
    WHERE company_id = p_company_id
      AND bill_date BETWEEN p_from_date AND p_to_date
  ),
  gl_stats AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN coa.account_type IN ('income','revenue') THEN jel.credit_amount - jel.debit_amount ELSE 0 END), 0)::NUMERIC, 2) AS gl_revenue,
      ROUND(COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END), 0)::NUMERIC, 2) AS gl_expenses
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date BETWEEN p_from_date AND p_to_date
  )
  SELECT jsonb_build_object(
    'revenue',        i.paid_amount,
    'receivables',    i.receivables,
    'invoice_count',  i.invoice_count,
    'purchases',      b.total_purchases,
    'payables',       b.payables,
    'bill_count',     b.bill_count,
    'gl_revenue',     g.gl_revenue,
    'gl_expenses',    g.gl_expenses,
    'gl_net_profit',  g.gl_revenue - g.gl_expenses,
    'from_date',      p_from_date,
    'to_date',        p_to_date
  )
  FROM invoice_stats i, bill_stats b, gl_stats g;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6. Materialized View للتقارير السريعة (Monthly GL Summary)
--    يُخزّن تلخيص شهري للقيود لتسريع تقارير P&L
-- ────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_gl_monthly_summary AS
SELECT
  je.company_id,
  DATE_TRUNC('month', je.entry_date)::DATE  AS month_start,
  coa.account_type,
  coa.sub_type,
  coa.account_code,
  coa.account_name,
  ROUND(SUM(jel.debit_amount)::NUMERIC, 2)  AS total_debit,
  ROUND(SUM(jel.credit_amount)::NUMERIC, 2) AS total_credit,
  COUNT(*)                                   AS line_count
FROM public.journal_entry_lines jel
JOIN public.journal_entries je ON je.id = jel.journal_entry_id
JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.status = 'posted'
  AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
  AND je.deleted_at IS NULL
GROUP BY je.company_id, DATE_TRUNC('month', je.entry_date), coa.account_type, coa.sub_type, coa.account_code, coa.account_name
WITH DATA;

-- فهرس على الـ Materialized View
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_gl_monthly_summary
  ON public.mv_gl_monthly_summary (company_id, month_start, account_code);

CREATE INDEX IF NOT EXISTS idx_mv_gl_monthly_type
  ON public.mv_gl_monthly_summary (company_id, account_type, month_start DESC);

-- ────────────────────────────────────────────────────────────────────
-- 7. دالة تحديث الـ Materialized View (تُستدعى بعد ترحيل القيود)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_gl_monthly_summary()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_gl_monthly_summary;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 8. التحقق من التثبيت
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_gl_account_summary'
  ), 'get_gl_account_summary missing!';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_gl_transactions_paginated'
  ), 'get_gl_transactions_paginated missing!';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_trial_balance'
  ), 'get_trial_balance missing!';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_kpis'
  ), 'get_dashboard_kpis missing!';

  RAISE NOTICE '✅ Phase 4 DB objects installed successfully!';
END;
$$;
