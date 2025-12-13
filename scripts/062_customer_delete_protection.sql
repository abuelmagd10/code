-- =============================================
-- 🔒 حماية حذف العملاء على مستوى قاعدة البيانات
-- يمنع حذف العميل إذا كان مرتبطاً بفواتير نشطة
-- =============================================

-- 1. إنشاء دالة التحقق قبل حذف العميل
CREATE OR REPLACE FUNCTION check_customer_delete()
RETURNS TRIGGER AS $$
DECLARE
    blocking_invoice_count INTEGER;
    draft_invoice_count INTEGER;
    payment_count INTEGER;
    active_sales_order_count INTEGER;
BEGIN
    -- التحقق من الفواتير بحالات تمنع الحذف (sent, partially_paid, paid)
    SELECT COUNT(*) INTO blocking_invoice_count
    FROM invoices
    WHERE customer_id = OLD.id
    AND LOWER(status) IN ('sent', 'partially_paid', 'paid');

    IF blocking_invoice_count > 0 THEN
        RAISE EXCEPTION 'CUSTOMER_DELETE_BLOCKED: لا يمكن حذف هذا العميل لوجود % فاتورة مرسلة أو مدفوعة مرتبطة به. برجاء مراجعة الفواتير أولاً.', blocking_invoice_count;
    END IF;

    -- التحقق من الفواتير المسودة
    SELECT COUNT(*) INTO draft_invoice_count
    FROM invoices
    WHERE customer_id = OLD.id
    AND LOWER(status) = 'draft';

    IF draft_invoice_count > 0 THEN
        RAISE EXCEPTION 'CUSTOMER_DELETE_BLOCKED: العميل لديه % فاتورة مسودة. يرجى حذفها أولاً قبل حذف العميل.', draft_invoice_count;
    END IF;

    -- التحقق من المدفوعات
    SELECT COUNT(*) INTO payment_count
    FROM payments
    WHERE customer_id = OLD.id;

    IF payment_count > 0 THEN
        RAISE EXCEPTION 'CUSTOMER_DELETE_BLOCKED: العميل لديه % سجل مدفوعات. لا يمكن الحذف.', payment_count;
    END IF;

    -- التحقق من أوامر البيع النشطة (غير مسودة)
    SELECT COUNT(*) INTO active_sales_order_count
    FROM sales_orders
    WHERE customer_id = OLD.id
    AND LOWER(status) != 'draft';

    IF active_sales_order_count > 0 THEN
        RAISE EXCEPTION 'CUSTOMER_DELETE_BLOCKED: العميل لديه % أمر بيع نشط. يرجى إلغاءها أولاً.', active_sales_order_count;
    END IF;

    -- إذا وصلنا هنا، يمكن الحذف
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 2. إزالة الـ trigger القديم إذا كان موجوداً
DROP TRIGGER IF EXISTS trigger_check_customer_delete ON customers;

-- 3. إنشاء الـ trigger الجديد
CREATE TRIGGER trigger_check_customer_delete
    BEFORE DELETE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION check_customer_delete();

-- 4. إضافة تعليق توضيحي
COMMENT ON FUNCTION check_customer_delete() IS 'دالة للتحقق قبل حذف العميل - تمنع الحذف إذا كان هناك فواتير نشطة أو مدفوعات';

SELECT 'Migration 062_customer_delete_protection completed successfully' AS status;

