-- =============================================
-- Upgrade Chart of Accounts: hierarchy, normal balance, flags
-- =============================================

-- Add hierarchy and flags to chart_of_accounts
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS normal_balance text NULL CHECK (normal_balance IN ('debit','credit')),
  ADD COLUMN IF NOT EXISTS sub_type text NULL;

-- Helpful index for hierarchy traversal per company
CREATE INDEX IF NOT EXISTS idx_chart_accounts_parent ON chart_of_accounts(company_id, parent_id);

-- Default normal balance based on account_type (run once; safe to rerun)
UPDATE chart_of_accounts
SET normal_balance = CASE lower(account_type)
  WHEN 'asset' THEN 'debit'
  WHEN 'expense' THEN 'debit'
  WHEN 'liability' THEN 'credit'
  WHEN 'equity' THEN 'credit'
  WHEN 'income' THEN 'credit'
  ELSE NULL END
WHERE normal_balance IS NULL;

-- =============================================
-- Seed: Professional baseline COA (Arabic labels, IFRS-style)
-- Only inserts missing codes per company
-- =============================================

WITH base(company_id, account_code, account_name, account_type, normal_balance, sub_type, level) AS (
  SELECT c.id, '1000', 'الخزينة (نقد بالصندوق)', 'asset', 'debit', 'cash', 1 FROM companies c
  UNION ALL SELECT c.id, '1010', 'حساب بنكي رئيسي', 'asset', 'debit', 'bank', 1 FROM companies c
  UNION ALL SELECT c.id, '1100', 'الذمم المدينة (العملاء)', 'asset', 'debit', 'accounts_receivable', 1 FROM companies c
  UNION ALL SELECT c.id, '1200', 'المخزون', 'asset', 'debit', 'inventory', 1 FROM companies c
  UNION ALL SELECT c.id, '1300', 'مصروفات مدفوعة مقدماً', 'asset', 'debit', 'prepaid_expense', 1 FROM companies c
  UNION ALL SELECT c.id, '1400', 'سلف للموردين', 'asset', 'debit', 'supplier_advance', 1 FROM companies c
  UNION ALL SELECT c.id, '1500', 'سلف من العملاء', 'liability', 'credit', 'customer_advance', 1 FROM companies c
  UNION ALL SELECT c.id, '2000', 'الذمم الدائنة (الموردين)', 'liability', 'credit', 'accounts_payable', 1 FROM companies c
  UNION ALL SELECT c.id, '2100', 'ضريبة القيمة المضافة مستحقة الدفع', 'liability', 'credit', 'vat_output', 1 FROM companies c
  UNION ALL SELECT c.id, '2200', 'مصروفات مستحقة', 'liability', 'credit', 'accruals', 1 FROM companies c
  UNION ALL SELECT c.id, '3000', 'رأس المال', 'equity', 'credit', 'capital', 1 FROM companies c
  UNION ALL SELECT c.id, '3100', 'أرباح مبقاة', 'equity', 'credit', 'retained_earnings', 1 FROM companies c
  UNION ALL SELECT c.id, '4000', 'مبيعات', 'income', 'credit', 'sales_revenue', 1 FROM companies c
  UNION ALL SELECT c.id, '4100', 'دخل آخر', 'income', 'credit', 'other_income', 1 FROM companies c
  UNION ALL SELECT c.id, '5000', 'تكلفة البضاعة المباعة', 'expense', 'debit', 'cogs', 1 FROM companies c
  UNION ALL SELECT c.id, '5100', 'مصروفات تشغيلية', 'expense', 'debit', 'operating_expenses', 1 FROM companies c
)
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, is_active)
SELECT b.company_id, b.account_code, b.account_name, b.account_type, b.normal_balance, b.sub_type, b.level, true
FROM base b
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca
  WHERE ca.company_id = b.company_id AND ca.account_code = b.account_code
);

-- Mark control accounts
-- Removed control flag marking; UI derives grouping dynamically based on children.

-- Optional: ensure codes are zero-padded and consistent
UPDATE chart_of_accounts
SET account_code = LPAD(account_code, 4, '0')
WHERE account_code ~ '^[0-9]+$' AND length(account_code) < 4;
