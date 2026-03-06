-- =============================================
-- Add Customer Snapshot Fields to Invoices
-- إضافة حقول نسخة بيانات العميل في الفواتير
-- =============================================
-- 
-- الهدف: حفظ نسخة من بيانات العميل وقت إنشاء/إرسال الفاتورة
-- لمنع تغيير البيانات التاريخية عند تعديل بيانات العميل لاحقاً
--
-- تاريخ الإنشاء: 2024
-- الأولوية: عالية (مشكلة تاريخية وقانونية)
--
-- ✅ جاهز للنسخ واللصق مباشرة في Supabase SQL Editor
-- =============================================

-- =============================================
-- 1️⃣ إضافة حقول Snapshot
-- =============================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_email_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_address_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_city_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_country_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_tax_id_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_governorate_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_detailed_address_snapshot TEXT;

-- =============================================
-- 2️⃣ إضافة Index للبحث السريع
-- =============================================

CREATE INDEX IF NOT EXISTS idx_invoices_customer_name_snapshot 
  ON invoices(customer_name_snapshot) 
  WHERE customer_name_snapshot IS NOT NULL;

-- =============================================
-- 3️⃣ إضافة Comments للتوثيق
-- =============================================

COMMENT ON COLUMN invoices.customer_name_snapshot IS 'نسخة من اسم العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_email_snapshot IS 'نسخة من بريد العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_phone_snapshot IS 'نسخة من هاتف العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_address_snapshot IS 'نسخة من عنوان العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_city_snapshot IS 'نسخة من مدينة العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_country_snapshot IS 'نسخة من دولة العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_tax_id_snapshot IS 'نسخة من الرقم الضريبي للعميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_governorate_snapshot IS 'نسخة من محافظة العميل وقت إنشاء/إرسال الفاتورة';
COMMENT ON COLUMN invoices.customer_detailed_address_snapshot IS 'نسخة من العنوان التفصيلي للعميل وقت إنشاء/إرسال الفاتورة';

-- =============================================
-- 4️⃣ ملء Snapshot للفواتير الموجودة (Backfill)
-- =============================================
-- 
-- ملاحظة: هذا يملأ Snapshot من بيانات العميل الحالية
-- قد لا تكون دقيقة 100% إذا تم تغيير بيانات العميل بعد إنشاء الفاتورة
-- لكنها أفضل من لا شيء
--
-- ⚠️ تحديث الفواتير بشكل فردي مع التحقق من governance scope
-- لأن trigger check_governance_scope() يتحقق من governance حتى عند UPDATE

DO $$
DECLARE
  invoice_rec RECORD;
  updated_count INTEGER := 0;
  skipped_count INTEGER := 0;
  error_count INTEGER := 0;
BEGIN
  -- تحديث الفواتير بشكل فردي مع التحقق من governance scope
  FOR invoice_rec IN 
    SELECT i.id, i.company_id, i.branch_id, i.customer_id, c.name, c.email, c.phone, c.address, c.city, c.country, c.tax_id, c.governorate, c.detailed_address
    FROM invoices i
    INNER JOIN customers c ON i.customer_id = c.id
    WHERE (i.customer_name_snapshot IS NULL OR i.customer_address_snapshot IS NULL)
      AND i.company_id = c.company_id
  LOOP
    BEGIN
      -- التحقق من governance scope قبل التحديث
      -- إذا كان branch_id موجوداً، يجب أن ينتمي للشركة
      IF invoice_rec.branch_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM branches 
          WHERE id = invoice_rec.branch_id 
          AND company_id = invoice_rec.company_id
        ) THEN
          -- تخطي هذه الفاتورة (governance scope غير صحيح)
          skipped_count := skipped_count + 1;
          CONTINUE;
        END IF;
      END IF;
      
      -- تحديث Snapshot للفاتورة
      UPDATE invoices
      SET 
        customer_name_snapshot = COALESCE(customer_name_snapshot, invoice_rec.name),
        customer_email_snapshot = COALESCE(customer_email_snapshot, invoice_rec.email),
        customer_phone_snapshot = COALESCE(customer_phone_snapshot, invoice_rec.phone),
        customer_address_snapshot = COALESCE(customer_address_snapshot, invoice_rec.address),
        customer_city_snapshot = COALESCE(customer_city_snapshot, invoice_rec.city),
        customer_country_snapshot = COALESCE(customer_country_snapshot, invoice_rec.country),
        customer_tax_id_snapshot = COALESCE(customer_tax_id_snapshot, invoice_rec.tax_id),
        customer_governorate_snapshot = COALESCE(customer_governorate_snapshot, invoice_rec.governorate),
        customer_detailed_address_snapshot = COALESCE(customer_detailed_address_snapshot, invoice_rec.detailed_address)
      WHERE id = invoice_rec.id;
      
      updated_count := updated_count + 1;
      
      -- طباعة تقدم كل 100 فاتورة
      IF updated_count % 100 = 0 THEN
        RAISE NOTICE '✅ تم تحديث % فاتورة حتى الآن...', updated_count;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        -- في حالة الخطأ، تسجيل وتخطي هذه الفاتورة
        error_count := error_count + 1;
        RAISE NOTICE '⚠️ خطأ في تحديث فاتورة %: %', invoice_rec.id, SQLERRM;
        CONTINUE;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم ملء Snapshot للفواتير الموجودة بنجاح';
  RAISE NOTICE '   - تم التحديث: % فاتورة', updated_count;
  RAISE NOTICE '   - تم التخطي: % فاتورة (governance scope)', skipped_count;
  RAISE NOTICE '   - أخطاء: % فاتورة', error_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ حدث خطأ عام أثناء ملء Snapshot: %', SQLERRM;
    RAISE;
END $$;

-- =============================================
-- 5️⃣ التحقق من النتائج
-- =============================================

DO $$
DECLARE
  total_invoices INTEGER;
  filled_snapshots INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_invoices FROM invoices;
  SELECT COUNT(*) INTO filled_snapshots 
  FROM invoices 
  WHERE customer_name_snapshot IS NOT NULL;
  
  RAISE NOTICE '✅ إجمالي الفواتير: %', total_invoices;
  RAISE NOTICE '✅ الفواتير التي تحتوي على Snapshot: %', filled_snapshots;
  RAISE NOTICE '✅ النسبة: %%%', ROUND((filled_snapshots::DECIMAL / NULLIF(total_invoices, 0) * 100)::NUMERIC, 2);
END $$;

-- =============================================
-- ✅ اكتمل التنفيذ
-- =============================================
