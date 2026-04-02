-- ============================================================
-- Migration: Fix Payment vs Pending Return Conflict
-- Created: 2026-04-03
-- ============================================================
-- Problem: A payment can be registered against a bill AFTER a
-- purchase return is created (pending_approval) but BEFORE it is
-- approved. This allows overpayment because prevent_bill_overpayment
-- reads bills.returned_amount which is only updated at warehouse
-- confirmation (not at return creation).
--
-- Fix 1: prevent_bill_overpayment now subtracts pending return amounts
--        from the available balance when validating a new payment.
--
-- Fix 2: confirm_purchase_return_delivery_v3 checks for overpayment
--        BEFORE executing the financial impact of the return.
--        Error code P0002 is returned so the frontend can display
--        a clear Arabic/English message to the user.
-- ============================================================

-- ---------------------------------------------------------------
-- FIX 1: Update prevent_bill_overpayment trigger
-- Now includes pending purchase returns in the available balance
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_bill_overpayment()
RETURNS trigger AS $$
DECLARE
  v_bill_total        NUMERIC;
  v_bill_returned     NUMERIC;
  v_pending_returns   NUMERIC;
  v_current_paid      NUMERIC;
  v_net_available     NUMERIC;
BEGIN
  -- Only guard when linking to a bill
  IF NEW.bill_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;

  -- Fetch bill financials
  SELECT
    COALESCE(b.total_amount, 0),
    COALESCE(b.returned_amount, 0)
  INTO v_bill_total, v_bill_returned
  FROM bills b WHERE id = NEW.bill_id;

  -- ✅ FIX: Also count any PENDING purchase returns not yet reflected in returned_amount
  SELECT COALESCE(SUM(pr.total_amount), 0)
  INTO v_pending_returns
  FROM purchase_returns pr
  WHERE pr.bill_id = NEW.bill_id
    AND pr.status IN ('pending_approval', 'pending_warehouse')
    AND COALESCE(pr.is_deleted, false) = false;

  -- Approved payments already allocated to this bill (excluding current)
  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_current_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Net available = bill total - already returned - pending returns
  v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

  IF (v_current_paid + NEW.amount) > v_net_available THEN
    RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: Payment of % would exceed net outstanding of % (total=%, returned=%, pending_returns=%, already_paid=%)',
      NEW.amount,
      v_net_available - v_current_paid,
      v_bill_total,
      v_bill_returned,
      v_pending_returns,
      v_current_paid
    USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- FIX 2: Add overpayment guard to confirm_purchase_return_delivery_v3
-- Called at warehouse confirmation (final step of return workflow)
-- Checks BEFORE committing financial impact of return
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_purchase_return_delivery_v3(
    p_purchase_return_id UUID,
    p_confirmed_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pr                RECORD;
    v_company_id        UUID;
    v_supplier_id       UUID;
    v_bill_id           UUID;
    v_transition_result JSONB;
    v_item              RECORD;
    v_je_id             UUID;
    v_credit_id         UUID;
    v_draft_data        JSONB;
    v_journal_entry     JSONB;
    v_journal_lines     JSONB;
    v_vendor_credit     JSONB;
    v_vendor_credit_items JSONB;
    v_bill_update       JSONB;
    -- ✅ NEW: Overpayment guard variables
    v_bill_total        NUMERIC;
    v_bill_returned     NUMERIC;
    v_current_paid      NUMERIC;
    v_net_after_return  NUMERIC;
    v_overpayment       NUMERIC;
BEGIN
    PERFORM set_config('app.allow_direct_post', 'true', true);

    SELECT * INTO v_pr FROM purchase_returns WHERE id = p_purchase_return_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found'; END IF;

    v_company_id  := v_pr.company_id;
    v_supplier_id := v_pr.supplier_id;
    v_bill_id     := v_pr.bill_id;
    v_draft_data  := v_pr.draft_financial_data;

    -- ✅ FIX 2: Guard against overpayment BEFORE applying return
    IF v_bill_id IS NOT NULL THEN
        SELECT
            COALESCE(b.total_amount, 0),
            COALESCE(b.returned_amount, 0)
        INTO v_bill_total, v_bill_returned
        FROM bills b WHERE id = v_bill_id;

        -- Total approved payments already made on this bill
        SELECT COALESCE(SUM(pa.allocated_amount), 0)
        INTO v_current_paid
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        WHERE pa.bill_id = v_bill_id
          AND p.status = 'approved'
          AND COALESCE(p.is_deleted, false) = false;

        -- What the net bill amount will be AFTER this return is applied
        v_net_after_return := GREATEST(v_bill_total - v_bill_returned - v_pr.total_amount, 0);

        -- If payments exceed the net amount after return → block
        IF v_current_paid > v_net_after_return THEN
            v_overpayment := v_current_paid - v_net_after_return;
            RAISE EXCEPTION 'RETURN_BLOCKED_OVERPAYMENT: Approving this return of % would cause an overpayment of % on bill (total=%, already_returned=%, paid=%). Please adjust or reverse the payment first.',
                v_pr.total_amount,
                v_overpayment,
                v_bill_total,
                v_bill_returned,
                v_current_paid
            USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- Proceed with original logic
    v_transition_result := transition_purchase_return_state(p_purchase_return_id, v_company_id, p_confirmed_by, 'completed', p_notes);

    UPDATE purchase_return_items SET is_deducted = true WHERE purchase_return_id = p_purchase_return_id AND is_deducted = false;

    FOR v_item IN (SELECT * FROM purchase_return_items WHERE purchase_return_id = p_purchase_return_id) LOOP
        INSERT INTO inventory_transactions (
            company_id, branch_id, warehouse_id, product_id,
            transaction_type, reference_type, reference_id,
            quantity_change, unit_cost, total_cost,
            transaction_date, notes, is_deleted
        ) VALUES (
            v_company_id, v_pr.branch_id, v_pr.warehouse_id, v_item.product_id,
            'purchase_return', 'purchase_return', p_purchase_return_id,
            -(v_item.quantity), v_item.unit_price, -(v_item.quantity * v_item.unit_price),
            NOW(), 'مرتجع مشتريات ' || v_pr.return_number, false
        );

        UPDATE bill_items SET returned_quantity = COALESCE(returned_quantity, 0) + v_item.quantity WHERE id = v_item.bill_item_id;
    END LOOP;

    IF v_draft_data IS NOT NULL THEN
        v_journal_entry       := v_draft_data->'journal_entry';
        v_journal_lines       := v_draft_data->'journal_lines';
        v_vendor_credit       := v_draft_data->'vendor_credit';
        v_vendor_credit_items := v_draft_data->'vendor_credit_items';
        v_bill_update         := v_draft_data->'bill_update';

        IF v_journal_entry IS NOT NULL THEN
            INSERT INTO journal_entries (company_id, branch_id, cost_center_id, reference_type, reference_id, entry_date, description, status, created_by)
            VALUES (v_company_id, v_pr.branch_id, v_pr.cost_center_id, 'purchase_return', p_purchase_return_id, (v_journal_entry->>'entry_date')::DATE, v_journal_entry->>'description', 'draft', p_confirmed_by) RETURNING id INTO v_je_id;

            IF v_journal_lines IS NOT NULL THEN
                INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
                SELECT v_je_id, (l->>'account_id')::UUID, COALESCE((l->>'debit_amount')::NUMERIC, 0), COALESCE((l->>'credit_amount')::NUMERIC, 0), l->>'description', v_pr.branch_id, v_pr.cost_center_id
                FROM jsonb_array_elements(v_journal_lines) AS l;
            END IF;

            UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
            UPDATE purchase_returns SET journal_entry_id = v_je_id WHERE id = p_purchase_return_id;
        END IF;

        IF v_vendor_credit IS NOT NULL THEN
            INSERT INTO vendor_credits (company_id, supplier_id, bill_id, source_purchase_return_id, source_purchase_invoice_id, journal_entry_id, credit_number, credit_date, status, subtotal, tax_amount, total_amount, applied_amount, branch_id, cost_center_id, notes, created_by)
            VALUES (v_company_id, v_supplier_id, v_bill_id, p_purchase_return_id, v_bill_id, v_je_id, v_vendor_credit->>'credit_number', COALESCE((v_vendor_credit->>'credit_date')::DATE, CURRENT_DATE), 'open', COALESCE((v_vendor_credit->>'subtotal')::NUMERIC, 0), COALESCE((v_vendor_credit->>'tax_amount')::NUMERIC, 0), COALESCE((v_vendor_credit->>'total_amount')::NUMERIC, 0), 0, v_pr.branch_id, v_pr.cost_center_id, v_vendor_credit->>'notes', p_confirmed_by) RETURNING id INTO v_credit_id;

            IF v_vendor_credit_items IS NOT NULL THEN
                INSERT INTO vendor_credit_items (vendor_credit_id, product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total)
                SELECT v_credit_id, NULLIF(vci->>'product_id', '')::UUID, vci->>'description', COALESCE((vci->>'quantity')::NUMERIC, 0), COALESCE((vci->>'unit_price')::NUMERIC, 0), COALESCE((vci->>'tax_rate')::NUMERIC, 0), COALESCE((vci->>'discount_percent')::NUMERIC, 0), COALESCE((vci->>'line_total')::NUMERIC, 0)
                FROM jsonb_array_elements(v_vendor_credit_items) AS vci;
            END IF;

            INSERT INTO system_events (company_id, event_type, reference_type, reference_id, payload, user_id, event_key)
            VALUES (v_company_id, 'vendor_credit.created', 'vendor_credit', v_credit_id, jsonb_build_object('return_id', p_purchase_return_id, 'amount', v_pr.total_amount), p_confirmed_by, 'vendor_credit.created.' || v_credit_id::text) ON CONFLICT DO NOTHING;
        END IF;

        IF v_bill_update IS NOT NULL THEN
            UPDATE bills SET
                returned_amount = COALESCE(NULLIF(v_bill_update->>'returned_amount', '')::NUMERIC, returned_amount),
                return_status   = COALESCE(NULLIF(v_bill_update->>'return_status', ''), return_status),
                status          = COALESCE(NULLIF(v_bill_update->>'status', ''), status),
                updated_at = NOW()
            WHERE id = v_bill_id;
        END IF;

        UPDATE purchase_returns SET draft_financial_data = NULL WHERE id = p_purchase_return_id;

    ELSE
        UPDATE bills SET
            returned_amount = COALESCE(returned_amount, 0) + v_pr.total_amount,
            return_status = CASE WHEN (COALESCE(returned_amount, 0) + v_pr.total_amount) >= total_amount THEN 'fully_returned' ELSE 'partially_returned' END
        WHERE id = v_bill_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'purchase_return_id', p_purchase_return_id);
END;
$$;
