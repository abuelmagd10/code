-- v3.74.377 — Seat License Stage 1 of 6: foundation table + backfill.
--
-- New conceptual model the owner asked for:
--   1. A "seat" is its own row with its own purchased_at + expires_at.
--      The license belongs to the seat, not to the user.
--   2. Users attach to seats via assigned_user_id. Moving a user
--      between seats does NOT change any seat dates.
--   3. Each company has its own seat numbers (1..N). Seat 0 is the
--      owner's virtual free seat — never appears in this table.
--   4. Buying multiple seats in the same checkout creates several
--      rows with the SAME purchased_at + expires_at (same invoice).
--      Buying a single seat months later creates a row with its own
--      independent dates.
--
-- What this migration changes BEHAVIORALLY: nothing.
-- The middleware, the inbox, the suspension page, the /settings/seats
-- API — all still read from company_seats.total_paid_seats and the
-- old company_members.seat_number column. This stage only lands the
-- new table, backfills it from current state, and ships helper RPCs
-- so later stages (Stage 2-6) can flip surfaces over one at a time.
--
-- Backfill strategy
--   For every company with total_paid_seats > 0:
--     create N seat_license rows, numbered 1..N
--     purchased_at = companies.current_period_start (fallback: end - 30d)
--     expires_at   = companies.current_period_end   (fallback: end of today)
--     billing_period from company_seats.billing_cycle (fallback: 'monthly')
--     assigned_user_id matches company_members.seat_number when present
--
--   Companies on the free tier (total_paid_seats = 0 or NULL) get no
--   rows — they have no paid seats to track. Members that sit at a
--   seat_number > total_paid_seats also get no row (they're over-
--   quota in the old model and stay that way).
--
-- Owner's seat 0 stays virtual and is not represented here.

-- ── 1. Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_seat_licenses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seat_number              int  NOT NULL,
  billing_period           text NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  purchased_at             timestamptz NOT NULL,
  expires_at               timestamptz NOT NULL,
  -- Which invoice originally paid for this seat (the create invoice)
  billing_invoice_id       uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  -- Most recent renewal — NULL if the seat has never been renewed
  last_renewed_at          timestamptz,
  last_renewal_invoice_id  uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  -- Currently attached user (NULL = empty seat, owner-assignable later)
  assigned_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  updated_at               timestamptz NOT NULL DEFAULT NOW(),

  -- Each company has unique seat numbers
  CONSTRAINT company_seat_licenses_company_seat_unique
    UNIQUE (company_id, seat_number)
);

-- A given user can only be on ONE seat per company. NULL is allowed
-- many times (many empty seats).
CREATE UNIQUE INDEX IF NOT EXISTS company_seat_licenses_assigned_user_unique
  ON public.company_seat_licenses (company_id, assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- Hot paths
CREATE INDEX IF NOT EXISTS company_seat_licenses_company_idx
  ON public.company_seat_licenses (company_id, seat_number);
CREATE INDEX IF NOT EXISTS company_seat_licenses_expires_idx
  ON public.company_seat_licenses (company_id, expires_at);
CREATE INDEX IF NOT EXISTS company_seat_licenses_user_idx
  ON public.company_seat_licenses (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

COMMENT ON TABLE public.company_seat_licenses IS
  'v3.74.377 - One row per purchased seat. License (purchased_at, expires_at) belongs to the seat; assigned_user_id can move via swap. Owner seat 0 is virtual and not stored here.';

-- ── 2. updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.company_seat_licenses_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_seat_licenses_updated_at ON public.company_seat_licenses;
CREATE TRIGGER company_seat_licenses_updated_at
  BEFORE UPDATE ON public.company_seat_licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.company_seat_licenses_set_updated_at();

-- ── 3. RLS — readers only, no direct writes from authed users ─
-- All seat manipulation happens through SECURITY DEFINER RPCs
-- (Stages 3-5). RLS here is intentionally conservative.
ALTER TABLE public.company_seat_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_seat_licenses_select ON public.company_seat_licenses;
CREATE POLICY company_seat_licenses_select
  ON public.company_seat_licenses
  FOR SELECT
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — service_role bypasses RLS, and
-- everything else goes through SECURITY DEFINER functions.

-- ── 4. Backfill helper ─────────────────────────────────────────
-- Wraps the seeding logic so we can re-run safely if needed.
-- Idempotent: NOT EXISTS guards keep re-runs from duplicating rows.
CREATE OR REPLACE FUNCTION public.backfill_company_seat_licenses()
RETURNS TABLE (
  company_id uuid,
  seats_created int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c               RECORD;
  v_total         int;
  v_purchased_at  timestamptz;
  v_expires_at    timestamptz;
  v_billing       text;
  v_invoice_id    uuid;
  v_created       int;
  n               int;
  v_assignee      uuid;
  v_assigned_at   timestamptz;
BEGIN
  FOR c IN
    SELECT
      cmp.id                            AS company_id,
      cmp.current_period_start,
      cmp.current_period_end,
      COALESCE(cs.total_paid_seats, 0)  AS total_paid_seats,
      cs.billing_cycle
    FROM public.companies cmp
    LEFT JOIN public.company_seats cs ON cs.company_id = cmp.id
    WHERE COALESCE(cs.total_paid_seats, 0) > 0
  LOOP
    v_total       := c.total_paid_seats;
    v_expires_at  := COALESCE(c.current_period_end, NOW() + INTERVAL '30 days');
    v_purchased_at := COALESCE(c.current_period_start, v_expires_at - INTERVAL '30 days');
    v_billing     := CASE
                       WHEN c.billing_cycle = 'annual' THEN 'annual'
                       ELSE 'monthly'
                     END;

    -- Find the most recent paid invoice as the "create" invoice for
    -- all seats. Best-effort — may be NULL for legacy companies.
    SELECT id INTO v_invoice_id
      FROM public.billing_invoices
     WHERE billing_invoices.company_id = c.company_id
       AND status = 'paid'
     ORDER BY created_at DESC
     LIMIT 1;

    v_created := 0;
    FOR n IN 1..v_total LOOP
      -- Skip if a row for (company, seat_number) already exists.
      -- This guards against repeated runs of the backfill helper.
      IF NOT EXISTS (
        SELECT 1 FROM public.company_seat_licenses
         WHERE company_seat_licenses.company_id = c.company_id
           AND company_seat_licenses.seat_number = n
      ) THEN
        -- Find a user currently sitting on this seat number (if any).
        SELECT cm.user_id, cm.created_at
          INTO v_assignee, v_assigned_at
          FROM public.company_members cm
         WHERE cm.company_id = c.company_id
           AND cm.seat_number = n
         LIMIT 1;

        INSERT INTO public.company_seat_licenses (
          company_id, seat_number, billing_period,
          purchased_at, expires_at,
          billing_invoice_id, assigned_user_id, assigned_at
        ) VALUES (
          c.company_id, n, v_billing,
          v_purchased_at, v_expires_at,
          v_invoice_id, v_assignee, v_assigned_at
        );
        v_created := v_created + 1;
      END IF;
    END LOOP;

    RETURN QUERY SELECT c.company_id, v_created;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.backfill_company_seat_licenses() IS
  'v3.74.377 - One-shot helper to seed company_seat_licenses from existing company_seats + company_members. Idempotent on (company_id, seat_number).';

-- ── 5. Run the backfill at apply time ─────────────────────────
SELECT * FROM public.backfill_company_seat_licenses();

-- ── 6. Convenience read helpers (used by Stages 2-6 later) ───
-- Returns the active license a given user is sitting on, if any.
-- "Active" = expires_at > NOW(). Returns NULL for the owner (since
-- the owner has no row in this table).
CREATE OR REPLACE FUNCTION public.get_user_seat_license(p_user_id uuid)
RETURNS TABLE (
  license_id     uuid,
  company_id     uuid,
  seat_number    int,
  purchased_at   timestamptz,
  expires_at     timestamptz,
  billing_period text,
  is_expired     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    csl.id, csl.company_id, csl.seat_number,
    csl.purchased_at, csl.expires_at, csl.billing_period,
    (csl.expires_at <= NOW()) AS is_expired
  FROM public.company_seat_licenses csl
  WHERE csl.assigned_user_id = p_user_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_seat_license(uuid) IS
  'v3.74.377 - Returns the seat license a user is currently attached to (any expiry status). Owner returns no rows since seat 0 is virtual.';

-- ── 7. Test-company staggered seed ────────────────────────────
-- Owner asked for شركة تست to have 10 seats spread over different
-- purchase + expiry dates so we can validate every transition the
-- new model needs: blocked employees on expired seats, swap-to-
-- rescue, single-seat renewal, multi-seat renewal, renew-all-expired.
--
-- After the backfill above, all 10 of شركة تست's seats share the
-- company's current_period_end. This block overrides them with the
-- planned distribution:
--
--   Seat 1-4: EXPIRED (purchased mar/apr/may, expires apr/may/jun)
--   Seat 5  : about to expire (active 1 day at apply time)
--   Seat 6-10: active with progressively longer expiry windows
--
-- The UPDATE is a no-op on a fresh DB that doesn't have شركة تست,
-- so this is safe to ship alongside the rest of the migration.

WITH seed AS (
  SELECT * FROM (VALUES
    (1,  '2026-03-15'::date, '2026-04-15'::date),
    (2,  '2026-04-01'::date, '2026-05-01'::date),
    (3,  '2026-04-20'::date, '2026-05-20'::date),
    (4,  '2026-05-15'::date, '2026-06-15'::date),
    (5,  '2026-05-28'::date, '2026-06-28'::date),
    (6,  '2026-06-01'::date, '2026-07-01'::date),
    (7,  '2026-06-10'::date, '2026-07-10'::date),
    (8,  '2026-06-15'::date, '2026-07-15'::date),
    (9,  '2026-06-20'::date, '2026-07-20'::date),
    (10, '2026-06-25'::date, '2026-07-25'::date)
  ) s(seat_number, purchased, expires)
)
UPDATE public.company_seat_licenses csl
   SET purchased_at = (s.purchased::timestamp AT TIME ZONE 'UTC'),
       expires_at   = (s.expires::timestamp AT TIME ZONE 'UTC'),
       updated_at   = NOW()
  FROM seed s
 WHERE csl.company_id = '8ef6338c-1713-4202-98ac-863633b76526'::uuid
   AND csl.seat_number = s.seat_number;
