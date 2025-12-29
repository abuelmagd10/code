-- =====================================================
-- 📌 ترحيل الفواتير المرسلة إلى نظام بضائع لدى الغير
-- =====================================================
-- هذا السكريبت يقوم بترحيل الفواتير المرسلة (sent) التي لها شركة شحن
-- إلى نظام بضائع لدى الغير الجديد

-- ===== 1) إنشاء سجلات بضائع لدى الغير للفواتير المرسلة =====
INSERT INTO third_party_inventory (
  company_id,
  invoice_id,
  product_id,
  quantity,
  unit_cost,
  shipping_provider_id,
  status,
  cleared_quantity,
  returned_quantity,
  notes,
  branch_id,
  cost_center_id,
  warehouse_id
)
SELECT 
  i.company_id,
  i.id as invoice_id,
  ii.product_id,
  ii.quantity,
  COALESCE(p.cost_price, ii.unit_price * 0.7) as unit_cost, -- استخدام سعر التكلفة أو تقدير 70%
  i.shipping_provider_id,
  'open' as status,
  0 as cleared_quantity,
  0 as returned_quantity,
  'ترحيل تلقائي من النظام القديم' as notes,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id
FROM invoices i
INNER JOIN invoice_items ii ON ii.invoice_id = i.id
INNER JOIN products p ON p.id = ii.product_id
WHERE i.status = 'sent'
  AND i.shipping_provider_id IS NOT NULL
  AND p.item_type != 'service'
  -- تجنب التكرار
  AND NOT EXISTS (
    SELECT 1 FROM third_party_inventory tpi 
    WHERE tpi.invoice_id = i.id AND tpi.product_id = ii.product_id
  );

-- ===== 2) تحديث حركات المخزون لتعكس النقل لبضائع لدى الغير =====
-- تحديث الحركات الموجودة لتضيف معلومات الموقع
UPDATE inventory_transactions it
SET 
  from_location_type = 'warehouse',
  from_location_id = it.warehouse_id,
  to_location_type = 'third_party',
  to_location_id = i.shipping_provider_id,
  shipping_provider_id = i.shipping_provider_id
FROM invoices i
WHERE it.reference_id = i.id
  AND it.transaction_type = 'sale'
  AND i.status = 'sent'
  AND i.shipping_provider_id IS NOT NULL
  AND it.to_location_type IS NULL;

-- ===== 3) إحصائيات الترحيل =====
DO $$
DECLARE
  migrated_invoices INTEGER;
  migrated_items INTEGER;
BEGIN
  SELECT COUNT(DISTINCT invoice_id) INTO migrated_invoices
  FROM third_party_inventory
  WHERE notes = 'ترحيل تلقائي من النظام القديم';
  
  SELECT COUNT(*) INTO migrated_items
  FROM third_party_inventory
  WHERE notes = 'ترحيل تلقائي من النظام القديم';
  
  RAISE NOTICE '✅ تم ترحيل % فاتورة تحتوي على % بند إلى نظام بضائع لدى الغير', migrated_invoices, migrated_items;
END $$;

