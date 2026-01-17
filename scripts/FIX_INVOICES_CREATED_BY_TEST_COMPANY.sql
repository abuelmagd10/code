-- إصلاح created_by_user_id للفواتير في شركة تست
-- نفذ هذا SQL في Supabase SQL Editor بعد التحقق من البيانات

-- ⚠️ تحذير: استبدل 'f0ffc062-1e6e-4324-8be4-f5052e881a67' بـ company_id الفعلي لشركة تست

-- =====================================================
-- تعطيل الـ triggers مؤقتاً للسماح بالتعديل
-- (محاولة تعطيل جميع الـ triggers المحتملة)
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
-- 0. تحديث created_by_user_id لأوامر البيع أولاً (إذا كانت مفقودة)
-- استخدام أول owner/admin في الشركة
-- =====================================================
UPDATE sales_orders so
SET created_by_user_id = (
  SELECT cm.user_id 
  FROM company_members cm
  WHERE cm.company_id = so.company_id 
    AND cm.role IN ('owner', 'admin')
  ORDER BY cm.role, cm.user_id
  LIMIT 1
)
WHERE so.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND so.created_by_user_id IS NULL;

-- =====================================================
-- 1. تحديث created_by_user_id للفواتير من أوامر البيع
-- =====================================================
UPDATE invoices i
SET created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND i.created_by_user_id IS NULL
  AND so.created_by_user_id IS NOT NULL;

-- =====================================================
-- 2. تحديث created_by_user_id للفواتير المستقلة (بدون sales_order_id)
-- استخدام أول owner/admin في الشركة
-- =====================================================
UPDATE invoices i
SET created_by_user_id = (
  SELECT cm.user_id 
  FROM company_members cm
  WHERE cm.company_id = i.company_id 
    AND cm.role IN ('owner', 'admin')
  ORDER BY cm.role, cm.user_id
  LIMIT 1
)
WHERE i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND i.created_by_user_id IS NULL
  AND i.sales_order_id IS NULL;

-- =====================================================
-- إعادة تفعيل الـ triggers بعد الانتهاء من الإصلاح
-- (إعادة تفعيل جميع الـ triggers المحتملة)
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
-- 3. التحقق من النتائج بعد الإصلاح
-- =====================================================
SELECT 
  'After Fix' as status,
  COUNT(*) as total_invoices,
  COUNT(created_by_user_id) as with_created_by,
  COUNT(*) - COUNT(created_by_user_id) as without_created_by,
  ROUND(COUNT(created_by_user_id)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as created_by_percentage
FROM invoices
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'; -- استبدل بـ company_id الفعلي

-- عرض الفواتير التي لا تزال بدون created_by_user_id (إن وجدت)
SELECT 
  id,
  invoice_number,
  status,
  created_at,
  sales_order_id
FROM invoices
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND created_by_user_id IS NULL
ORDER BY created_at DESC;
