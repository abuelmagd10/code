-- =====================================================
-- تحديث Write-Off Approval لاستخدام FIFO Engine + COGS Transactions
-- =====================================================
-- هذا السكريبت يحدث دالة approve_write_off لاستخدام:
-- 1. FIFO Engine لتحديد unit_cost
-- 2. cogs_transactions table لتسجيل COGS
-- 3. التحقق من الرصيد من FIFO Lots (وليس products.quantity_on_hand)
-- 4. الحوكمة الإلزامية: branch_id, cost_center_id, warehouse_id
-- =====================================================

-- =====================================================
-- 1. تحديث دالة approve_write_off
-- =====================================================
CREATE OR REPLACE FUNCTION approve_write_off(
  p_write_off_id UUID,
  p_approved_by UUID,
  p_expense_account_id UUID,
  p_inventory_account_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_write_off RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_product RECORD;
  v_total_cogs NUMERIC := 0;
  v_item_cogs NUMERIC;
  v_fifo_lots_available NUMERIC;
  v_cogs_transaction_id UUID;
  v_fifo_consumption_id UUID;
BEGIN
  -- جلب بيانات الإهلاك
  SELECT * INTO v_write_off FROM inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الإهلاك ليس في حالة انتظار');
  END IF;

  -- 🧾 ERP Governance: التحقق من الحوكمة الإلزامية
  IF v_write_off.branch_id IS NULL OR v_write_off.cost_center_id IS NULL OR v_write_off.warehouse_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الحوكمة مطلوبة: يجب تحديد branch_id, cost_center_id, warehouse_id'
    );
  END IF;

  -- ✅ التحقق من توفر الكميات من FIFO Lots (وليس products.quantity_on_hand)
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    -- حساب الكمية المتاحة من FIFO Lots في نفس الفرع/المخزن
    SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_fifo_lots_available
    FROM fifo_cost_lots
    WHERE product_id = v_item.product_id
      AND company_id = v_write_off.company_id
      AND (branch_id IS NULL OR branch_id = v_write_off.branch_id)
      AND (warehouse_id IS NULL OR warehouse_id = v_write_off.warehouse_id)
      AND remaining_quantity > 0;

    IF v_fifo_lots_available < v_item.quantity THEN
      SELECT name INTO v_product FROM products WHERE id = v_item.product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'الكمية المتاحة غير كافية للمنتج: ' || COALESCE(v_product.name, '') ||
                 ' (متاح من FIFO Lots: ' || v_fifo_lots_available || ', مطلوب: ' || v_item.quantity || ')' ||
                 '. يرجى التحقق من الرصيد في نفس الفرع/المخزن.'
      );
    END IF;
  END LOOP;

  -- إنشاء القيد المحاسبي (قبل حساب COGS لمعرفة journal_entry_id)
  INSERT INTO journal_entries (
    company_id, branch_id, cost_center_id, warehouse_id,
    reference_type, reference_id, entry_date, description
  ) VALUES (
    v_write_off.company_id,
    v_write_off.branch_id,
    v_write_off.cost_center_id,
    v_write_off.warehouse_id,
    'write_off',
    p_write_off_id,
    v_write_off.write_off_date,
    'إهلاك مخزون - ' || v_write_off.write_off_number
  ) RETURNING id INTO v_journal_id;

  -- 🔄 استهلاك FIFO Lots وإنشاء COGS Transactions لكل عنصر
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    -- ✅ استهلاك FIFO Lots (سيحدد unit_cost تلقائياً)
    v_item_cogs := consume_fifo_lots(
      p_company_id := v_write_off.company_id,
      p_product_id := v_item.product_id,
      p_quantity := v_item.quantity,
      p_consumption_type := 'write_off',
      p_reference_type := 'write_off',
      p_reference_id := p_write_off_id,
      p_consumption_date := v_write_off.write_off_date
    );

    IF v_item_cogs IS NULL OR v_item_cogs < 0 THEN
      -- Rollback في حالة الخطأ (يجب أن يكون في transaction)
      RETURN jsonb_build_object(
        'success', false,
        'error', 'خطأ في استهلاك FIFO Lots للمنتج: ' || v_item.product_id
      );
    END IF;

    -- الحصول على fifo_consumption_id الأخير (لربط COGS transaction)
    SELECT id INTO v_fifo_consumption_id
    FROM fifo_lot_consumptions
    WHERE reference_type = 'write_off'
      AND reference_id = p_write_off_id
      AND product_id = v_item.product_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- ✅ إنشاء COGS Transaction
    INSERT INTO cogs_transactions (
      company_id, branch_id, cost_center_id, warehouse_id,
      product_id, source_type, source_id, quantity,
      unit_cost, total_cost, fifo_consumption_id,
      transaction_date, created_by_user_id, notes
    )
    SELECT
      v_write_off.company_id,
      v_write_off.branch_id,
      v_write_off.cost_center_id,
      v_write_off.warehouse_id,
      v_item.product_id,
      'depreciation'::TEXT, -- source_type = depreciation
      p_write_off_id,
      v_item.quantity,
      -- حساب unit_cost من COGS / quantity
      CASE 
        WHEN v_item.quantity > 0 THEN ROUND(v_item_cogs / v_item.quantity, 4)
        ELSE 0
      END,
      v_item_cogs,
      v_fifo_consumption_id,
      v_write_off.write_off_date,
      p_approved_by,
      'إهلاك مخزون - ' || v_write_off.write_off_number
    RETURNING id INTO v_cogs_transaction_id;

    -- تحديث inventory_write_off_items.unit_cost و total_cost من FIFO (وليس من المدخلات)
    UPDATE inventory_write_off_items
    SET
      unit_cost = CASE 
        WHEN v_item.quantity > 0 THEN ROUND(v_item_cogs / v_item.quantity, 4)
        ELSE 0
      END,
      total_cost = v_item_cogs
    WHERE id = v_item.id;

    -- إضافة للتكلفة الإجمالية
    v_total_cogs := v_total_cogs + v_item_cogs;
  END LOOP;

  -- تحديث total_cost في inventory_write_offs (من FIFO فقط)
  UPDATE inventory_write_offs
  SET total_cost = v_total_cogs
  WHERE id = p_write_off_id;

  -- إدراج كلا السطرين (المدين والدائن) في نفس الأمر لضمان التوازن
  -- ✅ استخدام total_cost المحسوب من FIFO (وليس من المدخلات)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  ) VALUES 
    -- خصم حساب مصروف الإهلاك
    (
      v_journal_id, p_expense_account_id, v_total_cogs, 0,
      'مصروف إهلاك مخزون - ' || v_write_off.write_off_number
    ),
    -- دائن حساب المخزون
    (
      v_journal_id, p_inventory_account_id, 0, v_total_cogs,
      'تخفيض المخزون - ' || v_write_off.write_off_number
    );

  -- إنشاء حركات المخزون (للأرشفة - مع الاحتفاظ بـ inventory_transactions)
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO inventory_transactions (
      company_id, branch_id, cost_center_id, warehouse_id,
      product_id, transaction_type, quantity_change,
      reference_type, reference_id, journal_entry_id, notes
    ) VALUES (
      v_write_off.company_id,
      v_write_off.branch_id,
      v_write_off.cost_center_id,
      v_write_off.warehouse_id,
      v_item.product_id,
      'write_off',
      -v_item.quantity,
      'write_off',
      p_write_off_id,
      v_journal_id,
      'إهلاك - ' || v_write_off.write_off_number || ' (COGS من FIFO: ' || v_item.total_cost || ')'
    );
  END LOOP;

  -- تحديث حالة الإهلاك
  UPDATE inventory_write_offs SET
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = now(),
    journal_entry_id = v_journal_id,
    updated_at = now()
  WHERE id = p_write_off_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', v_journal_id,
    'total_cogs', v_total_cogs,
    'message', 'تم اعتماد الإهلاك بنجاح. تم استخدام FIFO Engine لحساب COGS.'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'خطأ في اعتماد الإهلاك: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. تعليقات توضيحية
-- =====================================================
COMMENT ON FUNCTION approve_write_off(UUID, UUID, UUID, UUID) IS 
'اعتماد إهلاك المخزون مع استخدام FIFO Engine + COGS Transactions. 
يستخدم FIFO Lots لتحديد unit_cost (وليس products.cost_price).
يخلق cogs_transactions مع source_type = depreciation.
يتطلب الحوكمة: branch_id, cost_center_id, warehouse_id.';

-- =====================================================
-- 3. التحقق من النجاح
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم تحديث دالة approve_write_off لاستخدام FIFO Engine + COGS Transactions';
  RAISE NOTICE '📋 الميزات الجديدة:';
  RAISE NOTICE '  - استخدام FIFO Engine لتحديد unit_cost';
  RAISE NOTICE '  - إنشاء cogs_transactions مع source_type = depreciation';
  RAISE NOTICE '  - التحقق من الرصيد من FIFO Lots (وليس products.quantity_on_hand)';
  RAISE NOTICE '  - الحوكمة الإلزامية: branch_id, cost_center_id, warehouse_id';
END $$;
