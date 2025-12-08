-- =============================================
-- تحديث جدول العملاء لدعم العناوين الاحترافية
-- Professional Address Fields for Customers
-- =============================================

-- إضافة حقل المحافظة إذا لم يكن موجوداً
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'governorate'
  ) THEN
    ALTER TABLE customers ADD COLUMN governorate TEXT;
  END IF;
END $$;

-- إضافة حقل العنوان التفصيلي إذا لم يكن موجوداً
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'detailed_address'
  ) THEN
    ALTER TABLE customers ADD COLUMN detailed_address TEXT;
    -- نقل البيانات القديمة من address إلى detailed_address
    UPDATE customers SET detailed_address = address WHERE detailed_address IS NULL AND address IS NOT NULL;
  END IF;
END $$;

-- تعليق على الحقول الجديدة
COMMENT ON COLUMN customers.governorate IS 'المحافظة - Governorate/State';
COMMENT ON COLUMN customers.detailed_address IS 'العنوان التفصيلي (شارع، رقم مبنى، معلم) - Detailed Address';

-- =============================================
-- نفس التغييرات لجدول الموردين
-- Same changes for suppliers table
-- =============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'governorate'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN governorate TEXT;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'detailed_address'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN detailed_address TEXT;
    UPDATE suppliers SET detailed_address = address WHERE detailed_address IS NULL AND address IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN suppliers.governorate IS 'المحافظة - Governorate/State';
COMMENT ON COLUMN suppliers.detailed_address IS 'العنوان التفصيلي (شارع، رقم مبنى، معلم) - Detailed Address';

