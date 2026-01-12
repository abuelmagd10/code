-- فحص شامل للفاتورة INV-0001 والنمط المحاسبي

-- 1. بيانات الفاتورة الأساسية
SELECT 
  i.invoice_number,
  i.status,
  i.invoice_date,
  i.total_amount,
  i.paid_amount,
  i.sales_order_id,
  c.name as customer_name,
  i.company_id,
  i.branch_id,
  i.warehouse_id
FROM invoices i
LEFT JOIN customers c ON i.customer_id = c.id
WHERE i.invoice_number = 'INV-0001';

-- 2. أمر البيع المرتبط
SELECT 
  so.order_number,
  so.status,
  so.order_date,
  so.total_amount,
  so.company_id,
  so.branch_id,
  so.warehouse_id
FROM sales_orders so
WHERE so.id = (SELECT sales_order_id FROM invoices WHERE invoice_number = 'INV-0001');

-- 3. حركات المخزون للفاتورة
SELECT 
  it.transaction_type,
  it.product_id,
  p.name as product_name,
  it.quantity_change,
  it.transaction_date,
  it.warehouse_id,
  it.notes
FROM inventory_transactions it
LEFT JOIN products p ON it.product_id = p.id
WHERE it.reference_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001')
ORDER BY it.transaction_date;

-- 4. القيود المحاسبية للفاتورة
SELECT 
  je.entry_date,
  je.reference_type,
  je.description,
  jel.account_id,
  a.name as account_name,
  jel.debit_amount,
  jel.credit_amount
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
LEFT JOIN accounts a ON jel.account_id = a.id
WHERE je.reference_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001')
ORDER BY je.entry_date, jel.id;

-- 5. المدفوعات
SELECT 
  p.payment_date,
  p.amount,
  p.payment_method,
  p.notes
FROM payments p
WHERE p.invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001')
ORDER BY p.payment_date;

-- 6. التحقق من النمط المحاسبي
SELECT 
  i.invoice_number,
  i.status,
  CASE 
    WHEN i.status = 'draft' THEN 'لا مخزون، لا قيد ✓'
    WHEN i.status = 'sent' THEN 'مخزون فقط، لا قيد ✓'
    WHEN i.status IN ('paid', 'partially_paid') THEN 'مخزون + قيد ✓'
    ELSE 'حالة غير معروفة ✗'
  END as expected_pattern,
  (SELECT COUNT(*) FROM inventory_transactions WHERE reference_id = i.id) as inventory_count,
  (SELECT COUNT(*) FROM journal_entries WHERE reference_id = i.id) as journal_count,
  CASE 
    WHEN i.status = 'draft' AND 
         (SELECT COUNT(*) FROM inventory_transactions WHERE reference_id = i.id) = 0 AND
         (SELECT COUNT(*) FROM journal_entries WHERE reference_id = i.id) = 0 
    THEN '✓ صحيح'
    WHEN i.status = 'sent' AND 
         (SELECT COUNT(*) FROM inventory_transactions WHERE reference_id = i.id) > 0 AND
         (SELECT COUNT(*) FROM journal_entries WHERE reference_id = i.id) = 0 
    THEN '✓ صحيح'
    WHEN i.status IN ('paid', 'partially_paid') AND 
         (SELECT COUNT(*) FROM inventory_transactions WHERE reference_id = i.id) > 0 AND
         (SELECT COUNT(*) FROM journal_entries WHERE reference_id = i.id) > 0 
    THEN '✓ صحيح'
    ELSE '✗ خطأ في النمط'
  END as pattern_check
FROM invoices i
WHERE i.invoice_number = 'INV-0001';

-- 7. توازن القيود المحاسبية
SELECT 
  je.id,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  SUM(jel.debit_amount) - SUM(jel.credit_amount) as difference,
  CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) < 0.01 THEN '✓ متوازن'
    ELSE '✗ غير متوازن'
  END as balance_check
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.reference_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001')
GROUP BY je.id, je.description;
