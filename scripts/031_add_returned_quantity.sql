-- =====================================================
-- إضافة عمود الكمية المرتجعة لبنود الفواتير
-- Add returned_quantity column to invoice and bill items
-- =====================================================

-- إضافة العمود لجدول بنود فواتير المبيعات
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0;

-- إضافة العمود لجدول بنود فواتير المشتريات
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0;

-- تحديث القيم الموجودة لتكون 0 بدلاً من NULL
UPDATE invoice_items SET returned_quantity = 0 WHERE returned_quantity IS NULL;
UPDATE bill_items SET returned_quantity = 0 WHERE returned_quantity IS NULL;

-- إضافة تعليق للأعمدة
COMMENT ON COLUMN invoice_items.returned_quantity IS 'الكمية المرتجعة من هذا البند';
COMMENT ON COLUMN bill_items.returned_quantity IS 'الكمية المرتجعة من هذا البند';

-- التحقق من إضافة الأعمدة
DO $$
BEGIN
  RAISE NOTICE '✅ تم إضافة عمود returned_quantity بنجاح';
END $$;

