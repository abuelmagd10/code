-- v3.74.317 — general_manager as a first-class role + final services scope
--
-- Owner's org model (clarified after v3.74.316):
--   owner            — المالك
--   general_manager  — مدير عام لجميع الفروع    (NEW, was code-only)
--   manager          — مدير فرع واحد            (existing)
-- Only these three create / edit / delete services. Everyone else is at
-- most read-only on services.
--
-- general_manager was already referenced in 15+ frontend files
-- (settings/users, sidebar, invoices, suppliers, etc.) for the
-- "can manage" gate, but the database had no entry for it: it wasn't in
-- the role CHECK constraints on company_members or company_role_
-- permissions, and the visibility function fell through to 'own'. This
-- migration closes that gap.

-- 1) Allow general_manager in the role CHECK constraints
ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_role_check;
ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_role_check CHECK (
    role IN ('owner','admin','manager','general_manager','accountant',
             'store_manager','staff','viewer','manufacturing_officer',
             'booking_officer','purchasing_officer','hr_officer')
  );

ALTER TABLE public.company_role_permissions
  DROP CONSTRAINT IF EXISTS company_role_permissions_role_check_v2;
ALTER TABLE public.company_role_permissions
  ADD CONSTRAINT company_role_permissions_role_check_v2 CHECK (
    role IN ('owner','admin','manager','general_manager','accountant',
             'store_manager','staff','viewer','manufacturing_officer',
             'booking_officer','purchasing_officer','hr_officer')
  );

-- 2) Visibility function: general_manager sees ALL branches (company scope)
CREATE OR REPLACE FUNCTION public.current_user_resource_visibility(p_company_id uuid, p_resource text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_role         text;
  v_is_owner     boolean;
  v_can_access   boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND user_id = auth.uid()
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN 'company';
  END IF;

  SELECT role INTO v_role
  FROM public.company_members
  WHERE user_id = auth.uid() AND company_id = p_company_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN 'none';
  END IF;

  -- v3.74.317: general_manager joins owner/admin at the company scope.
  -- A general manager is by definition responsible for every branch,
  -- so the data filter must be at the company level, not the branch.
  IF v_role IN ('owner', 'admin', 'general_manager') THEN
    RETURN 'company';
  END IF;

  SELECT can_access INTO v_can_access
  FROM public.company_role_permissions
  WHERE company_id = p_company_id
    AND role       = v_role
    AND resource   = p_resource
  LIMIT 1;

  IF v_can_access IS NOT TRUE THEN
    RETURN 'none';
  END IF;

  RETURN CASE
    WHEN v_role IN ('manager', 'accountant', 'supervisor', 'store_manager',
                    'manufacturing_officer', 'purchasing_officer', 'hr_officer')
      THEN 'branch'
    WHEN v_role = 'viewer' THEN 'company'
    ELSE 'own'
  END;
END;
$function$;

-- 3) Services: only owner (implicit) + general_manager + manager can write.
UPDATE public.company_role_permissions
SET can_write = false, can_update = false, can_delete = false
WHERE role IN ('admin','accountant') AND resource = 'services';

UPDATE public.company_role_permissions
SET can_access = true, can_read = true,
    can_write = true, can_update = true, can_delete = true
WHERE role = 'manager' AND resource = 'services';

UPDATE public.company_role_permissions
SET can_access = true, can_read = true,
    can_write = true, can_update = true, can_delete = true
WHERE role = 'general_manager' AND resource = 'services';

INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT c.id, 'general_manager', 'services',
       true, true, true, true, true, false, ARRAY[]::TEXT[]
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_role_permissions crp
  WHERE crp.company_id = c.id
    AND crp.role       = 'general_manager'
    AND crp.resource   = 'services'
);
