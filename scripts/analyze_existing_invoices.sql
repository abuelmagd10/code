-- =====================================================
-- تحليل الفواتير الموجودة للتحقق من COGS Transactions
-- =====================================================

-- =====================================================
-- فواتير Sent/Paid بدون COGS (قديمة - قبل التحديث)
-- =====================================================
WITH invoices_analysis AS (
  SELECT 
    i.id,
    i.invoice_number,
    i.status,
    i.invoice_date,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') as product_items_count,
    COUNT(DISTINCT ct.id) as cogs_transactions_count,
    CASE 
      WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL 
      THEN '⚠️ تفتقد الحوكمة'
      ELSE '✅ جاهزة'
    END as governance_status
  FROM invoices i
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
  LEFT JOIN products p ON ii.product_id = p.id
  LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY i.id, i.invoice_number, i.status, i.invoice_date, i.branch_id, i.cost_center_id, i.warehouse_id
  HAVING COUNT(DISTINCT ii.product_id) FILTER (WHERE p.item_type = 'product') > 0
  ORDER BY i.invoice_date DESC
  LIMIT 20
)
SELECT 
  invoice_number,
  status,
  invoice_date,
  product_items_count,
  cogs_transactions_count,
  governance_status,
  CASE 
    WHEN cogs_transactions_count = 0 AND governance_status = '✅ جاهزة'
    THEN 'ℹ️ قديمة - تم إنشاؤها قبل التحديث (طبيعي)'
    WHEN cogs_transactions_count > 0
    THEN '✅ لديها COGS Transactions (جديدة)'
    WHEN governance_status = '⚠️ تفتقد الحوكمة'
    THEN '⚠️ تفتقد الحوكمة - لا يمكن إنشاء COGS'
    ELSE '❓ غير معروف'
  END as analysis_note
FROM invoices_analysis;

-- =====================================================
-- التحقق من FIFO Consumption للفواتير الموجودة
-- =====================================================
WITH fifo_analysis AS (
  SELECT 
    i.invoice_number,
    COUNT(DISTINCT flc.product_id) as products_with_fifo,
    COUNT(DISTINCT flc.id) as fifo_consumptions_count,
    COALESCE(SUM(flc.total_cost), 0) as fifo_total_cost
  FROM invoices i
  LEFT JOIN fifo_lot_consumptions flc ON 
    flc.reference_type = 'invoice' 
    AND flc.reference_id = i.id
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY i.id, i.invoice_number
  ORDER BY i.invoice_date DESC
  LIMIT 20
)
SELECT 
  invoice_number,
  products_with_fifo,
  fifo_consumptions_count,
  fifo_total_cost,
  CASE 
    WHEN fifo_consumptions_count > 0 THEN '✅ FIFO Consumption موجود'
    ELSE 'ℹ️ لا يوجد FIFO Consumption - قد يكون قديم'
  END as fifo_status
FROM fifo_analysis
WHERE fifo_consumptions_count > 0 OR fifo_total_cost > 0;

-- =====================================================
-- ملخص: مقارنة FIFO vs COGS Transactions
-- =====================================================
SELECT 
  'مقارنة FIFO vs COGS' as comparison_type,
  (SELECT COUNT(DISTINCT reference_id) 
   FROM fifo_lot_consumptions 
   WHERE reference_type = 'invoice' 
     AND consumption_date >= CURRENT_DATE - INTERVAL '30 days') as invoices_with_fifo,
  (SELECT COUNT(DISTINCT source_id) 
   FROM cogs_transactions 
   WHERE source_type = 'invoice' 
     AND transaction_date >= CURRENT_DATE - INTERVAL '30 days') as invoices_with_cogs,
  CASE 
    WHEN (SELECT COUNT(DISTINCT source_id) FROM cogs_transactions WHERE source_type = 'invoice' AND transaction_date >= CURRENT_DATE - INTERVAL '30 days') = 0
      AND (SELECT COUNT(DISTINCT reference_id) FROM fifo_lot_consumptions WHERE reference_type = 'invoice' AND consumption_date >= CURRENT_DATE - INTERVAL '30 days') > 0
    THEN '⚠️ توجد FIFO Consumptions بدون COGS Transactions - قد تكون قديمة'
    WHEN (SELECT COUNT(DISTINCT source_id) FROM cogs_transactions WHERE source_type = 'invoice' AND transaction_date >= CURRENT_DATE - INTERVAL '30 days') > 0
    THEN '✅ النظام يعمل - توجد COGS Transactions'
    ELSE 'ℹ️ لا توجد بيانات حديثة - النظام جاهز للاستخدام'
  END as comparison_status;
