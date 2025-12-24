-- =============================================
-- تحويل النظام إلى Accrual Basis COGS (نمط Zoho Books)
-- Enable Accrual Basis COGS (Zoho Books Pattern)
-- =============================================
-- 
-- هذا السكربت يعدل الـ trigger ليسمح بإنشاء قيود COGS
-- للفواتير بحالة SENT (عند التسليم) بدلاً من PAID (عند الدفع)
--
-- التغيير:
-- من: Cash Basis (قيود COGS عند الدفع)
-- إلى: Accrual Basis (قيود COGS عند الإرسال)
-- =============================================

-- 1. تعديل دالة منع القيود على الفواتير SENT
CREATE OR REPLACE FUNCTION prevent_journal_on_sent_invoice()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status TEXT;
  bill_status TEXT;
BEGIN
  -- ✅ السماح بقيود COGS للفواتير (Accrual Basis)
  -- COGS entries are allowed for invoices regardless of status
  IF NEW.reference_type = 'invoice_cogs' THEN
    RETURN NEW;
  END IF;

  -- ✅ السماح بقيود COGS العكسية (للمرتجعات)
  IF NEW.reference_type = 'invoice_cogs_reversal' THEN
    RETURN NEW;
  END IF;

  -- فواتير المبيعات - منع قيود الإيراد للفواتير SENT
  -- (الإيراد يُسجل عند الدفع فقط)
  IF NEW.reference_type = 'invoice' AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO invoice_status FROM invoices WHERE id = NEW.reference_id;
    
    IF invoice_status = 'sent' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء قيد إيراد لفاتورة مبيعات بحالة SENT. قيود الإيراد تُنشأ فقط عند الدفع (PAID)';
    END IF;
  END IF;

  -- فواتير الشراء - منع قيود المصروف للفواتير RECEIVED
  IF NEW.reference_type = 'bill' AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO bill_status FROM bills WHERE id = NEW.reference_id;
    
    IF bill_status = 'received' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء قيد مصروف لفاتورة شراء بحالة RECEIVED. القيود تُنشأ فقط عند الدفع (PAID)';
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
-- ✅ الآن يمكن إنشاء قيود COGS للفواتير بحالة SENT
-- ✅ هذا يطابق نمط Zoho Books (Accrual Accounting)
-- ✅ المخزون سينخفض عند إرسال الفاتورة (التسليم)
-- ✅ التكلفة ستُسجل في نفس وقت الإيراد
-- 
-- ⚠️ قيود الإيراد لا تزال تُنشأ عند الدفع (PAID)
-- ⚠️ هذا نمط هجين: Accrual للتكلفة، Cash للإيراد
-- 
-- للتحويل الكامل إلى Accrual Basis:
-- - يجب تعديل الدالة لتسمح بقيود الإيراد عند SENT
-- - يجب إنشاء قيود إيراد لجميع الفواتير SENT
-- =============================================

-- 3. التحقق من التطبيق
DO $$
BEGIN
  RAISE NOTICE '✅ تم تعديل النظام إلى Accrual Basis COGS';
  RAISE NOTICE '📌 الآن يمكن إنشاء قيود COGS للفواتير بحالة SENT';
  RAISE NOTICE '📌 هذا يطابق نمط Zoho Books للمحاسبة على أساس الاستحقاق';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 الخطوة التالية:';
  RAISE NOTICE '   npm run inventory:fix VitaSlims';
END $$;

