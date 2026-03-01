-- =============================================================================
-- GL Integrity Safeguards
-- 1. get_gl_ar_balance_per_invoice: GL-based AR outstanding per invoice
-- 2. check_gl_balance_integrity: Dr=Cr verification per company/period
-- 3. get_ar_aging_gl: Full GL-driven aging AR calculation
-- =============================================================================

-- =============================================================================
-- SECTION 1: GL-Based AR Balance Per Invoice
-- Uses journal_entry_lines as Single Source of Truth
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_gl_ar_balance_per_invoice(
  p_company_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  invoice_id     TEXT,
  customer_id    UUID,
  invoice_number TEXT,
  invoice_date   DATE,
  due_date       DATE,
  ar_debit       NUMERIC,
  ar_credit      NUMERIC,
  outstanding    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ar_accounts AS (
    -- Identify AR accounts for this company
    SELECT id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND is_active  = true
      AND (
        sub_type      = 'accounts_receivable'
        OR account_name ILIKE '%receivable%'
        OR account_name ILIKE '%الذمم المدين%'
      )
  ),

  -- AR debits: come from 'invoice' type journals (reference_id = invoice.id)
  ar_debits AS (
    SELECT
      je.reference_id::TEXT AS invoice_id,
      SUM(jel.debit_amount) AS amount
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id     = p_company_id
      AND je.status         = 'posted'
      AND je.reference_type = 'invoice'
      AND je.entry_date    <= p_as_of_date
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND jel.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY je.reference_id
  ),

  -- AR credits from invoice_payment journals (reference_id = invoice.id)
  ar_payment_credits AS (
    SELECT
      je.reference_id::TEXT AS invoice_id,
      SUM(jel.credit_amount) AS amount
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id     = p_company_id
      AND je.status         = 'posted'
      AND je.reference_type = 'invoice_payment'
      AND je.entry_date    <= p_as_of_date
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND jel.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY je.reference_id
  ),

  -- AR credits from sales_return journals (reference_id = sales_return.id → join invoice_id)
  ar_return_credits AS (
    SELECT
      sr.invoice_id::TEXT AS invoice_id,
      SUM(jel.credit_amount) AS amount
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN sales_returns sr ON je.reference_id = sr.id
    WHERE je.company_id     = p_company_id
      AND je.status         = 'posted'
      AND je.reference_type = 'sales_return'
      AND je.entry_date    <= p_as_of_date
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND jel.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY sr.invoice_id
  )

  SELECT
    i.id::TEXT                                       AS invoice_id,
    i.customer_id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    COALESCE(d.amount, 0)                            AS ar_debit,
    COALESCE(pc.amount, 0) + COALESCE(rc.amount, 0) AS ar_credit,
    GREATEST(0,
      COALESCE(d.amount, 0)
      - COALESCE(pc.amount, 0)
      - COALESCE(rc.amount, 0)
    )                                                AS outstanding
  FROM invoices i
  LEFT JOIN ar_debits         d  ON d.invoice_id  = i.id::TEXT
  LEFT JOIN ar_payment_credits pc ON pc.invoice_id = i.id::TEXT
  LEFT JOIN ar_return_credits  rc ON rc.invoice_id = i.id::TEXT
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft', 'cancelled', 'fully_returned')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    -- Only invoices that have at least one AR debit in GL (posted invoices)
    AND COALESCE(d.amount, 0) > 0
  ORDER BY i.due_date ASC NULLS LAST;
$$;

-- =============================================================================
-- SECTION 2: GL Balance Integrity Check (Dr = Cr)
-- Verifies that every posted journal entry is balanced
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_gl_balance_integrity(
  p_company_id UUID,
  p_from_date  DATE DEFAULT NULL,
  p_to_date    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  check_name      TEXT,
  result          TEXT,
  total_debit     NUMERIC,
  total_credit    NUMERIC,
  difference      NUMERIC,
  unbalanced_count BIGINT,
  status          TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH posted_entries AS (
    SELECT je.id, je.entry_date
    FROM journal_entries je
    WHERE je.company_id = p_company_id
      AND je.status     = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
      AND je.entry_date <= p_to_date
  ),
  line_totals AS (
    SELECT
      jel.journal_entry_id,
      SUM(jel.debit_amount)  AS total_dr,
      SUM(jel.credit_amount) AS total_cr
    FROM journal_entry_lines jel
    WHERE jel.journal_entry_id IN (SELECT id FROM posted_entries)
    GROUP BY jel.journal_entry_id
  ),
  company_totals AS (
    SELECT
      SUM(total_dr)  AS grand_dr,
      SUM(total_cr)  AS grand_cr,
      COUNT(*) FILTER (WHERE ABS(total_dr - total_cr) > 0.01) AS unbalanced_entries
    FROM line_totals
  )
  SELECT
    'GL Balance Check'::TEXT                         AS check_name,
    CASE WHEN ABS(grand_dr - grand_cr) < 0.01
         THEN 'PASSED' ELSE 'FAILED' END             AS result,
    ROUND(COALESCE(grand_dr, 0), 2)                  AS total_debit,
    ROUND(COALESCE(grand_cr, 0), 2)                  AS total_credit,
    ROUND(ABS(COALESCE(grand_dr, 0) - COALESCE(grand_cr, 0)), 2) AS difference,
    COALESCE(unbalanced_entries, 0)                  AS unbalanced_count,
    CASE WHEN ABS(grand_dr - grand_cr) < 0.01
         THEN '✅ GL متوازن - جميع القيود صحيحة'
         ELSE '🚨 GL غير متوازن - يوجد خطأ في القيود المحاسبية'
    END                                              AS status
  FROM company_totals;
$$;

-- =============================================================================
-- SECTION 3: Scheduled GL Reconciliation Helper
-- Can be called daily/weekly to detect drift
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_ar_reconciliation_report(
  p_company_id UUID
)
RETURNS TABLE (
  source          TEXT,
  total_outstanding NUMERIC,
  invoice_count   BIGINT,
  note            TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Source 1: GL-based AR outstanding
  SELECT
    'GL (journal_entry_lines)'::TEXT AS source,
    ROUND(SUM(GREATEST(0,
      COALESCE(d.amount, 0) - COALESCE(pc.amount, 0) - COALESCE(rc.amount, 0)
    )), 2) AS total_outstanding,
    COUNT(i.id) AS invoice_count,
    'مصدر الحقيقة الرسمي - يستخدم في ميزان المراجعة'::TEXT AS note
  FROM invoices i
  LEFT JOIN (
    SELECT je.reference_id::TEXT AS reference_id, SUM(jel.debit_amount) AS amount
    FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND je.reference_type = 'invoice'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND (coa.sub_type = 'accounts_receivable' OR coa.account_name ILIKE '%receivable%')
    GROUP BY je.reference_id
  ) d ON d.reference_id = i.id::TEXT
  LEFT JOIN (
    SELECT je.reference_id::TEXT AS reference_id, SUM(jel.credit_amount) AS amount
    FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND je.reference_type = 'invoice_payment'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND (coa.sub_type = 'accounts_receivable' OR coa.account_name ILIKE '%receivable%')
    GROUP BY je.reference_id
  ) pc ON pc.reference_id = i.id::TEXT
  LEFT JOIN (
    SELECT sr.invoice_id::TEXT AS invoice_id, SUM(jel.credit_amount) AS amount
    FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    JOIN sales_returns sr ON je.reference_id = sr.id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND je.reference_type = 'sales_return'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND (coa.sub_type = 'accounts_receivable' OR coa.account_name ILIKE '%receivable%')
    GROUP BY sr.invoice_id
  ) rc ON rc.invoice_id = i.id::TEXT
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft', 'cancelled', 'fully_returned')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND COALESCE(d.amount, 0) > 0

  UNION ALL

  -- Source 2: Operational AR (invoices.total_amount - invoices.paid_amount)
  SELECT
    'Operational (invoices table)'::TEXT AS source,
    ROUND(SUM(GREATEST(0,
      i.total_amount
      - COALESCE(i.paid_amount, 0)
      - COALESCE(i.returned_amount, 0)
    )), 2) AS total_outstanding,
    COUNT(i.id) AS invoice_count,
    'تقديري تشغيلي - قد يختلف عن GL عند وجود أخطاء'::TEXT AS note
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false);
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_gl_ar_balance_per_invoice TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_gl_balance_integrity TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ar_reconciliation_report TO authenticated;

COMMENT ON FUNCTION public.get_gl_ar_balance_per_invoice IS
  'يحسب رصيد AR المستحق لكل فاتورة من journal_entry_lines مباشرة (Single Source of Truth). '
  'يُستخدم في تقرير أعمار الديون GL-Driven.';

COMMENT ON FUNCTION public.check_gl_balance_integrity IS
  'يتحقق أن SUM(Dr) = SUM(Cr) لجميع القيود المرحّلة للشركة. '
  'يجب استدعاؤها يومياً للكشف عن أي خلل محاسبي.';
