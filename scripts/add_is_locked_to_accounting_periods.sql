-- =============================================
-- إضافة عمود is_locked إلى accounting_periods
-- Add is_locked column to accounting_periods for Period Locking
-- =============================================

BEGIN;

-- إضافة العمود إذا لم يكن موجوداً
ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT true;

-- تحديث الفترات المغلقة لتكون is_locked = true
UPDATE accounting_periods
SET is_locked = true
WHERE status IN ('closed', 'locked')
  AND (is_locked IS NULL OR is_locked = false);

-- تحديث الفترات المفتوحة لتكون is_locked = false
UPDATE accounting_periods
SET is_locked = false
WHERE status = 'open'
  AND (is_locked IS NULL OR is_locked = true);

-- تعليق على العمود
COMMENT ON COLUMN accounting_periods.is_locked IS 
  'قفل الفترة المحاسبية - يمنع أي تعديل محاسبي بعد الإقفال';

COMMIT;
