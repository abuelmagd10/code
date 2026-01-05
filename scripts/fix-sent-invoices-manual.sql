-- =============================================
-- FIX: حذف القيود المحاسبية من فواتير Sent
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
-- 2. التحقق من وجود Trigger
-- =============================================
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'journal_entries'
  AND trigger_name LIKE '%prevent%delete%'
ORDER BY trigger_name;

-- =============================================
-- 3. محاولة تعطيل Trigger (إن وجد)
-- =============================================
-- إذا كان الـ trigger موجوداً، نفذ هذا:
-- ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_delete_posted_journal;

-- إذا كان الـ trigger غير موجود، تخطى هذه الخطوة

-- =============================================
-- 4. حذف القيود مباشرة
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
-- 5. إعادة تفعيل Trigger (إن كان معطلاً)
-- =============================================
-- إذا كنت قد عطلت الـ trigger، نفذ هذا:
-- ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_delete_posted_journal;

-- =============================================
-- 5. التحقق من النتيجة
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

