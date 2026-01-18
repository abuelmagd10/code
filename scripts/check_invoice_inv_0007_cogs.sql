-- =====================================================
-- التحقق من حساب COGS للفاتورة INV-0007
-- =====================================================

-- =====================================================
-- 1. معلومات الفاتورة الأساسية
-- =====================================================
SELECT 
  '1. معلومات الفاتورة' as check_step,
  i.id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.shipping_provider_id,
  sp.provider_name as shipping_provider_name,
  i.branch_id,
  b.name as branch_name,
  i.cost_center_id,
  cc.cost_center_name,
  i.warehouse_id,
  w.name as warehouse_name,
  i.invoice_date,
  i.created_at,
  i.updated_at
FROM invoices i
LEFT JOIN shipping_providers sp ON sp.id = i.shipping_provider_id
LEFT JOIN branches b ON b.id = i.branch_id
LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
LEFT JOIN warehouses w ON w.id = i.warehouse_id
WHERE i.invoice_number = 'INV-0007';

-- =====================================================
-- 2. منتجات الفاتورة
-- =====================================================
SELECT 
  '2. منتجات الفاتورة' as check_step,
  ii.id,
  ii.product_id,
  p.name as product_name,
  p.item_type,
  ii.quantity,
  ii.unit_price,
  ii.line_total
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
LEFT JOIN products p ON p.id = ii.product_id
WHERE i.invoice_number = 'INV-0007'
ORDER BY ii.created_at;

-- =====================================================
-- 3. Third-Party Inventory Items
-- =====================================================
SELECT 
  '3. Third-Party Inventory' as check_step,
  tpi.id,
  tpi.product_id,
  p.name as product_name,
  tpi.quantity,
  tpi.cleared_quantity,
  tpi.unit_cost,
  tpi.status,
  tpi.cleared_at,
  tpi.branch_id,
  tpi.cost_center_id,
  tpi.warehouse_id,
  tpi.created_at,
  tpi.updated_at
FROM invoices i
LEFT JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
LEFT JOIN products p ON p.id = tpi.product_id
WHERE i.invoice_number = 'INV-0007'
ORDER BY tpi.created_at;

-- =====================================================
-- 4. COGS Transactions (المصدر الموثوق)
-- =====================================================
SELECT 
  '4. COGS Transactions' as check_step,
  ct.id,
  ct.product_id,
  p.name as product_name,
  ct.quantity,
  ct.unit_cost,
  ct.total_cost,
  ct.source_type,
  ct.transaction_date,
  ct.branch_id,
  b.name as branch_name,
  ct.cost_center_id,
  cc.cost_center_name,
  ct.warehouse_id,
  w.name as warehouse_name,
  ct.fifo_consumption_id,
  ct.created_at
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN products p ON p.id = ct.product_id
LEFT JOIN branches b ON b.id = ct.branch_id
LEFT JOIN cost_centers cc ON cc.id = ct.cost_center_id
LEFT JOIN warehouses w ON w.id = ct.warehouse_id
WHERE i.invoice_number = 'INV-0007'
ORDER BY ct.created_at DESC;

-- =====================================================
-- 5. FIFO Lot Consumptions
-- =====================================================
SELECT 
  '5. FIFO Consumptions' as check_step,
  flc.id,
  flc.lot_id,
  fl.id as fifo_lot_id,
  fl.lot_date,
  flc.product_id,
  p.name as product_name,
  flc.quantity_consumed,
  flc.unit_cost,
  flc.total_cost,
  flc.consumption_date,
  flc.created_at
FROM invoices i
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = i.id AND flc.reference_type = 'invoice'
LEFT JOIN products p ON p.id = flc.product_id
LEFT JOIN fifo_cost_lots fl ON fl.id = flc.lot_id
WHERE i.invoice_number = 'INV-0007'
ORDER BY flc.created_at DESC;

-- =====================================================
-- 6. Journal Entries (إن وجدت)
-- =====================================================
SELECT 
  '6. Journal Entries' as check_step,
  je.id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description,
  je.branch_id,
  je.cost_center_id,
  je.created_at
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type IN ('invoice', 'invoice_payment', 'invoice_cogs')
WHERE i.invoice_number = 'INV-0007'
ORDER BY je.created_at DESC;

-- =====================================================
-- 7. Journal Entry Lines للـ COGS (إن وجدت)
-- =====================================================
SELECT 
  '7. Journal Entry Lines (COGS)' as check_step,
  jel.id,
  jel.journal_entry_id,
  je.reference_type,
  coa.account_name,
  coa.account_code,
  jel.debit_amount,
  jel.credit_amount,
  jel.description,
  jel.created_at
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id AND je.reference_type = 'invoice_cogs'
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE i.invoice_number = 'INV-0007'
ORDER BY jel.created_at;

-- =====================================================
-- 8. ملخص شامل وتحقق من التكامل
-- =====================================================
SELECT 
  '8. ملخص شامل وتحقق' as summary,
  i.invoice_number,
  i.status,
  i.total_amount,
  (SELECT COALESCE(SUM(p.amount), 0) FROM payments p 
   WHERE p.invoice_id = i.id) as total_paid,
  CASE 
    WHEN i.shipping_provider_id IS NOT NULL THEN 'Third-Party Sales'
    ELSE 'Direct Sales'
  END as sales_type,
  -- Third-Party Inventory
  (SELECT COUNT(*) FROM third_party_inventory WHERE invoice_id = i.id) as third_party_items_count,
  (SELECT COALESCE(SUM(cleared_quantity), 0) FROM third_party_inventory WHERE invoice_id = i.id) as third_party_cleared_qty,
  -- COGS Transactions (المصدر الموثوق)
  (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') as cogs_transactions_count,
  (SELECT COALESCE(SUM(total_cost), 0) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') as total_cogs_from_transactions,
  -- FIFO Consumptions
  (SELECT COUNT(*) FROM fifo_lot_consumptions WHERE reference_id = i.id AND reference_type = 'invoice') as fifo_consumptions_count,
  (SELECT COALESCE(SUM(total_cost), 0) FROM fifo_lot_consumptions WHERE reference_id = i.id AND reference_type = 'invoice') as total_cogs_from_fifo,
  -- Journal Entries
  (SELECT COUNT(*) FROM journal_entries WHERE reference_id = i.id AND reference_type = 'invoice_cogs') as cogs_journal_entries_count,
  -- التحقق من التكامل
  CASE 
    WHEN (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') > 0 
      AND (SELECT COUNT(*) FROM fifo_lot_consumptions WHERE reference_id = i.id AND reference_type = 'invoice') > 0
    THEN '✅ COGS Transactions و FIFO Consumptions موجودة'
    WHEN (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') > 0
    THEN '✅ COGS Transactions موجودة (FIFO قد لا يكون مستخدم)'
    WHEN i.status IN ('paid', 'partially_paid')
    THEN '❌ لم يتم إنشاء COGS Transactions'
    ELSE 'ℹ️ COGS سيتم إنشاؤه عند الدفع'
  END as cogs_status,
  -- التحقق من التوافق بين COGS Transactions و FIFO
  CASE 
    WHEN ABS(
      COALESCE((SELECT SUM(total_cost) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice'), 0) -
      COALESCE((SELECT SUM(total_cost) FROM fifo_lot_consumptions WHERE reference_id = i.id AND reference_type = 'invoice'), 0)
    ) < 0.01
    THEN '✅ COGS Transactions و FIFO متطابقان'
    WHEN (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') > 0
      AND (SELECT COUNT(*) FROM fifo_lot_consumptions WHERE reference_id = i.id AND reference_type = 'invoice') > 0
    THEN '⚠️ يوجد اختلاف بين COGS Transactions و FIFO'
    ELSE 'ℹ️ غير قابل للتطبيق'
  END as consistency_check
FROM invoices i
WHERE i.invoice_number = 'INV-0007';

-- =====================================================
-- 9. تفاصيل التحقق من الحوكمة (Governance)
-- =====================================================
SELECT 
  '9. التحقق من الحوكمة' as governance_check,
  ct.id as cogs_transaction_id,
  ct.product_id,
  p.name as product_name,
  CASE 
    WHEN ct.company_id IS NULL THEN '❌ company_id مفقود'
    WHEN ct.branch_id IS NULL THEN '❌ branch_id مفقود'
    WHEN ct.cost_center_id IS NULL THEN '❌ cost_center_id مفقود'
    WHEN ct.warehouse_id IS NULL THEN '❌ warehouse_id مفقود'
    ELSE '✅ جميع حقول الحوكمة موجودة'
  END as governance_status,
  ct.branch_id,
  ct.cost_center_id,
  ct.warehouse_id
FROM invoices i
JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN products p ON p.id = ct.product_id
WHERE i.invoice_number = 'INV-0007';
