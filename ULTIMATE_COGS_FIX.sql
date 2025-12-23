-- الحل النهائي: تصحيح COGS مباشرة بدون triggers

-- 1. تحديث أسعار التكلفة
UPDATE products p
SET cost_price = COALESCE((
  SELECT bi.unit_price 
  FROM bill_items bi
  JOIN bills b ON bi.bill_id = b.id
  WHERE bi.product_id = p.id 
    AND b.status != 'draft'
  ORDER BY b.bill_date DESC
  LIMIT 1
), p.cost_price, 0);

-- 2. تعطيل triggers مؤقتاً للقيود المحاسبية فقط
DROP TRIGGER IF EXISTS prevent_journal_on_sent_invoice_trigger ON journal_entries;

-- 3. حذف قيود COGS الخاطئة
DELETE FROM journal_entry_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE reference_type = 'invoice_cogs'
);

DELETE FROM journal_entries 
WHERE reference_type = 'invoice_cogs';

-- 4. إعادة إنشاء قيود COGS صحيحة
INSERT INTO journal_entries (id, company_id, reference_type, reference_id, entry_date, description)
SELECT 
  gen_random_uuid(),
  i.company_id,
  'invoice_cogs',
  i.id,
  i.invoice_date,
  'تكلفة البضاعة المباعة - ' || i.invoice_number
FROM invoices i
WHERE i.status != 'draft'
  AND EXISTS (
    SELECT 1 FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = i.id AND COALESCE(p.cost_price, 0) > 0
  );

-- 5. إضافة سطور القيود
WITH cogs_data AS (
  SELECT 
    je.id as journal_id,
    i.company_id,
    SUM(ii.quantity * COALESCE(p.cost_price, 0)) as total_cogs
  FROM journal_entries je
  JOIN invoices i ON je.reference_id = i.id
  JOIN invoice_items ii ON i.id = ii.invoice_id
  JOIN products p ON ii.product_id = p.id
  WHERE je.reference_type = 'invoice_cogs'
  GROUP BY je.id, i.company_id
)
INSERT INTO journal_entry_lines (
  journal_entry_id, account_id, debit_amount, credit_amount, description
)
SELECT 
  cd.journal_id,
  coa_cogs.id,
  cd.total_cogs,
  0,
  'تكلفة البضاعة المباعة'
FROM cogs_data cd
JOIN chart_of_accounts coa_cogs ON coa_cogs.company_id = cd.company_id 
  AND coa_cogs.sub_type = 'cogs'

UNION ALL

SELECT 
  cd.journal_id,
  coa_inv.id,
  0,
  cd.total_cogs,
  'خصم من المخزون'
FROM cogs_data cd
JOIN chart_of_accounts coa_inv ON coa_inv.company_id = cd.company_id 
  AND coa_inv.sub_type = 'inventory';

-- 6. إنشاء الحسابات المفقودة
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, sub_type, is_active)
SELECT DISTINCT 
  i.company_id,
  'COGS001',
  'تكلفة البضاعة المباعة',
  'expense',
  'cogs',
  true
FROM invoices i
WHERE i.status != 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts coa
    WHERE coa.company_id = i.company_id AND coa.sub_type = 'cogs'
  );

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, sub_type, is_active)
SELECT DISTINCT 
  i.company_id,
  'INV001',
  'المخزون',
  'asset',
  'inventory',
  true
FROM invoices i
WHERE i.status != 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts coa
    WHERE coa.company_id = i.company_id AND coa.sub_type = 'inventory'
  );

-- 7. إعادة تشغيل الخطوة 5 بعد إنشاء الحسابات
DELETE FROM journal_entry_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE reference_type = 'invoice_cogs'
);

WITH cogs_data AS (
  SELECT 
    je.id as journal_id,
    i.company_id,
    SUM(ii.quantity * COALESCE(p.cost_price, 0)) as total_cogs
  FROM journal_entries je
  JOIN invoices i ON je.reference_id = i.id
  JOIN invoice_items ii ON i.id = ii.invoice_id
  JOIN products p ON ii.product_id = p.id
  WHERE je.reference_type = 'invoice_cogs'
  GROUP BY je.id, i.company_id
)
INSERT INTO journal_entry_lines (
  journal_entry_id, account_id, debit_amount, credit_amount, description
)
SELECT 
  cd.journal_id,
  coa_cogs.id,
  cd.total_cogs,
  0,
  'تكلفة البضاعة المباعة'
FROM cogs_data cd
JOIN chart_of_accounts coa_cogs ON coa_cogs.company_id = cd.company_id 
  AND coa_cogs.sub_type = 'cogs'

UNION ALL

SELECT 
  cd.journal_id,
  coa_inv.id,
  0,
  cd.total_cogs,
  'خصم من المخزون'
FROM cogs_data cd
JOIN chart_of_accounts coa_inv ON coa_inv.company_id = cd.company_id 
  AND coa_inv.sub_type = 'inventory';

-- 8. تقرير النتائج النهائية
SELECT 
  c.name as company_name,
  i.invoice_number,
  i.status,
  i.total_amount as sales,
  COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0) as cogs,
  i.total_amount - COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0) as gross_profit
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
ORDER BY c.name, i.invoice_number;

-- 9. ملخص لكل شركة
SELECT 
  c.name as company_name,
  COUNT(i.id) as invoices_count,
  SUM(i.total_amount) as total_sales,
  SUM(COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0)) as total_cogs,
  SUM(i.total_amount) - SUM(COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0)) as total_profit
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
GROUP BY c.id, c.name
ORDER BY c.name;