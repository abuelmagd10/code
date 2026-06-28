-- v3.74.383 — Seat License Stage 6 of 6: invitation flow + polish.
--
-- The buy / renew / swap flows already speak the new per-seat
-- license model. The invitation flow (invite -> reserve -> accept ->
-- activate) still works against the legacy total_paid_seats counter,
-- which has two consequences in the new world:
--
--   1. get_seat_status reports "available" by subtracting active
--      members from total_paid_seats. It doesn't notice that some
--      paid seats may be expired. If the owner has moved members
--      onto active seats and left expired ones empty, the gate
--      would happily let them invite more people who'd then land
--      on those expired licenses and be blocked instantly.
--
--   2. assign_next_seat_number returns MAX(seat_number)+1 from
--      company_members. After members have hopped around via swaps,
--      this can return a seat number whose backing license is either
--      missing or expired.
--
--   3. activate_seat only updates company_members.seat_number. The
--      new license row keeps assigned_user_id NULL, which makes the
--      seats page show the user as "over-quota / no license" and
--      blocks them.
--
-- This migration patches all three so invitations land cleanly on
-- empty active licenses and the gate refuses when there isn't one.
-- Legacy free-tier companies (no licenses) fall back to the original
-- behaviour automatically.

-- ── 1. get_seat_status: license-aware available count ─────────
CREATE OR REPLACE FUNCTION public.get_seat_status(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_paid_seats  INTEGER := 0;
  v_owner_id          UUID;
  v_active_members    INTEGER := 0;
  v_pending_invites   INTEGER := 0;
  v_available         INTEGER := 0;
  v_sub_status        TEXT    := 'free';
  v_price_per_seat    INTEGER := 500;
  v_can_invite        BOOLEAN := false;
  v_is_suspended      BOOLEAN := false;
  v_license_count     INTEGER := 0;
  v_empty_active      INTEGER := 0;
BEGIN
  SELECT user_id, subscription_status
  INTO v_owner_id, v_sub_status
  FROM companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Company not found');
  END IF;

  SELECT COALESCE(total_paid_seats, 0), COALESCE(price_per_seat_egp, 500)
  INTO v_total_paid_seats, v_price_per_seat
  FROM company_seats
  WHERE company_id = p_company_id;

  SELECT COUNT(*)
  INTO v_active_members
  FROM company_members
  WHERE company_id = p_company_id
    AND user_id != v_owner_id;

  SELECT COUNT(*)
  INTO v_pending_invites
  FROM company_invitations
  WHERE company_id = p_company_id
    AND accepted = FALSE
    AND seat_reserved = TRUE
    AND expires_at > now()
    AND COALESCE(status, 'pending') = 'pending';

  -- v3.74.383 — license-aware availability. Count licenses that are
  -- empty AND not yet expired. If the company has any license rows,
  -- this is the authoritative number. Free-tier companies (no
  -- license rows) fall through to the legacy calculation.
  SELECT COUNT(*)
    INTO v_license_count
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id;

  IF v_license_count > 0 THEN
    SELECT COUNT(*)
      INTO v_empty_active
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND assigned_user_id IS NULL
       AND expires_at > NOW();

    -- Pending invitations have already reserved a seat_number that's
    -- earmarked for them; subtract them from the active-empty pool
    -- to avoid double-booking.
    v_available := GREATEST(0, v_empty_active - v_pending_invites);
  ELSE
    v_available := GREATEST(0, v_total_paid_seats - v_active_members - v_pending_invites);
  END IF;

  -- can_invite decision: subscription_status used to be the gate.
  -- Per the new model (Stage 3) the seat license dates rule, but
  -- the invite gate still cares about the subscription kind so that
  -- the free tier stays single-owner.
  IF v_sub_status = 'payment_failed' THEN
    -- Account suspended at the company level. Defer to license
    -- availability anyway — if some seats are still active, owners
    -- on those seats should be inviteable too.
    v_can_invite := v_available > 0;
    v_is_suspended := true;
  ELSIF v_sub_status = 'free' THEN
    v_can_invite := false;
  ELSE
    v_can_invite := v_available > 0;
  END IF;

  RETURN json_build_object(
    'total_paid_seats',    v_total_paid_seats,
    'used_seats',          v_active_members,
    'reserved_seats',      v_pending_invites,
    'available_seats',     v_available,
    'can_invite',          v_can_invite,
    'owner_id',            v_owner_id,
    'subscription_status', COALESCE(v_sub_status, 'free'),
    'is_suspended',        v_is_suspended,
    'price_per_seat_egp',  v_price_per_seat,
    -- v3.74.383 — diagnostic fields surfaced for the UI/debug tools.
    'license_count',       v_license_count,
    'empty_active',        v_empty_active
  );
END;
$$;

COMMENT ON FUNCTION public.get_seat_status(uuid) IS
  'v3.74.383 - available_seats now counts empty active licenses (not total_paid_seats - members). Falls back to legacy math for companies with zero license rows.';

-- ── 2. assign_next_seat_number: pick from empty active licenses ─
CREATE OR REPLACE FUNCTION public.assign_next_seat_number(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat_number int;
  v_license_count int;
BEGIN
  SELECT COUNT(*) INTO v_license_count
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id;

  IF v_license_count > 0 THEN
    -- Prefer the lowest-numbered empty active license that isn't
    -- already earmarked by a pending invitation.
    SELECT csl.seat_number INTO v_seat_number
      FROM public.company_seat_licenses csl
     WHERE csl.company_id = p_company_id
       AND csl.assigned_user_id IS NULL
       AND csl.expires_at > NOW()
       AND NOT EXISTS (
         SELECT 1 FROM public.company_invitations ci
          WHERE ci.company_id = p_company_id
            AND ci.seat_number = csl.seat_number
            AND ci.accepted = false
            AND COALESCE(ci.status, 'pending') = 'pending'
       )
     ORDER BY csl.seat_number
     LIMIT 1;

    IF v_seat_number IS NOT NULL THEN
      RETURN v_seat_number;
    END IF;
  END IF;

  -- Fallback (legacy / free tier): lowest unused seat_number.
  SELECT COALESCE(MAX(seat_number), 0) + 1
    INTO v_seat_number
    FROM company_members
   WHERE company_id = p_company_id;

  RETURN v_seat_number;
END;
$$;

COMMENT ON FUNCTION public.assign_next_seat_number(uuid) IS
  'v3.74.383 - Returns the lowest seat_number of an empty active license that isnt already reserved. Falls back to MAX(seat_number)+1 on legacy / free-tier companies.';

-- ── 3. activate_seat: also stamp the license assigned_user_id ──
CREATE OR REPLACE FUNCTION public.activate_seat(p_company_id uuid, p_invite_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat_number INTEGER;
  v_member_id   UUID;
  v_user_id     UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id::TEXT));

  SELECT seat_number INTO v_seat_number
  FROM company_invitations
  WHERE id = p_invite_id AND company_id = p_company_id;

  IF v_seat_number IS NOT NULL THEN
    -- Find the most recently added member without a seat_number
    -- (matches existing semantics — the just-accepted invitee).
    UPDATE company_members cm
    SET seat_number = v_seat_number
    WHERE cm.company_id = p_company_id
      AND cm.seat_number IS NULL
      AND cm.id = (
        SELECT id FROM company_members
        WHERE company_id = p_company_id AND seat_number IS NULL
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
      )
    RETURNING cm.id, cm.user_id INTO v_member_id, v_user_id;

    -- v3.74.383 — also attach the user to the seat license so the
    -- new per-license access check (get_user_company_status) lets
    -- them in. NULL assigned_user_id would otherwise mark them as
    -- "no seat" and they'd hit /suspended on first request.
    IF v_user_id IS NOT NULL THEN
      UPDATE public.company_seat_licenses
         SET assigned_user_id = v_user_id,
             assigned_at      = NOW(),
             updated_at       = NOW()
       WHERE company_id  = p_company_id
         AND seat_number = v_seat_number
         AND assigned_user_id IS NULL;
    END IF;
  END IF;

  -- Mark the invitation as accepted
  UPDATE company_invitations
  SET accepted = TRUE, status = 'accepted', accepted_at = now()
  WHERE id = p_invite_id AND company_id = p_company_id;

  -- Log activation
  INSERT INTO seat_transactions(company_id, transaction_type, seats_delta, metadata)
  VALUES (
    p_company_id,
    'activate',
    0,
    json_build_object(
      'invite_id', p_invite_id,
      'seat_number', v_seat_number,
      'user_id', v_user_id
    )
  );

  RETURN json_build_object(
    'success', TRUE,
    'seat_number', v_seat_number,
    'user_id', v_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.activate_seat(uuid, uuid) IS
  'v3.74.383 - In addition to stamping company_members.seat_number, also attaches the new user to company_seat_licenses.assigned_user_id so the per-license access check (v3.74.379 get_user_company_status) lets them in.';
