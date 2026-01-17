-- =====================================================
-- التحقق من COGS Transactions للفواتير المرسلة
-- =====================================================
-- هذا السكريبت يتحقق من:
-- 1. الفواتير المرسلة حديثاً
-- 2. وجود COGS Transactions
-- 3. وجود FIFO Consumptions
-- 4. Governance (branch/cost_center/warehouse)
-- =====================================================

-- =====================================================
-- الفواتير المرسلة حديثاً بدون COGS
-- =====================================================
SELECT 
  'الفواتير المرسلة حديثاً بدون COGS' as check_type,
  i.id as invoice_id,
  i.invoice_number,
  i.status,
  i.invoice_date,
  i.created_at,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') as product_items_count,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  CASE 
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL 
    THEN '⚠️ تفتقد الحوكمة - لا يمكن إنشاء COGS'
    WHEN COUNT(DISTINCT ct.id) = 0 AND COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') > 0
    THEN '❌ لا توجد COGS Transactions (يجب أن تكون موجودة)'
    WHEN COUNT(DISTINCT ct.id) > 0
    THEN '✅ لديها COGS Transactions'
    ELSE 'ℹ️ لا توجد منتجات'
  END as status_note
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
LEFT JOIN products p ON ii.product_id = p.id
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = i.id AND flc.reference_type = 'invoice'
WHERE i.status IN ('sent', 'partially_paid', 'paid')
  AND i.invoice_date >= CURRENT_DATE - INTERVAL '7 days'
  AND i.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY i.id, i.invoice_number, i.status, i.invoice_date, i.created_at, 
         i.branch_id, i.cost_center_id, i.warehouse_id
ORDER BY i.created_at DESC
LIMIT 20;

-- =====================================================
-- تفاصيل فاتورة محددة (في حالة وجود فاتورة حديثة)
-- =====================================================
-- استبدل 'INVOICE_NUMBER' برقم الفاتورة الفعلي
WITH latest_invoice AS (
  SELECT i.id, i.invoice_number, i.status, i.invoice_date, i.branch_id, i.cost_center_id, i.warehouse_id
  FROM invoices i
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY i.created_at DESC
  LIMIT 1
)
SELECT 
  'تفاصيل آخر فاتورة مرسلة' as check_type,
  li.invoice_number,
  li.status,
  li.invoice_date,
  li.branch_id,
  li.cost_center_id,
  li.warehouse_id,
  COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') as product_items_count,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  STRING_AGG(DISTINCT p.name, ', ') as product_names
FROM latest_invoice li
LEFT JOIN invoice_items ii ON ii.invoice_id = li.id
LEFT JOIN products p ON ii.product_id = p.id
LEFT JOIN cogs_transactions ct ON ct.source_id = li.id AND ct.source_type = 'invoice'
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = li.id AND flc.reference_type = 'invoice'
GROUP BY li.id, li.invoice_number, li.status, li.invoice_date, 
         li.branch_id, li.cost_center_id, li.warehouse_id;

-- =====================================================
-- التحقق من FIFO Lots للمنتجات في الفاتورة
-- =====================================================
WITH latest_invoice_items AS (
  SELECT DISTINCT ii.product_id, p.name as product_name
  FROM invoices i
  JOIN invoice_items ii ON ii.invoice_id = i.id
  JOIN products p ON ii.product_id = p.id
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '7 days'
    AND p.item_type = 'product'
  ORDER BY i.created_at DESC
  LIMIT 5
)
SELECT 
  'FIFO Lots للمنتجات في الفاتورة' as check_type,
  lii.product_name,
  COUNT(DISTINCT fl.id) as fifo_lots_count,
  COALESCE(SUM(fl.remaining_quantity), 0) as total_remaining_qty,
  CASE 
    WHEN COUNT(DISTINCT fl.id) = 0 THEN '⚠️ لا توجد FIFO Lots'
    WHEN SUM(fl.remaining_quantity) = 0 THEN '⚠️ FIFO Lots مستهلكة بالكامل'
    ELSE '✅ FIFO Lots متاحة'
  END as fifo_status
FROM latest_invoice_items lii
LEFT JOIN fifo_cost_lots fl ON fl.product_id = lii.product_id AND fl.remaining_quantity > 0
GROUP BY lii.product_id, lii.product_name;

-- =====================================================
-- التحقق من COGS Transactions للفاتورة
-- =====================================================
SELECT 
  'COGS Transactions للفاتورة' as check_type,
  ct.*,
  p.name as product_name,
  i.invoice_number
FROM cogs_transactions ct
JOIN products p ON ct.product_id = p.id
JOIN invoices i ON ct.source_id = i.id
WHERE ct.source_type = 'invoice'
  AND ct.transaction_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY ct.created_at DESC
LIMIT 20;

-- =====================================================
-- ملخص: حالة COGS للفواتير المرسلة
-- =====================================================
SELECT 
  'ملخص: حالة COGS للفواتير المرسلة' as summary_type,
  COUNT(DISTINCT i.id) as total_sent_invoices,
  COUNT(DISTINCT i.id) FILTER (
    WHERE i.branch_id IS NOT NULL 
      AND i.cost_center_id IS NOT NULL 
      AND i.warehouse_id IS NOT NULL
  ) as invoices_with_governance,
  COUNT(DISTINCT ct.id) as total_cogs_transactions,
  COUNT(DISTINCT i.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM cogs_transactions ct2 
      WHERE ct2.source_id = i.id AND ct2.source_type = 'invoice'
    )
  ) as invoices_with_cogs,
  CASE 
    WHEN COUNT(DISTINCT i.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM cogs_transactions ct2 
        WHERE ct2.source_id = i.id AND ct2.source_type = 'invoice'
      )
    ) = COUNT(DISTINCT i.id) FILTER (
      WHERE i.branch_id IS NOT NULL 
        AND i.cost_center_id IS NOT NULL 
        AND i.warehouse_id IS NOT NULL
    )
    THEN '✅ جميع الفواتير المرسلة لديها COGS'
    WHEN COUNT(DISTINCT i.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM cogs_transactions ct2 
        WHERE ct2.source_id = i.id AND ct2.source_type = 'invoice'
      )
    ) > 0
    THEN '⚠️ بعض الفواتير بدون COGS'
    ELSE '❌ لا توجد فواتير لديها COGS'
  END as overall_status
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
WHERE i.status IN ('sent', 'partially_paid', 'paid')
  AND i.invoice_date >= CURRENT_DATE - INTERVAL '7 days';
