-- v3.74.166 — Add purchase_returns to store_manager's default page list.
--
-- Background: store_manager is the warehouse-side approver for purchase
-- returns (confirm-delivery step). The owner-approval notification routes
-- the store_manager to /purchase-returns/{id} when they click it. But
-- purchase_returns was never in store_manager's default allowed_pages, so
-- the page guard either denied the page or sent them to a fallback route.
-- (Some existing companies had the row manually added — newly created
--  companies and the JS fallback were both missing it.)
--
-- This migration:
--   1. Rewrites seed_default_role_permissions to include the new row.
--   2. Backfills every existing company that doesn't already have it.

CREATE OR REPLACE FUNCTION public.seed_default_role_permissions(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.company_role_permissions
  WHERE company_id = p_company_id
    AND role IN ('staff', 'accountant', 'purchasing_officer', 'booking_officer',
                 'manufacturing_officer', 'store_manager', 'manager');

  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  VALUES
    (p_company_id, 'staff', 'customers',    true, true, true,  true,  true,  false),
    (p_company_id, 'staff', 'estimates',    true, true, true,  true,  true,  false),
    (p_company_id, 'staff', 'sales_orders', true, true, true,  true,  true,  false),
    (p_company_id, 'staff', 'inventory',    true, true, false, false, false, false);

  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  VALUES
    (p_company_id, 'accountant', 'dashboard',               true, true, false, false, false, false),
    (p_company_id, 'accountant', 'customers',               true, true, false, false, false, false),
    (p_company_id, 'accountant', 'invoices',                true, true, true,  true,  false, false),
    (p_company_id, 'accountant', 'sales_returns',           true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'sales_return_requests',   true, true, true,  true,  false, false),
    (p_company_id, 'accountant', 'customer_credits',        true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'bills',                   true, true, true,  true,  false, false),
    (p_company_id, 'accountant', 'purchase_returns',        true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'products',                true, true, false, false, false, false),
    (p_company_id, 'accountant', 'services',                true, true, false, false, false, false),
    (p_company_id, 'accountant', 'inventory',               true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'inventory_transfers',     true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'third_party_inventory',   true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'write_offs',              true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'dispatch_approvals',      true, true, false, false, false, false),
    (p_company_id, 'accountant', 'inventory_goods_receipt', true, true, false, false, false, false),
    (p_company_id, 'accountant', 'payments',                true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'expenses',                true, true, true,  true,  true,  false),
    (p_company_id, 'accountant', 'banking',                 true, true, true,  true,  true,  false);

  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  VALUES
    (p_company_id, 'purchasing_officer', 'suppliers',               true, true, true,  true,  true,  false),
    (p_company_id, 'purchasing_officer', 'purchase_orders',         true, true, true,  true,  true,  false),
    (p_company_id, 'purchasing_officer', 'inventory',               true, true, false, false, false, false),
    (p_company_id, 'purchasing_officer', 'dispatch_approvals',      true, true, false, false, false, false),
    (p_company_id, 'purchasing_officer', 'inventory_goods_receipt', true, true, false, false, false, false);

  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  VALUES
    (p_company_id, 'booking_officer', 'bookings',  true, true, true, true, true, false),
    (p_company_id, 'booking_officer', 'customers', true, true, true, true, true, false);

  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  VALUES
    (p_company_id, 'manufacturing_officer', 'manufacturing_boms', true, true, true, true, true, false),
    (p_company_id, 'manufacturing_officer', 'approvals',          true, true, true, true, false, false);

  -- 6. مسؤول المخزن - 8 pages (v3.74.166: added purchase_returns)
  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  VALUES
    (p_company_id, 'store_manager', 'inventory',               true, true, true,  true,  true,  false),
    (p_company_id, 'store_manager', 'inventory_transfers',     true, true, true,  true,  true,  false),
    (p_company_id, 'store_manager', 'third_party_inventory',   true, true, false, false, false, false),
    (p_company_id, 'store_manager', 'write_offs',              true, true, true,  true,  false, false),
    (p_company_id, 'store_manager', 'dispatch_approvals',      true, true, true,  true,  true,  false),
    (p_company_id, 'store_manager', 'inventory_goods_receipt', true, true, true,  true,  true,  false),
    (p_company_id, 'store_manager', 'sales_return_requests',   true, true, true,  true,  false, false), -- v3.74.14
    (p_company_id, 'store_manager', 'purchase_returns',        true, true, true,  true,  false, false); -- v3.74.166

  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  SELECT DISTINCT p_company_id, 'manager', resource, true, true, false, false, false, false
  FROM (VALUES
    ('customers'), ('estimates'), ('sales_orders'),
    ('dashboard'),
    ('invoices'), ('sales_returns'), ('sales_return_requests'),
    ('customer_credits'),
    ('bills'), ('purchase_returns'),
    ('products'), ('services'),
    ('inventory'), ('inventory_transfers'), ('third_party_inventory'),
    ('write_offs'), ('dispatch_approvals'), ('inventory_goods_receipt'),
    ('payments'), ('expenses'), ('banking'),
    ('suppliers'), ('purchase_orders'),
    ('bookings'),
    ('manufacturing_boms'), ('approvals')
  ) AS t(resource);
END;
$function$;

-- Backfill: every existing company whose store_manager doesn't already
-- have a purchase_returns row gets one with the same shape as the seed.
INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
SELECT DISTINCT c.id, 'store_manager', 'purchase_returns', true, true, true, true, false, false
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_role_permissions p
  WHERE p.company_id = c.id
    AND p.role = 'store_manager'
    AND p.resource = 'purchase_returns'
);
