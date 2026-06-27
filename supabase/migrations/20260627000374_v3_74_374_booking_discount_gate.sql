-- v3.74.374 — Stage 3 of 5: wire the booking activation discount gate.
--
-- The foundation (v3.74.372) and inbox (v3.74.373) gave us a place to
-- track and decide discount approvals, but nothing in the product was
-- actually creating them or blocking on them. This migration closes the
-- loop for bookings:
--
--   1. AFTER INSERT/UPDATE on bookings, if discount_amount > 0 changes
--      hands on a still-editable booking (draft or confirmed, no invoice
--      yet), open a discount_approvals row in 'pending'. Existing pending
--      requests for a different value get cancelled first so the inbox
--      shows the *current* request, not a stale one.
--
--      Idempotency: if the latest approval is already 'pending' OR
--      'approved' with the same value, do nothing. The trigger fires on
--      every UPDATE so this matters — without the check the inbox would
--      duplicate every time the booking row is touched.
--
--   2. activate_booking_atomic — the RPC that "تنفيذ الخدمة" calls —
--      now refuses to run if the booking carries a non-zero discount and
--      there is no matching approved approval. Body is otherwise the
--      v3.74.370 hop-through-confirmed implementation, byte-identical
--      except for the new gate block.
--
-- Backward compatibility
--   Bookings that already had a discount applied BEFORE this migration
--   are honored — the trigger only fires on changes, so it doesn't
--   retroactively block in-flight work. If someone tries to activate one
--   of those, the guard catches it and asks them to re-save the booking
--   (which fires the trigger and opens the approval row).
--
-- Notes about the discount type literal
--   bookings.discount_amount is, as the column name suggests, a monetary
--   value (EGP) — not a percentage. We always log 'amount' as the
--   discount_type. This matches the v3.74.371 fix for complete_booking_
--   atomic that switched the invoice insert from 'fixed' to 'amount'.

-- ── 1. Helper trigger function ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.bkg_request_discount_approval_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_id     uuid;
  v_last_status text;
  v_last_value  numeric;
  v_party_name  text;
  v_requester   uuid;
BEGIN
  -- Skip if nothing relevant changed.
  IF NEW.discount_amount IS NULL OR NEW.discount_amount <= 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.discount_amount, 0) = NEW.discount_amount THEN
    RETURN NEW;
  END IF;

  -- Only gate bookings that haven't been executed yet. Once the
  -- invoice exists or the booking is past in_progress, we can't
  -- meaningfully "approve" the discount anymore.
  IF NEW.status NOT IN ('draft', 'confirmed') OR NEW.invoice_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the latest approval row for this booking (any status).
  SELECT id, status, discount_value
    INTO v_last_id, v_last_status, v_last_value
    FROM public.discount_approvals
   WHERE document_type = 'booking' AND document_id = NEW.id
   ORDER BY requested_at DESC
   LIMIT 1;

  -- Idempotent fast-path: there is already a pending/approved
  -- request that matches the current amount, so the trigger's job
  -- is already done.
  IF FOUND AND v_last_status IN ('pending', 'approved') AND v_last_value = NEW.discount_amount THEN
    RETURN NEW;
  END IF;

  -- If there's a pending request for a *different* amount, retire
  -- it before opening the new one. Otherwise the approver would see
  -- two cards for the same booking with conflicting values.
  IF FOUND AND v_last_status = 'pending' THEN
    UPDATE public.discount_approvals
       SET status = 'cancelled',
           decision_note = COALESCE(decision_note, 'Superseded by amended discount on the booking.'),
           updated_at = NOW()
     WHERE id = v_last_id;
  END IF;

  -- Pull the customer name from the customers table for the
  -- approval card — best-effort, never block on it.
  BEGIN
    SELECT name INTO v_party_name
      FROM public.customers
     WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN
    v_party_name := NULL;
  END;

  -- requested_by precedence: whoever last touched the row, fall
  -- back to created_by, fall back to a NULL we'll let the table's
  -- NOT NULL constraint catch. updated_by is non-null on PATCH so
  -- this almost always resolves.
  v_requester := COALESCE(NEW.updated_by, NEW.created_by);
  IF v_requester IS NULL THEN
    RAISE EXCEPTION
      'Cannot open discount approval — no requester recorded on booking %.', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at
  ) VALUES (
    NEW.company_id, 'booking', NEW.id, NEW.booking_no,
    NEW.discount_amount, 'amount', NEW.total_amount, v_party_name,
    NULL, 'pending', v_requester, NOW()
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bkg_request_discount_approval_trg() IS
  'v3.74.374 - Auto-opens a discount_approvals row whenever a booking gets a non-zero discount (or that discount is changed). Skips on bookings that already have an invoice or are past in_progress.';

-- Drop the old trigger if it exists, then create. Replace pattern
-- keeps re-runs safe.
DROP TRIGGER IF EXISTS bkg_request_discount_approval ON public.bookings;
CREATE TRIGGER bkg_request_discount_approval
  AFTER INSERT OR UPDATE OF discount_amount ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bkg_request_discount_approval_trg();

-- ── 2. Activation gate ─────────────────────────────────────────
-- v3.74.374 — preserves v3.74.370 hop logic, adds discount gate
-- as the very first check after the FOR UPDATE select.
CREATE OR REPLACE FUNCTION public.activate_booking_atomic(
  p_company_id   uuid,
  p_booking_id   uuid,
  p_activated_by uuid,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_due_date     date DEFAULT CURRENT_DATE,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status         text;
  v_discount_amt   numeric;
  v_invoice_id     uuid;
  v_approval_state text;
  v_approval_id    uuid;
  v_result         jsonb;
BEGIN
  SELECT status, discount_amount, invoice_id
    INTO v_status, v_discount_amt, v_invoice_id
    FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Cannot activate a % booking. booking_id=%',
      v_status, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- v3.74.374 — Discount approval gate. If the booking carries a
  -- non-zero discount and there isn't an *approved* approval row
  -- matching the current value, we refuse to activate. The error
  -- string is intentionally in Arabic — it surfaces directly to
  -- the staff member who clicked "تنفيذ الخدمة".
  IF v_discount_amt IS NOT NULL AND v_discount_amt > 0 THEN
    SELECT id, status INTO v_approval_id, v_approval_state
      FROM public.discount_approvals
     WHERE document_type = 'booking'
       AND document_id   = p_booking_id
       AND discount_value = v_discount_amt
     ORDER BY requested_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'الخصم المطبق على الحجز يتطلب اعتماد المالك / المدير العام قبل التنفيذ. اطلب الاعتماد من صندوق الموافقات.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_approval_state <> 'approved' THEN
      RAISE EXCEPTION
        'الخصم بقيمة % منتظر اعتماد الإدارة (الحالة الحالية: %). لا يمكن تنفيذ الحجز قبل الاعتماد.',
        v_discount_amt, v_approval_state
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- v3.74.370 — Hop draft → confirmed first so the trigger guard
  -- accepts the next hop confirmed → in_progress.
  IF v_status = 'draft' THEN
    UPDATE public.bookings
       SET status       = 'confirmed',
           confirmed_by = COALESCE(confirmed_by, p_activated_by),
           confirmed_at = COALESCE(confirmed_at, NOW())
     WHERE id = p_booking_id;
    v_status := 'confirmed';
  END IF;

  IF v_status = 'confirmed' THEN
    UPDATE public.bookings
       SET status     = 'in_progress',
           started_by = COALESCE(started_by, p_activated_by),
           started_at = COALESCE(started_at, NOW())
     WHERE id = p_booking_id;
    v_status := 'in_progress';
  END IF;

  v_result := public.complete_booking_atomic(
    p_company_id   => p_company_id,
    p_booking_id   => p_booking_id,
    p_completed_by => p_activated_by,
    p_invoice_date => p_invoice_date,
    p_due_date     => p_due_date,
    p_notes        => p_notes
  );

  UPDATE public.bookings
     SET current_responsible_user_id = COALESCE(
       current_responsible_user_id,
       staff_user_id,
       p_activated_by
     )
   WHERE id = p_booking_id;

  RETURN v_result || jsonb_build_object(
    'activated_by', p_activated_by,
    'activated_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.activate_booking_atomic IS
  'v3.74.374 - Same as v3.74.370 hop activate + new discount approval gate. Refuses to run if discount_amount > 0 without a matching approved discount_approvals row.';

-- ── 3. Backfill ─────────────────────────────────────────────────
-- For any still-editable booking (draft / confirmed, no invoice) that
-- already carries a non-zero discount, open a pending approval row
-- so the inbox surfaces it and the gate has something to grade
-- against. The trigger above only fires on changes, so without this
-- step a pre-existing booking would surface the gate error with an
-- empty inbox — confusing for the approver.
INSERT INTO public.discount_approvals (
  company_id, document_type, document_id, document_no,
  discount_value, discount_type, document_total, party_name,
  reason, status, requested_by, requested_at
)
SELECT b.company_id, 'booking', b.id, b.booking_no,
       b.discount_amount, 'amount', b.total_amount,
       (SELECT name FROM public.customers WHERE id = b.customer_id),
       'Auto-backfill on v3.74.374 rollout',
       'pending',
       COALESCE(b.updated_by, b.created_by),
       NOW()
  FROM public.bookings b
 WHERE b.discount_amount > 0
   AND b.status IN ('draft','confirmed')
   AND b.invoice_id IS NULL
   AND COALESCE(b.updated_by, b.created_by) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.discount_approvals da
      WHERE da.document_type = 'booking'
        AND da.document_id   = b.id
   );
