-- v3.74.388 — Add expired_seat_count to get_seat_status so the
-- invite banner can tell the owner WHY no seat is available.
--
-- Owner reported confusing UX during invite testing: the banner said
-- "5 مستخدمة من إجمالى 10" then concluded "لا توجد مقاعد متاحة" —
-- the numbers don't visibly add up to the conclusion because 5 of the
-- 10 paid seats are actually expired (occupied + expired counts both
-- contribute to "not available" but the banner only surfaced "used").
--
-- Fix: surface expired_count so the UI can render
--   "5 نشطة مشغولة، 5 منتهية، 0 متاحة"
-- with a one-click "renew an expired seat" option besides the
-- existing "add a new seat" link.
--
-- Body is byte-identical to v3.74.383 except for the two new lookups
-- and two new keys in the returned jsonb.

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
  v_expired_count     INTEGER := 0;
  v_active_count      INTEGER := 0;
BEGIN
  SELECT user_id, subscription_status INTO v_owner_id, v_sub_status
  FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Company not found');
  END IF;

  SELECT COALESCE(total_paid_seats, 0), COALESCE(price_per_seat_egp, 500)
  INTO v_total_paid_seats, v_price_per_seat
  FROM company_seats WHERE company_id = p_company_id;

  SELECT COUNT(*) INTO v_active_members
  FROM company_members
  WHERE company_id = p_company_id AND user_id != v_owner_id;

  SELECT COUNT(*) INTO v_pending_invites
  FROM company_invitations
  WHERE company_id = p_company_id
    AND accepted = FALSE
    AND seat_reserved = TRUE
    AND expires_at > now()
    AND COALESCE(status, 'pending') = 'pending';

  SELECT COUNT(*) INTO v_license_count
    FROM public.company_seat_licenses WHERE company_id = p_company_id;

  IF v_license_count > 0 THEN
    SELECT COUNT(*) INTO v_empty_active
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND assigned_user_id IS NULL
       AND expires_at > NOW();

    -- v3.74.388 — diagnostics for the invite banner
    SELECT COUNT(*) INTO v_expired_count
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND expires_at <= NOW();

    SELECT COUNT(*) INTO v_active_count
      FROM public.company_seat_licenses
     WHERE company_id = p_company_id
       AND expires_at > NOW();

    v_available := GREATEST(0, v_empty_active - v_pending_invites);
  ELSE
    v_available     := GREATEST(0, v_total_paid_seats - v_active_members - v_pending_invites);
    v_expired_count := 0;
    v_active_count  := v_total_paid_seats;
  END IF;

  IF v_sub_status = 'payment_failed' THEN
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
    'license_count',       v_license_count,
    'empty_active',        v_empty_active,
    -- v3.74.388 — new diagnostic fields for the invite banner
    'expired_seat_count',  v_expired_count,
    'active_seat_count',   v_active_count
  );
END;
$$;

COMMENT ON FUNCTION public.get_seat_status(uuid) IS
  'v3.74.388 - Adds expired_seat_count + active_seat_count so the invite banner can explain WHY no seat is available (occupied vs expired) and direct the owner to renewal instead of just purchase.';
