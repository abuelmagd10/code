-- حل بسيط: تصحيح القيود الموجودة فقط

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

-- 2. تصحيح القيود الموجودة مباشرة
UPDATE journal_entry_lines 
SET debit_amount = subq.correct_cogs
FROM (
  SELECT 
    jel.id as line_id,
    SUM(ii.quantity * COALESCE(p.cost_price, 0)) as correct_cogs
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN invoices i ON je.reference_id = i.id
  JOIN invoice_items ii ON i.id = ii.invoice_id
  JOIN products p ON ii.product_id = p.id
  WHERE je.reference_type = 'invoice_cogs'
    AND jel.debit_amount > 0
  GROUP BY jel.id
) subq
WHERE journal_entry_lines.id = subq.line_id;

-- 3. تصحيح الجانب الدائن أيضاً
UPDATE journal_entry_lines 
SET credit_amount = subq.correct_cogs
FROM (
  SELECT 
    jel.id as line_id,
    SUM(ii.quantity * COALESCE(p.cost_price, 0)) as correct_cogs
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN invoices i ON je.reference_id = i.id
  JOIN invoice_items ii ON i.id = ii.invoice_id
  JOIN products p ON ii.product_id = p.id
  WHERE je.reference_type = 'invoice_cogs'
    AND jel.credit_amount > 0
  GROUP BY jel.id
) subq
WHERE journal_entry_lines.id = subq.line_id;

-- 4. تقرير النتائج
SELECT 
  '✅ تم تصحيح القيود الموجودة بنجاح!' as status,
  COUNT(*) as corrected_entries
FROM journal_entries 
WHERE reference_type = 'invoice_cogs';

-- 5. تقرير مفصل للنتائج
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
  ), 0) as gross_profit,
  -- نسبة الربح
  CASE 
    WHEN i.total_amount > 0 THEN 
      ROUND(((i.total_amount - COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        WHERE je.reference_id = i.id 
          AND je.reference_type = 'invoice_cogs'
          AND jel.debit_amount > 0
      ), 0)) / i.total_amount * 100), 2)
    ELSE 0 
  END as profit_margin_percent
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
ORDER BY c.name, i.invoice_number;

-- 6. ملخص لكل شركة
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
  ), 0)) as total_profit,
  -- نسبة الربح الإجمالية
  CASE 
    WHEN SUM(i.total_amount) > 0 THEN 
      ROUND(((SUM(i.total_amount) - SUM(COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        WHERE je.reference_id = i.id 
          AND je.reference_type = 'invoice_cogs'
          AND jel.debit_amount > 0
      ), 0))) / SUM(i.total_amount) * 100), 2)
    ELSE 0 
  END as overall_profit_margin
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
GROUP BY c.id, c.name
ORDER BY c.name;