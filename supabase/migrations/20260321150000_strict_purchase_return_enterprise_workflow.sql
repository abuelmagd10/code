-- ================================================================
-- Strict Enterprise Purchase Return Approval Workflow
-- ALL returns MUST go through:
--   1. pending_admin_approval → Admin approves/rejects
--   2. pending_warehouse     → Warehouse confirms/rejects
--   3. completed             → All effects applied (inventory + finance)
-- ================================================================

-- 1. Extend workflow_status constraint with new states
ALTER TABLE purchase_returns
  DROP CONSTRAINT IF EXISTS chk_purchase_returns_workflow_status;

ALTER TABLE purchase_returns
  ADD CONSTRAINT chk_purchase_returns_workflow_status
  CHECK (workflow_status IN (
    'pending_admin_approval',  -- NEW: All new returns start here (Phase 1 admin gate)
    'pending_warehouse',       -- NEW: Admin approved → waiting for warehouse confirmation
    'warehouse_rejected',      -- NEW: Warehouse rejected → user can edit & resubmit
    'pending_approval',        -- Legacy: kept for backward compat
    'partial_approval',        -- Phase 2: multi-warehouse partial confirmation
    'confirmed',               -- Warehouse confirmed (v1 flow)
    'completed',               -- Warehouse confirmed (v2 flow)
    'rejected',                -- Admin rejected
    'cancelled'
  ));

-- 2. Track warehouse rejection details
ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS warehouse_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_rejected_at TIMESTAMPTZ;

-- ================================================================
-- 3. Update process_purchase_return_atomic
--    Key changes:
--    a) v_is_pending = TRUE for ALL pending states (incl. pending_admin_approval)
--    b) status is forced to 'pending_approval' when pending (enables approve RPC)
--    c) Inventory/bill/vendor_credit deferred until warehouse confirmation
-- ================================================================
CREATE OR REPLACE FUNCTION process_purchase_return_atomic(
  p_company_id          UUID,
  p_supplier_id         UUID,
  p_bill_id             UUID,
  p_purchase_return     JSONB,
  p_return_items        JSONB,
  p_journal_entry       JSONB  DEFAULT NULL,
  p_journal_lines       JSONB  DEFAULT NULL,
  p_vendor_credit       JSONB  DEFAULT NULL,
  p_vendor_credit_items JSONB  DEFAULT NULL,
  p_bill_update         JSONB  DEFAULT NULL,
  p_workflow_status     TEXT   DEFAULT 'pending_admin_approval',
  p_created_by          UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr_id           UUID;
  v_je_id           UUID;
  v_vc_id           UUID;
  v_item            JSONB;
  v_bill_item       RECORD;
  v_current_stock   NUMERIC;
  v_requested_qty   NUMERIC;
  v_product_id      UUID;
  v_bill_item_id    UUID;
  v_warehouse_id    UUID;
  v_branch_id       UUID;
  v_cost_center_id  UUID;
  v_is_pending      BOOLEAN;
  v_je_status       TEXT;
  v_result          JSONB := '{}';
BEGIN
  v_warehouse_id   := NULLIF(p_purchase_return->>'warehouse_id', '')::UUID;
  v_branch_id      := NULLIF(p_purchase_return->>'branch_id', '')::UUID;
  v_cost_center_id := NULLIF(p_purchase_return->>'cost_center_id', '')::UUID;

  -- All admin-pending and warehouse-pending states defer execution
  v_is_pending := p_workflow_status IN (
    'pending_admin_approval', 'pending_approval', 'pending_warehouse'
  );

  v_je_status := CASE WHEN v_is_pending THEN 'draft' ELSE 'posted' END;

  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Bill ID is required to create a purchase return';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company: %', p_bill_id;
  END IF;

  -- Lock & validate items (only for immediate execution)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    IF v_bill_item_id IS NOT NULL AND NOT v_is_pending THEN
      SELECT id, quantity, COALESCE(returned_quantity, 0) AS returned_quantity
      INTO v_bill_item
      FROM bill_items WHERE id = v_bill_item_id FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill item not found: %', v_bill_item_id;
      END IF;

      IF (v_bill_item.returned_quantity + v_requested_qty) > v_bill_item.quantity THEN
        RAISE EXCEPTION 'Cannot return % units. Available: %',
          v_requested_qty, (v_bill_item.quantity - v_bill_item.returned_quantity);
      END IF;
    END IF;

    IF v_product_id IS NOT NULL AND v_warehouse_id IS NOT NULL AND NOT v_is_pending THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(p_company_id::text || v_product_id::text || v_warehouse_id::text)
      );
      SELECT COALESCE(SUM(quantity_change), 0) INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id   = p_company_id
        AND product_id   = v_product_id
        AND warehouse_id = v_warehouse_id
        AND COALESCE(is_deleted, false) = false;

      IF v_current_stock < v_requested_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
          v_product_id, v_current_stock, v_requested_qty;
      END IF;
    END IF;
  END LOOP;

  -- Create journal entry (draft when pending)
  IF p_journal_entry IS NOT NULL THEN
    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id,
      reference_type, reference_id,
      entry_date, description, status, validation_status
    ) VALUES (
      p_company_id, v_branch_id, v_cost_center_id,
      'purchase_return', NULL,
      (p_journal_entry->>'entry_date')::DATE,
      p_journal_entry->>'description',
      v_je_status,
      CASE WHEN v_is_pending THEN 'pending' ELSE 'valid' END
    ) RETURNING id INTO v_je_id;

    IF p_journal_lines IS NOT NULL AND jsonb_array_length(p_journal_lines) > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount, description,
        branch_id, cost_center_id,
        original_debit, original_credit, original_currency,
        exchange_rate_used, exchange_rate_id, rate_source
      )
      SELECT
        v_je_id,
        (l->>'account_id')::UUID,
        COALESCE((l->>'debit_amount')::NUMERIC, 0),
        COALESCE((l->>'credit_amount')::NUMERIC, 0),
        l->>'description',
        v_branch_id, v_cost_center_id,
        COALESCE((l->>'original_debit')::NUMERIC, 0),
        COALESCE((l->>'original_credit')::NUMERIC, 0),
        COALESCE(NULLIF(l->>'original_currency', ''), 'EGP'),
        COALESCE((l->>'exchange_rate_used')::NUMERIC, 1),
        NULLIF(l->>'exchange_rate_id', '')::UUID,
        l->>'rate_source'
      FROM jsonb_array_elements(p_journal_lines) AS l;
    END IF;

    v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
  END IF;

  -- Create purchase return record
  -- CRITICAL: status = 'pending_approval' for pending returns so approve RPC can act on them
  INSERT INTO purchase_returns (
    company_id, supplier_id, bill_id, journal_entry_id,
    return_number, return_date, status, workflow_status, created_by,
    subtotal, tax_amount, total_amount,
    settlement_method, reason, notes,
    branch_id, cost_center_id, warehouse_id,
    original_currency, original_subtotal, original_tax_amount, original_total_amount,
    exchange_rate_used, exchange_rate_id
  ) VALUES (
    p_company_id, p_supplier_id, p_bill_id, v_je_id,
    p_purchase_return->>'return_number',
    (p_purchase_return->>'return_date')::DATE,
    CASE WHEN v_is_pending THEN 'pending_approval' ELSE 'completed' END,
    COALESCE(NULLIF(p_workflow_status, ''), 'pending_admin_approval'),
    p_created_by,
    COALESCE((p_purchase_return->>'subtotal')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'tax_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0),
    p_purchase_return->>'settlement_method',
    p_purchase_return->>'reason',
    p_purchase_return->>'notes',
    v_branch_id, v_cost_center_id, v_warehouse_id,
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), 'EGP'),
    COALESCE((p_purchase_return->>'original_subtotal')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'original_tax_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'original_total_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'exchange_rate_used')::NUMERIC, 1),
    NULLIF(p_purchase_return->>'exchange_rate_id', '')::UUID
  ) RETURNING id INTO v_pr_id;

  v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));

  IF v_je_id IS NOT NULL THEN
    UPDATE journal_entries SET reference_id = v_pr_id WHERE id = v_je_id;
  END IF;

  -- Insert return items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    INSERT INTO purchase_return_items (
      purchase_return_id, bill_item_id, product_id,
      description, quantity, unit_price, tax_rate, discount_percent, line_total
    ) VALUES (
      v_pr_id, v_bill_item_id, v_product_id,
      v_item->>'description', v_requested_qty,
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
      COALESCE((v_item->>'line_total')::NUMERIC, 0)
    );

    -- Inventory deduction only for immediate (non-pending) execution
    IF NOT v_is_pending THEN
      IF v_bill_item_id IS NOT NULL THEN
        UPDATE bill_items
        SET returned_quantity = COALESCE(returned_quantity, 0) + v_requested_qty
        WHERE id = v_bill_item_id;
      END IF;

      IF v_product_id IS NOT NULL THEN
        INSERT INTO inventory_transactions (
          company_id, product_id, transaction_type, quantity_change,
          reference_id, reference_type, journal_entry_id, notes,
          branch_id, cost_center_id, warehouse_id, transaction_date
        ) VALUES (
          p_company_id, v_product_id, 'purchase_return', -v_requested_qty,
          v_pr_id, 'purchase_return', v_je_id,
          'مرتجع مشتريات ' || COALESCE(p_purchase_return->>'return_number', ''),
          v_branch_id, v_cost_center_id, v_warehouse_id,
          (p_purchase_return->>'return_date')::DATE
        );
      END IF;
    END IF;
  END LOOP;

  -- Vendor Credit (immediate only)
  IF p_vendor_credit IS NOT NULL AND NOT v_is_pending THEN
    IF EXISTS (SELECT 1 FROM vendor_credits WHERE source_purchase_return_id = v_pr_id) THEN
      RAISE EXCEPTION 'Vendor Credit already exists for this purchase return';
    END IF;

    INSERT INTO vendor_credits (
      company_id, supplier_id, bill_id,
      source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
      credit_number, credit_date, status,
      subtotal, tax_amount, total_amount, applied_amount,
      branch_id, cost_center_id, warehouse_id, notes,
      original_currency, exchange_rate_used, exchange_rate_id
    ) VALUES (
      p_company_id, p_supplier_id, p_bill_id,
      v_pr_id, p_bill_id, v_je_id,
      p_vendor_credit->>'credit_number',
      COALESCE((p_vendor_credit->>'credit_date')::DATE, CURRENT_DATE),
      'open',
      COALESCE((p_vendor_credit->>'subtotal')::NUMERIC, 0),
      COALESCE((p_vendor_credit->>'tax_amount')::NUMERIC, 0),
      COALESCE((p_vendor_credit->>'total_amount')::NUMERIC, 0),
      0, v_branch_id, v_cost_center_id, v_warehouse_id,
      p_vendor_credit->>'notes',
      COALESCE(NULLIF(p_vendor_credit->>'original_currency', ''), 'EGP'),
      COALESCE((p_vendor_credit->>'exchange_rate_used')::NUMERIC, 1),
      NULLIF(p_vendor_credit->>'exchange_rate_id', '')::UUID
    ) RETURNING id INTO v_vc_id;

    IF p_vendor_credit_items IS NOT NULL AND jsonb_array_length(p_vendor_credit_items) > 0 THEN
      INSERT INTO vendor_credit_items (
        vendor_credit_id, product_id, description,
        quantity, unit_price, tax_rate, discount_percent, line_total
      )
      SELECT v_vc_id,
        NULLIF(vci->>'product_id', '')::UUID, vci->>'description',
        COALESCE((vci->>'quantity')::NUMERIC, 0),
        COALESCE((vci->>'unit_price')::NUMERIC, 0),
        COALESCE((vci->>'tax_rate')::NUMERIC, 0),
        COALESCE((vci->>'discount_percent')::NUMERIC, 0),
        COALESCE((vci->>'line_total')::NUMERIC, 0)
      FROM jsonb_array_elements(p_vendor_credit_items) AS vci;
    END IF;

    v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));
  END IF;

  -- Bill update (immediate only)
  IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL AND NOT v_is_pending THEN
    UPDATE bills SET
      returned_amount = COALESCE(NULLIF(p_bill_update->>'returned_amount', '')::NUMERIC, returned_amount),
      return_status   = COALESCE(NULLIF(p_bill_update->>'return_status', ''), return_status),
      status          = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
      total_amount    = CASE
        WHEN (p_bill_update->>'total_amount') IS NOT NULL AND (p_bill_update->>'total_amount') != ''
        THEN (p_bill_update->>'total_amount')::NUMERIC
        ELSE total_amount
      END,
      updated_at = NOW()
    WHERE id = p_bill_id;
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Purchase return failed (rolled back): %', SQLERRM;
END;
$$;

-- ================================================================
-- 4. Update approve_purchase_return_atomic
--    Checks workflow_status (not just status) for robustness.
--    On approve: status='approved' + workflow_status='pending_warehouse'
--    On reject:  status='rejected' + workflow_status='rejected'
-- ================================================================
CREATE OR REPLACE FUNCTION approve_purchase_return_atomic(
  p_pr_id      UUID,
  p_user_id    UUID,
  p_company_id UUID,
  p_action     TEXT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr          RECORD;
  v_user_role   TEXT;
  v_user_branch UUID;
  v_new_status  TEXT;
  v_new_wf      TEXT;
BEGIN
  SELECT role, branch_id INTO v_user_role, v_user_branch
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;

  IF v_user_role NOT IN ('admin', 'owner', 'general_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to approve purchase returns');
  END IF;

  SELECT * INTO v_pr
  FROM public.purchase_returns
  WHERE id = p_pr_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  -- Branch isolation (owners/admins/general_managers can bypass for their company)
  IF v_user_role NOT IN ('owner', 'admin') THEN
    IF v_user_branch IS NOT NULL AND v_pr.branch_id IS NOT NULL AND v_user_branch != v_pr.branch_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation: Cannot approve return for a different branch');
    END IF;
  END IF;

  -- Accept both new (pending_admin_approval) and legacy (pending_approval) states
  IF v_pr.workflow_status NOT IN ('pending_admin_approval', 'pending_approval') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Purchase return is not pending admin approval. Current workflow_status: %s',
        v_pr.workflow_status
      )
    );
  END IF;

  IF p_action = 'approve' THEN
    v_new_status := 'approved';
    v_new_wf     := 'pending_warehouse';

    UPDATE public.purchase_returns
    SET
      status          = v_new_status,
      workflow_status = v_new_wf,
      approved_by     = p_user_id,
      approved_at     = NOW(),
      is_locked       = true,
      updated_at      = NOW()
    WHERE id = p_pr_id;

  ELSIF p_action = 'reject' THEN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;

    v_new_status := 'rejected';
    v_new_wf     := 'rejected';

    UPDATE public.purchase_returns
    SET
      status           = v_new_status,
      workflow_status  = v_new_wf,
      rejected_by      = p_user_id,
      rejected_at      = NOW(),
      rejection_reason = p_reason,
      is_locked        = false,
      updated_at       = NOW()
    WHERE id = p_pr_id;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approve or reject');
  END IF;

  INSERT INTO public.audit_logs (
    company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
  ) VALUES (
    p_company_id, p_user_id,
    CASE p_action WHEN 'approve' THEN 'purchase_return_approved' ELSE 'purchase_return_rejected' END,
    'purchase_return', p_pr_id,
    jsonb_build_object('status', v_pr.status, 'workflow_status', v_pr.workflow_status),
    jsonb_build_object('status', v_new_status, 'workflow_status', v_new_wf, 'reason', p_reason),
    NOW()
  );

  RETURN jsonb_build_object(
    'success',          true,
    'pr_id',            p_pr_id,
    'status',           v_new_status,
    'workflow_status',  v_new_wf,
    'created_by',       v_pr.created_by
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ================================================================
-- 5. New: reject_warehouse_return
--    Store manager rejects → workflow_status = 'warehouse_rejected'
--    User can then edit and resubmit (full cycle repeats)
-- ================================================================
CREATE OR REPLACE FUNCTION reject_warehouse_return(
  p_purchase_return_id  UUID,
  p_rejected_by         UUID,
  p_reason              TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr RECORD;
BEGIN
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse rejection reason is required');
  END IF;

  SELECT * INTO v_pr
  FROM purchase_returns
  WHERE id = p_purchase_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  -- Only act on returns awaiting warehouse confirmation
  IF v_pr.workflow_status NOT IN ('pending_warehouse', 'pending_approval') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot reject: return is not pending warehouse confirmation. Current status: %s',
        v_pr.workflow_status
      )
    );
  END IF;

  UPDATE purchase_returns
  SET
    workflow_status            = 'warehouse_rejected',
    warehouse_rejection_reason = p_reason,
    warehouse_rejected_by      = p_rejected_by,
    warehouse_rejected_at      = NOW(),
    is_locked                  = false,
    updated_at                 = NOW()
  WHERE id = p_purchase_return_id;

  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
  ) VALUES (
    v_pr.company_id, p_rejected_by,
    'purchase_return_warehouse_rejected',
    'purchase_return', p_purchase_return_id,
    jsonb_build_object('workflow_status', v_pr.workflow_status),
    jsonb_build_object('workflow_status', 'warehouse_rejected', 'reason', p_reason),
    NOW()
  );

  RETURN jsonb_build_object(
    'success',          true,
    'pr_id',            p_purchase_return_id,
    'workflow_status',  'warehouse_rejected',
    'created_by',       v_pr.created_by
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION process_purchase_return_atomic IS
  'Creates a purchase return in pending_admin_approval state. No inventory/financial effects until warehouse confirms.';
COMMENT ON FUNCTION approve_purchase_return_atomic IS
  'Admin approves → pending_warehouse (awaiting store manager) or rejects → rejected.';
COMMENT ON FUNCTION reject_warehouse_return IS
  'Store manager rejects → warehouse_rejected. Creator can edit and resubmit for full approval cycle.';
