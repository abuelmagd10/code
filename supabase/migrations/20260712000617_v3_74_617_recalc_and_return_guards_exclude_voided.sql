-- v3.74.617 — same voided-payment exclusion applied to the paid-status
-- recalculators and the return-overpay guard, so voided payments never
-- inflate paid totals (which would set wrong paid_amount/status or wrongly
-- block a purchase return). Applied to production via mcp; this mirrors it.

CREATE OR REPLACE FUNCTION public.fn_recalc_bill_paid_status(p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total NUMERIC;
  v_returned NUMERIC;
  v_paid NUMERIC;
  v_net NUMERIC;
  v_new_status TEXT;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
BEGIN
  SELECT
    COALESCE(b.total_amount, 0),
    COALESCE(b.returned_amount, 0),
    UPPER(COALESCE(b.currency_code, '')),
    COALESCE(NULLIF(b.exchange_rate, 0), 1)
  INTO v_total, v_returned, v_bill_currency, v_bill_rate
  FROM bills b WHERE b.id = p_bill_id;

  v_paid := COALESCE(
    (SELECT SUM(
      pa.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
        WHEN UPPER(p.currency_code) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
      END
     )
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.bill_id = p_bill_id
       AND p.status = 'approved'
       AND COALESCE(p.is_deleted, false) = false
       AND p.voided_at IS NULL
       AND p.voids_payment_id IS NULL
    ), 0
  )
  +
  COALESCE(
    (SELECT SUM(
      p2.amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(p2.currency_code) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_bill_rate
      END
     )
     FROM payments p2
     WHERE p2.bill_id = p_bill_id
       AND p2.status = 'approved'
       AND COALESCE(p2.is_deleted, false) = false
       AND p2.voided_at IS NULL
       AND p2.voids_payment_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM payment_allocations pa2
         WHERE pa2.payment_id = p2.id AND pa2.bill_id = p_bill_id
       )
    ), 0
  );

  v_paid := ROUND(v_paid::numeric, 4);
  v_net := GREATEST(v_total - v_returned, 0);

  v_new_status := CASE
    WHEN v_paid <= 0 THEN 'received'
    WHEN v_paid >= v_net - 0.01 THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.bills
  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()
  WHERE id = p_bill_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_paid_status(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total          NUMERIC;
  v_returned       NUMERIC;
  v_paid           NUMERIC;
  v_net            NUMERIC;
  v_new_status     TEXT;
  v_inv_currency   TEXT;
  v_inv_rate       NUMERIC;
BEGIN
  SELECT
    COALESCE(i.total_amount, 0),
    COALESCE(i.returned_amount, 0),
    UPPER(COALESCE(i.currency_code, '')),
    COALESCE(NULLIF(i.exchange_rate, 0), 1)
  INTO v_total, v_returned, v_inv_currency, v_inv_rate
  FROM invoices i WHERE i.id = p_invoice_id;

  v_paid := COALESCE(
    (SELECT SUM(
      pa.allocated_amount *
      CASE
        WHEN v_inv_currency = '' OR UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
        WHEN UPPER(p.currency_code) = v_inv_currency THEN 1
        ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_inv_rate
      END
     )
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.invoice_id = p_invoice_id
       AND p.status = 'approved'
       AND COALESCE(p.is_deleted, false) = false
       AND p.voided_at IS NULL
       AND p.voids_payment_id IS NULL
    ), 0
  )
  +
  COALESCE(
    (SELECT SUM(
      p2.amount *
      CASE
        WHEN v_inv_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(p2.currency_code) = v_inv_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_inv_rate
      END
     )
     FROM payments p2
     WHERE p2.invoice_id = p_invoice_id
       AND p2.status = 'approved'
       AND COALESCE(p2.is_deleted, false) = false
       AND p2.voided_at IS NULL
       AND p2.voids_payment_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM payment_allocations pa2
         WHERE pa2.payment_id = p2.id AND pa2.invoice_id = p_invoice_id
       )
    ), 0
  );

  v_paid := ROUND(v_paid::numeric, 4);
  v_net  := GREATEST(v_total - v_returned, 0);

  v_new_status := CASE
    WHEN v_paid <= 0 THEN 'sent'
    WHEN v_paid >= v_net - 0.01 THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_return_creating_overpay()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_bill_total NUMERIC;
  v_bill_returned NUMERIC;
  v_other_pending_returns NUMERIC;
  v_approved_paid NUMERIC;
  v_pending_payment NUMERIC;
  v_net_after_this_return NUMERIC;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
BEGIN
  IF NEW.bill_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.workflow_status NOT IN ('confirmed', 'completed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.workflow_status IS NOT DISTINCT FROM NEW.workflow_status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(b.total_amount, 0),
         COALESCE(b.returned_amount, 0),
         UPPER(COALESCE(b.currency_code, 'EGP')),
         COALESCE(NULLIF(b.exchange_rate, 0), 1)
  INTO v_bill_total, v_bill_returned, v_bill_currency, v_bill_rate
  FROM bills b WHERE id = NEW.bill_id;

  SELECT COALESCE(SUM(pr.total_amount), 0)
  INTO v_other_pending_returns
  FROM purchase_returns pr
  WHERE pr.bill_id = NEW.bill_id
    AND pr.status IN ('pending_approval', 'pending_warehouse')
    AND pr.id != NEW.id;

  SELECT COALESCE(SUM(
    pa.allocated_amount *
    CASE
      WHEN UPPER(COALESCE(p.currency_code, '')) = v_bill_currency THEN 1
      WHEN UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
      ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
    END
  ), 0)
  INTO v_approved_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.voided_at IS NULL
    AND p.voids_payment_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM vendor_payment_correction_requests v
      WHERE v.original_payment_id = p.id AND v.status = 'executed'
    );

  SELECT COALESCE(SUM(
    pa.allocated_amount *
    CASE
      WHEN UPPER(COALESCE(p.currency_code, '')) = v_bill_currency THEN 1
      WHEN UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
      ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
    END
  ), 0)
  INTO v_pending_payment
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'pending_approval'
    AND COALESCE(p.is_deleted, false) = false
    AND p.voided_at IS NULL
    AND p.voids_payment_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM vendor_payment_correction_requests v
      WHERE v.original_payment_id = p.id AND v.status = 'executed'
    );

  v_net_after_this_return := v_bill_total
                             - v_bill_returned
                             - COALESCE(NEW.total_amount, 0)
                             - v_other_pending_returns;

  IF (v_approved_paid + v_pending_payment) > v_net_after_this_return + 0.01 THEN
    RAISE EXCEPTION 'RETURN_WOULD_CAUSE_OVERPAY: اعتماد المرتجع % يخفض صافى الفاتورة إلى % بينما المدفوع المعتمد % + المعلق % = % — ارفض أو عدّل الدفعة المعلقة أولاً ثم أكد الإخراج',
      COALESCE(NEW.total_amount, 0),
      ROUND(v_net_after_this_return, 2),
      ROUND(v_approved_paid, 2),
      ROUND(v_pending_payment, 2),
      ROUND(v_approved_paid + v_pending_payment, 2)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
