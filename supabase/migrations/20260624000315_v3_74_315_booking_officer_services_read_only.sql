-- v3.74.315 — Booking Officer: services are READ-ONLY
--
-- Owner clarified that booking_officer should not create / edit / delete
-- services. He only uses the existing services to book against. Creating
-- a new service is reserved for owner, general manager, and branch
-- manager.
--
-- v3.74.314 inadvertently kept the legacy "all true" defaults from the
-- 20260515000500 seed. This migration:
--   1) Replaces the seed function with the correct read-only spec.
--   2) Backfills existing booking_officer rows on the services resource.
--
-- The services page already gates the Add/Edit/Delete buttons via
-- canAction(supabase, "services", <action>), so flipping the permission
-- here automatically hides those affordances from the operator.

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
    (p_company_id, 'booking_officer', 'bookings',     true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    -- الخدمات: قراءة فقط (مسؤول الحجز يستخدم الخدمات الموجودة، لا ينشئها)
    (p_company_id, 'booking_officer', 'services',     true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'booking_officer', 'customers',    true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'booking_officer', 'sales_orders', true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'booking_officer', 'payments',     true, true, true,  false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'booking_officer', 'reports',      true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'booking_officer', 'dashboard',    true, true, false, false, false, false, ARRAY[]::TEXT[])
  ON CONFLICT (company_id, role, resource) DO NOTHING;
END;
$$;

-- Backfill: any existing booking_officer rows on services lose write/update/delete.
UPDATE public.company_role_permissions
SET
  can_write  = false,
  can_update = false,
  can_delete = false
WHERE role = 'booking_officer'
  AND resource = 'services';
