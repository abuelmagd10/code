-- =============================================
-- FIX: حذف القيود المحاسبية من فواتير Sent
-- =============================================
-- 
-- ⚠️ نفذ هذا السكربت في Supabase SQL Editor
-- 
-- هذا السكربت يحذف القيود المحاسبية من فواتير Sent
-- لأن فواتير Sent يجب ألا يكون لها قيود (Cash Basis)
--
-- =============================================

-- 1. عرض القيود المراد حذفها
SELECT 
  i.invoice_number,
  i.status,
  i.total_amount,
  je.id as journal_entry_id,
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
-- 2. تعطيل Trigger مؤقتاً
-- =============================================
-- ملاحظة: الـ trigger اسمه trg_prevent_posted_journal_modification

ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;

-- =============================================
-- 3. حذف القيود
-- =============================================

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
-- 4. إعادة تفعيل Trigger
-- =============================================

ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;

-- =============================================
-- 5. التحقق من النتيجة
-- =============================================
SELECT 
  i.invoice_number,
  i.status,
  COUNT(je.id) as journal_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.invoice_number, i.status
HAVING COUNT(je.id) > 0;

-- النتيجة المتوقعة: 0 rows (لا فواتير Sent مع قيود)

-- =============================================
-- نهاية السكربت
-- =============================================

