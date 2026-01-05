-- =============================================
-- فحص القيد Draft الوحيد
-- =============================================
-- 
-- هذا الاستعلام يفحص القيد Draft الوحيد
-- للتأكد من أنه إما قيد يدوي قيد الإنشاء (طبيعي)
-- أو يجب إكماله/حذفه
--
-- =============================================

-- تفاصيل القيد Draft
SELECT 
  je.id,
  je.company_id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description,
  je.status,
  je.created_at,
  je.updated_at,
  COUNT(jel.id) as lines_count,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'draft'
GROUP BY je.id, je.company_id, je.reference_type, je.reference_id, 
         je.entry_date, je.description, je.status, je.created_at, je.updated_at;

-- إذا كان القيد مرتبط بمستند، تحقق من حالة المستند
SELECT 
  je.id as journal_entry_id,
  je.reference_type,
  je.reference_id,
  CASE 
    WHEN je.reference_type = 'invoice' THEN 
      (SELECT status FROM invoices WHERE id = je.reference_id)
    WHEN je.reference_type = 'bill' THEN 
      (SELECT status FROM bills WHERE id = je.reference_id)
    ELSE NULL
  END as document_status
FROM journal_entries je
WHERE je.status = 'draft';

-- =============================================
-- التوصيات:
-- =============================================
-- 
-- 1. إذا كان القيد Draft قيد يدوي (reference_type = 'manual_entry'):
--    - هذا طبيعي - يمكن إكماله لاحقاً
--
-- 2. إذا كان القيد Draft مرتبط بمستند:
--    - يجب التحقق من حالة المستند
--    - إذا كان المستند Paid، يجب إكمال القيد
--    - إذا كان المستند Draft، يمكن حذف القيد
--
-- 3. إذا كان القيد Draft بدون سطور:
--    - يمكن حذفه بأمان
--
-- =============================================

