-- =============================================
-- FIX: حذف القيود المحاسبية من فواتير Sent (نسخة مبسطة)
-- =============================================
-- 
-- ⚠️ تحذير: نفذ هذا السكربت في Supabase SQL Editor
-- 
-- هذا السكربت يحذف القيود المحاسبية من فواتير Sent
-- لأن فواتير Sent يجب ألا يكون لها قيود (Cash Basis)
--
-- =============================================

-- 1. التحقق من القيود المراد حذفها
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.paid_amount,
  je.id as journal_entry_id,
  je.reference_type,
  je.entry_date,
  je.description,
  je.status as journal_status
FROM invoices i
INNER JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
ORDER BY i.invoice_number;

-- النتيجة المتوقعة: 16 rows

-- =============================================
-- 2. حذف القيود مباشرة
-- =============================================
-- ملاحظة: إذا كان هناك trigger يمنع الحذف، سيظهر خطأ
-- في هذه الحالة، استخدم السكربت fix-sent-invoices-manual.sql

DELETE FROM journal_entries
WHERE id IN (
  SELECT je.id
  FROM journal_entries je
  INNER JOIN invoices i ON i.id = je.reference_id
  WHERE je.reference_type = 'invoice'
    AND i.status = 'sent'
);

-- النتيجة المتوقعة: 16 rows deleted

-- =============================================
-- 3. التحقق من النتيجة
-- =============================================
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

-- النتيجة المتوقعة: 0 rows (لا فواتير Sent مع قيود)

-- =============================================
-- نهاية السكربت
-- =============================================

