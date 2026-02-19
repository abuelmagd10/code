-- =====================================================================
-- Migration: Purchase Return Approval Workflow (Phase 1)
-- =====================================================================
-- يضيف سير عمل الاعتماد لمرتجعات المشتريات:
--
-- للمالك / المدير العام:
--   - اختيار أي مخزن في الشركة (ليس فقط مخزن الفاتورة)
--   - المرتجع يُنشأ بحالة pending_approval
--   - إشعار لمسؤول المخزن ومحاسب الفرع
--   - الخصم المخزني يتم بعد اعتماد مسؤول المخزن فقط
--
-- لمحاسب الفرع:
--   - مخزن فرعه فقط (السلوك الحالي)
--   - workflow_status = 'confirmed' مباشرة
-- =====================================================================

-- ====================================================================
-- 1. إضافة أعمدة Workflow لجدول purchase_returns
-- ====================================================================
ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS created_by       UUID,
  ADD COLUMN IF NOT EXISTS confirmed_by     UUID,
  ADD COLUMN IF NOT EXISTS confirmed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_notes TEXT;

-- تحديث السجلات القديمة
UPDATE purchase_returns
SET workflow_status = 'confirmed'
WHERE workflow_status IS NULL;

-- Constraint لضمان القيم الصالحة
ALTER TABLE purchase_returns
  DROP CONSTRAINT IF EXISTS chk_purchase_returns_workflow_status;
ALTER TABLE purchase_returns
  ADD CONSTRAINT chk_purchase_returns_workflow_status
  CHECK (workflow_status IN ('pending_approval', 'confirmed', 'rejected', 'cancelled'));

-- ====================================================================
-- 2. تحديث process_purchase_return_atomic لدعم pending_approval
-- ====================================================================
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
  p_workflow_status     TEXT   DEFAULT 'confirmed',   -- 'confirmed' | 'pending_approval'
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
  v_is_pending     := (p_workflow_status = 'pending_approval');

  -- حالة القيد: draft للمعلق، posted للمؤكد
  v_je_status := CASE WHEN v_is_pending THEN 'draft' ELSE 'posted' END;

  -- ===================== التحقق من الفاتورة =====================
  IF p_bill_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) THEN
      RAISE EXCEPTION 'Bill not found or does not belong to company: %', p_bill_id;
    END IF;
  END IF;

  -- ===================== قفل الصفوف والتحقق (Race Condition Protection) =====================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    -- 🔒 قفل bill_item (فقط للمرتجعات المؤكدة فوراً)
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

    -- 🔒 Advisory Lock + تحقق المخزون (للمرتجعات المؤكدة فوراً)
    IF v_product_id IS NOT NULL AND v_warehouse_id IS NOT NULL AND NOT v_is_pending THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(p_company_id::text || v_product_id::text || v_warehouse_id::text)
      );

      SELECT COALESCE(SUM(quantity_change), 0) INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id  = p_company_id
        AND product_id  = v_product_id
        AND warehouse_id = v_warehouse_id
        AND COALESCE(is_deleted, false) = false;

      IF v_current_stock < v_requested_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
          v_product_id, v_current_stock, v_requested_qty;
      END IF;
    END IF;
  END LOOP;

  -- ===================== إنشاء القيد المحاسبي =====================
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
      v_je_status,  -- draft للمعلق، posted للمؤكد
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

  -- ===================== إنشاء سجل المرتجع =====================
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
    COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
    COALESCE(NULLIF(p_workflow_status, ''), 'confirmed'),
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

  -- ===================== بنود المرتجع =====================
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

    -- الخصم المخزني وتحديث bill_items فقط للمرتجعات المؤكدة فوراً
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

  -- ===================== Vendor Credit (للمؤكد فوراً فقط) =====================
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

  -- ===================== تحديث الفاتورة (للمؤكد فوراً فقط) =====================
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

-- ====================================================================
-- 3. دالة اعتماد تسليم المرتجع (مسؤول المخزن)
-- ====================================================================
CREATE OR REPLACE FUNCTION confirm_purchase_return_delivery(
  p_purchase_return_id  UUID,
  p_confirmed_by        UUID,
  p_notes               TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr            RECORD;
  v_item          RECORD;
  v_bill_item     RECORD;
  v_current_stock NUMERIC;
  v_new_returned  NUMERIC;
  v_bill_total    NUMERIC;
  v_bill_st       TEXT;
  v_vc_id         UUID;
  v_result        JSONB := '{}';
BEGIN
  -- 🔒 قفل سجل المرتجع
  SELECT pr.*
  INTO v_pr
  FROM purchase_returns pr
  WHERE pr.id = p_purchase_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return not found: %', p_purchase_return_id;
  END IF;

  IF v_pr.workflow_status != 'pending_approval' THEN
    RAISE EXCEPTION 'Return is not pending approval. Current status: %', v_pr.workflow_status;
  END IF;

  -- ===================== تحقق وقفل لكل بند =====================
  FOR v_item IN
    SELECT pri.*
    FROM purchase_return_items pri
    WHERE pri.purchase_return_id = p_purchase_return_id
      AND pri.quantity > 0
  LOOP
    -- 🔒 قفل bill_item
    IF v_item.bill_item_id IS NOT NULL THEN
      SELECT id, quantity, COALESCE(returned_quantity, 0) AS returned_quantity
      INTO v_bill_item
      FROM bill_items
      WHERE id = v_item.bill_item_id
      FOR UPDATE;

      IF (v_bill_item.returned_quantity + v_item.quantity) > v_bill_item.quantity THEN
        RAISE EXCEPTION 'Return quantity exceeds bill item quantity for item %', v_item.bill_item_id;
      END IF;
    END IF;

    -- 🔒 Advisory Lock + تحقق المخزون
    IF v_item.product_id IS NOT NULL AND v_pr.warehouse_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(v_pr.company_id::text || v_item.product_id::text || v_pr.warehouse_id::text)
      );

      SELECT COALESCE(SUM(quantity_change), 0) INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id  = v_pr.company_id
        AND product_id  = v_item.product_id
        AND warehouse_id = v_pr.warehouse_id
        AND COALESCE(is_deleted, false) = false;

      IF v_current_stock < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Required: %',
          v_item.product_id, v_current_stock, v_item.quantity;
      END IF;
    END IF;
  END LOOP;

  -- ===================== تنفيذ العمليات المؤجلة =====================
  FOR v_item IN
    SELECT pri.*
    FROM purchase_return_items pri
    WHERE pri.purchase_return_id = p_purchase_return_id
      AND pri.quantity > 0
  LOOP
    -- حركة المخزون
    IF v_item.product_id IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      ) VALUES (
        v_pr.company_id, v_item.product_id,
        'purchase_return', -v_item.quantity,
        v_pr.id, 'purchase_return', v_pr.journal_entry_id,
        'مرتجع مشتريات ' || v_pr.return_number,
        v_pr.branch_id, v_pr.cost_center_id, v_pr.warehouse_id,
        v_pr.return_date
      );
    END IF;

    -- تحديث bill_item
    IF v_item.bill_item_id IS NOT NULL THEN
      UPDATE bill_items
      SET returned_quantity = COALESCE(returned_quantity, 0) + v_item.quantity
      WHERE id = v_item.bill_item_id;
    END IF;
  END LOOP;

  -- ===================== تحديث الفاتورة =====================
  IF v_pr.bill_id IS NOT NULL THEN
    SELECT returned_amount, total_amount, status
    INTO v_new_returned, v_bill_total, v_bill_st
    FROM bills WHERE id = v_pr.bill_id;

    v_new_returned := COALESCE(v_new_returned, 0) + v_pr.total_amount;

    IF v_bill_st IN ('paid', 'partially_paid') THEN
      UPDATE bills SET
        returned_amount = v_new_returned,
        return_status   = CASE WHEN v_new_returned >= v_bill_total THEN 'full' ELSE 'partial' END,
        updated_at = NOW()
      WHERE id = v_pr.bill_id;
    ELSE
      UPDATE bills SET
        returned_amount = v_new_returned,
        return_status   = CASE WHEN v_new_returned >= v_bill_total THEN 'full' ELSE 'partial' END,
        status = CASE WHEN (v_bill_total - v_pr.total_amount) <= 0 THEN 'fully_returned' ELSE v_bill_st END,
        total_amount = GREATEST(v_bill_total - v_pr.total_amount, 0),
        updated_at = NOW()
      WHERE id = v_pr.bill_id;
    END IF;
  END IF;

  -- ===================== نشر القيد المحاسبي =====================
  IF v_pr.journal_entry_id IS NOT NULL THEN
    UPDATE journal_entries
    SET status = 'posted', validation_status = 'valid', updated_at = NOW()
    WHERE id = v_pr.journal_entry_id AND status = 'draft';
  END IF;

  -- ===================== إنشاء Vendor Credit (إن لم يكن موجوداً) =====================
  IF v_pr.settlement_method = 'debit_note' AND v_pr.total_amount > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM vendor_credits WHERE source_purchase_return_id = v_pr.id) THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id,
        source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, warehouse_id,
        notes, original_currency, exchange_rate_used
      ) VALUES (
        v_pr.company_id, v_pr.supplier_id, v_pr.bill_id,
        v_pr.id, v_pr.bill_id, v_pr.journal_entry_id,
        'VC-' || REPLACE(v_pr.return_number, 'PRET-', ''),
        v_pr.return_date, 'open',
        v_pr.subtotal, v_pr.tax_amount, v_pr.total_amount, 0,
        v_pr.branch_id, v_pr.cost_center_id, v_pr.warehouse_id,
        'إشعار دائن تلقائي - اعتماد مرتجع ' || v_pr.return_number,
        COALESCE(v_pr.original_currency, 'EGP'),
        COALESCE(v_pr.exchange_rate_used, 1)
      ) RETURNING id INTO v_vc_id;

      -- بنود الإشعار الدائن من بنود المرتجع
      INSERT INTO vendor_credit_items (
        vendor_credit_id, product_id, description,
        quantity, unit_price, tax_rate, discount_percent, line_total
      )
      SELECT v_vc_id, pri.product_id, pri.description,
        pri.quantity, pri.unit_price, pri.tax_rate, pri.discount_percent, pri.line_total
      FROM purchase_return_items pri
      WHERE pri.purchase_return_id = v_pr.id;
    END IF;
  END IF;

  -- ===================== تأكيد المرتجع =====================
  UPDATE purchase_returns SET
    workflow_status    = 'confirmed',
    confirmed_by       = p_confirmed_by,
    confirmed_at       = NOW(),
    confirmation_notes = p_notes
  WHERE id = p_purchase_return_id;

  v_result := jsonb_build_object(
    'purchase_return_id', p_purchase_return_id,
    'workflow_status', 'confirmed'
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Confirm delivery failed (rolled back): %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION process_purchase_return_atomic IS
  'دالة أتومية لمعالجة مرتجعات المشتريات مع دعم سير عمل الاعتماد.';
COMMENT ON FUNCTION confirm_purchase_return_delivery IS
  'اعتماد تسليم مرتجع معلق من قبل مسؤول المخزن - يُنفذ الخصم المخزني والقيود.';
