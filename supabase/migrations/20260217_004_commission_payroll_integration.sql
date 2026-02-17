-- Commission-Payroll Integration: Database Schema Enhancements
-- Migration: 20260217_004_commission_payroll_integration.sql
-- Purpose: Add payment mode support and payroll integration fields

-- ============================================================================
-- 1. Add payout_mode to commission_plans
-- ============================================================================

ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS payout_mode TEXT DEFAULT 'payroll' 
CHECK (payout_mode IN ('immediate', 'payroll'));

COMMENT ON COLUMN public.commission_plans.payout_mode IS 
'Payment method: immediate (per invoice via Instant Payouts page) or payroll (monthly with salary). Default: payroll';

-- ============================================================================
-- 2. Add payroll_run_id to commission_runs
-- ============================================================================

ALTER TABLE public.commission_runs 
ADD COLUMN IF NOT EXISTS payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_runs_payroll 
ON public.commission_runs(payroll_run_id);

COMMENT ON COLUMN public.commission_runs.payroll_run_id IS 
'Links commission run to payroll run when attached (for payroll mode only). NULL for immediate mode or unattached runs.';

-- ============================================================================
-- 3. Add payment tracking fields to commission_ledger
-- ============================================================================

ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' 
CHECK (payment_status IN ('unpaid', 'scheduled', 'paid'));

ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS payment_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_ledger_payment_status 
ON public.commission_ledger(payment_status);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_paid_at 
ON public.commission_ledger(paid_at);

COMMENT ON COLUMN public.commission_ledger.payment_status IS 
'Payment status: unpaid (not ready for payment), scheduled (ready for instant payout), paid (already paid)';

COMMENT ON COLUMN public.commission_ledger.paid_at IS 
'Timestamp when commission was paid. NULL if not yet paid.';

COMMENT ON COLUMN public.commission_ledger.payment_journal_entry_id IS 
'Reference to journal entry created when commission was paid. NULL if not yet paid.';

-- ============================================================================
-- 4. Update existing data
-- ============================================================================

-- Set default payout_mode for existing plans
UPDATE public.commission_plans 
SET payout_mode = 'payroll' 
WHERE payout_mode IS NULL;

-- Set payment_status for existing ledger entries
-- Entries without a commission_run_id are considered scheduled (immediate mode)
-- Entries with a commission_run_id are unpaid (payroll mode)
UPDATE public.commission_ledger 
SET payment_status = CASE 
  WHEN commission_run_id IS NULL THEN 'scheduled'
  ELSE 'unpaid'
END
WHERE payment_status IS NULL;

-- ============================================================================
-- 5. Add helper function to get pending instant payouts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pending_instant_payouts(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  invoices_count BIGINT,
  gross_commission NUMERIC,
  clawbacks NUMERIC,
  net_commission NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.employee_id,
    e.full_name AS employee_name,
    COUNT(DISTINCT CASE WHEN cl.source_type = 'sales_invoice' THEN cl.source_id END) AS invoices_count,
    COALESCE(SUM(CASE WHEN cl.source_type = 'sales_invoice' THEN cl.commission_amount ELSE 0 END), 0) AS gross_commission,
    COALESCE(SUM(CASE WHEN cl.source_type = 'credit_note' THEN cl.commission_amount ELSE 0 END), 0) AS clawbacks,
    COALESCE(SUM(cl.commission_amount), 0) AS net_commission
  FROM public.commission_ledger cl
  INNER JOIN public.employees e ON e.id = cl.employee_id
  INNER JOIN public.commission_plans cp ON cp.id = cl.commission_plan_id
  WHERE cl.company_id = p_company_id
    AND cl.payment_status = 'scheduled'
    AND cp.payout_mode = 'immediate'
    AND cl.created_at::DATE BETWEEN p_start_date AND p_end_date
    AND (p_employee_id IS NULL OR cl.employee_id = p_employee_id)
  GROUP BY cl.employee_id, e.full_name
  HAVING COALESCE(SUM(cl.commission_amount), 0) > 0
  ORDER BY e.full_name;
END;
$$;

COMMENT ON FUNCTION public.get_pending_instant_payouts IS 
'Get pending instant commission payouts for a company within a date range. Only includes commissions from immediate payout mode plans.';

-- ============================================================================
-- 6. Add helper function to pay instant commissions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_instant_commissions(
  p_company_id UUID,
  p_employee_ids UUID[],
  p_payment_account_id UUID,
  p_payment_date DATE,
  p_start_date DATE,
  p_end_date DATE,
  p_user_id UUID
)
RETURNS TABLE (
  employee_id UUID,
  amount NUMERIC,
  journal_entry_id UUID,
  commissions_paid BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp_id UUID;
  v_net_amount NUMERIC;
  v_je_id UUID;
  v_count BIGINT;
  v_commission_expense_account UUID;
BEGIN
  -- Get commission expense account (you may need to adjust this based on your chart of accounts)
  SELECT id INTO v_commission_expense_account
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id
    AND account_type = 'expense'
    AND account_name ILIKE '%commission%'
  LIMIT 1;

  IF v_commission_expense_account IS NULL THEN
    RAISE EXCEPTION 'Commission expense account not found. Please create a commission expense account first.';
  END IF;

  -- Process each employee
  FOREACH v_emp_id IN ARRAY p_employee_ids
  LOOP
    -- Calculate net commission for this employee
    SELECT COALESCE(SUM(commission_amount), 0), COUNT(*)
    INTO v_net_amount, v_count
    FROM public.commission_ledger
    WHERE company_id = p_company_id
      AND employee_id = v_emp_id
      AND payment_status = 'scheduled'
      AND created_at::DATE BETWEEN p_start_date AND p_end_date;

    -- Skip if no commissions to pay
    IF v_net_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Create journal entry
    INSERT INTO public.journal_entries (
      company_id,
      entry_date,
      description,
      reference_type,
      reference_id,
      created_by,
      status
    )
    VALUES (
      p_company_id,
      p_payment_date,
      'Instant commission payment for employee',
      'commission_payout',
      v_emp_id,
      p_user_id,
      'posted'
    )
    RETURNING id INTO v_je_id;

    -- Dr. Commission Expense
    INSERT INTO public.journal_entry_lines (
      journal_entry_id,
      account_id,
      debit,
      credit,
      description
    )
    VALUES (
      v_je_id,
      v_commission_expense_account,
      v_net_amount,
      0,
      'Commission expense'
    );

    -- Cr. Cash/Bank
    INSERT INTO public.journal_entry_lines (
      journal_entry_id,
      account_id,
      debit,
      credit,
      description
    )
    VALUES (
      v_je_id,
      p_payment_account_id,
      0,
      v_net_amount,
      'Commission payment'
    );

    -- Update commission ledger entries
    UPDATE public.commission_ledger
    SET 
      payment_status = 'paid',
      paid_at = NOW(),
      payment_journal_entry_id = v_je_id
    WHERE company_id = p_company_id
      AND employee_id = v_emp_id
      AND payment_status = 'scheduled'
      AND created_at::DATE BETWEEN p_start_date AND p_end_date;

    -- Return result for this employee
    RETURN QUERY SELECT v_emp_id, v_net_amount, v_je_id, v_count;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.pay_instant_commissions IS 
'Pay instant commissions for specified employees. Creates journal entries and updates commission ledger.';

-- ============================================================================
-- 7. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_pending_instant_payouts TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_instant_commissions TO authenticated;
