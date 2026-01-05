-- =============================================
-- FIX: حذف القيود المحاسبية من فواتير Sent
-- =============================================
-- 
-- هذا السكربت يحذف القيود المحاسبية من فواتير Sent
-- لأن فواتير Sent يجب ألا يكون لها قيود (Cash Basis)
--
-- ⚠️ تحذير: نفذ هذا السكربت فقط بعد:
-- 1. التحقق من أن الفواتير فعلاً Sent (غير مدفوعة)
-- 2. التحقق من أن القيود تم إنشاؤها بالخطأ
-- 3. حفظ نسخة احتياطية
--
-- =============================================

-- أولاً: عرض الفواتير المشكوك فيها
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.paid_amount,
  i.invoice_date,
  je.id as journal_entry_id,
  je.reference_type,
  je.entry_date as journal_date,
  je.description as journal_description,
  COUNT(jel.id) as lines_count
FROM invoices i
INNER JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status, i.total_amount, i.paid_amount, 
         i.invoice_date, je.id, je.reference_type, je.entry_date, je.description
ORDER BY i.invoice_number;

-- =============================================
-- ثانياً: حذف سطور القيود
-- =============================================
-- ⚠️ قم بتعليق هذا الجزء حتى تتحقق من النتائج أعلاه

/*
DELETE FROM journal_entry_lines
WHERE journal_entry_id IN (
  SELECT je.id
  FROM journal_entries je
  INNER JOIN invoices i ON i.id = je.reference_id
  WHERE je.reference_type = 'invoice'
    AND i.status = 'sent'
);
*/

-- =============================================
-- ثالثاً: حذف القيود
-- =============================================
-- ⚠️ قم بتعليق هذا الجزء حتى تتحقق من النتائج أعلاه

/*
DELETE FROM journal_entries
WHERE id IN (
  SELECT je.id
  FROM journal_entries je
  INNER JOIN invoices i ON i.id = je.reference_id
  WHERE je.reference_type = 'invoice'
    AND i.status = 'sent'
);
*/

-- =============================================
-- رابعاً: التحقق من النتيجة
-- =============================================
-- بعد الحذف، نفذ هذا الاستعلام للتأكد

/*
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(je.id) as journal_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(je.id) > 0;
*/

-- النتيجة المتوقعة: 0 rows (لا فواتير Sent مع قيود)

-- =============================================
-- نهاية السكربت
-- =============================================

