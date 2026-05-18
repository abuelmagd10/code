-- ============================================================
-- Migration: 20260518000200_add_shipments_permissions.sql
-- Fix: Shipments resource has no permission records, causing
--       [AUTHZ] No permission record found for resource: shipments
--
-- Adds shipments permissions for all relevant roles across
-- all existing companies (INSERT ... ON CONFLICT DO NOTHING).
-- ============================================================

-- Seed shipments permissions for a single company
CREATE OR REPLACE FUNCTION public.seed_shipments_permissions(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
  VALUES
    -- manager: full access
    (p_company_id, 'manager',       'shipments', true, true, true, true, true, false, ARRAY[]::TEXT[]),
    -- accountant: read-only (view shipment status on invoices)
    (p_company_id, 'accountant',    'shipments', true, true, false, false, false, false, ARRAY[]::TEXT[]),
    -- store_manager: read + write + update (manage shipments from warehouse)
    (p_company_id, 'store_manager', 'shipments', true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- staff: read-only
    (p_company_id, 'staff',         'shipments', true, true, false, false, false, false, ARRAY[]::TEXT[])
  ON CONFLICT (company_id, role, resource) DO NOTHING;
END;
$$;

-- Apply to all existing companies
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  FOR v_company_id IN
    SELECT id FROM public.companies
  LOOP
    PERFORM public.seed_shipments_permissions(v_company_id);
  END LOOP;
END;
$$;
