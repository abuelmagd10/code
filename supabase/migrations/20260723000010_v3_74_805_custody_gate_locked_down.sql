-- ============================================================================
-- v3.74.805 — قفل بوابة العهدة (رصدها فاحص الأمن نفسه)
--
-- The integrity board flagged its FIRST real security finding since going
-- clean: ic_anon_reachable_readers caught booking_mandatory_custody_gate
-- (born in v3.74.802) — SECURITY DEFINER with Postgres's default PUBLIC
-- execute, company-scoped reads, no caller check. Anon could probe booking
-- custody composition. The checker infrastructure proved itself.
--
-- Fix: EXECUTE revoked from PUBLIC/anon (granted to authenticated only),
-- and assert_company_access_by_row('bookings', ...) added inside — the
-- established defence-in-depth pattern. Verified after: the checker
-- reports ZERO anon-reachable readers again.
--
-- Companion TS fixes in the same release:
--   - the booking-completed notification for the ACCOUNTANT now references
--     the INVOICE (his workspace) — referencing the booking routed him to
--     a page outside his role and bounced him to the dashboard;
--   - the invoice-list delivery chip prefers warehouse_status (the
--     authoritative dispatch state) over approval_status, which sits at
--     its 'pending' default on booking-born invoices and showed
--     «بانتظار اعتماد التسليم» on an approved invoice.
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.booking_mandatory_custody_gate(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- v3.74.805 — caller must belong to the booking's company.
  PERFORM public.assert_company_access_by_row('bookings', p_booking_id);

  RETURN (
    WITH bkg AS (
      SELECT b.id, b.company_id, s.product_catalog_id
      FROM public.bookings b
      JOIN public.services s ON s.id = b.service_id
      WHERE b.id = p_booking_id
    ),
    required_items AS (
      SELECT pbi.id AS bundle_item_id, p.name AS product_name
      FROM bkg
      JOIN public.product_bundle_items pbi
        ON pbi.parent_product_id = bkg.product_catalog_id
       AND pbi.company_id = bkg.company_id
      JOIN public.products p ON p.id = pbi.child_product_id
      WHERE COALESCE(pbi.is_optional, false) = false
      UNION
      SELECT pbi.id, p.name
      FROM bkg
      JOIN public.booking_bundle_selections bbs ON bbs.booking_id = bkg.id
      JOIN public.product_bundle_items pbi ON pbi.id = bbs.bundle_item_id
      JOIN public.products p ON p.id = pbi.child_product_id
    ),
    missing AS (
      SELECT m.product_name
      FROM required_items m
      WHERE NOT EXISTS (
        SELECT 1 FROM public.booking_stock_withdrawals w
        WHERE w.booking_id = p_booking_id
          AND w.bundle_item_id = m.bundle_item_id
          AND w.status = 'approved'
      )
    )
    SELECT jsonb_build_object(
      'ready',   NOT EXISTS (SELECT 1 FROM missing),
      'missing', COALESCE((SELECT jsonb_agg(product_name) FROM missing), '[]'::jsonb)
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) TO authenticated;
