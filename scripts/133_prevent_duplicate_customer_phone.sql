-- ============================================
-- منع تكرار رقم التليفون للعملاء
-- Prevent Duplicate Customer Phone Numbers
-- ============================================
-- هذا السكريبت يضيف trigger لمنع إنشاء عميل بنفس رقم التليفون
-- في نفس الشركة (بعد تطبيع رقم التليفون)

-- دالة تطبيع رقم التليفون (مطابقة للكود في phone-utils.ts)
CREATE OR REPLACE FUNCTION normalize_phone_number(phone TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
  arabic_nums TEXT[] := ARRAY['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  hindi_nums TEXT[] := ARRAY['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  i INTEGER;
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN '';
  END IF;

  normalized := phone;

  -- تحويل الأرقام العربية إلى إنجليزية
  FOR i IN 0..9 LOOP
    normalized := REPLACE(normalized, arabic_nums[i + 1], i::TEXT);
  END LOOP;

  -- تحويل الأرقام الهندية إلى إنجليزية
  FOR i IN 0..9 LOOP
    normalized := REPLACE(normalized, hindi_nums[i + 1], i::TEXT);
  END LOOP;

  -- إزالة المسافات والأحرف غير الرقمية (ما عدا + في البداية)
  normalized := REGEXP_REPLACE(normalized, '[\s\-\(\)]', '', 'g');

  -- معالجة أرقام الهواتف المصرية
  IF normalized LIKE '002%' THEN
    normalized := SUBSTRING(normalized FROM 4);
  ELSIF normalized LIKE '02%' AND LENGTH(normalized) > 10 THEN
    normalized := SUBSTRING(normalized FROM 3);
  ELSIF normalized LIKE '2%' AND LENGTH(normalized) = 12 THEN
    normalized := SUBSTRING(normalized FROM 2);
  END IF;

  -- التأكد من أن الأرقام المصرية تبدأ بـ 0
  IF LENGTH(normalized) = 10 AND normalized LIKE '1%' THEN
    normalized := '0' || normalized;
  END IF;

  RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- دالة التحقق من تكرار رقم التليفون
CREATE OR REPLACE FUNCTION check_duplicate_customer_phone()
RETURNS TRIGGER AS $$
DECLARE
  normalized_new_phone TEXT;
  existing_customer RECORD;
BEGIN
  -- إذا لم يكن هناك رقم تليفون، لا حاجة للتحقق
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;

  -- تطبيع رقم التليفون الجديد
  normalized_new_phone := normalize_phone_number(NEW.phone);

  -- إذا كان الرقم فارغاً بعد التطبيع، لا حاجة للتحقق
  IF normalized_new_phone = '' THEN
    RETURN NEW;
  END IF;

  -- البحث عن عميل موجود بنفس رقم التليفون (بعد التطبيع) في نفس الشركة
  SELECT id, name, phone INTO existing_customer
  FROM customers
  WHERE company_id = NEW.company_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID) -- استثناء السجل الحالي عند التحديث
    AND phone IS NOT NULL
    AND phone != ''
    AND normalize_phone_number(phone) = normalized_new_phone
  LIMIT 1;

  -- إذا وُجد عميل بنفس رقم التليفون، رفض العملية
  IF existing_customer IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE: %', existing_customer.name
      USING HINT = format('Phone number %s is already used by customer: %s', NEW.phone, existing_customer.name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء Trigger لمنع التكرار عند الإدخال والتحديث
DROP TRIGGER IF EXISTS trg_prevent_duplicate_customer_phone ON customers;
CREATE TRIGGER trg_prevent_duplicate_customer_phone
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_customer_phone();

-- ============================================
-- ملاحظات:
-- ============================================
-- 1. هذا الـ trigger يتحقق من تكرار رقم التليفون في نفس الشركة فقط
-- 2. يتم تطبيع رقم التليفون قبل المقارنة (إزالة المسافات والأحرف الخاصة)
-- 3. عند التحديث، يتم استثناء السجل الحالي من التحقق
-- 4. إذا وُجد تكرار، يتم رفض العملية مع رسالة خطأ واضحة
