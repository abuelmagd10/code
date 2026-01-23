-- =====================================================
-- 🔧 إصلاح مشكلة أرشفة الإشعارات
-- =====================================================
-- المشكلة: دالة get_user_notifications تستبعد المؤرشفة دائماً
-- حتى لو طلب المستخدم status = 'archived'
-- =====================================================

-- ✅ تحديث دالة get_user_notifications لدعم المؤرشفة
-- ⚠️ يجب حذف الدالة أولاً لأننا نغير المنطق
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID, UUID, UUID, VARCHAR, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID, UUID, UUID, VARCHAR);
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS get_user_notifications(UUID, UUID);

-- ✅ إعادة إنشاء الدالة مع إصلاح منطق الأرشيف
-- ملاحظة: البنية تطابق fix_get_user_notifications.sql
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT NULL,
  -- ✅ المعاملات الجديدة (اختيارية)
  p_severity TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  reference_type VARCHAR(50),
  reference_id UUID,
  title VARCHAR(255),
  message TEXT,
  priority VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMPTZ,
  branch_name TEXT,        -- ✅ TEXT (لأن branches.name هو TEXT)
  warehouse_name VARCHAR(255),
  -- ✅ إرجاع الحقول الجديدة
  severity TEXT,
  category TEXT,
  event_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
  -- ✅ جلب دور المستخدم في الشركة
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    n.id,
    n.reference_type,
    n.reference_id,
    n.title,
    n.message,
    n.priority,
    n.status,
    n.created_at,
    b.name AS branch_name,
    w.name AS warehouse_name,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  WHERE n.company_id = p_company_id
    AND (n.assigned_to_user = p_user_id OR n.assigned_to_user IS NULL)
    AND (
      n.assigned_to_role = v_user_role 
      OR n.assigned_to_role IS NULL
      OR v_user_role IS NULL
    )
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    AND (p_status IS NULL OR n.status = p_status)
    -- ✅ إصلاح: إذا كان المستخدم يطلب المؤرشفة، نعرضها
    -- إذا لم يطلب المؤرشفة، نستبعدها (السلوك الافتراضي)
    AND (p_status = 'archived' OR n.status != 'archived')
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    -- ✅ فلترة حسب severity و category (مع دعم NULL للأعمدة القديمة)
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
  ORDER BY
    CASE n.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    n.created_at DESC;
END;
$$;

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم إصلاح مشكلة أرشفة الإشعارات - يمكن الآن عرض المؤرشفة عند اختيار فلتر Archived' AS status;
