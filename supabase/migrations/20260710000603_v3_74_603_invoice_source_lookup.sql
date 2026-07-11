-- =====================================================================
-- v3.74.603 — get_invoice_source(): RLS-proof source-document lookup
-- (applied to production via Supabase MCP on 2026-07-10; mirrored here)
--
-- The booking-invoice Edit button leaked for the accountant because
-- the UI checked linkage by SELECTing bookings directly — a table the
-- accountant's RLS may hide → lookup empty → gate bypassed (server
-- still blocked the save, but the button misled).
--
-- SECURITY DEFINER lookup callable by any company member: returns the
-- invoice's source order (booking and/or sales order) numbers. Used by
-- the invoice pages and API guards to enforce the owner rule:
--   * booking-linked invoice   → never directly editable (edit the
--     booking: addons + discount; auto-resync)
--   * sales-order-linked       → editable directly by owner/admin/GM
--     only (their direct-creation path); everyone else edits the
--     SALES ORDER (which already rebuilds invoice items + totals —
--     verified: app/sales-orders/[id]/edit deletes+reinserts
--     invoice_items, and trg_sync_sales_order_to_invoice syncs
--     subtotal/tax/total/status)
-- =====================================================================

-- v3.74.603b — FIX: the first version used plpgsql RECORDs; referencing
-- fields of a never-assigned record raises 55000 — hit whenever the
-- invoice had a booking but NO sales order (exactly INV-2026-00001),
-- so the client rpc() errored and the UI treated it as "no linkage"
-- (the Edit button kept leaking). Scalars are null-safe.
CREATE OR REPLACE FUNCTION public.get_invoice_source(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_sales_order_id uuid;
  v_booking_id uuid;
  v_booking_no text;
  v_so_number text;
BEGIN
  SELECT company_id, sales_order_id INTO v_company_id, v_sales_order_id
  FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = v_company_id AND cm.user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT b.id, b.booking_no INTO v_booking_id, v_booking_no
  FROM public.bookings b WHERE b.invoice_id = p_invoice_id LIMIT 1;

  IF v_sales_order_id IS NOT NULL THEN
    SELECT so.so_number INTO v_so_number
    FROM public.sales_orders so WHERE so.id = v_sales_order_id;
  END IF;

  RETURN jsonb_build_object(
    'booking_id',     v_booking_id,
    'booking_no',     v_booking_no,
    'sales_order_id', v_sales_order_id,
    'so_number',      v_so_number
  );
END;
$$;
