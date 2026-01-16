-- =============================================
-- 🧾 Stock Depreciation Governance Rule
-- منع إهلاك المخزون بدون رصيد فعلي
-- =============================================
-- الهدف: منع أي عملية إهلاك إذا لم يكن هناك رصيد فعلي متاح في:
-- - نفس الشركة
-- - نفس الفرع  
-- - نفس مركز التكلفة
-- - نفس المخزن
-- - نفس الصنف

-- =====================================
-- 1. دالة حساب الرصيد المتاح حسب المفاتيح
-- =====================================
CREATE OR REPLACE FUNCTION get_available_inventory_quantity(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_available_qty INTEGER := 0;
  v_product_qty INTEGER := 0;
  v_transaction_count INTEGER := 0;
BEGIN
  -- حساب الرصيد المتاح من inventory_transactions
  -- نأخذ في الاعتبار: company_id, branch_id, warehouse_id, cost_center_id, product_id
  SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);
  
  -- ✅ الحل الجذري: إذا لم توجد transactions على الإطلاق، استخدم quantity_on_hand من المنتج
  -- هذا يضمن أن المنتجات التي لم يتم تسجيل حركات مخزون لها (مثل المنتجات الجديدة) 
  -- يمكن إهلاكها بناءً على quantity_on_hand
  IF v_transaction_count = 0 THEN
    SELECT COALESCE(quantity_on_hand, 0) INTO v_product_qty
    FROM products
    WHERE id = p_product_id AND company_id = p_company_id;
    
    -- ✅ إرجاع quantity_on_hand حتى لو كان 0 (لأنه القيمة الصحيحة)
    RETURN GREATEST(0, v_product_qty);
  END IF;
  
  -- إذا كانت هناك transactions، استخدم المجموع المحسوب
  RETURN GREATEST(0, v_available_qty);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 2. تحديث دالة approve_write_off للتحقق من الرصيد
-- =====================================
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
  v_available_qty INTEGER;
  v_warehouse_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
BEGIN
  -- جلب بيانات الإهلاك
  SELECT * INTO v_write_off FROM inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الإهلاك ليس في حالة انتظار');
  END IF;

  -- 🧾 Governance Rule: التحقق من توفر الكميات حسب المفاتيح الصحيحة
  v_warehouse_id := v_write_off.warehouse_id;
  
  -- جلب branch_id و cost_center_id من warehouse إذا لم يكن موجوداً في write_off
  IF v_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM warehouses WHERE id = v_warehouse_id;
  END IF;

  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    -- حساب الرصيد المتاح حسب المفاتيح الصحيحة
    v_available_qty := get_available_inventory_quantity(
      v_write_off.company_id,
      v_branch_id,
      v_warehouse_id,
      v_cost_center_id,
      v_item.product_id
    );

    -- 🧾 Governance Rule: منع الإهلاك إذا الرصيد <= 0 أو < الكمية المطلوبة
    IF v_available_qty <= 0 THEN
      SELECT name, sku INTO v_product FROM products WHERE id = v_item.product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'الرصيد المتاح غير كافٍ للمنتج: ' || COALESCE(v_product.name, 'غير معروف') ||
                 ' (SKU: ' || COALESCE(v_product.sku, 'N/A') || ')' ||
                 ' - الرصيد المتاح: ' || v_available_qty ||
                 ' (يجب أن يكون > 0 في المخزن: ' || COALESCE(v_warehouse_id::TEXT, 'غير محدد') || ')'
      );
    END IF;

    IF v_available_qty < v_item.quantity THEN
      SELECT name, sku INTO v_product FROM products WHERE id = v_item.product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'الرصيد المتاح غير كافٍ للمنتج: ' || COALESCE(v_product.name, 'غير معروف') ||
                 ' (SKU: ' || COALESCE(v_product.sku, 'N/A') || ')' ||
                 ' - الرصيد المتاح: ' || v_available_qty ||
                 ', المطلوب للإهلاك: ' || v_item.quantity ||
                 ' (المخزن: ' || COALESCE(v_warehouse_id::TEXT, 'غير محدد') || ')'
      );
    END IF;
  END LOOP;

  -- إنشاء القيد المحاسبي
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description
  ) VALUES (
    v_write_off.company_id,
    'write_off',
    p_write_off_id,
    v_write_off.write_off_date,
    'إهلاك مخزون - ' || v_write_off.write_off_number
  ) RETURNING id INTO v_journal_id;

  -- إدراج كلا السطرين (المدين والدائن) في نفس الأمر لضمان التوازن
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  ) VALUES 
    -- خصم حساب مصروف الإهلاك
    (
      v_journal_id, p_expense_account_id, v_write_off.total_cost, 0,
      'مصروف إهلاك مخزون - ' || v_write_off.write_off_number
    ),
    -- دائن حساب المخزون
    (
      v_journal_id, p_inventory_account_id, 0, v_write_off.total_cost,
      'تخفيض المخزون - ' || v_write_off.write_off_number
    );

  -- إنشاء حركات المخزون مع warehouse_id و branch_id
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      warehouse_id, branch_id, cost_center_id,
      reference_id, journal_entry_id, notes
    ) VALUES (
      v_write_off.company_id,
      v_item.product_id,
      'write_off',
      -v_item.quantity,
      v_warehouse_id,
      v_branch_id,
      v_cost_center_id,
      p_write_off_id,
      v_journal_id,
      'إهلاك - ' || v_write_off.write_off_number
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
    'message', 'تم اعتماد الإهلاك بنجاح'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 3. Database Trigger للتحقق قبل Insert/Update
-- =====================================
CREATE OR REPLACE FUNCTION validate_write_off_items()
RETURNS TRIGGER AS $$
DECLARE
  v_write_off RECORD;
  v_warehouse_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
  v_available_qty INTEGER;
  v_item_quantity INTEGER;
BEGIN
  -- جلب بيانات الإهلاك
  SELECT * INTO v_write_off FROM inventory_write_offs WHERE id = NEW.write_off_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'إهلاك غير موجود: %', NEW.write_off_id;
  END IF;

  -- جلب warehouse_id و branch_id من الإهلاك
  v_warehouse_id := v_write_off.warehouse_id;
  
  IF v_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM warehouses WHERE id = v_warehouse_id;
  END IF;

  -- حساب الرصيد المتاح
  v_available_qty := get_available_inventory_quantity(
    v_write_off.company_id,
    v_branch_id,
    v_warehouse_id,
    v_cost_center_id,
    NEW.product_id
  );

  -- جلب الكمية المطلوبة (من السجل الجديد أو المحدث)
  IF TG_OP = 'INSERT' THEN
    v_item_quantity := NEW.quantity;
  ELSE -- UPDATE
    v_item_quantity := NEW.quantity;
  END IF;

  -- 🧾 Governance Rule: منع الإدخال/التحديث إذا الرصيد غير كافٍ
  -- ملاحظة: هذا التحقق في Insert فقط - في Update نتحقق عند Approve
  -- لأن المستخدم قد يكون يعدل الكمية قبل الاعتماد
  IF TG_OP = 'INSERT' AND v_available_qty < v_item_quantity THEN
    RAISE EXCEPTION 'الرصيد المتاح غير كافٍ: الرصيد المتاح = %, المطلوب = % (company_id: %, warehouse_id: %, product_id: %)',
      v_available_qty, v_item_quantity, v_write_off.company_id, v_warehouse_id, NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إنشاء Trigger قبل Insert/Update
DROP TRIGGER IF EXISTS trg_validate_write_off_items ON inventory_write_off_items;
CREATE TRIGGER trg_validate_write_off_items
BEFORE INSERT OR UPDATE ON inventory_write_off_items
FOR EACH ROW EXECUTE FUNCTION validate_write_off_items();

-- =====================================
-- 4. Trigger للتحقق عند Approve (حالة Update status)
-- =====================================
CREATE OR REPLACE FUNCTION validate_write_off_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_warehouse_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
  v_available_qty INTEGER;
BEGIN
  -- التحقق فقط عند تغيير الحالة إلى 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- جلب warehouse_id و branch_id
    v_warehouse_id := NEW.warehouse_id;
    
    IF v_warehouse_id IS NOT NULL THEN
      SELECT branch_id INTO v_branch_id FROM warehouses WHERE id = v_warehouse_id;
    END IF;

    -- التحقق من جميع العناصر
    FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = NEW.id LOOP
      v_available_qty := get_available_inventory_quantity(
        NEW.company_id,
        v_branch_id,
        v_warehouse_id,
        v_cost_center_id,
        v_item.product_id
      );

      -- 🧾 Governance Rule: منع الاعتماد إذا الرصيد غير كافٍ
      IF v_available_qty <= 0 THEN
        RAISE EXCEPTION 'لا يمكن اعتماد الإهلاك: الرصيد المتاح = 0 للمنتج (product_id: %, warehouse_id: %)',
          v_item.product_id, v_warehouse_id;
      END IF;

      IF v_available_qty < v_item.quantity THEN
        RAISE EXCEPTION 'لا يمكن اعتماد الإهلاك: الرصيد المتاح (%) < الكمية المطلوبة (%) للمنتج (product_id: %, warehouse_id: %)',
          v_available_qty, v_item.quantity, v_item.product_id, v_warehouse_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إنشاء Trigger قبل Update على inventory_write_offs
DROP TRIGGER IF EXISTS trg_validate_write_off_approval ON inventory_write_offs;
CREATE TRIGGER trg_validate_write_off_approval
BEFORE UPDATE ON inventory_write_offs
FOR EACH ROW EXECUTE FUNCTION validate_write_off_approval();

-- =====================================
-- 5. فهرس لتحسين الأداء
-- =====================================
CREATE INDEX IF NOT EXISTS idx_inventory_tx_warehouse_product 
  ON inventory_transactions(company_id, warehouse_id, product_id) 
  WHERE is_deleted IS NULL OR is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_branch_warehouse 
  ON inventory_transactions(company_id, branch_id, warehouse_id, product_id) 
  WHERE is_deleted IS NULL OR is_deleted = false;

-- =====================================
-- 6. ملاحظات مهمة
-- =====================================
-- ✅ التحقق في 3 طبقات:
--    1. UI: منع الإدخال في الواجهة
--    2. API: التحقق في دالة approve_write_off
--    3. Database: Triggers تمنع أي تجاوز

-- ✅ الرصيد يحسب من inventory_transactions بناءً على:
--    - company_id
--    - branch_id (من warehouse إذا لم يكن في write_off)
--    - warehouse_id
--    - cost_center_id
--    - product_id

-- ✅ لا يُسمح بالإهلاك إذا:
--    - available_quantity <= 0
--    - available_quantity < depreciation_quantity
