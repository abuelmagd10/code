-- v3.74.318 — Correction: admin IS the general manager label in the UI
--
-- The owner pointed out that the user-management page already exposes
-- "مدير عام" — but it maps to role = 'admin', not 'general_manager'.
-- v3.74.317 stripped admin of write access on services, which broke
-- the very role he was trying to empower. This migration restores
-- admin's full access on services and cleans up the orphan
-- general_manager rows v3.74.317 inserted.
--
-- We keep the v3.74.317 constraint expansion + visibility function
-- change (general_manager is allowed and gets company scope) as
-- defense-in-depth — harmless if unused, useful if the project ever
-- needs a separate "general manager" role distinct from admin.
--
-- Final state on services after this migration:
--   owner             — full (implicit via visibility function)
--   admin             — full (= label "مدير عام" in the UI)
--   manager           — full (= label "مدير", branch-scoped)
--   accountant        — read only
--   booking_officer   — read only
--   store_manager / purchasing_officer / etc — unchanged

-- 1) admin regains full perms on services
UPDATE public.company_role_permissions
SET can_access = true, can_read = true,
    can_write  = true, can_update = true, can_delete = true
WHERE role = 'admin' AND resource = 'services';

-- 2) Any company missing an admin/services row gets one
INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT c.id, 'admin', 'services',
       true, true, true, true, true, false, ARRAY[]::TEXT[]
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_role_permissions crp
  WHERE crp.company_id = c.id
    AND crp.role       = 'admin'
    AND crp.resource   = 'services'
);

-- 3) Clean up the orphan general_manager rows from v3.74.317
DELETE FROM public.company_role_permissions
WHERE role = 'general_manager';

-- 4) Backfill: booking_officer on services (read-only) for any company
--    that has the role but is missing the services row. This guarantees
--    the role can open the services page to pick a service when creating
--    a booking, even on companies that joined the project before the
--    seed function existed.
INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT DISTINCT cm.company_id, 'booking_officer', 'services',
       true, true, false, false, false, false, ARRAY[]::TEXT[]
FROM public.company_members cm
WHERE cm.role = 'booking_officer'
  AND NOT EXISTS (
    SELECT 1 FROM public.company_role_permissions crp
    WHERE crp.company_id = cm.company_id
      AND crp.role       = 'booking_officer'
      AND crp.resource   = 'services'
  );
