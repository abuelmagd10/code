-- ============================================================
-- إضافة حقول حالة الاستلام وسبب الرفض لجدول bills
-- ============================================================

-- إضافة عمود receipt_status
ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS receipt_status TEXT DEFAULT NULL
CHECK (receipt_status IN ('pending', 'received', 'rejected'));

-- إضافة عمود receipt_rejection_reason
ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS receipt_rejection_reason TEXT DEFAULT NULL;

-- إضافة فهرس لتحسين الاستعلامات
CREATE INDEX IF NOT EXISTS idx_bills_receipt_status 
ON public.bills(receipt_status) 
WHERE receipt_status IS NOT NULL;

-- تعليق على الأعمدة
COMMENT ON COLUMN public.bills.receipt_status IS 
  'حالة اعتماد الاستلام: pending (في الانتظار), received (تم الاستلام), rejected (مرفوض)';

COMMENT ON COLUMN public.bills.receipt_rejection_reason IS 
  'سبب رفض اعتماد الاستلام من مسؤول المخزن';
