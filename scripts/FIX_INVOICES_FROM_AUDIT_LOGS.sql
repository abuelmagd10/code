-- إصلاح created_by_user_id للفواتير بناءً على audit_logs
-- هذا السكربت يستخدم audit_logs لتحديد منشئ الفاتورة الفعلي

-- ⚠️ تحذير: استبدل 'f0ffc062-1e6e-4324-8be4-f5052e881a67' بـ company_id الفعلي

-- =====================================================
-- تعطيل الـ triggers مؤقتاً للسماح بالتعديل
-- =====================================================
DO $$
BEGIN
  -- محاولة تعطيل prevent_paid_invoice_modification_trigger
  BEGIN
    ALTER TABLE invoices DISABLE TRIGGER prevent_paid_invoice_modification_trigger;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- الـ trigger غير موجود، تجاهل
  END;

  -- محاولة تعطيل trg_prevent_paid_invoice_modification
  BEGIN
    ALTER TABLE invoices DISABLE TRIGGER trg_prevent_paid_invoice_modification;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- الـ trigger غير موجود، تجاهل
  END;
END $$;

-- =====================================================
-- 1. تحديث created_by_user_id للفواتير من audit_logs
-- =====================================================
UPDATE invoices i
SET created_by_user_id = al.user_id
FROM audit_logs al
WHERE al.target_table = 'invoices'
  AND al.action = 'INSERT'
  AND al.record_id = i.id
  AND i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND i.created_by_user_id IS DISTINCT FROM al.user_id; -- تحديث فقط إذا كانت مختلفة

-- =====================================================
-- 2. تحديث created_by_user_id لأوامر البيع المرتبطة من audit_logs
-- (إذا كانت الفاتورة تم إنشاؤها من أمر بيع)
-- =====================================================
UPDATE sales_orders so
SET created_by_user_id = i.created_by_user_id
FROM invoices i
WHERE i.sales_order_id = so.id
  AND i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND i.created_by_user_id IS NOT NULL
  AND (so.created_by_user_id IS NULL OR so.created_by_user_id IS DISTINCT FROM i.created_by_user_id);

-- =====================================================
-- إعادة تفعيل الـ triggers بعد الانتهاء من الإصلاح
-- =====================================================
DO $$
BEGIN
  -- محاولة إعادة تفعيل prevent_paid_invoice_modification_trigger
  BEGIN
    ALTER TABLE invoices ENABLE TRIGGER prevent_paid_invoice_modification_trigger;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- الـ trigger غير موجود، تجاهل
  END;

  -- محاولة إعادة تفعيل trg_prevent_paid_invoice_modification
  BEGIN
    ALTER TABLE invoices ENABLE TRIGGER trg_prevent_paid_invoice_modification;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- الـ trigger غير موجود، تجاهل
  END;
END $$;

-- =====================================================
-- التحقق من النتائج بعد الإصلاح
-- =====================================================
SELECT 
  'After Fix from Audit Logs' as status,
  COUNT(*) as total_invoices,
  COUNT(created_by_user_id) as with_created_by,
  COUNT(*) - COUNT(created_by_user_id) as without_created_by,
  ROUND(COUNT(created_by_user_id)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as created_by_percentage
FROM invoices
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'; -- استبدل بـ company_id الفعلي

-- عرض الفواتير مع created_by_user_id المحدث
SELECT 
  i.id,
  i.invoice_number,
  i.created_by_user_id,
  up.display_name as creator_name,
  al.user_id as audit_log_user_id,
  up_audit.display_name as audit_log_creator_name,
  CASE 
    WHEN i.created_by_user_id = al.user_id THEN '✅ متطابق'
    ELSE '❌ غير متطابق'
  END as match_status
FROM invoices i
LEFT JOIN audit_logs al ON al.target_table = 'invoices' 
  AND al.action = 'INSERT' 
  AND al.record_id = i.id
LEFT JOIN user_profiles up ON i.created_by_user_id = up.user_id
LEFT JOIN user_profiles up_audit ON al.user_id = up_audit.user_id
WHERE i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
ORDER BY i.created_at DESC;
