-- =====================================================
-- تشخيص مفصل للفواتير بدون COGS (Unknown Reason)
-- =====================================================

-- 1️⃣ الفواتير "Unknown" - فحص مفصل
SELECT 
  i.invoice_number,
  i.status,
  i.company_id,
  i.branch_id IS NOT NULL as has_branch,
  i.cost_center_id IS NOT NULL as has_cost_center,
  i.warehouse_id IS NOT NULL as has_warehouse,
  (
    SELECT COUNT(*) FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = i.id AND p.item_type != 'service'
  ) as product_items_count,
  (
    SELECT COUNT(DISTINCT ii.product_id) FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    JOIN fifo_cost_lots fl ON fl.product_id = p.id
    WHERE ii.invoice_id = i.id 
      AND p.item_type != 'service'
      AND fl.remaining_quantity > 0
  ) as products_with_fifo_lots,
  (
    SELECT COUNT(*) FROM third_party_inventory tpi
    WHERE tpi.invoice_id = i.id
  ) as third_party_items_count,
  (
    SELECT STRING_AGG(DISTINCT tpi.status, ', ') FROM third_party_inventory tpi
    WHERE tpi.invoice_id = i.id
  ) as third_party_statuses,
  i.created_at
FROM invoices i
WHERE i.status IN ('paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM cogs_transactions ct
    WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
  )
  AND i.branch_id IS NOT NULL 
  AND i.cost_center_id IS NOT NULL 
  AND i.warehouse_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM third_party_inventory tpi
    WHERE tpi.invoice_id = i.id AND tpi.status != 'cleared'
  )
ORDER BY i.created_at DESC
LIMIT 10;
