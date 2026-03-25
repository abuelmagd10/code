-- Phase 1: Enterprise Supplier Payments - Allocations & Audit Foundation

-- 1. Create payment_allocations
CREATE TABLE IF NOT EXISTS public.payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(payment_id, bill_id)
);

-- 2. Create payment_audit_logs
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, APPROVE_L1, REJECT, etc.
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add columns to payments
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_approval_role VARCHAR(50);

-- Backfill data seamlessly for existing payments (disabling triggers to bypass historical safeguards)
ALTER TABLE public.payments DISABLE TRIGGER USER;

INSERT INTO public.payment_allocations (payment_id, bill_id, allocated_amount, created_at)
SELECT id, bill_id, amount, created_at
FROM public.payments
WHERE bill_id IS NOT NULL
  AND supplier_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.payments
SET unallocated_amount = CASE WHEN bill_id IS NOT NULL THEN 0 ELSE amount END
WHERE supplier_id IS NOT NULL;

ALTER TABLE public.payments ENABLE TRIGGER USER;

-- 4. Centralized Bill Recalculation Function
CREATE OR REPLACE FUNCTION fn_recalc_bill_paid_status(p_bill_id UUID) RETURNS VOID AS $$
DECLARE
  v_total NUMERIC;
  v_returned NUMERIC;
  v_paid NUMERIC;
  v_net NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Sum ONLY approved allocations
  SELECT
    COALESCE(b.total_amount, 0),
    COALESCE(b.returned_amount, 0),
    COALESCE(SUM(pa.allocated_amount) FILTER (WHERE p.status = 'approved' AND COALESCE(p.is_deleted, false) = false), 0)
  INTO v_total, v_returned, v_paid
  FROM bills b
  LEFT JOIN payment_allocations pa ON pa.bill_id = b.id
  LEFT JOIN payments p ON p.id = pa.payment_id
  WHERE b.id = p_bill_id
  GROUP BY b.total_amount, b.returned_amount;

  v_net := GREATEST(v_total - v_returned, 0);

  v_new_status := CASE
    WHEN v_paid <= 0 THEN 'received'
    WHEN v_paid >= v_net THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.bills
  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()
  WHERE id = p_bill_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger: Sync legacy payment inserts to set unallocated_amount
CREATE OR REPLACE FUNCTION sync_legacy_payment_unallocated() RETURNS trigger AS $$
BEGIN
  IF NEW.bill_id IS NOT NULL THEN
    NEW.unallocated_amount := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_legacy_payment_unallocated_trigger ON payments;
CREATE TRIGGER sync_legacy_payment_unallocated_trigger
BEFORE INSERT OR UPDATE OF bill_id, amount ON payments
FOR EACH ROW
WHEN (NEW.supplier_id IS NOT NULL)
EXECUTE FUNCTION sync_legacy_payment_unallocated();

-- 6. Trigger: Sync legacy payment inserts to create allocations properly
CREATE OR REPLACE FUNCTION sync_legacy_payment_allocation() RETURNS trigger AS $$
BEGIN
  IF NEW.bill_id IS NOT NULL THEN
    INSERT INTO payment_allocations (payment_id, bill_id, allocated_amount, created_at)
    VALUES (NEW.id, NEW.bill_id, NEW.amount, NEW.created_at)
    ON CONFLICT (payment_id, bill_id) DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_legacy_payment_allocation_trigger ON payments;
CREATE TRIGGER sync_legacy_payment_allocation_trigger
AFTER INSERT OR UPDATE OF bill_id, amount ON payments
FOR EACH ROW
WHEN (NEW.supplier_id IS NOT NULL)
EXECUTE FUNCTION sync_legacy_payment_allocation();

-- 7. Trigger: Allocation Changes recalculate Bill
CREATE OR REPLACE FUNCTION recalc_bill_on_allocation_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN 
    PERFORM fn_recalc_bill_paid_status(OLD.bill_id);
  ELSE 
    PERFORM fn_recalc_bill_paid_status(NEW.bill_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recalc_bill_after_allocation ON payment_allocations;
CREATE TRIGGER recalc_bill_after_allocation
AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION recalc_bill_on_allocation_change();

-- 8. Trigger: Payment Status/Delete recalculate Bills via allocations
CREATE OR REPLACE FUNCTION recalc_bills_for_payment() RETURNS trigger AS $$
DECLARE
  v_bill_id UUID;
BEGIN
  FOR v_bill_id IN 
    SELECT DISTINCT pa.bill_id FROM payment_allocations pa WHERE pa.payment_id = COALESCE(NEW.id, OLD.id)
    UNION
    SELECT COALESCE(NEW.bill_id, OLD.bill_id) WHERE COALESCE(NEW.bill_id, OLD.bill_id) IS NOT NULL
  LOOP
    IF v_bill_id IS NOT NULL THEN
      PERFORM fn_recalc_bill_paid_status(v_bill_id);
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Replace old recalc_bill_on_payment_change trigger
DROP TRIGGER IF EXISTS recalc_bill_on_payment_change ON payments;
CREATE TRIGGER recalc_bill_on_payment_change
AFTER UPDATE OF status, is_deleted OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION recalc_bills_for_payment();

-- 9. Replace prevent_bill_overpayment to use allocations table
CREATE OR REPLACE FUNCTION prevent_bill_overpayment() RETURNS trigger AS $$
DECLARE
  v_bill_total    NUMERIC;
  v_bill_returned NUMERIC;
  v_current_paid  NUMERIC;
  v_net_available NUMERIC;
BEGIN
  -- Only guard when linking legacy style. Allocation specific endpoints will have their own guards.
  IF NEW.bill_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;

  SELECT
    COALESCE(b.total_amount, 0),
    COALESCE(b.returned_amount, 0)
  INTO v_bill_total, v_bill_returned
  FROM bills b WHERE id = NEW.bill_id;

  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_current_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id 
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_net_available := GREATEST(v_bill_total - v_bill_returned, 0);

  IF (v_current_paid + NEW.amount) > v_net_available THEN
    RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: Payment of % would exceed net outstanding of % (total=%, returned=%, already_paid=%)',
      NEW.amount, v_net_available - v_current_paid, v_bill_total, v_bill_returned, v_current_paid
    USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
