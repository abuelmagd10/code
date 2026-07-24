-- ============================================================================
-- v3.74.807 — بوابة المقاعد تفحص الشركة الصحيحة
-- ============================================================================
-- Owner-reported lockout: the purchasing officer (a member of TWO
-- companies) was blocked from company "تست" with the message "seat #1
-- expired July 22" — while the seats admin page truthfully showed his
-- تست seat valid until July 29.
--
-- Root cause — get_user_company_status had two unordered LIMIT 1 reads:
--   1. company_members  WHERE user_id = X LIMIT 1   → arbitrary company
--   2. company_seat_licenses WHERE assigned_user_id = X LIMIT 1
--      → NOT scoped by company. It grabbed the EXPIRED license from
--        his OTHER company ("توب تانك", expired 2026-07-22) and gated
--        the تست session with it.
--
-- Fix:
--   * Membership pick is deterministic: owner first, then a membership
--     whose seat license is still valid, then the oldest membership.
--     A user locked out of one company but active in another can log in.
--   * The license lookup is scoped to the SAME company being gated.
--   * get_user_seat_license (same unscoped pattern, currently unused
--     by the app) hardened with deterministic ordering too.
--
-- Verified (test DB first, then production):
--   * goldwallet: suspended=false, company=تست, expires 2026-07-29 ✓
--   * probe with ALL licenses expired: suspended=true with a company
--     name consistent with its own license (rolled back) ✓
--   * owner: never suspended ✓
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_company_status(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id        uuid;
  v_owner_id          uuid;
  v_status            text;
  v_legacy_seat_num   int;
  v_paid_seats        int;
  v_is_owner          boolean;
  v_license_seat_num  int;
  v_license_expires   timestamptz;
  v_seat_suspended    boolean;
  v_company_suspended boolean;
BEGIN
  -- v3.74.807: deterministic membership pick. A user can belong to
  -- several companies; gate on the BEST standing one (owner first,
  -- then a membership whose seat license is still valid, then the
  -- oldest membership). The previous unordered LIMIT 1 could pick a
  -- company the user is fine in while the license subquery below
  -- (previously unscoped) grabbed an expired license from ANOTHER
  -- company - locking users out with a mismatched company name.
  SELECT cm.company_id, cm.seat_number
    INTO v_company_id, v_legacy_seat_num
  FROM company_members cm
  JOIN companies c ON c.id = cm.company_id
  LEFT JOIN company_seat_licenses csl
    ON csl.company_id = cm.company_id
   AND csl.assigned_user_id = cm.user_id
  WHERE cm.user_id = p_user_id
  ORDER BY (c.user_id = p_user_id) DESC,
           (csl.expires_at > NOW()) DESC NULLS LAST,
           cm.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN json_build_object(
      'has_company', false, 'is_owner', false, 'is_suspended', false,
      'is_company_suspended', false, 'is_seat_suspended', false
    );
  END IF;

  SELECT c.user_id, c.subscription_status INTO v_owner_id, v_status
  FROM companies c WHERE c.id = v_company_id;

  SELECT COALESCE(cs.total_paid_seats, 0) INTO v_paid_seats
  FROM company_seats cs WHERE cs.company_id = v_company_id;
  v_paid_seats := COALESCE(v_paid_seats, 0);

  v_is_owner := (v_owner_id = p_user_id);

  -- v3.74.807: the license MUST belong to the same company we are
  -- gating on. The unscoped lookup was the root cause of the
  -- cross-company lockout.
  SELECT csl.seat_number, csl.expires_at
    INTO v_license_seat_num, v_license_expires
    FROM company_seat_licenses csl
   WHERE csl.assigned_user_id = p_user_id
     AND csl.company_id = v_company_id
   LIMIT 1;

  v_company_suspended := (v_status = 'payment_failed');

  IF v_is_owner THEN
    v_seat_suspended := false;
  ELSIF v_license_expires IS NULL THEN
    v_seat_suspended := true;
  ELSE
    v_seat_suspended := (v_license_expires <= NOW());
  END IF;

  RETURN json_build_object(
    'has_company', true, 'company_id', v_company_id, 'is_owner', v_is_owner,
    'subscription_status', COALESCE(v_status, 'free'),
    'seat_number', COALESCE(v_license_seat_num, v_legacy_seat_num),
    'paid_seats', v_paid_seats,
    'seat_expires_at', v_license_expires,
    'is_company_suspended', v_company_suspended,
    'is_seat_suspended', v_seat_suspended,
    'is_suspended', (NOT v_is_owner AND v_seat_suspended)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_seat_license(p_user_id uuid)
 RETURNS TABLE(license_id uuid, company_id uuid, seat_number integer, purchased_at timestamp with time zone, expires_at timestamp with time zone, billing_period text, is_expired boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- v3.74.807: deterministic - prefer a still-valid license, then the
  -- most recent. The unordered LIMIT 1 could return an expired license
  -- from another company for multi-company users.
  SELECT
    csl.id, csl.company_id, csl.seat_number,
    csl.purchased_at, csl.expires_at, csl.billing_period,
    (csl.expires_at <= NOW()) AS is_expired
  FROM public.company_seat_licenses csl
  WHERE csl.assigned_user_id = p_user_id
  ORDER BY (csl.expires_at > NOW()) DESC, csl.expires_at DESC
  LIMIT 1;
$function$;
