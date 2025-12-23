-- الحل الأمثل: تحديث متزامن للمدين والدائن

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

-- 2. تحديث متزامن للقيود (المدين والدائن معاً)
WITH cogs_corrections AS (
  SELECT 
    je.id as journal_entry_id,
    SUM(ii.quantity * COALESCE(p.cost_price, 0)) as correct_cogs
  FROM journal_entries je
  JOIN invoices i ON je.reference_id = i.id
  JOIN invoice_items ii ON i.id = ii.invoice_id
  JOIN products p ON ii.product_id = p.id
  WHERE je.reference_type = 'invoice_cogs'
  GROUP BY je.id
)
UPDATE journal_entry_lines 
SET 
  debit_amount = CASE 
    WHEN debit_amount > 0 THEN cc.correct_cogs 
    ELSE 0 
  END,
  credit_amount = CASE 
    WHEN credit_amount > 0 THEN cc.correct_cogs 
    ELSE 0 
  END
FROM cogs_corrections cc
WHERE journal_entry_lines.journal_entry_id = cc.journal_entry_id;

-- 3. تقرير فوري للتحقق من التوازن
SELECT 
  je.id,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.reference_type = 'invoice_cogs'
GROUP BY je.id, je.description
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
ORDER BY difference DESC;

-- 4. تقرير النتائج النهائية
SELECT 
  c.name as company_name,
  i.invoice_number,
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

-- 5. ملخص الشركات
SELECT 
  c.name as company_name,
  COUNT(i.id) as invoices,
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