-- ============================================================
-- Migration: 20260221_009_integrity_shield.sql
-- Phase 5: نظام الحماية الدائمة (Permanent Integrity Shield)
-- ============================================================
-- 1. Daily Reconciliation Job function
-- 2. Monthly Audit Snapshot
-- 3. Validation Lock enforcement
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. جدول سجلات التسوية اليومية
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_reconciliation_log (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID        NOT NULL REFERENCES companies(id),
  run_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  check_name       TEXT        NOT NULL,
  gl_value         NUMERIC(20,4),
  operational_value NUMERIC(20,4),
  difference       NUMERIC(20,4),
  is_ok            BOOLEAN     NOT NULL DEFAULT true,
  severity         TEXT        NOT NULL DEFAULT 'info', -- 'ok','warning','critical'
  message          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_recon_company_date ON daily_reconciliation_log(company_id, run_date);
CREATE INDEX IF NOT EXISTS idx_daily_recon_severity ON daily_reconciliation_log(severity, is_ok);

-- ─────────────────────────────────────────────
-- 2. جدول لقطات التدقيق الشهرية (Audit Snapshots)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_snapshots (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID        NOT NULL REFERENCES companies(id),
  snapshot_date       DATE        NOT NULL,
  snapshot_type       TEXT        NOT NULL DEFAULT 'monthly', -- 'monthly','annual_close','manual'
  -- Trial Balance
  total_debits        NUMERIC(20,4) DEFAULT 0,
  total_credits       NUMERIC(20,4) DEFAULT 0,
  is_balanced         BOOLEAN      DEFAULT true,
  -- Balance Sheet
  total_assets        NUMERIC(20,4) DEFAULT 0,
  total_liabilities   NUMERIC(20,4) DEFAULT 0,
  total_equity        NUMERIC(20,4) DEFAULT 0,
  net_income          NUMERIC(20,4) DEFAULT 0,
  -- Inventory
  gl_inventory_value  NUMERIC(20,4) DEFAULT 0,
  fifo_inventory_value NUMERIC(20,4) DEFAULT 0,
  inventory_ok        BOOLEAN      DEFAULT true,
  -- AR/AP
  total_ar            NUMERIC(20,4) DEFAULT 0,
  total_ap            NUMERIC(20,4) DEFAULT 0,
  -- Validation
  critical_failures   INTEGER      DEFAULT 0,
  warning_failures    INTEGER      DEFAULT 0,
  snapshot_data       JSONB,
  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_snapshots_company_date ON audit_snapshots(company_id, snapshot_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_snapshots_unique_monthly
  ON audit_snapshots(company_id, snapshot_date, snapshot_type)
  WHERE snapshot_type = 'monthly';

-- ─────────────────────────────────────────────
-- 3. دالة التسوية اليومية الشاملة
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_daily_reconciliation(p_company_id UUID)
RETURNS TABLE (
  check_name        TEXT,
  gl_value          NUMERIC,
  operational_value NUMERIC,
  difference        NUMERIC,
  severity          TEXT,
  is_ok             BOOLEAN,
  message           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gl_inventory    NUMERIC := 0;
  v_fifo_inventory  NUMERIC := 0;
  v_gl_ar           NUMERIC := 0;
  v_op_ar           NUMERIC := 0;  -- Operational AR from invoices
  v_gl_ap           NUMERIC := 0;
  v_op_ap           NUMERIC := 0;  -- Operational AP from bills
  v_gl_cash         NUMERIC := 0;
  v_op_cash         NUMERIC := 0;  -- Operational bank balance
  v_unbalanced      INTEGER := 0;
  v_run_date        DATE    := CURRENT_DATE;
  v_sev             TEXT;
  v_ok              BOOLEAN;
  v_msg             TEXT;
  v_diff            NUMERIC;
BEGIN
  -- ── GL Inventory ──
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_gl_inventory
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND coa.account_type = 'asset'
    AND (coa.sub_type = 'inventory' OR coa.account_name ILIKE '%مخزون%');

  -- ── FIFO Inventory ──
  SELECT COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) INTO v_fifo_inventory
  FROM fifo_cost_lots fcl
  JOIN products p ON p.id = fcl.product_id
  WHERE p.company_id = p_company_id AND fcl.remaining_quantity > 0;

  -- ── GL AR ──
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_gl_ar
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND coa.account_type = 'asset'
    AND (coa.sub_type IN ('accounts_receivable','ar') OR coa.account_name ILIKE '%العملاء%');

  -- ── Operational AR (from invoices) ──
  SELECT COALESCE(SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.returned_amount,0), 0)), 0)
  INTO v_op_ar
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('cancelled','draft');

  -- ── GL AP ──
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_gl_ap
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND coa.account_type = 'liability'
    AND (coa.sub_type IN ('accounts_payable','ap') OR coa.account_name ILIKE '%الموردين%');

  -- ── Operational AP (from bills) ──
  SELECT COALESCE(SUM(GREATEST(b.total_amount - COALESCE(b.paid_amount,0), 0)), 0)
  INTO v_op_ap
  FROM bills b
  WHERE b.company_id = p_company_id
    AND b.status NOT IN ('cancelled','draft');

  -- ── GL Cash/Bank ──
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_gl_cash
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND coa.account_type = 'asset'
    AND (coa.sub_type IN ('cash','bank') OR coa.account_name ILIKE '%بنك%' OR coa.account_name ILIKE '%صندوق%');

  -- ── Operational Cash (from bank_accounts) ──
  SELECT COALESCE(SUM(ba.balance), 0) INTO v_op_cash
  FROM bank_accounts ba
  WHERE ba.company_id = p_company_id;

  -- ── Unbalanced entries ──
  SELECT COUNT(*) INTO v_unbalanced
  FROM (
    SELECT je.id
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
    GROUP BY je.id
    HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
  ) sub;

  -- ── Clear old log for today ──
  DELETE FROM daily_reconciliation_log
  WHERE company_id = p_company_id AND run_date = v_run_date;

  -- ── Check 1: GL vs FIFO Inventory ──
  v_diff := ABS(v_gl_inventory - v_fifo_inventory);
  v_ok   := v_diff < 1;
  v_sev  := CASE WHEN v_ok THEN 'ok' WHEN v_diff > v_gl_inventory * 0.05 THEN 'critical' ELSE 'warning' END;
  v_msg  := CASE WHEN v_ok THEN 'GL Inventory = FIFO ✓'
                 ELSE 'تضارب: GL=' || v_gl_inventory || ' FIFO=' || v_fifo_inventory || ' فارق=' || v_diff END;
  INSERT INTO daily_reconciliation_log(company_id,run_date,check_name,gl_value,operational_value,difference,is_ok,severity,message)
  VALUES(p_company_id,v_run_date,'GL vs FIFO Inventory',v_gl_inventory,v_fifo_inventory,v_diff,v_ok,v_sev,v_msg);
  RETURN QUERY VALUES('GL vs FIFO Inventory',v_gl_inventory,v_fifo_inventory,v_diff,v_sev,v_ok,v_msg);

  -- ── Check 2: GL AR vs Operational AR ──
  v_diff := ABS(v_gl_ar - v_op_ar);
  v_ok   := v_diff < 1;
  v_sev  := CASE WHEN v_ok THEN 'ok' WHEN v_diff > 10 THEN 'critical' ELSE 'warning' END;
  v_msg  := CASE WHEN v_ok THEN 'GL AR = Operational AR ✓'
                 ELSE 'تضارب AR: GL=' || v_gl_ar || ' Operational=' || v_op_ar END;
  INSERT INTO daily_reconciliation_log(company_id,run_date,check_name,gl_value,operational_value,difference,is_ok,severity,message)
  VALUES(p_company_id,v_run_date,'GL AR vs Operational',v_gl_ar,v_op_ar,v_diff,v_ok,v_sev,v_msg);
  RETURN QUERY VALUES('GL AR vs Operational',v_gl_ar,v_op_ar,v_diff,v_sev,v_ok,v_msg);

  -- ── Check 3: GL AP vs Operational AP ──
  v_diff := ABS(v_gl_ap - v_op_ap);
  v_ok   := v_diff < 1;
  v_sev  := CASE WHEN v_ok THEN 'ok' WHEN v_diff > 10 THEN 'critical' ELSE 'warning' END;
  v_msg  := CASE WHEN v_ok THEN 'GL AP = Operational AP ✓'
                 ELSE 'تضارب AP: GL=' || v_gl_ap || ' Operational=' || v_op_ap END;
  INSERT INTO daily_reconciliation_log(company_id,run_date,check_name,gl_value,operational_value,difference,is_ok,severity,message)
  VALUES(p_company_id,v_run_date,'GL AP vs Operational',v_gl_ap,v_op_ap,v_diff,v_ok,v_sev,v_msg);
  RETURN QUERY VALUES('GL AP vs Operational',v_gl_ap,v_op_ap,v_diff,v_sev,v_ok,v_msg);

  -- ── Check 4: GL Cash vs Operational Bank ──
  v_diff := ABS(v_gl_cash - v_op_cash);
  v_ok   := v_diff < 1;
  v_sev  := CASE WHEN v_ok THEN 'ok' WHEN v_diff > 10 THEN 'critical' ELSE 'warning' END;
  v_msg  := CASE WHEN v_ok THEN 'GL Cash = Bank Accounts ✓'
                 ELSE 'تضارب نقد: GL=' || v_gl_cash || ' Bank=' || v_op_cash END;
  INSERT INTO daily_reconciliation_log(company_id,run_date,check_name,gl_value,operational_value,difference,is_ok,severity,message)
  VALUES(p_company_id,v_run_date,'GL Cash vs Bank',v_gl_cash,v_op_cash,v_diff,v_ok,v_sev,v_msg);
  RETURN QUERY VALUES('GL Cash vs Bank',v_gl_cash,v_op_cash,v_diff,v_sev,v_ok,v_msg);

  -- ── Check 5: Unbalanced Journal Entries ──
  v_ok  := v_unbalanced = 0;
  v_sev := CASE WHEN v_ok THEN 'ok' ELSE 'critical' END;
  v_msg := CASE WHEN v_ok THEN 'لا توجد قيود غير متوازنة ✓' ELSE v_unbalanced || ' قيد غير متوازن!' END;
  INSERT INTO daily_reconciliation_log(company_id,run_date,check_name,gl_value,operational_value,difference,is_ok,severity,message)
  VALUES(p_company_id,v_run_date,'Unbalanced Journal Entries',0,v_unbalanced,v_unbalanced,v_ok,v_sev,v_msg);
  RETURN QUERY VALUES('Unbalanced Journal Entries',0::NUMERIC,v_unbalanced::NUMERIC,v_unbalanced::NUMERIC,v_sev,v_ok,v_msg);
END;
$$;

-- ─────────────────────────────────────────────
-- 4. دالة إنشاء Audit Snapshot شهري
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_monthly_audit_snapshot(
  p_company_id  UUID,
  p_snapshot_date DATE DEFAULT CURRENT_DATE,
  p_created_by  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id      UUID;
  v_total_debits     NUMERIC := 0;
  v_total_credits    NUMERIC := 0;
  v_assets           NUMERIC := 0;
  v_liabilities      NUMERIC := 0;
  v_equity           NUMERIC := 0;
  v_net_income       NUMERIC := 0;
  v_gl_inventory     NUMERIC := 0;
  v_fifo_inventory   NUMERIC := 0;
  v_total_ar         NUMERIC := 0;
  v_total_ap         NUMERIC := 0;
  v_critical_fails   INTEGER := 0;
  v_warning_fails    INTEGER := 0;
BEGIN
  -- Trial Balance
  SELECT COALESCE(SUM(jel.debit_amount),0), COALESCE(SUM(jel.credit_amount),0)
  INTO v_total_debits, v_total_credits
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date;

  -- Balance Sheet components (Assets)
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount),0) INTO v_assets
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date AND coa.account_type = 'asset';

  -- Liabilities
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount),0) INTO v_liabilities
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date AND coa.account_type = 'liability';

  -- Equity
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount),0) INTO v_equity
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date AND coa.account_type = 'equity';

  -- Net Income (Revenue - Expenses)
  SELECT COALESCE(SUM(
    CASE WHEN coa.account_type = 'revenue' THEN jel.credit_amount - jel.debit_amount
         WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount
         ELSE 0 END
  ), 0) INTO v_net_income
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date
    AND coa.account_type IN ('revenue','expense');

  -- Inventory
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount),0) INTO v_gl_inventory
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date
    AND coa.account_type = 'asset'
    AND (coa.sub_type = 'inventory' OR coa.account_name ILIKE '%مخزون%');

  SELECT COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost),0) INTO v_fifo_inventory
  FROM fifo_cost_lots fcl
  JOIN products p ON p.id = fcl.product_id
  WHERE p.company_id = p_company_id AND fcl.remaining_quantity > 0;

  -- AR/AP
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount),0) INTO v_total_ar
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date AND coa.account_type = 'asset'
    AND (coa.sub_type IN ('accounts_receivable','ar') OR coa.account_name ILIKE '%العملاء%');

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount),0) INTO v_total_ap
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id AND je.status = 'posted'
    AND je.entry_date <= p_snapshot_date AND coa.account_type = 'liability'
    AND (coa.sub_type IN ('accounts_payable','ap') OR coa.account_name ILIKE '%الموردين%');

  -- Count recon failures
  SELECT
    COUNT(CASE WHEN severity = 'critical' AND NOT is_ok THEN 1 END),
    COUNT(CASE WHEN severity = 'warning'  AND NOT is_ok THEN 1 END)
  INTO v_critical_fails, v_warning_fails
  FROM daily_reconciliation_log
  WHERE company_id = p_company_id AND run_date = p_snapshot_date;

  -- Insert snapshot
  INSERT INTO audit_snapshots (
    company_id, snapshot_date, snapshot_type,
    total_debits, total_credits, is_balanced,
    total_assets, total_liabilities, total_equity, net_income,
    gl_inventory_value, fifo_inventory_value, inventory_ok,
    total_ar, total_ap,
    critical_failures, warning_failures,
    snapshot_data, created_by
  ) VALUES (
    p_company_id, p_snapshot_date, 'monthly',
    v_total_debits, v_total_credits, ABS(v_total_debits - v_total_credits) < 0.01,
    v_assets, v_liabilities, v_equity, v_net_income,
    v_gl_inventory, v_fifo_inventory, ABS(v_gl_inventory - v_fifo_inventory) < 1,
    v_total_ar, v_total_ap,
    v_critical_fails, v_warning_fails,
    jsonb_build_object(
      'run_at', NOW(),
      'trial_balance_difference', ABS(v_total_debits - v_total_credits),
      'balance_sheet_check', ABS(v_assets - (v_liabilities + v_equity + v_net_income)) < 0.01,
      'fifo_vs_gl_difference', ABS(v_gl_inventory - v_fifo_inventory)
    ),
    p_created_by
  )
  ON CONFLICT (company_id, snapshot_date, snapshot_type)
  DO UPDATE SET
    total_debits         = EXCLUDED.total_debits,
    total_credits        = EXCLUDED.total_credits,
    is_balanced          = EXCLUDED.is_balanced,
    total_assets         = EXCLUDED.total_assets,
    total_liabilities    = EXCLUDED.total_liabilities,
    total_equity         = EXCLUDED.total_equity,
    net_income           = EXCLUDED.net_income,
    gl_inventory_value   = EXCLUDED.gl_inventory_value,
    fifo_inventory_value = EXCLUDED.fifo_inventory_value,
    inventory_ok         = EXCLUDED.inventory_ok,
    total_ar             = EXCLUDED.total_ar,
    total_ap             = EXCLUDED.total_ap,
    critical_failures    = EXCLUDED.critical_failures,
    warning_failures     = EXCLUDED.warning_failures,
    snapshot_data        = EXCLUDED.snapshot_data,
    created_at           = NOW()
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 5. دالة التحقق قبل إقفال الشهر/السنة
--    تمنع الإقفال إذا وُجدت مشاكل حرجة
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_close_period_with_integrity(
  p_company_id UUID,
  p_period_year INTEGER,
  p_period_month INTEGER DEFAULT NULL  -- NULL = إقفال سنوي
)
RETURNS TABLE (
  can_close      BOOLEAN,
  blocking_issues JSONB,
  warnings       JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recon_row   RECORD;
  v_blocks      JSONB := '[]'::JSONB;
  v_warns       JSONB := '[]'::JSONB;
  v_unbalanced  INTEGER;
  v_fifo_diff   NUMERIC;
BEGIN
  -- تشغيل التسوية اليومية
  PERFORM public.run_daily_reconciliation(p_company_id);

  -- فحص المشاكل الحرجة من آخر تسوية
  FOR v_recon_row IN
    SELECT * FROM daily_reconciliation_log
    WHERE company_id = p_company_id
      AND run_date = CURRENT_DATE
      AND NOT is_ok
    ORDER BY severity DESC
  LOOP
    IF v_recon_row.severity = 'critical' THEN
      v_blocks := v_blocks || jsonb_build_object(
        'check', v_recon_row.check_name,
        'message', v_recon_row.message,
        'difference', v_recon_row.difference
      );
    ELSE
      v_warns := v_warns || jsonb_build_object(
        'check', v_recon_row.check_name,
        'message', v_recon_row.message
      );
    END IF;
  END LOOP;

  -- فحص القيود غير المتوازنة
  SELECT COUNT(*) INTO v_unbalanced
  FROM (
    SELECT je.id
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND EXTRACT(YEAR FROM je.entry_date) = p_period_year
    GROUP BY je.id
    HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
  ) sub;

  IF v_unbalanced > 0 THEN
    v_blocks := v_blocks || jsonb_build_object(
      'check', 'UNBALANCED_ENTRIES',
      'message', v_unbalanced || ' قيود غير متوازنة في الفترة',
      'count', v_unbalanced
    );
  END IF;

  RETURN QUERY VALUES (
    jsonb_array_length(v_blocks) = 0,
    v_blocks,
    v_warns
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 6. API Endpoint helper: GET /api/reconciliation
--    يُعيد آخر نتائج التسوية + حالة النظام
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_reconciliation_status(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_last_run DATE;
  v_critical INTEGER;
  v_warnings INTEGER;
BEGIN
  SELECT MAX(run_date) INTO v_last_run
  FROM daily_reconciliation_log
  WHERE company_id = p_company_id;

  SELECT
    COUNT(CASE WHEN severity = 'critical' AND NOT is_ok THEN 1 END),
    COUNT(CASE WHEN severity = 'warning'  AND NOT is_ok THEN 1 END)
  INTO v_critical, v_warnings
  FROM daily_reconciliation_log
  WHERE company_id = p_company_id AND run_date = v_last_run;

  SELECT jsonb_build_object(
    'last_run_date', v_last_run,
    'critical_failures', v_critical,
    'warning_failures', v_warnings,
    'is_healthy', v_critical = 0,
    'checks', jsonb_agg(
      jsonb_build_object(
        'check_name', check_name,
        'is_ok', is_ok,
        'severity', severity,
        'gl_value', gl_value,
        'operational_value', operational_value,
        'difference', difference,
        'message', message
      ) ORDER BY severity DESC, is_ok ASC
    )
  ) INTO v_result
  FROM daily_reconciliation_log
  WHERE company_id = p_company_id AND run_date = v_last_run;

  RETURN COALESCE(v_result, jsonb_build_object('error','No reconciliation data found','last_run_date',NULL));
END;
$$;

-- ─────────────────────────────────────────────
-- 7. RLS للجداول الجديدة
-- ─────────────────────────────────────────────
ALTER TABLE daily_reconciliation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_snapshots          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_recon_log"     ON daily_reconciliation_log;
DROP POLICY IF EXISTS "company_members_audit_snapshots" ON audit_snapshots;

CREATE POLICY "company_members_recon_log" ON daily_reconciliation_log
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_members_audit_snapshots" ON audit_snapshots
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 8. تحديث accounting-validation للتحقق من مكونات Phase 5
-- ─────────────────────────────────────────────
COMMENT ON FUNCTION public.run_daily_reconciliation(UUID) IS
  'Phase 5: Daily Reconciliation — GL vs FIFO, GL vs AR, GL vs AP, GL Cash vs Bank';
COMMENT ON FUNCTION public.create_monthly_audit_snapshot(UUID, DATE, UUID) IS
  'Phase 5: Monthly Audit Snapshot — captures Trial Balance, Balance Sheet, Inventory, AR/AP';
COMMENT ON FUNCTION public.can_close_period_with_integrity(UUID, INTEGER, INTEGER) IS
  'Phase 5: Validation Lock — prevents period closing if critical reconciliation failures exist';

COMMIT;
