-- =====================================================================
-- v3.74.581 — Reports access matrix (owner decisions)
-- (applied to production via Supabase MCP on 2026-07-08; mirrored here)
--
--   * Operational roles get resource 'reports' (branch-scoped
--     server-side via buildBranchFilter; owner/admin/GM company-wide)
--   * NEW resource 'financial_reports': top management ONLY
--     (owner/admin/general_manager). Accountant explicitly EXCLUDED
--     per owner decision.
--   * Seeded for all existing companies + auto-seed for new ones.
--   NOTE: 'warehouse_manager' is not a valid company_role_permissions
--   role (check constraint) — the warehouse role key is store_manager.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seed_reports_access_v581(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'general_manager','manager','accountant','store_manager',
    'purchasing_officer','booking_officer','manufacturing_officer'
  ] LOOP
    INSERT INTO public.company_role_permissions
      (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
    VALUES (p_company_id, v_role, 'reports', true, true, false, false, false, false, '{}')
    ON CONFLICT (company_id, role, resource) DO UPDATE
      SET can_access = true, can_read = true;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['owner','admin','general_manager'] LOOP
    INSERT INTO public.company_role_permissions
      (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
    VALUES (p_company_id, v_role, 'financial_reports', true, true, false, false, false, false, '{}')
    ON CONFLICT (company_id, role, resource) DO UPDATE
      SET can_access = true, can_read = true;
  END LOOP;
END;
$$;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_reports_access_v581(c.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_auto_seed_role_permissions()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  perform public.seed_default_role_permissions(new.id);
  -- v3.74.508 add-on grants
  perform public.seed_purchasing_officer_returns_permissions(new.id);
  -- v3.74.581 reports access matrix
  perform public.seed_reports_access_v581(new.id);
  return new;
end;
$$;
