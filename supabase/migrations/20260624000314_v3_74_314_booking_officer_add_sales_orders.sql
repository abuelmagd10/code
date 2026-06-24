-- v3.74.314 — Booking Officer: add sales_orders to default permissions
--
-- The owner wants the new booking_officer role to land on a familiar
-- workspace that mirrors the existing "staff" role. That means he needs
-- access to:
--   /customers       — already seeded in 20260515000500
--   /bookings        — already seeded
--   /services        — already seeded
--   /sales-orders    — NOT seeded yet  ← this migration adds it
--
-- The booking module will surface bookings as "أوامر الحجز" inside the
-- /sales-orders page in a follow-up version (v3.74.316). For that tab to
-- be reachable, the role must have access to /sales-orders. Bookings RLS
-- still scopes the data to "own" (created_by_user_id = auth.uid()) — this
-- migration only changes the page-access permission, not the row filter.

-- Replace the seed function so it knows about sales_orders too.
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
    (p_company_id, 'booking_officer', 'bookings',     true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- الخدمات: كل الصلاحيات
    (p_company_id, 'booking_officer', 'services',     true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- العملاء: قراءة وكتابة
    (p_company_id, 'booking_officer', 'customers',    true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- أوامر البيع: قراءة وكتابة (يرى صفحة /sales-orders ويفتح تاب "أوامر الحجز")
    (p_company_id, 'booking_officer', 'sales_orders', true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- المدفوعات: قراءة وإنشاء
    (p_company_id, 'booking_officer', 'payments',     true, true, true, false, false, false, ARRAY[]::TEXT[]),
    -- التقارير: قراءة فقط
    (p_company_id, 'booking_officer', 'reports',      true, true, false, false, false, false, ARRAY[]::TEXT[]),
    -- لوحة التحكم: وصول
    (p_company_id, 'booking_officer', 'dashboard',    true, true, false, false, false, false, ARRAY[]::TEXT[])
  ON CONFLICT (company_id, role, resource) DO NOTHING;
END;
$$;

-- Backfill: for every company that already has a booking_officer member
-- but is missing the sales_orders permission, add it now.
INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT DISTINCT
  cm.company_id, 'booking_officer', 'sales_orders',
  true, true, true, true, false, false, ARRAY[]::TEXT[]
FROM public.company_members cm
WHERE cm.role = 'booking_officer'
  AND NOT EXISTS (
    SELECT 1 FROM public.company_role_permissions crp
    WHERE crp.company_id = cm.company_id
      AND crp.role = 'booking_officer'
      AND crp.resource = 'sales_orders'
  )
ON CONFLICT (company_id, role, resource) DO NOTHING;
