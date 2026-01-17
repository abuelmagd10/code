-- =====================================================
-- التحقق من نظام COGS Professional
-- =====================================================
-- هذا السكريبت يتحقق من:
-- 1. وجود الجدول والهيكل
-- 2. وجود فواتير قديمة (قبل التحديث)
-- 3. جاهزية النظام للاستخدام
-- =====================================================

-- =====================================================
-- التحقق 1: وجود الجدول والهيكل
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'cogs_transactions'
  ) THEN
    RAISE EXCEPTION '❌ جدول cogs_transactions غير موجود - يرجى تطبيق SQL migration أولاً';
  END IF;
  RAISE NOTICE '✅ جدول cogs_transactions موجود';
END $$;

-- التحقق من الحقول الإلزامية
SELECT 
  'الحقول الإلزامية' as check_type,
  COUNT(*) FILTER (WHERE column_name = 'company_id') as has_company_id,
  COUNT(*) FILTER (WHERE column_name = 'branch_id') as has_branch_id,
  COUNT(*) FILTER (WHERE column_name = 'cost_center_id') as has_cost_center_id,
  COUNT(*) FILTER (WHERE column_name = 'warehouse_id') as has_warehouse_id,
  COUNT(*) FILTER (WHERE column_name = 'source_type') as has_source_type,
  COUNT(*) FILTER (WHERE column_name = 'unit_cost') as has_unit_cost
FROM information_schema.columns
WHERE table_name = 'cogs_transactions';

-- =====================================================
-- التحقق 2: وجود فواتير جاهزة للاختبار
-- =====================================================
-- البحث عن فواتير حديثة (آخر 30 يوم) مع منتجات
WITH recent_invoices AS (
  SELECT 
    i.id,
    i.invoice_number,
    i.status,
    i.invoice_date,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    COUNT(DISTINCT ii.product_id) as products_count,
    COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') as product_items_count
  FROM invoices i
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
  LEFT JOIN products p ON ii.product_id = p.id
  WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
    AND i.status IN ('sent', 'partially_paid', 'paid')
  GROUP BY i.id, i.invoice_number, i.status, i.invoice_date, i.branch_id, i.cost_center_id, i.warehouse_id
  HAVING COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') > 0
  ORDER BY i.invoice_date DESC
  LIMIT 10
)
SELECT 
  invoice_number,
  status,
  invoice_date,
  products_count,
  product_items_count,
  CASE 
    WHEN branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL 
    THEN '⚠️ تفتقد الحوكمة'
    ELSE '✅ جاهزة للاختبار'
  END as readiness_status,
  (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = id AND source_type = 'invoice') as existing_cogs_count
FROM recent_invoices;

-- =====================================================
-- التحقق 3: فواتير بدون COGS (قديمة - قبل التحديث)
-- =====================================================
-- فواتير حديثة بدون COGS transactions (قد تحتاج إلى تحديث)
SELECT 
  i.invoice_number,
  i.status,
  i.invoice_date,
  COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') as product_items_count,
  CASE 
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL 
    THEN '⚠️ تفتقد الحوكمة - لا يمكن إنشاء COGS'
    ELSE '✅ جاهزة - يمكن إنشاء COGS يدوياً'
  END as status_note
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
LEFT JOIN products p ON ii.product_id = p.id
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
  AND i.status IN ('sent', 'partially_paid', 'paid')
  AND p.item_type = 'product'
  AND ct.id IS NULL  -- لا يوجد COGS transactions
GROUP BY i.id, i.invoice_number, i.status, i.invoice_date, i.branch_id, i.cost_center_id, i.warehouse_id
HAVING COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') > 0
ORDER BY i.invoice_date DESC
LIMIT 10;

-- =====================================================
-- التحقق 4: وجود FIFO Lots للمنتجات
-- =====================================================
-- التحقق من وجود FIFO Lots للمنتجات في الفواتير الحديثة
WITH invoice_products AS (
  SELECT DISTINCT
    i.id as invoice_id,
    ii.product_id,
    p.name as product_name
  FROM invoices i
  JOIN invoice_items ii ON ii.invoice_id = i.id
  JOIN products p ON ii.product_id = p.id
  WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
    AND i.status IN ('sent', 'partially_paid', 'paid')
    AND p.item_type = 'product'
  LIMIT 20
)
SELECT 
  ip.product_name,
  COUNT(DISTINCT fl.id) as fifo_lots_count,
  COALESCE(SUM(fl.remaining_quantity), 0) as total_remaining_qty,
  CASE 
    WHEN COUNT(DISTINCT fl.id) = 0 THEN '⚠️ لا توجد FIFO Lots'
    WHEN SUM(fl.remaining_quantity) = 0 THEN '⚠️ FIFO Lots مستهلكة بالكامل'
    ELSE '✅ FIFO Lots متاحة'
  END as fifo_status
FROM invoice_products ip
LEFT JOIN fifo_cost_lots fl ON fl.product_id = ip.product_id AND fl.remaining_quantity > 0
GROUP BY ip.product_id, ip.product_name
ORDER BY fifo_lots_count DESC, product_name;

-- =====================================================
-- التحقق 5: حالة النظام العامة
-- =====================================================
SELECT 
  'حالة النظام' as check_type,
  (SELECT COUNT(*) FROM cogs_transactions) as total_cogs_transactions,
  (SELECT COUNT(DISTINCT source_id) FROM cogs_transactions WHERE source_type = 'invoice') as invoices_with_cogs,
  (SELECT COUNT(*) FROM invoices WHERE status IN ('sent', 'partially_paid', 'paid') AND invoice_date >= CURRENT_DATE - INTERVAL '30 days') as recent_invoices_count,
  (SELECT COUNT(*) FROM invoices 
   WHERE status IN ('sent', 'partially_paid', 'paid') 
     AND invoice_date >= CURRENT_DATE - INTERVAL '30 days'
     AND branch_id IS NOT NULL 
     AND cost_center_id IS NOT NULL 
     AND warehouse_id IS NOT NULL) as invoices_with_governance,
  CASE 
    WHEN (SELECT COUNT(*) FROM cogs_transactions) = 0 
      AND (SELECT COUNT(*) FROM invoices WHERE status IN ('sent', 'partially_paid', 'paid') AND invoice_date >= CURRENT_DATE - INTERVAL '30 days') > 0
    THEN '⚠️ توجد فواتير حديثة بدون COGS - قد تكون قديمة (قبل التحديث)'
    WHEN (SELECT COUNT(*) FROM cogs_transactions) = 0 
      AND (SELECT COUNT(*) FROM invoices WHERE status IN ('sent', 'partially_paid', 'paid') AND invoice_date >= CURRENT_DATE - INTERVAL '30 days') = 0
    THEN '✅ النظام جاهز - لا توجد فواتير حديثة بعد'
    ELSE '✅ النظام يعمل - توجد COGS transactions'
  END as system_status;

-- =====================================================
-- التحقق 6: جاهزية النظام للاختبار
-- =====================================================
-- توصيات للاختبار
SELECT 
  'توصيات الاختبار' as recommendation_type,
  CASE 
    WHEN (SELECT COUNT(*) FROM invoices WHERE status = 'draft' AND branch_id IS NOT NULL AND cost_center_id IS NOT NULL AND warehouse_id IS NOT NULL) > 0
    THEN '✅ يمكنك إنشاء فاتورة جديدة من Draft وإرسالها لاختبار COGS'
    ELSE 'ℹ️ لا توجد فواتير Draft جاهزة - يمكنك إنشاء فاتورة جديدة'
  END as test_invoice_ready,
  CASE 
    WHEN (SELECT COUNT(*) FROM fifo_cost_lots WHERE remaining_quantity > 0) > 0
    THEN '✅ توجد FIFO Lots متاحة للاختبار'
    ELSE '⚠️ لا توجد FIFO Lots - يرجى إضافة مشتريات أولاً'
  END as fifo_lots_ready,
  CASE 
    WHEN (SELECT COUNT(*) FROM invoices WHERE status IN ('sent', 'partially_paid', 'paid') AND branch_id IS NOT NULL AND cost_center_id IS NOT NULL AND warehouse_id IS NOT NULL) > 0
    THEN '✅ توجد فواتير Sent جاهزة للاختبار (مرتجعات)'
    ELSE 'ℹ️ لا توجد فواتير Sent - يمكنك إنشاء فاتورة وإرسالها'
  END as return_test_ready;
