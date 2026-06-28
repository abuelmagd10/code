-- v3.74.382 — Seat License Stage 5 of 6: per-seat renewal.
--
-- The owner can renew:
--   - one seat
--   - several selected seats
--   - all expired seats in the company
--
-- Renewal moves the chosen seats' expires_at forward by 1 month (or
-- 1 year for annual). For seats that are already expired we start
-- the new period from NOW; for seats still inside their paid window
-- we extend from the existing expires_at so the customer doesn't
-- lose the days they already paid for.
--
-- Pricing follows the same engine as buy — volume discount is
-- computed on the COUNT being renewed in this single payment, not
-- on the total company seat count. That matches what the owner
-- explicitly asked for.
--
-- Idempotency
--   billing_invoice_id is the dedup key. Each successful renewal
--   stamps last_renewal_invoice_id on the renewed licenses, so a
--   re-fired Paymob webhook sees rows already carrying that invoice
--   and short-circuits.

CREATE OR REPLACE FUNCTION public.renew_seat_licenses(
  p_company_id          uuid,
  p_seat_license_ids    uuid[],
  p_billing_period      text,
  p_billing_invoice_id  uuid DEFAULT NULL,
  p_performed_by        uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period         text;
  v_now            timestamptz := NOW();
  v_interval       interval;
  v_renewed_ids    uuid[] := ARRAY[]::uuid[];
  v_renewed_count  int := 0;
  v_existing_count int;
  v_match_count    int;
  v_target_count   int;
  rec              RECORD;
  v_new_expires    timestamptz;
BEGIN
  -- Guards
  IF p_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'company_id_required');
  END IF;
  IF p_seat_license_ids IS NULL OR array_length(p_seat_license_ids, 1) IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_seats_specified');
  END IF;

  v_period := CASE WHEN p_billing_period = 'annual' THEN 'annual' ELSE 'monthly' END;
  v_interval := CASE
    WHEN v_period = 'annual' THEN INTERVAL '1 year'
    ELSE                          INTERVAL '1 month'
  END;
  v_target_count := array_length(p_seat_license_ids, 1);

  -- One renewal transaction at a time per company.
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

  -- Idempotency: if any of the targeted licenses already carry this
  -- invoice as their last_renewal_invoice_id, the renewal already
  -- happened. Return idempotent so a re-fired webhook is a no-op.
  IF p_billing_invoice_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_count
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND id = ANY(p_seat_license_ids)
       AND last_renewal_invoice_id = p_billing_invoice_id;

    IF v_existing_count > 0 THEN
      RETURN json_build_object(
        'success',      true,
        'idempotent',   true,
        'renewed_count', 0,
        'matched_count', v_existing_count,
        'invoice_id',    p_billing_invoice_id
      );
    END IF;
  END IF;

  -- Safety: only operate on licenses that actually belong to this
  -- company. Returns a count so callers can detect bad inputs.
  SELECT count(*) INTO v_match_count
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id
     AND id = ANY(p_seat_license_ids);
  IF v_match_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'no_matching_licenses');
  END IF;

  -- Renew each matched license.
  FOR rec IN
    SELECT id, seat_number, expires_at
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND id = ANY(p_seat_license_ids)
     ORDER BY seat_number
  LOOP
    v_new_expires := CASE
      WHEN rec.expires_at <= v_now THEN v_now + v_interval
      ELSE                              rec.expires_at + v_interval
    END;

    UPDATE public.company_seat_licenses
       SET expires_at              = v_new_expires,
           billing_period          = v_period,
           last_renewed_at         = v_now,
           last_renewal_invoice_id = p_billing_invoice_id,
           updated_at              = v_now
     WHERE id = rec.id;

    v_renewed_ids := array_append(v_renewed_ids, rec.id);
    v_renewed_count := v_renewed_count + 1;
  END LOOP;

  -- Audit log.
  BEGIN
    INSERT INTO public.audit_logs (action, company_id, target_table, new_data, user_id)
    VALUES (
      'seat_licenses_renewed',
      p_company_id,
      'company_seat_licenses',
      json_build_object(
        'license_ids',         v_renewed_ids,
        'count',               v_renewed_count,
        'billing_period',      v_period,
        'billing_invoice_id',  p_billing_invoice_id,
        'renewed_at',          v_now,
        'performed_by',        p_performed_by,
        'requested_count',     v_target_count,
        'unmatched_count',     v_target_count - v_match_count
      )::jsonb,
      p_performed_by
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object(
    'success',        true,
    'idempotent',     false,
    'renewed_count',  v_renewed_count,
    'license_ids',    to_json(v_renewed_ids),
    'billing_period', v_period,
    'requested',      v_target_count,
    'unmatched',      v_target_count - v_match_count
  );
END;
$$;

COMMENT ON FUNCTION public.renew_seat_licenses(uuid, uuid[], text, uuid, uuid) IS
  'v3.74.382 - Extends expires_at on a set of seat licenses. Expired seats restart from NOW; active seats extend from existing expires_at. Idempotent on billing_invoice_id.';

-- ── Convenience helper used by /api/billing/seats/renew route ──
-- Returns the license ids belonging to a company that are currently
-- expired. The route uses this when the owner picks "renew all
-- expired".
CREATE OR REPLACE FUNCTION public.get_expired_seat_license_ids(p_company_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id ORDER BY seat_number), ARRAY[]::uuid[])
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id
     AND expires_at <= NOW();
$$;

COMMENT ON FUNCTION public.get_expired_seat_license_ids(uuid) IS
  'v3.74.382 - Returns license ids whose expires_at is in the past, ordered by seat_number.';
