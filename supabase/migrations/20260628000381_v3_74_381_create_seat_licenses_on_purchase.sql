-- v3.74.381 — Seat License Stage 4 of 6: per-seat creation on purchase.
--
-- When the Paymob webhook fires (or the free-grant coupon shortcut
-- runs), we need to insert one row in company_seat_licenses per seat
-- that was just purchased. Each row gets:
--   - the next free seat_number for the company (max+1, +2, ...)
--   - purchased_at = NOW()
--   - expires_at   = NOW() + 1 month (or +1 year for annual)
--   - billing_invoice_id = the invoice that paid for this batch
--   - assigned_user_id = NULL (the owner attaches users via swap)
--
-- The legacy increase_seats RPC continues to do its existing job
-- (bumps company_seats.total_paid_seats, refreshes companies.
-- current_period_*, reactivates payment_failed) so every screen that
-- still reads the old shape (sidebar badges, get_seat_status, the
-- billing page summary) keeps working.
--
-- Idempotency
--   Dedup key = billing_invoice_id. If any seat_license row already
--   carries this invoice id, the RPC short-circuits and returns
--   idempotent=true. The webhook can re-fire safely.
--
--   When billing_invoice_id is NULL (e.g. the FREE-coupon path that
--   skips Paymob), there's no shared dedup key, so the caller is
--   responsible for not double-invoking. The free-grant path is
--   one-shot inside POST /api/billing/seats, so this is fine.

CREATE OR REPLACE FUNCTION public.create_seat_licenses_for_purchase(
  p_company_id          uuid,
  p_seats_count         int,
  p_billing_period      text,
  p_billing_invoice_id  uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period           text;
  v_purchased_at     timestamptz := NOW();
  v_expires_at       timestamptz;
  v_max_seat         int;
  v_next_seat        int;
  v_created          int := 0;
  v_existing_count   int;
  i                  int;
  v_new_ids          uuid[] := ARRAY[]::uuid[];
  v_new_id           uuid;
BEGIN
  -- Guards
  IF p_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'company_id_required');
  END IF;
  IF p_seats_count IS NULL OR p_seats_count <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_seats_count');
  END IF;

  v_period := CASE WHEN p_billing_period = 'annual' THEN 'annual' ELSE 'monthly' END;
  v_expires_at := CASE
    WHEN v_period = 'annual' THEN v_purchased_at + INTERVAL '1 year'
    ELSE                          v_purchased_at + INTERVAL '1 month'
  END;

  -- One purchase at a time per company so two webhooks for the same
  -- payment can't race to allocate the same seat_number.
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

  -- Idempotency check via billing_invoice_id.
  IF p_billing_invoice_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_count
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND billing_invoice_id = p_billing_invoice_id;

    IF v_existing_count > 0 THEN
      RETURN json_build_object(
        'success',      true,
        'idempotent',   true,
        'created_count', 0,
        'existing_count', v_existing_count,
        'invoice_id',    p_billing_invoice_id
      );
    END IF;
  END IF;

  -- Find the highest existing seat_number for this company so the new
  -- batch picks up from max+1. Returns 0 when the table is empty,
  -- so seat numbering starts at 1.
  SELECT COALESCE(MAX(seat_number), 0)
    INTO v_max_seat
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id;

  v_next_seat := v_max_seat + 1;

  FOR i IN 0..(p_seats_count - 1) LOOP
    INSERT INTO public.company_seat_licenses (
      company_id, seat_number, billing_period,
      purchased_at, expires_at, billing_invoice_id
    ) VALUES (
      p_company_id, v_next_seat + i, v_period,
      v_purchased_at, v_expires_at, p_billing_invoice_id
    )
    RETURNING id INTO v_new_id;
    v_new_ids := array_append(v_new_ids, v_new_id);
    v_created := v_created + 1;
  END LOOP;

  -- Audit trail.
  BEGIN
    INSERT INTO public.audit_logs (action, company_id, target_table, new_data)
    VALUES (
      'seat_licenses_created',
      p_company_id,
      'company_seat_licenses',
      json_build_object(
        'count',              v_created,
        'first_seat_number',  v_next_seat,
        'last_seat_number',   v_next_seat + p_seats_count - 1,
        'billing_period',     v_period,
        'purchased_at',       v_purchased_at,
        'expires_at',         v_expires_at,
        'billing_invoice_id', p_billing_invoice_id,
        'license_ids',        v_new_ids
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object(
    'success',        true,
    'idempotent',     false,
    'created_count',  v_created,
    'first_seat',     v_next_seat,
    'last_seat',      v_next_seat + p_seats_count - 1,
    'license_ids',    to_json(v_new_ids),
    'billing_period', v_period,
    'purchased_at',   v_purchased_at,
    'expires_at',     v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.create_seat_licenses_for_purchase(uuid, int, text, uuid) IS
  'v3.74.381 - Adds N seat license rows for a freshly-paid purchase. Idempotent on billing_invoice_id. Allocates seat numbers as MAX(seat_number)+1..+N.';
