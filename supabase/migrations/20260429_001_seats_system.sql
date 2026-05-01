-- ============================================================
-- SEATS SYSTEM MIGRATION - 7ESAB ERP
-- File: 20260429_001_seats_system.sql
-- Safe: Uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS
-- No data loss. Existing companies continue to work as 'free'.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. ALTER companies: Add subscription fields
-- ─────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free'
    CHECK (subscription_status IN ('free','active','past_due','canceled','payment_failed')),
  ADD COLUMN IF NOT EXISTS paymob_order_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- ─────────────────────────────────────────────
-- 2. CREATE company_seats table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_seats (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  total_paid_seats     INTEGER     NOT NULL DEFAULT 0,
  price_per_seat_egp   INTEGER     NOT NULL DEFAULT 500,
  billing_cycle        TEXT        NOT NULL DEFAULT 'monthly',
  status               TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','paused','canceled')),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id)
);

-- ─────────────────────────────────────────────
-- 3. ALTER company_invitations: Add seat fields
-- ─────────────────────────────────────────────
ALTER TABLE company_invitations
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','cancelled')),
  ADD COLUMN IF NOT EXISTS seat_reserved   BOOLEAN     DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invited_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMPTZ;

-- ─────────────────────────────────────────────
-- 4. CREATE seat_transactions (audit trail)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seat_transactions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_type        TEXT        NOT NULL,  -- 'purchase','refund','release','activate','reserve'
  seats_delta             INTEGER     NOT NULL,  -- positive = add, negative = remove
  paymob_transaction_id   TEXT,
  amount_egp              INTEGER,
  performed_by            UUID,                  -- user who triggered this
  metadata                JSONB       DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- Index for idempotency check
CREATE UNIQUE INDEX IF NOT EXISTS seat_transactions_paymob_txn_unique
  ON seat_transactions(paymob_transaction_id)
  WHERE paymob_transaction_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 5. RLS Policies for new tables
-- ─────────────────────────────────────────────

-- company_seats: only company members can read, only service_role writes
ALTER TABLE company_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_seats_select" ON company_seats;
CREATE POLICY "company_seats_select" ON company_seats
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- seat_transactions: only company members can read
ALTER TABLE seat_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seat_transactions_select" ON seat_transactions;
CREATE POLICY "seat_transactions_select" ON seat_transactions
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 6. Function: get_seat_status(company_id)
-- Returns real-time seat availability for a company
-- Owner (companies.user_id) is ALWAYS free - never counted
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_seat_status(p_company_id UUID)
RETURNS JSON
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
BEGIN
  -- Get owner user_id (always free)
  SELECT user_id, subscription_status
  INTO v_owner_id, v_sub_status
  FROM companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Company not found');
  END IF;

  -- Get paid seats for this company (0 if no record yet = free tier)
  SELECT COALESCE(total_paid_seats, 0), COALESCE(price_per_seat_egp, 500)
  INTO v_total_paid_seats, v_price_per_seat
  FROM company_seats
  WHERE company_id = p_company_id;

  -- Active members EXCLUDING the owner (owner is always free)
  SELECT COUNT(*)
  INTO v_active_members
  FROM company_members
  WHERE company_id = p_company_id
    AND user_id != v_owner_id;

  -- Pending invitations that have a reserved seat (not expired, not cancelled)
  SELECT COUNT(*)
  INTO v_pending_invites
  FROM company_invitations
  WHERE company_id = p_company_id
    AND accepted = FALSE
    AND seat_reserved = TRUE
    AND expires_at > now()
    AND COALESCE(status, 'pending') = 'pending';

  -- Available = paid - used - reserved (min 0)
  v_available := GREATEST(0, v_total_paid_seats - v_active_members - v_pending_invites);

  RETURN json_build_object(
    'total_paid_seats',  v_total_paid_seats,
    'used_seats',        v_active_members,
    'reserved_seats',    v_pending_invites,
    'available_seats',   v_available,
    'can_invite',        v_available > 0,
    'owner_id',          v_owner_id,
    'subscription_status', COALESCE(v_sub_status, 'free'),
    'price_per_seat_egp', v_price_per_seat
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_seat_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_seat_status(UUID) TO service_role;

-- ─────────────────────────────────────────────
-- 7. Function: reserve_seat(company_id, invite_id)
-- Atomically checks availability and reserves a seat
-- Returns success/error JSON
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reserve_seat(
  p_company_id UUID,
  p_invite_id  UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status JSON;
  v_available INTEGER;
BEGIN
  -- Lock the company_seats row to prevent race condition
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id::TEXT));

  -- Check current availability
  SELECT get_seat_status(p_company_id) INTO v_status;
  v_available := (v_status->>'available_seats')::INTEGER;

  IF v_available <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', 'no_seats_available');
  END IF;

  -- Mark the invitation as having a reserved seat
  UPDATE company_invitations
  SET seat_reserved = TRUE, status = 'pending'
  WHERE id = p_invite_id AND company_id = p_company_id;

  -- Log the reservation
  INSERT INTO seat_transactions(company_id, transaction_type, seats_delta, metadata)
  VALUES (p_company_id, 'reserve', 0, json_build_object('invite_id', p_invite_id));

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_seat(UUID, UUID) TO service_role;

-- ─────────────────────────────────────────────
-- 8. Function: release_seat(company_id, invite_id)
-- Called when an invitation is cancelled
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_seat(
  p_company_id UUID,
  p_invite_id  UUID,
  p_by_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE company_invitations
  SET seat_reserved = FALSE,
      status = 'cancelled',
      cancelled_at = now()
  WHERE id = p_invite_id AND company_id = p_company_id;

  INSERT INTO seat_transactions(company_id, transaction_type, seats_delta, performed_by, metadata)
  VALUES (p_company_id, 'release', 0, p_by_user_id, json_build_object('invite_id', p_invite_id));

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION release_seat(UUID, UUID, UUID) TO service_role;

-- ─────────────────────────────────────────────
-- 9. Function: activate_seat(company_id, invite_id)
-- Called when an invitation is accepted — converts reserved → active
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION activate_seat(
  p_company_id UUID,
  p_invite_id  UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite
  FROM company_invitations
  WHERE id = p_invite_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'invite_not_found');
  END IF;

  IF v_invite.accepted = TRUE OR COALESCE(v_invite.status,'pending') = 'accepted' THEN
    RETURN json_build_object('success', FALSE, 'error', 'invite_already_accepted');
  END IF;

  IF COALESCE(v_invite.status,'pending') = 'cancelled' THEN
    RETURN json_build_object('success', FALSE, 'error', 'invite_cancelled');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN json_build_object('success', FALSE, 'error', 'invite_expired');
  END IF;

  -- Mark invite as accepted and convert seat from reserved to active
  UPDATE company_invitations
  SET accepted = TRUE,
      status = 'accepted',
      seat_reserved = FALSE,  -- no longer "pending reserved" — now it's an active member
      accepted_at = now()
  WHERE id = p_invite_id;

  -- Log activation
  INSERT INTO seat_transactions(company_id, transaction_type, seats_delta, metadata)
  VALUES (p_company_id, 'activate', 0, json_build_object('invite_id', p_invite_id));

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION activate_seat(UUID, UUID) TO service_role;

-- ─────────────────────────────────────────────
-- 10. Function: increase_seats (idempotent)
-- Called from Paymob webhook - safe to call multiple times
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increase_seats(
  p_company_id          UUID,
  p_seats_count         INTEGER,
  p_paymob_txn_id       TEXT,
  p_amount_egp          INTEGER DEFAULT NULL,
  p_performed_by        UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_txn_id UUID;
BEGIN
  -- Idempotency check: has this paymob transaction been processed before?
  SELECT id INTO v_existing_txn_id
  FROM seat_transactions
  WHERE paymob_transaction_id = p_paymob_txn_id;

  IF FOUND THEN
    RETURN json_build_object('success', TRUE, 'idempotent', TRUE, 'message', 'already_processed');
  END IF;

  -- Upsert company_seats
  INSERT INTO company_seats(company_id, total_paid_seats, status)
  VALUES (p_company_id, p_seats_count, 'active')
  ON CONFLICT (company_id)
  DO UPDATE SET
    total_paid_seats = company_seats.total_paid_seats + EXCLUDED.total_paid_seats,
    updated_at = now();

  -- Update subscription status on company
  UPDATE companies
  SET subscription_status = 'active',
      current_period_start = now(),
      current_period_end = (now() + INTERVAL '1 month')
  WHERE id = p_company_id;

  -- Log the transaction
  INSERT INTO seat_transactions(
    company_id, transaction_type, seats_delta,
    paymob_transaction_id, amount_egp, performed_by, metadata
  )
  VALUES (
    p_company_id, 'purchase', p_seats_count,
    p_paymob_txn_id, p_amount_egp, p_performed_by,
    json_build_object('source', 'paymob_webhook')
  );

  RETURN json_build_object('success', TRUE, 'idempotent', FALSE, 'new_seats', p_seats_count);
END;
$$;

GRANT EXECUTE ON FUNCTION increase_seats(UUID, INTEGER, TEXT, INTEGER, UUID) TO service_role;

-- ─────────────────────────────────────────────
-- 11. updated_at trigger for company_seats
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_seats_updated_at ON company_seats;
CREATE TRIGGER set_company_seats_updated_at
  BEFORE UPDATE ON company_seats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- END OF MIGRATION
-- ─────────────────────────────────────────────
