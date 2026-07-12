-- v3.74.616 — same fix as v3.74.615 applied to the customer side:
-- prevent_invoice_overpayment() summed approved payment_allocations without
-- excluding voided payments (voided_at) or their reversal entries
-- (voids_payment_id), so a voided customer payment inflated "already paid"
-- and could wrongly block a legitimate payment with OVERPAYMENT_BLOCKED.
-- Applied to production via mcp apply_migration on 2026-07-12; this mirrors it.
CREATE OR REPLACE FUNCTION public.prevent_invoice_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice_total  NUMERIC;
  v_current_paid   NUMERIC;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, 'approved') LIKE 'pending_%' THEN RETURN NEW; END IF;

  SELECT COALESCE(total_amount, 0) INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id;

  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_current_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.invoice_id = NEW.invoice_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.voided_at IS NULL
    AND p.voids_payment_id IS NULL
    AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_current_paid + NEW.amount) > v_invoice_total THEN
    RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: Customer payment of % would exceed invoice total of % (already_paid=%)',
      NEW.amount, v_invoice_total - v_current_paid, v_current_paid
    USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
