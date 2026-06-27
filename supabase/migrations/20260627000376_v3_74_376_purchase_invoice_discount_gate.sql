-- v3.74.376 — Stage 5 of 5: purchase invoice (bill) discount gate.
--
-- Same pattern as v3.74.375 (sales invoices), but on bills with
-- 'purchase_invoice' as the discount_approvals document_type. Two
-- triggers + a backfill:
--
--   1. bill_request_discount_approval — AFTER INSERT OR UPDATE OF
--      discount_value/discount_type on bills in 'draft'. Auto-opens
--      a pending discount_approvals row, idempotent on no-op edits,
--      cancels stale pending rows when the amount or type changes.
--
--   2. bill_block_post_unapproved_discount — BEFORE UPDATE OF status
--      on bills. Refuses to move the bill out of 'draft' into any
--      posted-like status when a non-zero discount lacks a matching
--      approved approval row.
--
-- Bypass flag: same app.skip_discount_approval session-local GUC the
-- sales triggers use. Today only complete_booking_atomic sets it
-- (for booking-generated SALES invoices), so there's no current
-- caller that would skip the bill triggers — but the helper sits
-- there for future RPCs that need it. Cheaper than rebuilding the
-- pattern.
--
-- requester precedence on bills: last_edited_by_user_id first
-- (matches the "whoever just saved" intent), then created_by_user_id,
-- then created_by. At least one is reliably set on every PATCH.

-- ── 1. Auto-request trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bill_request_discount_approval_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_id      uuid;
  v_last_status  text;
  v_last_value   numeric;
  v_last_type    text;
  v_party_name   text;
  v_requester    uuid;
BEGIN
  IF current_setting('app.skip_discount_approval', true) = 'booking' THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_value IS NULL OR NEW.discount_value <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Detect no-op updates so we don't double-open the inbox.
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.discount_value, 0) = NEW.discount_value
     AND COALESCE(OLD.discount_type, '') = COALESCE(NEW.discount_type, '') THEN
    RETURN NEW;
  END IF;

  SELECT id, status, discount_value, discount_type
    INTO v_last_id, v_last_status, v_last_value, v_last_type
    FROM public.discount_approvals
   WHERE document_type = 'purchase_invoice' AND document_id = NEW.id
   ORDER BY requested_at DESC
   LIMIT 1;

  -- Idempotent: same value + type + pending/approved → nothing to do.
  IF FOUND
     AND v_last_status IN ('pending', 'approved')
     AND v_last_value = NEW.discount_value
     AND COALESCE(v_last_type, '') = COALESCE(NEW.discount_type, 'amount') THEN
    RETURN NEW;
  END IF;

  -- Cancel stale pending so the inbox shows only the current ask.
  IF FOUND AND v_last_status = 'pending' THEN
    UPDATE public.discount_approvals
       SET status = 'cancelled',
           decision_note = COALESCE(decision_note, 'Superseded by amended discount on the purchase invoice.'),
           updated_at = NOW()
     WHERE id = v_last_id;
  END IF;

  BEGIN
    SELECT name INTO v_party_name
      FROM public.suppliers
     WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN
    v_party_name := NULL;
  END;

  v_requester := COALESCE(NEW.last_edited_by_user_id, NEW.created_by_user_id, NEW.created_by);
  IF v_requester IS NULL THEN
    RAISE EXCEPTION
      'Cannot open discount approval — no requester recorded on bill %.', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at
  ) VALUES (
    NEW.company_id, 'purchase_invoice', NEW.id, NEW.bill_number,
    NEW.discount_value, COALESCE(NEW.discount_type, 'amount'),
    NEW.total_amount, v_party_name,
    NULL, 'pending', v_requester, NOW()
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bill_request_discount_approval_trg() IS
  'v3.74.376 - Auto-opens discount_approvals row when a draft purchase invoice gets a non-zero discount. Bypassed when app.skip_discount_approval=''booking''.';

DROP TRIGGER IF EXISTS bill_request_discount_approval ON public.bills;
CREATE TRIGGER bill_request_discount_approval
  AFTER INSERT OR UPDATE OF discount_value, discount_type ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.bill_request_discount_approval_trg();

-- ── 2. Posting gate ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bill_block_post_unapproved_discount_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval_state text;
BEGIN
  IF current_setting('app.skip_discount_approval', true) = 'booking' THEN
    RETURN NEW;
  END IF;

  -- Only care about transitions out of draft.
  IF COALESCE(OLD.status, '') <> 'draft' THEN
    RETURN NEW;
  END IF;
  -- Any forward-status transition that turns the bill into a real
  -- liability. The "rejected" / "deleted" exits stay open — they
  -- don't post anything financial.
  IF NEW.status NOT IN ('sent', 'approved', 'posted', 'paid', 'partially_paid') THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_value IS NULL OR NEW.discount_value <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT status
    INTO v_approval_state
    FROM public.discount_approvals
   WHERE document_type = 'purchase_invoice'
     AND document_id   = NEW.id
     AND discount_value = NEW.discount_value
     AND COALESCE(discount_type, 'amount') = COALESCE(NEW.discount_type, 'amount')
   ORDER BY requested_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'الخصم المطبق على فاتورة المورد يتطلب اعتماد المالك / المدير العام قبل الترحيل. اطلب الاعتماد من صندوق الموافقات.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_approval_state <> 'approved' THEN
    RAISE EXCEPTION
      'الخصم على فاتورة المورد منتظر اعتماد الإدارة (الحالة الحالية: %). لا يمكن ترحيل الفاتورة قبل الاعتماد.',
      v_approval_state
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bill_block_post_unapproved_discount_trg() IS
  'v3.74.376 - Refuses to flip a purchase invoice (bill) from draft to a posted status when it carries an unapproved discount.';

DROP TRIGGER IF EXISTS bill_block_post_unapproved_discount ON public.bills;
CREATE TRIGGER bill_block_post_unapproved_discount
  BEFORE UPDATE OF status ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.bill_block_post_unapproved_discount_trg();

-- ── 3. Backfill ────────────────────────────────────────────────
-- For any draft bill that already carries a non-zero discount, open
-- a pending approval row. NOT EXISTS guard keeps it idempotent.
INSERT INTO public.discount_approvals (
  company_id, document_type, document_id, document_no,
  discount_value, discount_type, document_total, party_name,
  reason, status, requested_by, requested_at
)
SELECT b.company_id, 'purchase_invoice', b.id, b.bill_number,
       b.discount_value, COALESCE(b.discount_type, 'amount'),
       b.total_amount,
       (SELECT name FROM public.suppliers WHERE id = b.supplier_id),
       'Auto-backfill on v3.74.376 rollout',
       'pending',
       COALESCE(b.last_edited_by_user_id, b.created_by_user_id, b.created_by),
       NOW()
  FROM public.bills b
 WHERE b.discount_value > 0
   AND b.status = 'draft'
   AND COALESCE(b.is_deleted, false) = false
   AND COALESCE(b.last_edited_by_user_id, b.created_by_user_id, b.created_by) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.discount_approvals da
      WHERE da.document_type = 'purchase_invoice'
        AND da.document_id   = b.id
   );
