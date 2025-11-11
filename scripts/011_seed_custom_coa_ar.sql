-- =============================================
-- Seed Custom Arabic Chart of Accounts per provided tree
-- Creates detailed groups and accounts under existing hierarchy (A, L, E, I, X)
-- Safe to rerun: uses NOT EXISTS guards
-- =============================================

-- Helper: get id of a node by code
-- Note: We rely on previously seeded group nodes from 010_seed_hierarchical_coa.sql

-- Current Assets sub-groups under A1
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1C', 'النقد', 'asset', 'debit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1C'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1B', 'المصرف', 'asset', 'debit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1B'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1O', 'الأصول المتداولة الأخرى', 'asset', 'debit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1O'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1AR', 'الحسابات المدينة', 'asset', 'debit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1AR'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1INVG', 'المخزون', 'asset', 'debit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1INVG'
);

-- Non-current Assets sub-group under A2
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A2FA', 'الأصول الثابتة', 'asset', 'debit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A2')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A2FA'
);

-- Current Liabilities sub-groups under L1
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'L1O', 'الالتزامات الجارية الأخرى', 'liability', 'credit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'L1O'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'L1AP', 'الحسابات الدائنة', 'liability', 'credit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'L1AP'
);

-- Equity components already under E1 (from 010), will insert detailed accounts below

-- Income sources already under I1; Expenses under X1

-- =============================================
-- Insert detail accounts under groups (posting accounts)
-- =============================================

-- Cash & Undeposited Funds
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1110', 'المبالغ الصغيرة', 'asset', 'debit', 'cash', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1C'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1110'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1115', 'أموال غير مودعة', 'asset', 'debit', 'cash', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1C'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1115'
);

-- Banks
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1120', 'Zoho Payroll - Bank Account', 'asset', 'debit', 'bank', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1B'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1120'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1121', 'بنك الامارات دبى (ENBD)', 'asset', 'debit', 'bank', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1B'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1121'
);

-- Accounts Receivable
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1130', 'الحسابات المدينة', 'asset', 'debit', 'accounts_receivable', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1AR'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1130'
);

-- Other Current Assets: VAT input, Excise input, advances, prepaid
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1140', 'Input VAT', 'asset', 'debit', 'vat_input', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1140'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1141', 'Input Excise Tax', 'asset', 'debit', 'excise_input', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1141'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1145', 'ضرائب مدفوعة مقدمة', 'asset', 'debit', 'tax_prepaid', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1145'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1150', 'سلفة الموظفين', 'asset', 'debit', 'employee_advance', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1150'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1151', 'مصروفات مدفوعة مقدمًا', 'asset', 'debit', 'prepaid_expense', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1151'
);

-- Prepaid detail under prepaid group as control with nested items
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'A1OPP', 'تفصيل المصروفات المدفوعة مقدمًا', 'asset', 'debit', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1O')
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'A1OPP'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1152', 'رسوم تسجيل الشركة و عقد الشراكة مقدمأ', 'asset', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1OPP'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1152'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1153', 'ايجارى مكتب ابوهيل مقدما', 'asset', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '1152'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1153'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1154', 'ايجارى مكتب مارينا مقدما', 'asset', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '1152'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1154'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1155', 'مصاريف الرخصة التجارية دبى مقدما', 'asset', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '1152'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1155'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1156', 'اشتراك الدومين + الايميل جودادى مقدما', 'asset', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1OPP'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1156'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1157', 'اشتراك GS1 مقدما', 'asset', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1OPP'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1157'
);

-- Fixed Assets and samples
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1301', 'مصروفات التأسيس', 'asset', 'debit', 'fixed_assets', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A2FA'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1301'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1302', 'الأثاث والمعدات', 'asset', 'debit', 'fixed_assets', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A2FA'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1302'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1303', 'اكلاشية طباعة اكياس البطاطس 1كيلو+2.5 كيلو', 'asset', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '1302'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1303'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '1304', 'مجمع اهلاك اكلاشية طباعة اكياس البطاطس 1كيلو+2.5 كيلو', 'asset', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '1303'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1304'
);

-- Liabilities: payroll and taxes under L1O
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '2101', 'Reimbursements Payable', 'liability', 'credit', 'payroll_other', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '2101'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '2102', 'Statutory Deductions Payable', 'liability', 'credit', 'payroll_other', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '2102'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '2103', 'Output VAT', 'liability', 'credit', 'vat_output', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '2103'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '2104', 'Excise Tax Payable', 'liability', 'credit', 'excise_output', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1O'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '2104'
);

-- Accounts Payable
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '2000', 'الحسابات الدائنة', 'liability', 'credit', 'accounts_payable', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'L1AP'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '2000'
);

-- Equity
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '3000', 'رأس مال الشركة', 'equity', 'credit', 'capital', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'E1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '3000'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '3100', 'ارباح المرحلة', 'equity', 'credit', 'retained_earnings', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'E1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '3100'
);

-- Income
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '4000', 'المبيعات', 'income', 'credit', 'sales_revenue', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'I1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '4000'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '4010', '‎الرسوم الأخرى ‏', 'income', 'credit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'I1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '4010'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '4020', 'إيراد الفوائد', 'income', 'credit', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'I1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '4020'
);

-- Expenses
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '5000', 'تكلفة البضائع المباعة', 'expense', 'debit', 'cogs', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5000'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '5100', 'مصروفات تشغيلية', 'expense', 'debit', 'operating_expenses', 3,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5100'
);

-- Example operating expense groups under X1
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'X1IT', 'مصروفات الإنترنت وتكنولوجيا المعلومات', 'expense', 'debit', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1')
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X1IT'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5110', 'اشتراك الدومين + الايميل جودادى', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1IT'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5110'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'X1MKT', 'الإعلان والتسويق', 'expense', 'debit', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1')
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X1MKT'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5120', 'اشتراك موقع كانفا للتصميم', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1MKT'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5120'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'X1PRINT', 'الطباعة والأدوات المكتبية', 'expense', 'debit', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1')
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X1PRINT'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5130', 'تكاليف كروت NFC عدد 100 كارت', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1PRINT'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5130'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5131', 'GS1', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1PRINT'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5131'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5132', 'تكاليف تصميم الكيس -البطاطس', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1PRINT'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5132'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'X1REG', 'رسوم تسجيل الشركة و عقد الشراكة', 'expense', 'debit', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1')
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X1REG'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5140', 'مصاريف الرخصة التجارية دبى', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1REG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5140'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5141', 'مصاريف العلامة التجارية', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1REG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5141'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5142', 'تسجيل الجمارك بدبى', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1REG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5142'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5143', 'مصاريف كارت المنشأة', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1REG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5143'
);

-- COGS detailed groups and items
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
SELECT c.id, 'X1COGS', 'تفصيل تكلفة البضائع المباعة', 'expense', 'debit', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5000')
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = 'X1COGS'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5200', 'اجمالى تكاليف الشحن', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1COGS'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5200'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5201', 'تكاليف النقل الداخلى (الامارات)', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5200'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5201'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5202', 'تكاليف الشحن الداخلى مصر', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5200'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5202'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5203', 'رسوم الشحن الدولى', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5200'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5203'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5300', 'مستلزمات المنتج من كيس وكرتونة', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1COGS'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5300'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5301', 'تكاليف تصنيع الكيس', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5300'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5301'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5302', 'تكاليف شراء كرتونة', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5300'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5302'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5400', 'اجمالى تكاليف التخليص الجمركى', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1COGS'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5400'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5401', 'تكاليف الجمرك دبى', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5400'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5401'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5500', 'اجمالى تكاليف التخزين', 'expense', 'debit', 5,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'X1COGS'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5500'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5501', 'تكلفة التثلاجة للكرتونة 10 كيلو بجبل على', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5500'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5501'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, is_active)
SELECT c.id, '5502', 'تفريغ دخول وخروج الثلاجة', 'expense', 'debit', 6,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5500'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '5502'
);

-- Inventory detail under A1INVG if needed
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1201', 'العمل قيد التقدم', 'asset', 'debit', 'inventory', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1INVG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1201'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1202', 'البضائع الجاهزة', 'asset', 'debit', 'inventory', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1INVG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1202'
);

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, sub_type, level, parent_id, is_active)
SELECT c.id, '1203', 'أصول قائمة البضائع', 'asset', 'debit', 'inventory', 4,
       (SELECT id FROM chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = 'A1INVG'), true
FROM companies c WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.account_code = '1203'
);

-- Final cleanup: ensure posting/normal_balance consistent
UPDATE chart_of_accounts
SET normal_balance = CASE lower(account_type)
  WHEN 'asset' THEN 'debit'
  WHEN 'expense' THEN 'debit'
  WHEN 'liability' THEN 'credit'
  WHEN 'equity' THEN 'credit'
  WHEN 'income' THEN 'credit'
  ELSE normal_balance END
WHERE normal_balance IS NULL;
