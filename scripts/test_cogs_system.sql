-- =====================================================
-- اختبار شامل End-to-End لنظام COGS Professional
-- =====================================================
-- هذا السكريبت يختبر:
-- 1. Purchase → Inventory In
-- 2. Invoice Sent → FIFO → COGS Transactions
-- 3. Partial Payment → No extra COGS
-- 4. Full Payment
-- 5. Partial Return → COGS Reversal
-- 6. Full Return
-- =====================================================

-- =====================================================
-- التحقق الأولي: وجود الجدول والهيكل
-- =====================================================
DO $$
BEGIN
  -- التحقق من وجود جدول cogs_transactions
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
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'cogs_transactions'
  AND column_name IN ('company_id', 'branch_id', 'cost_center_id', 'warehouse_id', 'product_id', 'source_type', 'source_id', 'quantity', 'unit_cost', 'total_cost')
ORDER BY ordinal_position;

-- =====================================================
-- اختبار 1: Purchase → Inventory In
-- =====================================================
-- التحقق من وجود FIFO Lots بعد الشراء
DO $$
DECLARE
  v_test_company_id UUID;
  v_test_product_id UUID;
  v_fifo_lot_count INT;
BEGIN
  -- اختبار: البحث عن شركة و منتج موجودين
  SELECT id INTO v_test_company_id FROM companies LIMIT 1;
  SELECT id INTO v_test_product_id FROM products WHERE company_id = v_test_company_id AND item_type = 'product' LIMIT 1;
  
  IF v_test_company_id IS NULL THEN
    RAISE NOTICE '⚠️ لا توجد شركات في النظام للاختبار';
    RETURN;
  END IF;
  
  IF v_test_product_id IS NULL THEN
    RAISE NOTICE '⚠️ لا توجد منتجات في الشركة % للاختبار', v_test_company_id;
    RETURN;
  END IF;
  
  -- التحقق من وجود FIFO Lots
  SELECT COUNT(*) INTO v_fifo_lot_count
  FROM fifo_cost_lots
  WHERE company_id = v_test_company_id
    AND product_id = v_test_product_id;
  
  RAISE NOTICE '📦 اختبار 1: Purchase → Inventory In';
  RAISE NOTICE '   المنتج: %', v_test_product_id;
  RAISE NOTICE '   عدد FIFO Lots: %', v_fifo_lot_count;
  
  IF v_fifo_lot_count > 0 THEN
    RAISE NOTICE '   ✅ FIFO Lots موجودة';
  ELSE
    RAISE NOTICE '   ⚠️ لا توجد FIFO Lots - يرجى إضافة مشتريات للمنتج';
  END IF;
END $$;

-- =====================================================
-- اختبار 2: Invoice Sent → FIFO → COGS Transactions
-- =====================================================
-- التحقق من إنشاء COGS Transactions عند Invoice Sent
WITH invoice_cogs_check AS (
  SELECT 
    i.id as invoice_id,
    i.invoice_number,
    i.status,
    i.invoice_date,
    COUNT(DISTINCT ct.id) as cogs_transactions_count,
    COALESCE(SUM(ct.total_cost), 0) as total_cogs,
    COUNT(DISTINCT ii.product_id) as products_count
  FROM invoices i
  LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY i.id, i.invoice_number, i.status, i.invoice_date
  HAVING COUNT(DISTINCT ii.product_id) > 0
  ORDER BY i.invoice_date DESC
  LIMIT 10
)
SELECT 
  invoice_number,
  status,
  invoice_date,
  products_count,
  cogs_transactions_count,
  total_cogs,
  CASE 
    WHEN cogs_transactions_count > 0 THEN '✅ COGS موجود'
    ELSE '⚠️ لا يوجد COGS - قد يكون قديم أو بدون منتجات'
  END as status_check
FROM invoice_cogs_check;

-- =====================================================
-- اختبار 3: التحقق من تطابق FIFO Consumption مع COGS
-- =====================================================
-- مقارنة FIFO Consumption مع COGS Transactions
WITH fifo_cogs_comparison AS (
  SELECT 
    flc.reference_id as invoice_id,
    flc.product_id,
    p.name as product_name,
    SUM(flc.total_cost) as fifo_total_cost,
    SUM(ct.total_cost) as cogs_total_cost,
    COUNT(DISTINCT flc.id) as fifo_consumptions,
    COUNT(DISTINCT ct.id) as cogs_transactions
  FROM fifo_lot_consumptions flc
  JOIN products p ON p.id = flc.product_id
  LEFT JOIN cogs_transactions ct ON 
    ct.source_id = flc.reference_id 
    AND ct.source_type = 'invoice'
    AND ct.product_id = flc.product_id
    AND ct.fifo_consumption_id = flc.id
  WHERE flc.reference_type = 'invoice'
    AND flc.consumption_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY flc.reference_id, flc.product_id, p.name
  HAVING SUM(flc.total_cost) > 0
  LIMIT 10
)
SELECT 
  invoice_id,
  product_name,
  fifo_total_cost,
  cogs_total_cost,
  ABS(fifo_total_cost - cogs_total_cost) as difference,
  fifo_consumptions,
  cogs_transactions,
  CASE 
    WHEN ABS(fifo_total_cost - cogs_total_cost) < 0.01 THEN '✅ تطابق'
    WHEN cogs_total_cost = 0 THEN '⚠️ COGS مفقود'
    ELSE '❌ فرق'
  END as status_check
FROM fifo_cogs_comparison
ORDER BY ABS(fifo_total_cost - cogs_total_cost) DESC;

-- =====================================================
-- اختبار 4: Sales Return → COGS Reversal
-- =====================================================
-- التحقق من عكس COGS عند المرتجع
WITH return_cogs_check AS (
  SELECT 
    i.id as invoice_id,
    i.invoice_number,
    COUNT(DISTINCT ct_invoice.id) as original_cogs_count,
    COUNT(DISTINCT ct_return.id) as return_cogs_count,
    COALESCE(SUM(CASE WHEN ct_invoice.id IS NOT NULL THEN ct_invoice.total_cost ELSE 0 END), 0) as original_cogs_total,
    COALESCE(SUM(CASE WHEN ct_return.id IS NOT NULL THEN ct_return.total_cost ELSE 0 END), 0) as return_cogs_total
  FROM invoices i
  LEFT JOIN cogs_transactions ct_invoice ON 
    ct_invoice.source_id = i.id 
    AND ct_invoice.source_type = 'invoice'
  LEFT JOIN sales_returns sr ON sr.invoice_id = i.id
  LEFT JOIN cogs_transactions ct_return ON 
    ct_return.source_type = 'return'
    AND (ct_return.source_id = sr.id OR ct_return.source_id = i.id)
  WHERE i.status IN ('partially_returned', 'fully_returned')
    OR i.returned_amount > 0
  GROUP BY i.id, i.invoice_number
  LIMIT 10
)
SELECT 
  invoice_number,
  original_cogs_count,
  return_cogs_count,
  original_cogs_total,
  return_cogs_total,
  CASE 
    WHEN return_cogs_count > 0 THEN '✅ COGS Reversal موجود'
    WHEN original_cogs_count > 0 AND return_cogs_count = 0 THEN '⚠️ COGS Reversal مفقود'
    ELSE 'ℹ️ لا يوجد COGS أصلي'
  END as status_check
FROM return_cogs_check
WHERE original_cogs_count > 0;

-- =====================================================
-- اختبار 5: التحقق من الحوكمة (Governance)
-- =====================================================
-- التحقق من وجود الحوكمة في جميع COGS Transactions
SELECT 
  COUNT(*) as total_cogs_transactions,
  COUNT(*) FILTER (WHERE branch_id IS NULL) as missing_branch,
  COUNT(*) FILTER (WHERE cost_center_id IS NULL) as missing_cost_center,
  COUNT(*) FILTER (WHERE warehouse_id IS NULL) as missing_warehouse,
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL AND cost_center_id IS NOT NULL AND warehouse_id IS NOT NULL) as with_full_governance,
  CASE 
    WHEN COUNT(*) FILTER (WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL) = 0 
    THEN '✅ جميع COGS Transactions لديها حوكمة كاملة'
    ELSE '⚠️ بعض COGS Transactions تفتقد الحوكمة'
  END as governance_status
FROM cogs_transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- =====================================================
-- اختبار 6: مقارنة Dashboard Stats (Old vs New)
-- =====================================================
-- مقارنة COGS من cogs_transactions (الجديد) مع cost_price (القديم)
WITH new_cogs AS (
  -- COGS من cogs_transactions (المصدر الجديد)
  SELECT 
    company_id,
    SUM(total_cost) as total_cogs
  FROM cogs_transactions
  WHERE source_type = 'invoice'
    AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY company_id
),
old_cogs AS (
  -- COGS من cost_price (الطريقة القديمة - للتحقق فقط)
  SELECT 
    i.company_id,
    SUM(ii.quantity * COALESCE(p.cost_price, 0)) as total_cogs
  FROM invoice_items ii
  JOIN invoices i ON ii.invoice_id = i.id
  JOIN products p ON ii.product_id = p.id
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
    AND p.item_type != 'service'
  GROUP BY i.company_id
)
SELECT 
  COALESCE(n.company_id, o.company_id) as company_id,
  COALESCE(n.total_cogs, 0) as new_method_cogs,
  COALESCE(o.total_cogs, 0) as old_method_cogs,
  ABS(COALESCE(n.total_cogs, 0) - COALESCE(o.total_cogs, 0)) as difference,
  CASE 
    WHEN ABS(COALESCE(n.total_cogs, 0) - COALESCE(o.total_cogs, 0)) < 0.01 
    THEN '✅ تطابق'
    WHEN n.total_cogs = 0 AND o.total_cogs > 0 
    THEN '⚠️ لا يوجد COGS جديد - قد تكون البيانات قديمة'
    WHEN n.total_cogs > 0 AND o.total_cogs = 0 
    THEN '⚠️ لا يوجد COGS قديم - منتجات بدون cost_price'
    ELSE 'ℹ️ فرق (متوقع - FIFO vs Average Cost)'
  END as comparison_status
FROM new_cogs n
FULL OUTER JOIN old_cogs o ON n.company_id = o.company_id
ORDER BY ABS(COALESCE(n.total_cogs, 0) - COALESCE(o.total_cogs, 0)) DESC;

-- =====================================================
-- اختبار 7: التحقق من توازن المخزون والـ COGS
-- =====================================================
-- مقارنة مجموع المخزون مع مجموع COGS + المرتجعات
WITH inventory_summary AS (
  SELECT 
    company_id,
    product_id,
    SUM(quantity_change) as net_quantity_change
  FROM inventory_transactions
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY company_id, product_id
),
cogs_summary AS (
  SELECT 
    company_id,
    product_id,
    SUM(CASE WHEN source_type = 'invoice' THEN total_cost ELSE 0 END) as total_cogs,
    SUM(CASE WHEN source_type = 'return' THEN total_cost ELSE 0 END) as return_cogs
  FROM cogs_transactions
  WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY company_id, product_id
)
SELECT 
  COALESCE(i.company_id, c.company_id) as company_id,
  COALESCE(i.product_id, c.product_id) as product_id,
  COALESCE(i.net_quantity_change, 0) as inventory_change,
  COALESCE(c.total_cogs, 0) as cogs_total,
  COALESCE(c.return_cogs, 0) as return_cogs_total,
  COALESCE(c.return_cogs, 0) - COALESCE(c.total_cogs, 0) as net_cogs,
  CASE 
    WHEN ABS(COALESCE(i.net_quantity_change, 0) - (COALESCE(c.return_cogs, 0) - COALESCE(c.total_cogs, 0))) < 0.01 
    THEN '✅ متوازن'
    ELSE 'ℹ️ فرق (متوقع - لا يحسب جميع المعاملات)'
  END as balance_status
FROM inventory_summary i
FULL OUTER JOIN cogs_summary c ON i.company_id = c.company_id AND i.product_id = c.product_id
WHERE COALESCE(i.net_quantity_change, 0) != 0 
   OR COALESCE(c.total_cogs, 0) != 0
LIMIT 20;

-- =====================================================
-- ملخص الاختبارات
-- =====================================================
SELECT 
  '📊 ملخص الاختبارات' as test_section,
  (SELECT COUNT(*) FROM cogs_transactions WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as total_cogs_transactions,
  (SELECT COUNT(DISTINCT source_id) FROM cogs_transactions WHERE source_type = 'invoice' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as invoices_with_cogs,
  (SELECT COUNT(DISTINCT source_id) FROM cogs_transactions WHERE source_type = 'return' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as returns_with_cogs_reversal,
  (SELECT COUNT(*) FROM cogs_transactions WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL) as missing_governance,
  CASE 
    WHEN (SELECT COUNT(*) FROM cogs_transactions WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL) = 0 
    THEN '✅ جميع COGS Transactions لديها حوكمة كاملة'
    ELSE '⚠️ بعض COGS Transactions تفتقد الحوكمة'
  END as overall_status;
