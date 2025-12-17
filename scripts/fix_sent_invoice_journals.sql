-- =====================================================
-- 📌 تصحيح قيود الفواتير المرسلة (sent) للنمط الجديد
-- =====================================================
-- المشكلة: الفواتير في حالة sent لها قيود إيراد (النمط القديم)
-- الحل: تحويل القيود من (AR/Revenue) إلى (AR/Clearing)
-- =====================================================

-- 1️⃣ تحديث reference_type من 'invoice' إلى 'invoice_ar'
UPDATE journal_entries je
SET 
  reference_type = 'invoice_ar',
  description = REPLACE(description, 'فاتورة مبيعات', 'تثبيت ذمة فاتورة')
FROM invoices i
WHERE je.reference_id = i.id
  AND je.reference_type = 'invoice'
  AND i.status = 'sent'
  AND COALESCE(i.paid_amount, 0) = 0;

-- 2️⃣ تحديث سطور القيود: تبديل حساب المبيعات بحساب Clearing
-- للشركة 9c92a597-8c88-42a7-ad02-bd4a25b755ee
UPDATE journal_entry_lines jel
SET 
  account_id = '921c1237-3f58-4849-ab37-386ca03a810d', -- حساب التسوية المؤقتة
  description = 'حساب التسوية المؤقتة'
FROM journal_entries je
JOIN invoices i ON je.reference_id = i.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE jel.journal_entry_id = je.id
  AND je.reference_type = 'invoice_ar'
  AND i.status = 'sent'
  AND COALESCE(i.paid_amount, 0) = 0
  AND ca.sub_type = 'sales_revenue'
  AND i.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee';

-- للشركة bc41f91c-8fcb-4fbe-8430-c461f39cc5f9 (إن وجدت فواتير)
UPDATE journal_entry_lines jel
SET 
  account_id = '351508dd-6746-43f4-9077-621ee25b8002', -- حساب التسوية المؤقتة
  description = 'حساب التسوية المؤقتة'
FROM journal_entries je
JOIN invoices i ON je.reference_id = i.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE jel.journal_entry_id = je.id
  AND je.reference_type = 'invoice_ar'
  AND i.status = 'sent'
  AND COALESCE(i.paid_amount, 0) = 0
  AND ca.sub_type = 'sales_revenue'
  AND i.company_id = 'bc41f91c-8fcb-4fbe-8430-c461f39cc5f9';

-- 3️⃣ تحديث وصف سطر الذمم المدينة
UPDATE journal_entry_lines jel
SET description = 'الذمم المدينة - تثبيت الذمة'
FROM journal_entries je
JOIN invoices i ON je.reference_id = i.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE jel.journal_entry_id = je.id
  AND je.reference_type = 'invoice_ar'
  AND i.status = 'sent'
  AND COALESCE(i.paid_amount, 0) = 0
  AND ca.sub_type = 'accounts_receivable';

-- =====================================================
-- 📊 التحقق من النتائج
-- =====================================================
-- SELECT je.id, je.reference_type, je.description, i.invoice_number, i.status
-- FROM journal_entries je
-- JOIN invoices i ON je.reference_id = i.id
-- WHERE i.status = 'sent' AND COALESCE(i.paid_amount, 0) = 0
-- ORDER BY i.created_at DESC;

