-- =====================================================
-- تحسين جدول vendor_credits لدعم مرتجعات المشتريات التلقائية
-- Enhancement of vendor_credits table for automatic purchase returns
-- =====================================================

-- 1. إضافة الأعمدة المطلوبة
ALTER TABLE vendor_credits 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_purchase_invoice_id UUID REFERENCES bills(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_purchase_return_id UUID REFERENCES purchase_returns(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0;

-- 2. تحديث قيم status المسموحة
-- الحالات: open, applied, partially_applied, closed, cancelled
COMMENT ON COLUMN vendor_credits.status IS 'open: لم يُطبق بعد | applied: مطبق جزئياً | closed: مطبق بالكامل | cancelled: ملغي';

-- 3. إضافة فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_vendor_credits_branch ON vendor_credits(branch_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_cost_center ON vendor_credits(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_source_invoice ON vendor_credits(source_purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_source_return ON vendor_credits(source_purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_reference ON vendor_credits(reference_type, reference_id);

-- 4. إضافة قيد تحقق (constraint) لضمان وجود المورد والشركة
ALTER TABLE vendor_credits 
DROP CONSTRAINT IF EXISTS chk_vendor_credits_amounts,
ADD CONSTRAINT chk_vendor_credits_amounts CHECK (
  total_amount >= 0 AND 
  applied_amount >= 0 AND 
  applied_amount <= total_amount
);

-- 5. تحديث الدالة لحساب remaining_amount (إذا لم تكن موجودة)
-- remaining_amount = total_amount - applied_amount
-- هذا العمود محسوب تلقائياً (GENERATED ALWAYS AS)

-- 6. إضافة تعليقات توضيحية
COMMENT ON TABLE vendor_credits IS 'جدول إشعارات دائن الموردين - يُنشأ تلقائياً عند مرتجعات المشتريات للفواتير المدفوعة';
COMMENT ON COLUMN vendor_credits.branch_id IS 'الفرع المرتبط بالإشعار (من الفاتورة الأصلية)';
COMMENT ON COLUMN vendor_credits.cost_center_id IS 'مركز التكلفة المرتبط بالإشعار (من الفاتورة الأصلية)';
COMMENT ON COLUMN vendor_credits.source_purchase_invoice_id IS 'معرف فاتورة الشراء الأصلية (إن وجدت)';
COMMENT ON COLUMN vendor_credits.source_purchase_return_id IS 'معرف مرتجع المشتريات المرتبط (إن وجد)';
COMMENT ON COLUMN vendor_credits.subtotal IS 'المجموع الفرعي قبل الضريبة';
COMMENT ON COLUMN vendor_credits.tax_amount IS 'قيمة الضريبة';
COMMENT ON COLUMN vendor_credits.total_amount IS 'الإجمالي الكلي (subtotal + tax_amount)';
COMMENT ON COLUMN vendor_credits.applied_amount IS 'المبلغ المطبق على فواتير أخرى';
COMMENT ON COLUMN vendor_credits.remaining_amount IS 'المبلغ المتبقي (محسوب تلقائياً)';
COMMENT ON COLUMN vendor_credits.reference_type IS 'نوع المرجع: purchase_return, adjustment, overpayment';
COMMENT ON COLUMN vendor_credits.reference_id IS 'معرف المرجع (purchase_return_id أو غيره)';

-- 7. إنشاء دالة trigger لتحديث حالة vendor_credit تلقائياً
CREATE OR REPLACE FUNCTION update_vendor_credit_status()
RETURNS TRIGGER AS $$
BEGIN
  -- تحديث حالة vendor_credit بناءً على المبلغ المطبق
  IF NEW.applied_amount >= NEW.total_amount THEN
    NEW.status = 'closed';
  ELSIF NEW.applied_amount > 0 THEN
    NEW.status = 'applied';
  ELSE
    NEW.status = 'open';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. إنشاء trigger لتحديث الحالة تلقائياً
DROP TRIGGER IF EXISTS trg_update_vendor_credit_status ON vendor_credits;
CREATE TRIGGER trg_update_vendor_credit_status
  BEFORE INSERT OR UPDATE OF applied_amount ON vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_credit_status();

-- 9. إنشاء دالة لتحديث vendor_credit عند تطبيقه على فاتورة
CREATE OR REPLACE FUNCTION update_vendor_credit_on_application()
RETURNS TRIGGER AS $$
DECLARE
  v_total_applied DECIMAL(15,2);
BEGIN
  -- حساب إجمالي المبلغ المطبق من جدول vendor_credit_applications
  SELECT COALESCE(SUM(amount_applied), 0)
  INTO v_total_applied
  FROM vendor_credit_applications
  WHERE vendor_credit_id = NEW.vendor_credit_id;
  
  -- تحديث vendor_credit
  UPDATE vendor_credits
  SET applied_amount = v_total_applied
  WHERE id = NEW.vendor_credit_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. إنشاء trigger لتحديث vendor_credit عند التطبيق
DROP TRIGGER IF EXISTS trg_update_vendor_credit_on_application ON vendor_credit_applications;
CREATE TRIGGER trg_update_vendor_credit_on_application
  AFTER INSERT OR UPDATE OR DELETE ON vendor_credit_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_credit_on_application();

-- 11. تحديث RLS policies (إذا لزم الأمر)
-- السياسات موجودة بالفعل في scripts/091_vendor_credits_table.sql

-- 12. إضافة قيد فريد لمنع ازدواج إنشاء vendor_credit لنفس المرتجع
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_credits_unique_return 
ON vendor_credits(source_purchase_return_id) 
WHERE source_purchase_return_id IS NOT NULL;

COMMENT ON INDEX idx_vendor_credits_unique_return IS 'منع إنشاء أكثر من vendor_credit لنفس مرتجع المشتريات';

-- ✅ تم تحسين جدول vendor_credits بنجاح

