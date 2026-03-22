-- ==============================================================================
-- إشعارات الإدارة العليا لمرتجعات المشتريات: Fan-out إلى assigned_to_user
-- السبب: get_user_notifications يطابق assigned_to_role مع v_user_role بدقة،
-- فيفوت الإشعار إذا كان دور المستخدم في company_members مختلفاً (مثل gm) أو
-- إذا كان الإشعار موجهاً لدور لا يطابق صف المستخدم.
-- الحل: جلب user_id لكل الأعضاء ذوي الأدوار الإدارية عبر SECURITY DEFINER ثم
-- إنشاء إشعار لكل مستخدم بـ assigned_to_user (نفس آلية إشعار المنشئ).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_privileged_manager_user_ids(p_company_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT cm.user_id
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.role IN (
      'owner',
      'admin',
      'general_manager',
      'gm',
      'super_admin',
      'superadmin',
      'generalmanager'
    );
$$;

COMMENT ON FUNCTION public.get_privileged_manager_user_ids(uuid) IS
  'Returns distinct user IDs for company members with executive roles (for PR/bill management notifications).';

GRANT EXECUTE ON FUNCTION public.get_privileged_manager_user_ids(uuid) TO authenticated;
