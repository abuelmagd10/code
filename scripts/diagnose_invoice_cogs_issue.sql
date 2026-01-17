-- =====================================================
-- تشخيص مشكلة عدم إنشاء COGS Transactions للفواتير المرسلة
-- =====================================================

-- =====================================================
-- 1. التحقق من الفواتير المرسلة حديثاً
-- =====================================================
SELECT 
  '1. الفواتير المرسلة حديثاً' as check_step,
  i.id,
  i.invoice_number,
  i.status,
  i.invoice_date,
  i.created_at,
  i.updated_at,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  CASE 
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL 
    THEN '❌ تفتقد الحوكمة'
    ELSE '✅ Governance كامل'
  END as governance_status,
  -- التحقق من وجود منتجات
  (SELECT COUNT(*) FROM invoice_items ii 
   JOIN products p ON ii.product_id = p.id 
   WHERE ii.invoice_id = i.id AND p.item_type = 'product') as product_items_count,
  -- التحقق من COGS
  (SELECT COUNT(*) FROM cogs_transactions ct 
   WHERE ct.source_id = i.id AND ct.source_type = 'invoice') as cogs_count,
  -- التحقق من FIFO
  (SELECT COUNT(*) FROM fifo_lot_consumptions flc 
   WHERE flc.reference_id = i.id AND flc.reference_type = 'invoice') as fifo_count
FROM invoices i
WHERE i.status IN ('sent', 'partially_paid', 'paid')
  AND i.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY i.created_at DESC
LIMIT 10;

-- =====================================================
-- 2. التحقق من المنتجات في الفواتير
-- =====================================================
SELECT 
  '2. المنتجات في الفواتير المرسلة' as check_step,
  i.invoice_number,
  p.id as product_id,
  p.name as product_name,
  p.item_type,
  ii.quantity,
  -- التحقق من FIFO Lots
  (SELECT COUNT(*) FROM fifo_cost_lots fl 
   WHERE fl.product_id = p.id AND fl.remaining_quantity > 0) as fifo_lots_available,
  (SELECT COALESCE(SUM(remaining_quantity), 0) FROM fifo_cost_lots fl 
   WHERE fl.product_id = p.id AND fl.remaining_quantity > 0) as fifo_total_qty
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
JOIN products p ON ii.product_id = p.id
WHERE i.status IN ('sent', 'partially_paid', 'paid')
  AND i.created_at >= CURRENT_DATE - INTERVAL '7 days'
  AND p.item_type = 'product'
ORDER BY i.created_at DESC, i.invoice_number
LIMIT 20;

-- =====================================================
-- 3. التحقق من وجود COGS Transactions
-- =====================================================
SELECT 
  '3. COGS Transactions للفواتير' as check_step,
  ct.id,
  ct.source_id,
  ct.source_type,
  ct.product_id,
  p.name as product_name,
  ct.quantity,
  ct.unit_cost,
  ct.total_cost,
  ct.transaction_date,
  ct.created_at,
  i.invoice_number
FROM cogs_transactions ct
JOIN products p ON ct.product_id = p.id
LEFT JOIN invoices i ON ct.source_id = i.id AND ct.source_type = 'invoice'
WHERE ct.transaction_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY ct.created_at DESC
LIMIT 20;

-- =====================================================
-- 4. التحقق من FIFO Consumptions
-- =====================================================
SELECT 
  '4. FIFO Consumptions للفواتير' as check_step,
  flc.id,
  flc.reference_id,
  flc.reference_type,
  flc.product_id,
  p.name as product_name,
  flc.quantity_consumed,
  flc.unit_cost,
  flc.total_cost,
  flc.consumption_date,
  flc.created_at,
  i.invoice_number
FROM fifo_lot_consumptions flc
JOIN products p ON flc.product_id = p.id
LEFT JOIN invoices i ON flc.reference_id = i.id AND flc.reference_type = 'invoice'
WHERE flc.consumption_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY flc.created_at DESC
LIMIT 20;

-- =====================================================
-- 5. ملخص التشخيص
-- =====================================================
WITH invoice_summary AS (
  SELECT 
    COUNT(DISTINCT i.id) as total_invoices,
    COUNT(DISTINCT i.id) FILTER (
      WHERE i.branch_id IS NOT NULL 
        AND i.cost_center_id IS NOT NULL 
        AND i.warehouse_id IS NOT NULL
    ) as invoices_with_governance,
    COUNT(DISTINCT i.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM invoice_items ii 
        JOIN products p ON ii.product_id = p.id 
        WHERE ii.invoice_id = i.id AND p.item_type = 'product'
      )
    ) as invoices_with_products,
    COUNT(DISTINCT i.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM cogs_transactions ct 
        WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
      )
    ) as invoices_with_cogs
  FROM invoices i
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.created_at >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT 
  '5. ملخص التشخيص' as check_step,
  total_invoices,
  invoices_with_governance,
  invoices_with_products,
  invoices_with_cogs,
  CASE 
    WHEN invoices_with_governance = total_invoices 
      AND invoices_with_products > 0 
      AND invoices_with_cogs = 0
    THEN '❌ المشكلة: فواتير لديها Governance ومنتجات لكن بدون COGS - يرجى التحقق من console logs'
    WHEN invoices_with_governance < total_invoices
    THEN '⚠️ بعض الفواتير تفتقد Governance'
    WHEN invoices_with_products = 0
    THEN 'ℹ️ لا توجد فواتير بمنتجات'
    WHEN invoices_with_cogs > 0
    THEN '✅ توجد COGS Transactions'
    ELSE '❓ حالة غير معروفة'
  END as diagnosis
FROM invoice_summary;
