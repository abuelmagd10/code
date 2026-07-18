-- v3.74.691 — Remove the confusing third notification on PO/SO discounts.
-- ------------------------------------------------------------------
-- Reported: creating a purchase order that carries a discount produced THREE
-- owner notifications instead of the expected two:
--   (1) "طلب موافقة على أمر شراء"      → opens the PO, to approve the PO itself.   KEEP
--   (2) "طلب موافقة على خصم أمر شراء"  → opens the approvals inbox, to approve the
--                                        discount (from po_evaluate_discount_approval). KEEP
--   (3) "خصم بانتظار الاعتماد"         → emitted by the generic trigger
--        notify_discount_request_trg on every discount_approvals insert. Its text
--        describes the DISCOUNT but its link opens the DOCUMENT, so it reads as a
--        mislabelled duplicate of (1)/(2).
--
-- Fix: the generic trigger now skips purchase_order / sales_order, because those
-- two already emit a dedicated, correctly-worded discount notification that
-- points at the approvals inbox. All other document types (invoices, bills,
-- bookings, ...) keep using the generic trigger unchanged — they have no
-- dedicated one.
--
-- Net result: exactly one notification per concern — one to approve the document,
-- one to approve its discount.
-- ------------------------------------------------------------------

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.notify_discount_request_trg'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.691%' THEN
    d := replace(d,
      $a$  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;$a$,
      $a$  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  -- v3.74.691 — purchase_order / sales_order already receive a dedicated
  -- discount-approval notification (from po_/so_evaluate_discount_approval)
  -- that opens the approvals inbox, plus their own document-approval
  -- notification. Emitting this one too produced a third, confusing message
  -- worded as a discount but linking to the document.
  IF NEW.document_type::text IN ('purchase_order','sales_order') THEN RETURN NEW; END IF;$a$);
    EXECUTE d;
  END IF;
END $do$;
