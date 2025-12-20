-- التحقق من حالة الفاتورة INV-0001 في شركة foodcana
-- وتصحيحها لتتوافق مع النمط المحاسبي الجديد

-- 1. البحث عن الفاتورة وشركة foodcana
SELECT 
    c.id as company_id,
    c.name as company_name,
    i.id as invoice_id,
    i.invoice_number,
    i.status,
    i.subtotal,
    i.tax_amount,
    i.total_amount,
    i.returned_amount,
    i.return_status
FROM companies c
JOIN invoices i ON i.company_id = c.id
WHERE c.name ILIKE '%foodcana%'
  AND i.invoice_number = 'INV-0001';

-- 2. البحث عن قيود sales_return المرتبطة بهذه الفاتورة
SELECT 
    je.id as journal_entry_id,
    je.reference_type,
    je.description,
    je.entry_date,
    COUNT(jel.id) as lines_count
FROM companies c
JOIN invoices i ON i.company_id = c.id
JOIN journal_entries je ON je.reference_id = i.id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE c.name ILIKE '%foodcana%'
  AND i.invoice_number = 'INV-0001'
  AND je.reference_type = 'sales_return'
GROUP BY je.id, je.reference_type, je.description, je.entry_date;

-- 3. البحث عن القيد الأصلي للفاتورة
SELECT 
    je.id as journal_entry_id,
    je.reference_type,
    je.description,
    je.entry_date,
    jel.account_id,
    coa.account_name,
    coa.sub_type,
    jel.debit_amount,
    jel.credit_amount
FROM companies c
JOIN invoices i ON i.company_id = c.id
JOIN journal_entries je ON je.reference_id = i.id
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE c.name ILIKE '%foodcana%'
  AND i.invoice_number = 'INV-0001'
  AND je.reference_type = 'invoice'
ORDER BY jel.debit_amount DESC, jel.credit_amount DESC;

-- 4. البحث عن بنود الفاتورة والكميات المرتجعة
SELECT 
    ii.id as item_id,
    ii.description,
    ii.quantity,
    ii.returned_quantity,
    ii.unit_price,
    ii.tax_rate,
    ii.discount_percent,
    ii.line_total,
    (ii.quantity - COALESCE(ii.returned_quantity, 0)) as available_qty
FROM companies c
JOIN invoices i ON i.company_id = c.id
JOIN invoice_items ii ON ii.invoice_id = i.id
WHERE c.name ILIKE '%foodcana%'
  AND i.invoice_number = 'INV-0001'
ORDER BY ii.id;

-- 5. البحث عن حركات المخزون المرتبطة
SELECT 
    it.id as transaction_id,
    it.transaction_type,
    it.quantity_change,
    it.reference_id,
    it.journal_entry_id,
    it.notes,
    p.name as product_name
FROM companies c
JOIN invoices i ON i.company_id = c.id
JOIN inventory_transactions it ON it.reference_id = i.id
LEFT JOIN products p ON p.id = it.product_id
WHERE c.name ILIKE '%foodcana%'
  AND i.invoice_number = 'INV-0001'
ORDER BY it.created_at;