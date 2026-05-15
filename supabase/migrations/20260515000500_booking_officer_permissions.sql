-- ============================================================
-- Phase R6 — Booking Officer Default Permissions
-- ============================================================
-- تُضاف هذه الصلاحيات لأي شركة لديها عضو بدور booking_officer
-- بدون إزالة أي صلاحيات مخصصة مسبقاً (INSERT ... ON CONFLICT DO NOTHING)
-- ============================================================

-- دالة مساعدة تُدرج الصلاحية الافتراضية فقط إذا لم تكن موجودة
-- (تستخدمها الشركات الجديدة تلقائياً + يمكن تشغيلها يدوياً للشركات القديمة)
CREATE OR REPLACE FUNCTION public.seed_booking_officer_permissions(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
  VALUES
    -- الحجوزات: كل الصلاحيات
    (p_company_id, 'booking_officer', 'bookings',  true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- الخدمات: كل الصلاحيات (يُنشئ ويُعدّل خدمات فرعه)
    (p_company_id, 'booking_officer', 'services',  true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- العملاء: قراءة وكتابة
    (p_company_id, 'booking_officer', 'customers', true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- المدفوعات: قراءة وإنشاء (تسجيل دفعات الحجوزات)
    (p_company_id, 'booking_officer', 'payments',  true, true, true, false, false, false, ARRAY[]::TEXT[]),
    -- التقارير: قراءة فقط
    (p_company_id, 'booking_officer', 'reports',   true, true, false, false, false, false, ARRAY[]::TEXT[]),
    -- لوحة التحكم: وصول
    (p_company_id, 'booking_officer', 'dashboard', true, true, false, false, false, false, ARRAY[]::TEXT[])
  ON CONFLICT (company_id, role, resource) DO NOTHING;
END;
$$;

-- تشغيل تلقائي للشركات التي لديها booking_officer بالفعل ولا تملك صلاحيات له
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  FOR v_company_id IN
    SELECT DISTINCT cm.company_id
    FROM public.company_members cm
    WHERE cm.role = 'booking_officer'
    AND NOT EXISTS (
      SELECT 1 FROM public.company_role_permissions crp
      WHERE crp.company_id = cm.company_id
      AND crp.role = 'booking_officer'
    )
  LOOP
    PERFORM public.seed_booking_officer_permissions(v_company_id);
  END LOOP;
END;
$$;
