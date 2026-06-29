-- v3.74.391 — Stricter, branch-aware RLS for suppliers.
--
-- Owner explicitly scoped who can add/edit/delete suppliers:
--   - Company-level (any branch, including suppliers with NULL branch):
--       owner, admin, general_manager
--   - Branch-level (only suppliers whose branch_id matches the
--     user's own company_members.branch_id):
--       manager, accountant, purchasing_officer
--
-- Everyone else (store_manager, booking_officer, manufacturing_officer,
-- hr_officer, staff, viewer) → no write access on suppliers, even
-- though the global can_modify_data (v3.74.390) might let them write
-- elsewhere.
--
-- The SELECT policy stays open to any company member so the existing
-- suppliers list / picker dropdowns keep working for everyone who
-- needs to see suppliers in invoices, purchase orders, etc.
--
-- Why a dedicated function instead of can_modify_data
--   can_modify_data is a global "can this user write at all on this
--   company" check used by 22 tables. The suppliers rule is stricter
--   (branch-scoped) AND involves the row's own branch_id, which a
--   parameterless company-level check can't express. So we keep
--   can_modify_data alone and override suppliers' policies with the
--   new can_manage_supplier_row(company_id, branch_id) helper.

CREATE OR REPLACE FUNCTION public.can_manage_supplier_row(
  p_company_id uuid,
  p_row_branch_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role           text;
  v_user_branch_id uuid;
BEGIN
  -- Short-circuit: companies.user_id is always allowed.
  IF EXISTS (
    SELECT 1 FROM companies c
     WHERE c.id = p_company_id AND c.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Resolve the caller's role + branch on this company.
  SELECT role, branch_id INTO v_role, v_user_branch_id
    FROM company_members
   WHERE company_id = p_company_id
     AND user_id    = auth.uid()
   LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Company-level roles: can write to any supplier on the company,
  -- including suppliers with NULL branch_id.
  IF v_role IN ('owner', 'admin', 'general_manager') THEN
    RETURN true;
  END IF;

  -- Branch-level roles: must have a branch assignment on company_
  -- members AND the row's branch must match. Suppliers with NULL
  -- branch_id are off-limits to branch-level users — only company-
  -- level roles can manage shared suppliers.
  IF v_role IN ('manager', 'accountant', 'purchasing_officer') THEN
    IF v_user_branch_id IS NULL THEN RETURN false; END IF;
    IF p_row_branch_id IS NULL THEN RETURN false; END IF;
    RETURN p_row_branch_id = v_user_branch_id;
  END IF;

  -- All other roles: read-only on suppliers.
  RETURN false;
END;
$function$;

COMMENT ON FUNCTION public.can_manage_supplier_row(uuid, uuid) IS
  'v3.74.391 - Owner-confirmed rule: company-level roles (owner/admin/general_manager) manage any supplier; branch-level roles (manager/accountant/purchasing_officer) only manage suppliers on their own branch.';

-- Replace suppliers DML policies. SELECT stays unchanged (any
-- company member can view).
DROP POLICY IF EXISTS suppliers_insert ON public.suppliers;
CREATE POLICY suppliers_insert
  ON public.suppliers
  FOR INSERT
  WITH CHECK (can_manage_supplier_row(company_id, branch_id));

DROP POLICY IF EXISTS suppliers_update ON public.suppliers;
CREATE POLICY suppliers_update
  ON public.suppliers
  FOR UPDATE
  USING      (can_manage_supplier_row(company_id, branch_id))
  WITH CHECK (can_manage_supplier_row(company_id, branch_id));

DROP POLICY IF EXISTS suppliers_delete ON public.suppliers;
CREATE POLICY suppliers_delete
  ON public.suppliers
  FOR DELETE
  USING (can_manage_supplier_row(company_id, branch_id));
