-- =====================================================================
-- Migration: Atomic Purchase Return RPC Function
-- =====================================================================
-- دالة SQL أتومية لمعالجة مرتجعات المشتريات بالكامل داخل Transaction واحدة
--
-- ✅ تضمن:
-- 1. قفل صفوف bill_items بـ FOR UPDATE (منع Race Conditions)
-- 2. قفل مستوى المنتج بـ pg_advisory_xact_lock (منع التزامن)
-- 3. التحقق من الكميات المتاحة بعد القفل (atomic validation)
-- 4. إنشاء journal_entry + lines (مع status='posted')
-- 5. إنشاء purchase_return + purchase_return_items
-- 6. تحديث bill_items.returned_quantity
-- 7. إنشاء inventory_transactions (خصم المخزون)
-- 8. إنشاء vendor_credit + vendor_credit_items (اختياري)
-- 9. تحديث bills (returned_amount, return_status)
--
-- كل هذا في BEGIN...END واحد = rollback تلقائي عند أي خطأ
-- =====================================================================

CREATE OR REPLACE FUNCTION process_purchase_return_atomic(
  p_company_id          UUID,
  p_supplier_id         UUID,
  p_bill_id             UUID,
  p_purchase_return     JSONB,
  p_return_items        JSONB,
  p_journal_entry       JSONB DEFAULT NULL,
  p_journal_lines       JSONB DEFAULT NULL,
  p_vendor_credit       JSONB DEFAULT NULL,
  p_vendor_credit_items JSONB DEFAULT NULL,
  p_bill_update         JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr_id          UUID;
  v_je_id          UUID;
  v_vc_id          UUID;
  v_item           JSONB;
  v_bill_item      RECORD;
  v_current_stock  NUMERIC;
  v_requested_qty  NUMERIC;
  v_product_id     UUID;
  v_bill_item_id   UUID;
  v_warehouse_id   UUID;
  v_branch_id      UUID;
  v_cost_center_id UUID;
  v_result         JSONB := '{}';
BEGIN
  -- ===================== استخراج معلومات الحوكمة =====================
  v_warehouse_id   := NULLIF(p_purchase_return->>'warehouse_id', '')::UUID;
  v_branch_id      := NULLIF(p_purchase_return->>'branch_id', '')::UUID;
  v_cost_center_id := NULLIF(p_purchase_return->>'cost_center_id', '')::UUID;

  -- ===================== التحقق من الفاتورة =====================
  IF p_bill_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM bills
      WHERE id = p_bill_id AND company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Bill not found or does not belong to company: %', p_bill_id;
    END IF;
  END IF;

  -- ===================== قفل الصفوف والتحقق (Race Condition Protection) =====================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    -- 🔒 قفل bill_item لمنع التزامن على returned_quantity
    IF v_bill_item_id IS NOT NULL THEN
      SELECT id, quantity, COALESCE(returned_quantity, 0) AS returned_quantity
      INTO v_bill_item
      FROM bill_items
      WHERE id = v_bill_item_id
      FOR UPDATE;  -- 🔒 ROW-LEVEL LOCK

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill item not found: %', v_bill_item_id;
      END IF;

      IF (v_bill_item.returned_quantity + v_requested_qty) > v_bill_item.quantity THEN
        RAISE EXCEPTION
          'Cannot return % units. Bill item quantity: %, already returned: %, available: %',
          v_requested_qty,
          v_bill_item.quantity,
          v_bill_item.returned_quantity,
          (v_bill_item.quantity - v_bill_item.returned_quantity);
      END IF;
    END IF;

    -- 🔒 قفل مستوى المنتج+المخزن بـ Advisory Lock (يمنع الطلبات المتزامنة)
    IF v_product_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtext(p_company_id::text || v_product_id::text || v_warehouse_id::text)
      );

      -- حساب رصيد المخزون الحالي بعد القفل
      SELECT COALESCE(SUM(quantity_change), 0)
      INTO v_current_stock
      FROM inventory_transactions
      WHERE company_id  = p_company_id
        AND product_id  = v_product_id
        AND warehouse_id = v_warehouse_id
        AND COALESCE(is_deleted, false) = false;

      IF v_current_stock < v_requested_qty THEN
        RAISE EXCEPTION
          'Insufficient stock for product %. Available: %, Requested: %',
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
      p_company_id,
      v_branch_id,
      v_cost_center_id,
      'purchase_return',
      NULL,  -- سيُحدَّث بمعرف المرتجع بعد إنشائه
      (p_journal_entry->>'entry_date')::DATE,
      p_journal_entry->>'description',
      COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted'),
      COALESCE(NULLIF(p_journal_entry->>'validation_status', ''), 'valid')
    ) RETURNING id INTO v_je_id;

    -- إدراج سطور القيد
    IF p_journal_lines IS NOT NULL AND jsonb_array_length(p_journal_lines) > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id,
        debit_amount, credit_amount, description,
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
        v_branch_id,
        v_cost_center_id,
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
    return_number, return_date, status,
    subtotal, tax_amount, total_amount,
    settlement_method, reason, notes,
    branch_id, cost_center_id, warehouse_id,
    original_currency, original_subtotal, original_tax_amount, original_total_amount,
    exchange_rate_used, exchange_rate_id
  ) VALUES (
    p_company_id,
    p_supplier_id,
    p_bill_id,
    v_je_id,
    p_purchase_return->>'return_number',
    (p_purchase_return->>'return_date')::DATE,
    COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
    COALESCE((p_purchase_return->>'subtotal')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'tax_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0),
    p_purchase_return->>'settlement_method',
    p_purchase_return->>'reason',
    p_purchase_return->>'notes',
    v_branch_id,
    v_cost_center_id,
    v_warehouse_id,
    COALESCE(NULLIF(p_purchase_return->>'original_currency', ''), 'EGP'),
    COALESCE((p_purchase_return->>'original_subtotal')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'original_tax_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'original_total_amount')::NUMERIC, 0),
    COALESCE((p_purchase_return->>'exchange_rate_used')::NUMERIC, 1),
    NULLIF(p_purchase_return->>'exchange_rate_id', '')::UUID
  ) RETURNING id INTO v_pr_id;

  v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));

  -- ربط القيد بمعرف المرتجع (بدلاً من bill_id)
  IF v_je_id IS NOT NULL THEN
    UPDATE journal_entries
    SET reference_id = v_pr_id
    WHERE id = v_je_id;
  END IF;

  -- ===================== بنود المرتجع + حركات المخزون =====================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    v_product_id    := NULLIF(v_item->>'product_id', '')::UUID;
    v_bill_item_id  := NULLIF(v_item->>'bill_item_id', '')::UUID;
    v_requested_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    IF v_requested_qty <= 0 THEN CONTINUE; END IF;

    -- إدراج بند المرتجع
    INSERT INTO purchase_return_items (
      purchase_return_id, bill_item_id, product_id,
      description, quantity, unit_price, tax_rate, discount_percent, line_total
    ) VALUES (
      v_pr_id,
      v_bill_item_id,
      v_product_id,
      v_item->>'description',
      v_requested_qty,
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
      COALESCE((v_item->>'line_total')::NUMERIC, 0)
    );

    -- تحديث returned_quantity في bill_item (الصف مقفل بالفعل من فوق)
    IF v_bill_item_id IS NOT NULL THEN
      UPDATE bill_items
      SET returned_quantity = COALESCE(returned_quantity, 0) + v_requested_qty
      WHERE id = v_bill_item_id;
    END IF;

    -- إنشاء حركة مخزون (خصم الكمية المرتجعة)
    IF v_product_id IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id,
        transaction_type, quantity_change,
        reference_id, reference_type,
        journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id,
        transaction_date
      ) VALUES (
        p_company_id,
        v_product_id,
        'purchase_return',
        -v_requested_qty,  -- سالب = خروج من المخزون
        v_pr_id,
        'purchase_return',
        v_je_id,
        'مرتجع مشتريات ' || COALESCE(p_purchase_return->>'return_number', ''),
        v_branch_id,
        v_cost_center_id,
        v_warehouse_id,
        (p_purchase_return->>'return_date')::DATE
      );
    END IF;
  END LOOP;

  -- ===================== Vendor Credit (اختياري - للإشعار المدين فقط) =====================
  IF p_vendor_credit IS NOT NULL THEN
    -- منع التكرار
    IF EXISTS (
      SELECT 1 FROM vendor_credits
      WHERE source_purchase_return_id = v_pr_id
    ) THEN
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
      p_company_id,
      p_supplier_id,
      p_bill_id,
      v_pr_id,
      p_bill_id,
      v_je_id,
      p_vendor_credit->>'credit_number',
      COALESCE((p_vendor_credit->>'credit_date')::DATE, CURRENT_DATE),
      'open',
      COALESCE((p_vendor_credit->>'subtotal')::NUMERIC, 0),
      COALESCE((p_vendor_credit->>'tax_amount')::NUMERIC, 0),
      COALESCE((p_vendor_credit->>'total_amount')::NUMERIC, 0),
      0,
      v_branch_id,
      v_cost_center_id,
      v_warehouse_id,
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
      SELECT
        v_vc_id,
        NULLIF(vci->>'product_id', '')::UUID,
        vci->>'description',
        COALESCE((vci->>'quantity')::NUMERIC, 0),
        COALESCE((vci->>'unit_price')::NUMERIC, 0),
        COALESCE((vci->>'tax_rate')::NUMERIC, 0),
        COALESCE((vci->>'discount_percent')::NUMERIC, 0),
        COALESCE((vci->>'line_total')::NUMERIC, 0)
      FROM jsonb_array_elements(p_vendor_credit_items) AS vci;
    END IF;

    v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));
  END IF;

  -- ===================== تحديث الفاتورة =====================
  IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL THEN
    UPDATE bills
    SET
      returned_amount = COALESCE(
        NULLIF(p_bill_update->>'returned_amount', '')::NUMERIC,
        returned_amount
      ),
      return_status = COALESCE(
        NULLIF(p_bill_update->>'return_status', ''),
        return_status
      ),
      status = COALESCE(
        NULLIF(p_bill_update->>'status', ''),
        status
      ),
      total_amount = CASE
        WHEN (p_bill_update->>'total_amount') IS NOT NULL
          AND (p_bill_update->>'total_amount') != ''
        THEN (p_bill_update->>'total_amount')::NUMERIC
        ELSE total_amount
      END,
      updated_at = NOW()
    WHERE id = p_bill_id;
  END IF;

  -- ===================== إرجاع النتيجة =====================
  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- PL/pgSQL يُلغي Transaction تلقائياً عند الاستثناء
  RAISE EXCEPTION 'Purchase return failed (rolled back): %', SQLERRM;
END;
$$;

-- ✅ تعليق توثيقي
COMMENT ON FUNCTION process_purchase_return_atomic IS
  'دالة أتومية لمعالجة مرتجعات المشتريات. تنفذ جميع العمليات في Transaction واحدة مع قفل SQL لمنع Race Conditions.';
