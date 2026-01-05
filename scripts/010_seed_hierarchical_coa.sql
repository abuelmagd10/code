-- =============================================
-- Seed Hierarchical Chart of Accounts (Arabic, IFRS-style groups)
-- Safe to rerun; inserts missing group nodes and wires parent-child
-- =============================================
-- ⚠️ NOTE: This file uses "accruals" as an account sub_type only
-- This is NOT Accrual Accounting - System uses Cash Basis ONLY
-- =============================================

-- Root group nodes per company (non-posting control accounts)
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
SELECT c.id, 'A', 'الأصول', 'asset', 'debit', 1 FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
SELECT c.id, 'L', 'الخصوم', 'liability', 'credit', 1 FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'L'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
SELECT c.id, 'E', 'حقوق الملكية', 'equity', 'credit', 1 FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'E'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
SELECT c.id, 'I', 'الإيرادات', 'income', 'credit', 1 FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'I'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
SELECT c.id, 'X', 'المصروفات', 'expense', 'debit', 1 FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X'
);

-- Sub-group nodes
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1', 'الأصول المتداولة', 'asset', 'debit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A2', 'الأصول غير المتداولة', 'asset', 'debit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A2'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'L1', 'الخصوم المتداولة', 'liability', 'credit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'L1'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'L2', 'الخصوم غير المتداولة', 'liability', 'credit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'L2'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'E1', 'مكونات حقوق الملكية', 'equity', 'credit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'E')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'E1'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'I1', 'مصادر الدخل', 'income', 'credit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'I')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'I1'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'X1', 'مصروفات التشغيل', 'expense', 'debit', 2,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X1'
);

-- Wire existing accounts under appropriate sub-groups (per company)
-- Current Assets
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'A1'
), level = 3
WHERE lower(ca.account_type) = 'asset'
  AND (coalesce(ca.sub_type,'') IN ('cash','bank','accounts_receivable','inventory','prepaid_expense','supplier_advance'));

-- Non-current Assets (example: PPE if present)
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'A2'
), level = 3
WHERE lower(ca.account_type) = 'asset'
  AND coalesce(ca.sub_type,'') IN ('ppe','fixed_assets');

-- Current Liabilities
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'L1'
), level = 3
WHERE lower(ca.account_type) = 'liability'
  AND (coalesce(ca.sub_type,'') IN ('accounts_payable','vat_output','accruals','customer_advance'));

-- Non-current Liabilities
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'L2'
), level = 3
WHERE lower(ca.account_type) = 'liability'
  AND coalesce(ca.sub_type,'') IN ('long_term_loans','bank_loans');

-- Equity components
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'E1'
), level = 3
WHERE lower(ca.account_type) = 'equity';

-- Income sources
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'I1'
), level = 3
WHERE lower(ca.account_type) = 'income';

-- Operating expenses
UPDATE chart_of_accounts ca
SET parent_id = (
  SELECT id FROM chart_of_accounts g WHERE g.company_id = ca.company_id AND g.account_code = 'X1'
), level = 3
WHERE lower(ca.account_type) = 'expense';

-- Ensure root groups are set as control and non-posting
-- Removed control flag marking; الواجهة تشتق حالة التجميع ديناميكياً حسب وجود أبناء.

-- Optional: fix any missing normal_balance based on type
UPDATE chart_of_accounts
SET normal_balance = CASE lower(account_type)
  WHEN 'asset' THEN 'debit'
  WHEN 'expense' THEN 'debit'
  WHEN 'liability' THEN 'credit'
  WHEN 'equity' THEN 'credit'
  WHEN 'income' THEN 'credit'
  ELSE normal_balance END
WHERE normal_balance IS NULL;
