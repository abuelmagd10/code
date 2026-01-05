-- =============================================
-- منع قيود الإيراد للفواتير بحالة SENT (نمط Cash Basis)
-- Prevent Revenue Journal Entries for SENT Invoices (Cash Basis Pattern)
-- =============================================
-- 
-- 📌 المرجع الأعلى: ACCOUNTING_PATTERN.md (Single Source of Truth)
-- 
-- هذا السكربت يضمن تطبيق النمط المحاسبي الصارم:
-- ✅ Cash Basis (أساس النقدية)
-- 
-- القواعد:
-- - Draft: ❌ لا مخزون، ❌ لا قيود
-- - Sent: ✅ مخزون فقط، ❌ لا قيود محاسبية
-- - Paid: ✅ قيود محاسبية كاملة (AR/Revenue + Payment)
-- 
-- ⚠️ ممنوع منعاً باتاً:
-- - إنشاء قيود AR/Revenue للفواتير بحالة SENT
-- - إنشاء قيود Inventory/AP للفواتير بحالة RECEIVED
-- =============================================

-- 1. دالة منع القيود المحاسبية على الفواتير SENT/RECEIVED
CREATE OR REPLACE FUNCTION prevent_journal_on_sent_invoice()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status TEXT;
  bill_status TEXT;
BEGIN
  -- ✅ السماح بقيود COGS (للتوافق مع الأنظمة القديمة فقط)
  -- ⚠️ ملاحظة: COGS غير مستخدم في النمط الحالي (Cash Basis)
  IF NEW.reference_type = 'invoice_cogs' THEN
    RETURN NEW;
  END IF;

  -- ✅ السماح بقيود COGS العكسية (للمرتجعات)
  IF NEW.reference_type = 'invoice_cogs_reversal' THEN
    RETURN NEW;
  END IF;

  -- ❌ فواتير المبيعات - منع قيود الإيراد للفواتير SENT
  -- 📌 Cash Basis: الإيراد يُسجل عند الدفع فقط
  IF NEW.reference_type = 'invoice' AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO invoice_status FROM invoices WHERE id = NEW.reference_id;
    
    IF invoice_status = 'sent' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي (Cash Basis): لا يمكن إنشاء قيد إيراد لفاتورة مبيعات بحالة SENT. قيود الإيراد تُنشأ فقط عند الدفع (PAID)';
    END IF;
  END IF;

  -- ❌ فواتير الشراء - منع قيود المصروف للفواتير RECEIVED
  -- 📌 Cash Basis: المصروف يُسجل عند الدفع فقط
  IF NEW.reference_type = 'bill' AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO bill_status FROM bills WHERE id = NEW.reference_id;
    
    IF bill_status = 'received' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي (Cash Basis): لا يمكن إنشاء قيد مصروف لفاتورة شراء بحالة RECEIVED. القيود تُنشأ فقط عند الدفع (PAID)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. إعادة إنشاء الـ trigger
DROP TRIGGER IF EXISTS trg_prevent_journal_on_sent ON journal_entries;
CREATE TRIGGER trg_prevent_journal_on_sent
BEFORE INSERT ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_journal_on_sent_invoice();

-- =============================================
-- ملاحظات مهمة:
-- =============================================
-- 
-- ✅ النمط المحاسبي المعتمد: Cash Basis (أساس النقدية)
-- ✅ المرجع الأعلى: ACCOUNTING_PATTERN.md
-- 
-- 📌 القواعد الصارمة:
-- - Sent/Received: مخزون فقط، ❌ لا قيود محاسبية
-- - Paid: قيود محاسبية كاملة
-- 
-- ⚠️ أي محاولة لإنشاء قيود محاسبية للفواتير SENT/RECEIVED
--    سيتم رفضها تلقائياً من قاعدة البيانات
-- =============================================

-- 3. التحقق من التطبيق
DO $$
BEGIN
  RAISE NOTICE '✅ تم تفعيل حماية النمط المحاسبي (Cash Basis)';
  RAISE NOTICE '📌 ممنوع إنشاء قيود محاسبية للفواتير بحالة SENT/RECEIVED';
  RAISE NOTICE '📌 القيود المحاسبية تُنشأ عند الدفع فقط (PAID)';
  RAISE NOTICE '';
  RAISE NOTICE '📖 المرجع: ACCOUNTING_PATTERN.md';
END $$;

