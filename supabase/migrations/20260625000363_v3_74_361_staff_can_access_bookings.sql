-- v3.74.361 (hotfix2) — staff role gets bookings as an allowed page.
--
-- Symptom (owner, June 25 2026):
--   "Khaled Aglan" (role=staff) was the named staff on
--   BKG-2026-00001. Clicking the view-details button took him to
--   /bookings/[id] for a fraction of a second, then bounced him
--   right back to /sales-orders.
--
-- Root cause:
--   AppShell + RealtimeRouteGuard read getResourceFromPath, which
--   resolves /bookings/[id] to the 'bookings' resource. The staff
--   role had no row in company_role_permissions for 'bookings', so
--   canAccessPage returned false and the user was redirected to the
--   first allowed page (sales_orders).
--
-- Fix:
--   Add a 'bookings' permission row for every company that already
--   has a staff role configured. The booking detail page still
--   enforces row-level access via bookings RLS (own visibility),
--   so this only opens the *route*, not the data — a staff member
--   who is not assigned to the booking will still see "الحجز غير
--   موجود".

INSERT INTO public.company_role_permissions (
  company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access
)
SELECT DISTINCT company_id, 'staff', 'bookings', true, true, false, true, false, false
  FROM public.company_role_permissions
 WHERE role = 'staff'
ON CONFLICT (company_id, role, resource) DO NOTHING;
