-- =====================================================================
-- Migration: Purchase Return Multi-Warehouse Support (Phase 2)
-- =====================================================================
-- يضيف دعم المخازن المتعددة لمرتجعات المشتريات:
--
-- الميزات الجديدة:
--   - جدول purchase_return_warehouse_allocations لتتبع كل مخزن على حدة
--   - كل تخصيص مخزن له قيد محاسبي مستقل وحالة اعتماد مستقلة
--   - دالة process_purchase_return_multi_warehouse لإنشاء مرتجع متعدد المخازن
--   - دالة confirm_warehouse_allocation لاعتماد مخزن واحد مستقل
--   - حالة partial_approval للمرتجعات المعتمدة جزئياً
-- =====================================================================

-- ====================================================================
-- 1. جدول تخصيصات مخازن المرتجع
-- ====================================================================
CREATE TABLE IF NOT EXISTS purchase_return_warehouse_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL,
  purchase_return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  warehouse_id       UUID NOT NULL,
  branch_id          UUID,
  cost_center_id     UUID,
  journal_entry_id   UUID,
  workflow_status    TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (workflow_status IN ('pending_approval', 'confirmed', 'rejected')),
  subtotal           NUMERIC(18,4) DEFAULT 0,
  tax_amount         NUMERIC(18,4) DEFAULT 0,
  total_amount       NUMERIC(18,4) DEFAULT 0,
  confirmed_by       UUID,
  confirmed_at       TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- منع تكرار نفس المخزن في نفس المرتجع
CREATE UNIQUE INDEX IF NOT EXISTS idx_prwa_unique_return_warehouse
  ON purchase_return_warehouse_allocations(purchase_return_id, warehouse_id);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_prwa_purchase_return_id
  ON purchase_return_warehouse_allocations(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_prwa_company_id
  ON purchase_return_warehouse_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_prwa_warehouse_id
  ON purchase_return_warehouse_allocations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_prwa_workflow_status
  ON purchase_return_warehouse_allocations(workflow_status);

-- ====================================================================
-- 2. إضافة أعمدة لجدول purchase_return_items
-- ====================================================================
ALTER TABLE purchase_return_items
  ADD COLUMN IF NOT EXISTS warehouse_id            UUID,
  ADD COLUMN IF NOT EXISTS warehouse_allocation_id UUID
    REFERENCES purchase_return_warehouse_allocations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pri_warehouse_allocation_id
  ON purchase_return_items(warehouse_allocation_id);

-- ====================================================================
-- 3. إضافة حالة partial_approval لـ purchase_returns
-- ====================================================================
ALTER TABLE purchase_returns
  DROP CONSTRAINT IF EXISTS chk_purchase_returns_workflow_status;

ALTER TABLE purchase_returns
  ADD CONSTRAINT chk_purchase_returns_workflow_status
  CHECK (workflow_status IN (
    'pending_approval', 'partial_approval', 'confirmed', 'rejected', 'cancelled'
  ));

-- ====================================================================
-- 4. دالة إنشاء مرتجع متعدد المخازن (أتومية)
-- ====================================================================
CREATE OR REPLACE FUNCTION process_purchase_return_multi_warehouse(
  p_company_id       UUID,
  p_supplier_id      UUID,
  p_bill_id          UUID,
  p_purchase_return  JSONB,     -- header بيانات المرتجع (بدون warehouse_id)
  p_warehouse_groups JSONB,     -- مصفوفة تخصيصات:
                                -- [{ warehouse_id, branch_id, cost_center_id,
                                --    subtotal, tax_amount, total_amount,
                                --    journal_entry, journal_lines, items[] }]
  p_bill_update      JSONB DEFAULT NULL,
  p_created_by       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr_id          UUID;
  v_group          JSONB;
  v_alloc_id       UUID;
  v_je_id          UUID;
  v_item           JSONB;
  v_product_id     UUID;
  v_bill_item_id   UUID;
  v_requested_qty  NUMERIC;
  v_warehouse_id   UUID;
  v_branch_id      UUID;
  v_cost_center_id UUID;
  v_alloc_ids      UUID[] := ARRAY[]::UUID[];
  v_result         JSONB := '{}';
  v_group_count    INT;
BEGIN
  -- التحقق من الفاتورة (إلزامية)
  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Bill ID is required to create a purchase return';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company: %', p_bill_id;
  END IF;

  v_group_count := jsonb_array_length(p_warehouse_groups);
  IF v_group_count < 2 THEN
    RAISE EXCEPTION 'Multi-warehouse function requires at least 2 warehouse groups. Use process_purchase_return_atomic for single warehouse.';
  END IF;

  -- ===================== قفل بنود الفاتورة والتحقق (لكل تخصيص) =====================
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_warehouse_groups) LOOP
    v_warehouse_id   := NULLIF(v_group->>'warehouse_id', '')::UUID;
    v_branch_id      := NULLIF(v_group->>'branch_id', '')::UUID;
    v_cost_center_id := NULLIF(v_group->>'cost_center_id', '')::UUID;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items') LOOP
      v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
      v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
      v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

      IF v_requested_qty <= 0 THEN CONTINUE; END IF;

      -- قفل bill_item للتحقق من الكميات المتاحة
      IF v_bill_item_id IS NOT NULL THEN
        PERFORM id FROM bill_items WHERE id = v_bill_item_id FOR UPDATE;
      END IF;

      -- Advisory Lock للمخزون (لن نخصم الآن لكن نقفل لمنع race condition)
      IF v_product_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
          hashtext(p_company_id::text || v_product_id::text || v_warehouse_id::text)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- ===================== التحقق من الكميات الإجمالية عبر كل التخصيصات =====================
  -- نتحقق من أن مجموع الكميات لكل bill_item عبر جميع التخصيصات لا يتجاوز المتاح
  DECLARE
    v_qty_check RECORD;
  BEGIN
    WITH item_totals AS (
      SELECT
        NULLIF(v_item->>'bill_item_id', '')::UUID AS bill_item_id,
        SUM((v_item->>'quantity')::NUMERIC) AS total_qty
      FROM jsonb_array_elements(p_warehouse_groups) AS g,
           jsonb_array_elements(g->'items') AS v_item
      WHERE (v_item->>'quantity')::NUMERIC > 0
        AND (v_item->>'bill_item_id') IS NOT NULL
      GROUP BY NULLIF(v_item->>'bill_item_id', '')::UUID
    )
    SELECT bi.id, bi.quantity, COALESCE(bi.returned_quantity, 0) AS returned_quantity,
           it.total_qty
    INTO v_qty_check
    FROM item_totals it
    JOIN bill_items bi ON bi.id = it.bill_item_id
    WHERE it.total_qty > (bi.quantity - COALESCE(bi.returned_quantity, 0))
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Return quantity (%) exceeds available quantity (%) for bill item %',
        v_qty_check.total_qty,
        (v_qty_check.quantity - v_qty_check.returned_quantity),
        v_qty_check.id;
    END IF;
  END;

  -- ===================== إنشاء سجل المرتجع الرئيسي =====================
  INSERT INTO purchase_returns (
    company_id, supplier_id, bill_id,
    return_number, return_date, status, workflow_status, created_by,
    subtotal, tax_amount, total_amount,
    settlement_method, reason, notes,
    branch_id, cost_center_id, warehouse_id,
    original_currency, original_subtotal, original_tax_amount, original_total_amount,
    exchange_rate_used, exchange_rate_id
  ) VALUES (
    p_company_id, p_supplier_id, p_bill_id,
    p_purchase_return->>'return_number',
    (p_purchase_return->>'return_date')::DATE,
    COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
    'pending_approval',   -- المرتجع متعدد المخازن دائماً pending حتى تعتمد جميع المخازن
    p_created_by,
    COALESCE((p_purchase_return->>'subtotal')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'tax_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0),
    p_purchase_return->>'settlement_method',
    p_purchase_return->>'reason',
    p_purchase_return->>'notes',
    NULL, NULL, NULL,    -- لا يوجد فرع/مخزن رئيسي في المرتجع المتعدد
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), 'EGP'),
    COALESCE((p_purchase_return->>'original_subtotal')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'original_tax_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'original_total_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'exchange_rate_used')::NUMERIC, 1),
    NULLIF(p_purchase_return->>'exchange_rate_id', '')::UUID
  ) RETURNING id INTO v_pr_id;

  v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));

  -- ===================== معالجة كل تخصيص مخزن =====================
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_warehouse_groups) LOOP
    v_warehouse_id   := NULLIF(v_group->>'warehouse_id', '')::UUID;
    v_branch_id      := NULLIF(v_group->>'branch_id', '')::UUID;
    v_cost_center_id := NULLIF(v_group->>'cost_center_id', '')::UUID;
    v_je_id          := NULL;

    -- إنشاء القيد المحاسبي (draft) لهذا المخزن
    IF (v_group->'journal_entry') IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        reference_type, reference_id,
        entry_date, description, status, validation_status
      ) VALUES (
        p_company_id, v_branch_id, v_cost_center_id,
        'purchase_return', v_pr_id,
        (v_group->'journal_entry'->>'entry_date')::DATE,
        v_group->'journal_entry'->>'description',
        'draft',
        'pending'
      ) RETURNING id INTO v_je_id;

      IF (v_group->'journal_lines') IS NOT NULL
         AND jsonb_array_length(v_group->'journal_lines') > 0 THEN
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
        FROM jsonb_array_elements(v_group->'journal_lines') AS l;
      END IF;
    END IF;

    -- إنشاء سجل تخصيص المخزن
    INSERT INTO purchase_return_warehouse_allocations (
      company_id, purchase_return_id, warehouse_id, branch_id, cost_center_id,
      journal_entry_id, workflow_status,
      subtotal, tax_amount, total_amount
    ) VALUES (
      p_company_id, v_pr_id, v_warehouse_id, v_branch_id, v_cost_center_id,
      v_je_id, 'pending_approval',
      COALESCE((v_group->>'subtotal')::NUMERIC, 0),
      COALESCE((v_group->>'tax_amount')::NUMERIC, 0),
      COALESCE((v_group->>'total_amount')::NUMERIC, 0)
    ) RETURNING id INTO v_alloc_id;

    v_alloc_ids := array_append(v_alloc_ids, v_alloc_id);

    -- إدراج بنود هذا التخصيص
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items') LOOP
      v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
      v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
      v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

      IF v_requested_qty <= 0 THEN CONTINUE; END IF;

      INSERT INTO purchase_return_items (
        purchase_return_id, bill_item_id, product_id,
        description, quantity, unit_price, tax_rate, discount_percent, line_total,
        warehouse_id, warehouse_allocation_id
      ) VALUES (
        v_pr_id, v_bill_item_id, v_product_id,
        v_item->>'description', v_requested_qty,
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
        COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
        COALESCE((v_item->>'line_total')::NUMERIC, 0),
        v_warehouse_id, v_alloc_id
      );
    END LOOP;
  END LOOP;

  -- إضافة معرّفات التخصيصات إلى النتيجة
  v_result := jsonb_set(v_result, '{allocation_ids}', to_jsonb(v_alloc_ids));

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Multi-warehouse purchase return failed (rolled back): %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION process_purchase_return_multi_warehouse IS
  'إنشاء مرتجع مشتريات متعدد المخازن بشكل أتومي — كل مخزن يُعتمد بشكل مستقل.';

-- ====================================================================
-- 5. دالة اعتماد تخصيص مخزن واحد
-- ====================================================================
CREATE OR REPLACE FUNCTION confirm_warehouse_allocation(
  p_allocation_id UUID,
  p_confirmed_by  UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alloc          RECORD;
  v_pr             RECORD;
  v_item           RECORD;
  v_bill_item      RECORD;
  v_current_stock  NUMERIC;
  v_vc_id          UUID;
  v_pending_count  INT;
  v_new_status     TEXT;
  v_new_returned   NUMERIC;
  v_bill_total     NUMERIC;
  v_bill_st        TEXT;
  v_result         JSONB := '{}';
BEGIN
  -- 🔒 قفل سجل التخصيص
  SELECT *
  INTO v_alloc
  FROM purchase_return_warehouse_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse allocation not found: %', p_allocation_id;
  END IF;

  IF v_alloc.workflow_status != 'pending_approval' THEN
    RAISE EXCEPTION 'Allocation is not pending approval. Current status: %', v_alloc.workflow_status;
  END IF;

  -- 🔒 قفل سجل المرتجع الرئيسي
  SELECT *
  INTO v_pr
  FROM purchase_returns
  WHERE id = v_alloc.purchase_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return not found: %', v_alloc.purchase_return_id;
  END IF;

  -- ===================== التحقق والقفل لكل بند =====================
  FOR v_item IN
    SELECT pri.*
    FROM purchase_return_items pri
    WHERE pri.warehouse_allocation_id = p_allocation_id
      AND pri.quantity > 0
  LOOP
    -- قفل bill_item
    IF v_item.bill_item_id IS NOT NULL THEN
      SELECT id, quantity, COALESCE(returned_quantity, 0) AS returned_quantity
      INTO v_bill_item
      FROM bill_items
      WHERE id = v_item.bill_item_id
      FOR UPDATE;

      IF (v_bill_item.returned_quantity + v_item.quantity) > v_bill_item.quantity THEN
        RAISE EXCEPTION 'Return quantity exceeds available for bill item %', v_item.bill_item_id;
      END IF;
    END IF;

    -- Advisory Lock + تحقق المخزون
    IF v_item.product_id IS NOT NULL AND v_alloc.warehouse_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(v_pr.company_id::text || v_item.product_id::text || v_alloc.warehouse_id::text)
      );

      SELECT COALESCE(SUM(quantity_change), 0) INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id   = v_pr.company_id
        AND product_id   = v_item.product_id
        AND warehouse_id = v_alloc.warehouse_id
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
    WHERE pri.warehouse_allocation_id = p_allocation_id
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
        v_pr.id, 'purchase_return', v_alloc.journal_entry_id,
        'مرتجع مشتريات ' || v_pr.return_number || ' — ' || v_alloc.warehouse_id::text,
        v_alloc.branch_id, v_alloc.cost_center_id, v_alloc.warehouse_id,
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

  -- ===================== نشر القيد المحاسبي =====================
  IF v_alloc.journal_entry_id IS NOT NULL THEN
    UPDATE journal_entries
    SET status = 'posted', validation_status = 'valid', updated_at = NOW()
    WHERE id = v_alloc.journal_entry_id AND status = 'draft';
  END IF;

  -- ===================== إنشاء Vendor Credit (للإشعار الدائن) =====================
  IF v_pr.settlement_method = 'debit_note' AND v_alloc.total_amount > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM vendor_credits
      WHERE source_purchase_return_id = v_pr.id
        AND warehouse_id = v_alloc.warehouse_id
    ) THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id,
        source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, warehouse_id,
        notes, original_currency, exchange_rate_used
      ) VALUES (
        v_pr.company_id, v_pr.supplier_id, v_pr.bill_id,
        v_pr.id, v_pr.bill_id, v_alloc.journal_entry_id,
        'VC-' || REPLACE(v_pr.return_number, 'PRET-', '') || '-' || LEFT(v_alloc.warehouse_id::text, 8),
        v_pr.return_date, 'open',
        v_alloc.subtotal, v_alloc.tax_amount, v_alloc.total_amount, 0,
        v_alloc.branch_id, v_alloc.cost_center_id, v_alloc.warehouse_id,
        'إشعار دائن تلقائي — مرتجع ' || v_pr.return_number || ' / مخزن ' || v_alloc.warehouse_id::text,
        COALESCE(v_pr.original_currency, 'EGP'),
        COALESCE(v_pr.exchange_rate_used, 1)
      ) RETURNING id INTO v_vc_id;

      -- بنود الإشعار الدائن من بنود هذا التخصيص
      INSERT INTO vendor_credit_items (
        vendor_credit_id, product_id, description,
        quantity, unit_price, tax_rate, discount_percent, line_total
      )
      SELECT v_vc_id, pri.product_id, pri.description,
        pri.quantity, pri.unit_price, pri.tax_rate, pri.discount_percent, pri.line_total
      FROM purchase_return_items pri
      WHERE pri.warehouse_allocation_id = p_allocation_id;
    END IF;
  END IF;

  -- ===================== تحديث حالة التخصيص =====================
  UPDATE purchase_return_warehouse_allocations SET
    workflow_status = 'confirmed',
    confirmed_by    = p_confirmed_by,
    confirmed_at    = NOW(),
    notes           = p_notes
  WHERE id = p_allocation_id;

  -- ===================== تحديث الحالة الإجمالية للمرتجع =====================
  SELECT COUNT(*) INTO v_pending_count
  FROM purchase_return_warehouse_allocations
  WHERE purchase_return_id = v_alloc.purchase_return_id
    AND workflow_status = 'pending_approval';

  v_new_status := CASE WHEN v_pending_count = 0 THEN 'confirmed' ELSE 'partial_approval' END;

  UPDATE purchase_returns
  SET workflow_status = v_new_status, updated_at = NOW()
  WHERE id = v_alloc.purchase_return_id;

  -- ===================== تحديث الفاتورة (فقط عند اكتمال الاعتماد) =====================
  IF v_pending_count = 0 AND v_pr.bill_id IS NOT NULL THEN
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

  v_result := jsonb_build_object(
    'allocation_id',        p_allocation_id,
    'purchase_return_id',   v_alloc.purchase_return_id,
    'allocation_status',    'confirmed',
    'overall_status',       v_new_status,
    'pending_allocations',  v_pending_count
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Confirm warehouse allocation failed (rolled back): %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION confirm_warehouse_allocation IS
  'اعتماد تخصيص مخزن واحد في مرتجع متعدد المخازن — يُنفذ الخصم والقيد لهذا المخزن فقط.';

-- ====================================================================
-- 6. RLS للجدول الجديد
-- ====================================================================
ALTER TABLE purchase_return_warehouse_allocations ENABLE ROW LEVEL SECURITY;

-- السماح لأعضاء الشركة بالقراءة
CREATE POLICY "company_members_read_prwa"
  ON purchase_return_warehouse_allocations FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- السماح للمالك والأدوار العليا بالإنشاء
CREATE POLICY "privileged_insert_prwa"
  ON purchase_return_warehouse_allocations FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- السماح بالتحديث (لنشر الاعتماد)
CREATE POLICY "privileged_update_prwa"
  ON purchase_return_warehouse_allocations FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );
