-- =============================================================
-- Migration: Annual Closing (قيد الإقفال السنوي)
-- Date: 2026-02-18
-- =============================================================
-- Creates:
--   1. fiscal_year_closings  - Records of completed year-end closings
--   2. get_closing_preview   - RPC to preview revenue/expense before closing
--   3. perform_annual_closing_atomic - RPC to execute the closing atomically
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Table: fiscal_year_closings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_year_closings (
  id                         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id                 UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year                INTEGER NOT NULL,
  closing_date               DATE NOT NULL,
  total_revenue              NUMERIC(20, 4) NOT NULL DEFAULT 0,
  total_expenses             NUMERIC(20, 4) NOT NULL DEFAULT 0,
  net_income                 NUMERIC(20, 4) NOT NULL DEFAULT 0,
  status                     TEXT NOT NULL DEFAULT 'posted'
                               CHECK (status IN ('posted', 'reversed')),
  journal_entry_id           UUID REFERENCES public.journal_entries(id),
  retained_earnings_account_id UUID REFERENCES public.chart_of_accounts(id),
  created_by                 UUID,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, fiscal_year)
);

-- RLS
ALTER TABLE public.fiscal_year_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_year_closings_company_policy" ON public.fiscal_year_closings;
CREATE POLICY "fiscal_year_closings_company_policy"
  ON public.fiscal_year_closings
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------
-- 2. RPC: get_closing_preview
-- Returns revenue/expense breakdown for a fiscal year WITHOUT closing.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_closing_preview(
  p_company_id UUID,
  p_fiscal_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue_total  NUMERIC(20,4) := 0;
  v_expense_total  NUMERIC(20,4) := 0;
  v_revenue_lines  JSONB := '[]'::JSONB;
  v_expense_lines  JSONB := '[]'::JSONB;
  v_already_closed BOOLEAN := FALSE;
  v_account        RECORD;
BEGIN
  -- Check if already closed
  SELECT TRUE INTO v_already_closed
    FROM public.fiscal_year_closings
   WHERE company_id = p_company_id
     AND fiscal_year = p_fiscal_year
     AND status = 'posted';

  -- Revenue accounts (normal_balance = credit, account_type IN ('income','revenue'))
  FOR v_account IN
    SELECT
      coa.id,
      coa.account_code,
      coa.account_name,
      COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN public.journal_entries je
           ON je.id = jel.journal_entry_id
          AND je.company_id = p_company_id
          AND EXTRACT(YEAR FROM je.entry_date) = p_fiscal_year
          AND je.status = 'posted'
          AND COALESCE(je.is_closing_entry, FALSE) = FALSE
    WHERE coa.company_id = p_company_id
      AND coa.account_type IN ('income', 'revenue')
    GROUP BY coa.id, coa.account_code, coa.account_name
    HAVING COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) <> 0
    ORDER BY coa.account_code
  LOOP
    v_revenue_total := v_revenue_total + v_account.net_balance;
    v_revenue_lines := v_revenue_lines || jsonb_build_object(
      'id',           v_account.id,
      'account_code', v_account.account_code,
      'account_name', v_account.account_name,
      'balance',      v_account.net_balance
    );
  END LOOP;

  -- Expense accounts (normal_balance = debit, account_type = 'expense')
  FOR v_account IN
    SELECT
      coa.id,
      coa.account_code,
      coa.account_name,
      COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN public.journal_entries je
           ON je.id = jel.journal_entry_id
          AND je.company_id = p_company_id
          AND EXTRACT(YEAR FROM je.entry_date) = p_fiscal_year
          AND je.status = 'posted'
          AND COALESCE(je.is_closing_entry, FALSE) = FALSE
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'expense'
    GROUP BY coa.id, coa.account_code, coa.account_name
    HAVING COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) <> 0
    ORDER BY coa.account_code
  LOOP
    v_expense_total := v_expense_total + v_account.net_balance;
    v_expense_lines := v_expense_lines || jsonb_build_object(
      'id',           v_account.id,
      'account_code', v_account.account_code,
      'account_name', v_account.account_name,
      'balance',      v_account.net_balance
    );
  END LOOP;

  RETURN jsonb_build_object(
    'fiscal_year',      p_fiscal_year,
    'already_closed',   COALESCE(v_already_closed, FALSE),
    'total_revenue',    v_revenue_total,
    'total_expenses',   v_expense_total,
    'net_income',       v_revenue_total - v_expense_total,
    'revenue_accounts', v_revenue_lines,
    'expense_accounts', v_expense_lines
  );
END;
$$;

-- ---------------------------------------------------------------
-- 3. RPC: perform_annual_closing_atomic
-- Executes year-end closing: zeros all revenue/expense accounts,
-- transfers net income/loss to Retained Earnings (3200).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perform_annual_closing_atomic(
  p_company_id                  UUID,
  p_fiscal_year                 INTEGER,
  p_closing_date                DATE,
  p_retained_earnings_account_id UUID,
  p_user_id                     UUID DEFAULT NULL,
  p_notes                       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue_total  NUMERIC(20,4) := 0;
  v_expense_total  NUMERIC(20,4) := 0;
  v_net_income     NUMERIC(20,4) := 0;
  v_je_id          UUID;
  v_closing_id     UUID;
  v_lines          JSONB[] := ARRAY[]::JSONB[];
  v_account        RECORD;
  v_affected_count INTEGER := 0;
BEGIN
  -- Guard: fiscal year already closed
  IF EXISTS (
    SELECT 1 FROM public.fiscal_year_closings
     WHERE company_id = p_company_id
       AND fiscal_year = p_fiscal_year
       AND status = 'posted'
  ) THEN
    RAISE EXCEPTION 'السنة المالية % مقفلة بالفعل', p_fiscal_year;
  END IF;

  -- Guard: retained earnings account must belong to the company
  IF NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts
     WHERE id = p_retained_earnings_account_id
       AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'حساب الأرباح المحتجزة غير موجود';
  END IF;

  -- Guard: must have at least one revenue or expense transaction
  IF NOT EXISTS (
    SELECT 1
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
     WHERE je.company_id = p_company_id
       AND EXTRACT(YEAR FROM je.entry_date) = p_fiscal_year
       AND je.status = 'posted'
       AND COALESCE(je.is_closing_entry, FALSE) = FALSE
       AND coa.account_type IN ('income', 'revenue', 'expense')
  ) THEN
    RAISE EXCEPTION 'لا توجد حركات إيرادات أو مصروفات لهذه السنة المالية';
  END IF;

  -- ───────────────────────────────
  -- A. Collect REVENUE closing lines
  --    Normal balance = credit  → Dr each account to zero it
  -- ───────────────────────────────
  FOR v_account IN
    SELECT
      coa.id,
      coa.account_code,
      coa.account_name,
      COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN public.journal_entries je
           ON je.id = jel.journal_entry_id
          AND je.company_id = p_company_id
          AND EXTRACT(YEAR FROM je.entry_date) = p_fiscal_year
          AND je.status = 'posted'
          AND COALESCE(je.is_closing_entry, FALSE) = FALSE
    WHERE coa.company_id = p_company_id
      AND coa.account_type IN ('income', 'revenue')
    GROUP BY coa.id, coa.account_code, coa.account_name
    HAVING COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) > 0
  LOOP
    v_revenue_total := v_revenue_total + v_account.net_balance;
    v_lines := array_append(v_lines, jsonb_build_object(
      'account_id',    v_account.id,
      'debit_amount',  v_account.net_balance,
      'credit_amount', 0,
      'description',   'إقفال حساب إيرادات: ' || v_account.account_name || ' - السنة المالية ' || p_fiscal_year
    ));
    v_affected_count := v_affected_count + 1;
  END LOOP;

  -- ───────────────────────────────
  -- B. Collect EXPENSE closing lines
  --    Normal balance = debit  → Cr each account to zero it
  -- ───────────────────────────────
  FOR v_account IN
    SELECT
      coa.id,
      coa.account_code,
      coa.account_name,
      COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN public.journal_entries je
           ON je.id = jel.journal_entry_id
          AND je.company_id = p_company_id
          AND EXTRACT(YEAR FROM je.entry_date) = p_fiscal_year
          AND je.status = 'posted'
          AND COALESCE(je.is_closing_entry, FALSE) = FALSE
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'expense'
    GROUP BY coa.id, coa.account_code, coa.account_name
    HAVING COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) > 0
  LOOP
    v_expense_total := v_expense_total + v_account.net_balance;
    v_lines := array_append(v_lines, jsonb_build_object(
      'account_id',    v_account.id,
      'debit_amount',  0,
      'credit_amount', v_account.net_balance,
      'description',   'إقفال حساب مصروفات: ' || v_account.account_name || ' - السنة المالية ' || p_fiscal_year
    ));
    v_affected_count := v_affected_count + 1;
  END LOOP;

  -- ───────────────────────────────
  -- C. Net income/loss → Retained Earnings
  -- ───────────────────────────────
  v_net_income := v_revenue_total - v_expense_total;

  IF v_net_income > 0 THEN
    -- Profit → Credit Retained Earnings
    v_lines := array_append(v_lines, jsonb_build_object(
      'account_id',    p_retained_earnings_account_id,
      'debit_amount',  0,
      'credit_amount', v_net_income,
      'description',   'صافي ربح السنة المالية ' || p_fiscal_year || ' → أرباح محتجزة'
    ));
  ELSIF v_net_income < 0 THEN
    -- Loss → Debit Retained Earnings
    v_lines := array_append(v_lines, jsonb_build_object(
      'account_id',    p_retained_earnings_account_id,
      'debit_amount',  ABS(v_net_income),
      'credit_amount', 0,
      'description',   'صافي خسارة السنة المالية ' || p_fiscal_year || ' → أرباح محتجزة'
    ));
  END IF;

  -- ───────────────────────────────
  -- D. Create journal entry header
  -- ───────────────────────────────
  INSERT INTO public.journal_entries (
    company_id,
    entry_date,
    description,
    reference_type,
    status,
    is_closing_entry,
    created_by
  ) VALUES (
    p_company_id,
    p_closing_date,
    'قيد الإقفال السنوي - السنة المالية ' || p_fiscal_year,
    'annual_closing',
    'posted',
    TRUE,
    p_user_id
  ) RETURNING id INTO v_je_id;

  -- ───────────────────────────────
  -- E. Insert all lines atomically
  -- ───────────────────────────────
  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  )
  SELECT
    v_je_id,
    (line->>'account_id')::UUID,
    (line->>'debit_amount')::NUMERIC,
    (line->>'credit_amount')::NUMERIC,
    line->>'description'
  FROM unnest(v_lines) AS line;

  -- ───────────────────────────────
  -- F. Record the closing
  -- ───────────────────────────────
  INSERT INTO public.fiscal_year_closings (
    company_id,
    fiscal_year,
    closing_date,
    total_revenue,
    total_expenses,
    net_income,
    status,
    journal_entry_id,
    retained_earnings_account_id,
    created_by,
    notes
  ) VALUES (
    p_company_id,
    p_fiscal_year,
    p_closing_date,
    v_revenue_total,
    v_expense_total,
    v_net_income,
    'posted',
    v_je_id,
    p_retained_earnings_account_id,
    p_user_id,
    p_notes
  ) RETURNING id INTO v_closing_id;

  -- ───────────────────────────────
  -- G. Lock all accounting_periods for this fiscal year (if table exists)
  -- ───────────────────────────────
  UPDATE public.accounting_periods
     SET status    = 'closed',
         is_locked = TRUE,
         closed_at = NOW(),
         closed_by = p_user_id
   WHERE company_id = p_company_id
     AND EXTRACT(YEAR FROM period_start) = p_fiscal_year
     AND status <> 'closed';

  RETURN jsonb_build_object(
    'success',           TRUE,
    'closing_id',        v_closing_id,
    'journal_entry_id',  v_je_id,
    'fiscal_year',       p_fiscal_year,
    'total_revenue',     v_revenue_total,
    'total_expenses',    v_expense_total,
    'net_income',        v_net_income,
    'accounts_closed',   v_affected_count
  );
END;
$$;

-- Grant execute to authenticated users (RLS on fiscal_year_closings handles row-level security)
GRANT EXECUTE ON FUNCTION public.get_closing_preview TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_annual_closing_atomic TO authenticated;
