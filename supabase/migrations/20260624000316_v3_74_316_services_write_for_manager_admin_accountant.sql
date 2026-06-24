-- v3.74.316 — Services: write permission for manager / admin / accountant
--
-- Owner picked the roles that should be able to create / edit / delete
-- services. Owner is always full (resolved by the visibility function),
-- and these three roles need explicit write permission. store_manager is
-- intentionally left without any services access — he handles the
-- warehouse, not the service catalog.
--
-- Two-step approach:
--   1) UPDATE any existing row for these roles + 'services' resource.
--   2) INSERT a fresh row for any company that doesn't have one yet
--      (e.g. admin wasn't seeded on legacy companies).
--
-- The services page reads permissions live via canAction(), so flipping
-- the flags here immediately enables the Add/Edit/Delete buttons for
-- those roles.

UPDATE public.company_role_permissions
SET
  can_access = true,
  can_read   = true,
  can_write  = true,
  can_update = true,
  can_delete = true
WHERE role     IN ('manager','admin','accountant')
  AND resource = 'services';

INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT DISTINCT c.id, r.role, 'services',
       true, true, true, true, true, false, ARRAY[]::TEXT[]
FROM public.companies c
CROSS JOIN (VALUES ('manager'), ('admin'), ('accountant')) r(role)
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_role_permissions crp
  WHERE crp.company_id = c.id
    AND crp.role       = r.role
    AND crp.resource   = 'services'
);
