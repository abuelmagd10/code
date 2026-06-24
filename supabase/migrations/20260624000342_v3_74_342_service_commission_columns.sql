-- ============================================================================
-- v3.74.342 — Service Commission columns on user_bonuses
-- ============================================================================
--
-- The owner asked for service commission to flow through the existing
-- bonus → payroll pipeline rather than a parallel sub-ledger. To do
-- that the user_bonuses table needs two new columns:
--
--   * source     TEXT      — discriminates the existing sales bonuses
--                            ('sales') from the new service-commission
--                            rows ('service_commission'). Backfilled
--                            to 'sales' for every historical row.
--
--   * booking_id UUID      — points back to the booking the commission
--                            was earned from. NULL for sales bonuses.
--
-- A partial UNIQUE index on (company_id, booking_id) — restricted to
-- still-active rows — gives us idempotency: the payment-side hook and
-- the activation-side "born paid" hook can both fire safely, and the
-- second one becomes a no-op via 23505.
--
-- Already-reversed rows are excluded so that if HR later flips the
-- status back to a fresh attempt, the unique check still allows it.
-- ============================================================================

ALTER TABLE public.user_bonuses
  ADD COLUMN IF NOT EXISTS source     TEXT,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id);

-- Tag every historical row as a sales bonus so the discriminator is
-- never NULL after this migration runs.
UPDATE public.user_bonuses
   SET source = 'sales'
 WHERE source IS NULL;

-- Idempotency guard for the new service-commission flow. Sales rows
-- have booking_id IS NULL so they sit outside the index entirely.
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_bonuses_booking_active
  ON public.user_bonuses (company_id, booking_id)
  WHERE booking_id IS NOT NULL
    AND status NOT IN ('reversed', 'cancelled');

COMMENT ON COLUMN public.user_bonuses.source IS
  'Origin discriminator: ''sales'' (default) or ''service_commission''.';
COMMENT ON COLUMN public.user_bonuses.booking_id IS
  'Booking that earned this commission. NULL for sales bonuses.';
