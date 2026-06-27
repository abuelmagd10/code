-- v3.74.379 — Seat License Stage 3 of 6: per-license swap + middleware.
--
-- The big behavioural switch. Until this migration:
--   - swap_seat_numbers swapped the SEAT NUMBER on company_members
--     rows (the seat moved, the user stayed put)
--   - get_user_company_status decided suspension by comparing
--     seat_number to company_seats.total_paid_seats
--
-- After this migration:
--   - swap_seat_numbers moves the USER ATTACHMENT between two
--     existing seat licenses (the seat stays, the user moves)
--   - get_user_company_status looks up the user's attached seat
--     license and checks expires_at to decide if they're blocked
--
-- That's exactly the model the owner asked for: "license belongs to
-- the seat, not the user. Admin moves users between seats". Moving
-- a user onto an expired seat blocks them; moving them onto an
-- active seat brings them back.
--
-- Legacy column kept in sync
--   company_members.seat_number is still read by various screens
--   (the sidebar, get_seat_status, the over_quota calculation in
--   /settings/seats). The new swap RPC updates it alongside the
--   licenses so the legacy view stays consistent.
--
-- Audit log
--   Every swap writes a single audit_logs row with action=seat_swap
--   and a payload describing actor, the two seats, and the two
--   users before and after the move.
--
-- Backward compatibility
--   The RPC signature gains an optional p_actor_user_id parameter
--   so existing callers that don't pass it still work. The /swap
--   API route is updated separately to pass the authenticated user.

-- ── 1. New swap RPC (overload-safe rewrite) ───────────────────
DROP FUNCTION IF EXISTS public.swap_seat_numbers(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.swap_seat_numbers(uuid, integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.swap_seat_numbers(
  p_company_id     uuid,
  p_seat_a         integer,
  p_seat_b         integer,
  p_actor_user_id  uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id        uuid;
  v_license_a_id    uuid;
  v_license_b_id    uuid;
  v_user_before_a   uuid;
  v_user_before_b   uuid;
BEGIN
  -- Guard: company must exist; pull owner id for safety checks.
  SELECT user_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
  IF v_owner_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'company_not_found');
  END IF;

  -- Owner seat (0) is virtual and never participates.
  IF p_seat_a = 0 OR p_seat_b = 0 THEN
    RETURN json_build_object('success', false, 'error', 'cannot_swap_owner_seat');
  END IF;

  -- Same-seat is a no-op (saves caller round-trips).
  IF p_seat_a = p_seat_b THEN
    RETURN json_build_object('success', true, 'no_op', true);
  END IF;

  -- Concurrency: one swap per company at a time. The transaction-
  -- scoped advisory lock auto-releases on commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

  -- Resolve license rows + their current occupants.
  SELECT id, assigned_user_id
    INTO v_license_a_id, v_user_before_a
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id AND seat_number = p_seat_a
   LIMIT 1;

  SELECT id, assigned_user_id
    INTO v_license_b_id, v_user_before_b
    FROM public.company_seat_licenses
   WHERE company_id = p_company_id AND seat_number = p_seat_b
   LIMIT 1;

  -- Both seats need to be real licenses (no over-quota or fictional
  -- seat numbers). If a seat number doesn't have a license row, the
  -- caller is trying to swap with something we don't manage.
  IF v_license_a_id IS NULL OR v_license_b_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'license_not_found');
  END IF;

  -- If both seats are empty there's nothing to move.
  IF v_user_before_a IS NULL AND v_user_before_b IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'both_seats_empty');
  END IF;

  -- ── Swap assigned_user_id between the two licenses ──
  -- We have to nullify one side first to avoid violating the
  -- partial unique index on (company_id, assigned_user_id).
  UPDATE public.company_seat_licenses
     SET assigned_user_id = NULL,
         assigned_at      = NULL,
         updated_at       = NOW()
   WHERE id = v_license_a_id;

  UPDATE public.company_seat_licenses
     SET assigned_user_id = v_user_before_a,
         assigned_at      = CASE WHEN v_user_before_a IS NOT NULL THEN NOW() ELSE NULL END,
         updated_at       = NOW()
   WHERE id = v_license_b_id;

  UPDATE public.company_seat_licenses
     SET assigned_user_id = v_user_before_b,
         assigned_at      = CASE WHEN v_user_before_b IS NOT NULL THEN NOW() ELSE NULL END,
         updated_at       = NOW()
   WHERE id = v_license_a_id;

  -- ── Keep the legacy seat_number column in sync ──
  -- Various screens (sidebar, billing pages, the old get_seat_status
  -- RPC) still read company_members.seat_number. Mirror the move
  -- here so those screens don't drift while Stages 4-6 land.
  IF v_user_before_a IS NOT NULL THEN
    UPDATE public.company_members
       SET seat_number = p_seat_b
     WHERE company_id = p_company_id AND user_id = v_user_before_a;
  END IF;
  IF v_user_before_b IS NOT NULL THEN
    UPDATE public.company_members
       SET seat_number = p_seat_a
     WHERE company_id = p_company_id AND user_id = v_user_before_b;
  END IF;

  -- ── Audit log entry (best-effort; never abort the swap) ──
  BEGIN
    INSERT INTO public.audit_logs (
      action, company_id, target_table, new_data, user_id
    ) VALUES (
      'seat_swap',
      p_company_id,
      'company_seat_licenses',
      json_build_object(
        'seat_a',          p_seat_a,
        'seat_b',          p_seat_b,
        'license_a_id',    v_license_a_id,
        'license_b_id',    v_license_b_id,
        'user_on_a_before', v_user_before_a,
        'user_on_b_before', v_user_before_b,
        'user_on_a_after', v_user_before_b,
        'user_on_b_after', v_user_before_a,
        'performed_by',    p_actor_user_id,
        'performed_at',    NOW()
      )::jsonb,
      p_actor_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'swapped', json_build_object(
      'a', p_seat_a,
      'b', p_seat_b,
      'user_on_a', v_user_before_b,
      'user_on_b', v_user_before_a
    )
  );
END;
$$;

COMMENT ON FUNCTION public.swap_seat_numbers(uuid, integer, integer, uuid) IS
  'v3.74.379 - Moves the assigned user between two seat licenses (not the seat number on members). Owner seat 0 cannot participate. Audit-logged with actor + before/after users.';

-- ── 2. License-aware company status RPC ───────────────────────
-- Old behaviour: suspended if (subscription_status='payment_failed')
-- OR (seat_number > total_paid_seats).
--
-- New behaviour: suspended if the user's attached license has
-- expires_at <= NOW(), OR the user has no attached license at all
-- (and is not the owner). Subscription_status is still surfaced for
-- legacy callers but no longer drives the gate.
CREATE OR REPLACE FUNCTION public.get_user_company_status(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT cm.company_id, cm.seat_number INTO v_company_id, v_legacy_seat_num
  FROM company_members cm
  WHERE cm.user_id = p_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN json_build_object(
      'has_company', false,
      'is_owner', false,
      'is_suspended', false,
      'is_company_suspended', false,
      'is_seat_suspended', false
    );
  END IF;

  SELECT c.user_id, c.subscription_status INTO v_owner_id, v_status
  FROM companies c
  WHERE c.id = v_company_id;

  SELECT COALESCE(cs.total_paid_seats, 0) INTO v_paid_seats
  FROM company_seats cs
  WHERE cs.company_id = v_company_id;
  v_paid_seats := COALESCE(v_paid_seats, 0);

  v_is_owner := (v_owner_id = p_user_id);

  -- v3.74.379 — pull the license the user is currently attached to.
  -- This is the new source of truth for seat-level suspension.
  SELECT csl.seat_number, csl.expires_at
    INTO v_license_seat_num, v_license_expires
    FROM company_seat_licenses csl
   WHERE csl.assigned_user_id = p_user_id
   LIMIT 1;

  -- Company-suspended retains its legacy meaning (subscription_status
  -- flag). Stage 4/5 will retire payment_failed once renewal lands.
  -- subscription_status kept for legacy callers but no longer gates
  -- access. With per-seat licenses, a user is allowed in whenever
  -- their seat is still within its paid period, regardless of
  -- whether the most recent renewal attempt at the company level
  -- failed.
  v_company_suspended := (v_status = 'payment_failed');

  -- Seat-level suspension under the new model:
  --   - The owner is never seat-suspended (no license required).
  --   - A non-owner with no license is seat-suspended.
  --   - A non-owner whose license has passed its expires_at is
  --     seat-suspended.
  IF v_is_owner THEN
    v_seat_suspended := false;
  ELSIF v_license_expires IS NULL THEN
    -- No attached license. Could be over-quota legacy, or a brand-
    -- new member not yet placed on a seat (Stage 6 will cover this
    -- properly). Either way: blocked.
    v_seat_suspended := true;
  ELSE
    v_seat_suspended := (v_license_expires <= NOW());
  END IF;

  RETURN json_build_object(
    'has_company',           true,
    'company_id',            v_company_id,
    'is_owner',              v_is_owner,
    'subscription_status',   COALESCE(v_status, 'free'),
    -- Surface the LICENSE seat number when available; fall back to
    -- the legacy column. Either way the user only ever has one.
    'seat_number',           COALESCE(v_license_seat_num, v_legacy_seat_num),
    'paid_seats',            v_paid_seats,
    -- v3.74.379 — new fields for the suspended page UX
    'seat_expires_at',       v_license_expires,
    'is_company_suspended',  v_company_suspended,
    'is_seat_suspended',     v_seat_suspended,
    -- v3.74.379 — access decision lives purely on the seat license.
    -- The old "(NOT is_owner AND (company_suspended OR seat_suspended))"
    -- blocked users out when their company's last renewal failed
    -- even though the seat they paid for was still inside its
    -- valid window. Per-seat model says: license dates rule.
    'is_suspended',          (NOT v_is_owner AND v_seat_suspended)
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_company_status(uuid) IS
  'v3.74.379 - Seat-license-only suspension. subscription_status is surfaced but does not gate access. is_suspended = (NOT is_owner AND is_seat_suspended).';
