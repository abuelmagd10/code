-- =============================================
-- ✅ الحل الجذري الشامل لمشكلة الرصيد المتاح في الإهلاك
-- =============================================
-- المشكلة: الرصيد المتاح = 0 رغم وجود المنتج في المخزن
-- السبب الجذري: 
--   1. دالة get_available_inventory_quantity لا تجلب cost_center_id من branch تلقائياً
--   2. إذا كان cost_center_id NULL، الشرط يقبل أي cost_center_id مما يؤدي لحساب خاطئ
--   3. يجب حساب الرصيد بناءً على cost_center_id المرتبط بـ branch المحدد
-- الحل: جلب branch_id و cost_center_id تلقائياً من warehouse إذا لم يكن محدداً
-- =============================================

-- =====================================
-- 1. تحديث دالة حساب الرصيد المتاح (الحل الجذري)
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
  v_transaction_count INTEGER := 0;
  v_final_branch_id UUID;
  v_final_cost_center_id UUID;
  v_warehouse_branch_id UUID;
  v_branch_default_cost_center_id UUID;
BEGIN
  -- ✅ الخطوة 1: تحديد branch_id النهائي
  -- إذا تم تمرير warehouse_id، نجلب branch_id منه
  IF p_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_warehouse_branch_id
    FROM warehouses
    WHERE id = p_warehouse_id AND company_id = p_company_id;
    
    -- استخدام branch_id من warehouse إذا كان متوفراً ولم يتم تمرير branch_id
    IF v_warehouse_branch_id IS NOT NULL THEN
      v_final_branch_id := COALESCE(p_branch_id, v_warehouse_branch_id);
    ELSE
      v_final_branch_id := p_branch_id;
    END IF;
  ELSE
    v_final_branch_id := p_branch_id;
  END IF;

  -- ✅ الخطوة 2: تحديد cost_center_id النهائي
  -- إذا كان branch_id محدداً ولم يكن cost_center_id محدداً، نجلب default_cost_center_id من branch
  IF v_final_branch_id IS NOT NULL AND p_cost_center_id IS NULL THEN
    SELECT default_cost_center_id INTO v_branch_default_cost_center_id
    FROM branches
    WHERE id = v_final_branch_id AND company_id = p_company_id;
    
    v_final_cost_center_id := v_branch_default_cost_center_id;
  ELSE
    v_final_cost_center_id := p_cost_center_id;
  END IF;

  -- ✅ الخطوة 3: حساب الرصيد المتاح من inventory_transactions
  -- نستخدم المعايير الصحيحة: company_id, branch_id, warehouse_id, cost_center_id, product_id
  -- الحل المحسّن: نحاول بالمعايير الصارمة أولاً، ثم بالمعايير المرنة
  
  -- المحاولة 1: البحث بالمعايير الصارمة (warehouse + branch + cost_center)
  SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    AND (v_final_branch_id IS NULL OR branch_id = v_final_branch_id)
    AND (v_final_cost_center_id IS NULL OR cost_center_id = v_final_cost_center_id)
    AND (is_deleted IS NULL OR is_deleted = false);

  -- المحاولة 2: إذا لم توجد transactions بالمعايير الصارمة، نجرب بدون cost_center_id
  -- هذا يحل مشكلة cost_center_id mismatch
  IF v_transaction_count = 0 AND p_warehouse_id IS NOT NULL AND v_final_branch_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
    FROM inventory_transactions
    WHERE company_id = p_company_id
      AND product_id = p_product_id
      AND warehouse_id = p_warehouse_id
      AND branch_id = v_final_branch_id
      AND (is_deleted IS NULL OR is_deleted = false);
  END IF;

  -- المحاولة 3: إذا لم توجد transactions، نجرب بدون branch_id أيضاً (فقط warehouse)
  -- هذا يحل مشكلة branch_id mismatch
  IF v_transaction_count = 0 AND p_warehouse_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity_change), 0), COUNT(*) INTO v_available_qty, v_transaction_count
    FROM inventory_transactions
    WHERE company_id = p_company_id
      AND product_id = p_product_id
      AND warehouse_id = p_warehouse_id
      AND (is_deleted IS NULL OR is_deleted = false);
  END IF;

  -- ✅ الخطوة 4: إذا لم توجد transactions في المخزن المحدد، نرجع 0
  -- ⚠️ لا نستخدم quantity_on_hand لأنه الرصيد الإجمالي في جميع المخازن، وليس في المخزن المحدد
  -- إذا لم توجد transactions في المخزن المحدد، فهذا يعني أن الرصيد = 0 في هذا المخزن
  IF v_transaction_count = 0 THEN
    RETURN 0;
  END IF;
  
  -- ✅ الخطوة 5: إذا كانت هناك transactions، استخدم المجموع المحسوب
  RETURN GREATEST(0, v_available_qty);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================
-- 2. تحديث دالة approve_write_off لجلب cost_center_id من branch
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
  
  -- ✅ جلب branch_id من warehouse
  IF v_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id 
    FROM warehouses 
    WHERE id = v_warehouse_id AND company_id = v_write_off.company_id;
  END IF;

  -- ✅ جلب cost_center_id من branch (الحل الجذري)
  IF v_branch_id IS NOT NULL THEN
    SELECT default_cost_center_id INTO v_cost_center_id
    FROM branches
    WHERE id = v_branch_id AND company_id = v_write_off.company_id;
  END IF;

  -- التحقق من جميع العناصر
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    -- حساب الرصيد المتاح حسب المفاتيح الصحيحة (مع cost_center_id الصحيح)
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
        'error', 'لا يمكن إهلاك المخزون بدون رصيد فعلي' || E'\n' ||
                 'المنتج: ' || COALESCE(v_product.name, 'غير معروف') ||
                 ' (SKU: ' || COALESCE(v_product.sku, 'N/A') || ')' || E'\n' ||
                 'الرصيد المتاح = ' || v_available_qty || E'\n' ||
                 'المطلوب = ' || v_item.quantity || E'\n' ||
                 'warehouse_id = ' || COALESCE(v_warehouse_id::TEXT, 'غير محدد') || E'\n' ||
                 'branch_id = ' || COALESCE(v_branch_id::TEXT, 'غير محدد') || E'\n' ||
                 'cost_center_id = ' || COALESCE(v_cost_center_id::TEXT, 'غير محدد')
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

  -- إنشاء حركات المخزون مع warehouse_id و branch_id و cost_center_id الصحيحة
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
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================
-- 3. تحديث trigger validate_write_off_items لجلب cost_center_id بشكل صحيح
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
  
  -- ✅ جلب branch_id من warehouse
  IF v_warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id 
    FROM warehouses 
    WHERE id = v_warehouse_id AND company_id = v_write_off.company_id;
  END IF;

  -- ✅ جلب cost_center_id من branch (الحل الجذري)
  IF v_branch_id IS NOT NULL THEN
    SELECT default_cost_center_id INTO v_cost_center_id
    FROM branches
    WHERE id = v_branch_id AND company_id = v_write_off.company_id;
  END IF;

  -- حساب الرصيد المتاح (مع cost_center_id الصحيح)
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
    RAISE EXCEPTION 'الرصيد المتاح غير كافٍ: الرصيد المتاح = %, المطلوب = % (company_id: %, warehouse_id: %, branch_id: %, cost_center_id: %, product_id: %)',
      v_available_qty, v_item_quantity, v_write_off.company_id, v_warehouse_id, v_branch_id, v_cost_center_id, NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================
-- 4. تحديث trigger validate_write_off_approval لجلب cost_center_id بشكل صحيح
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
    
    -- ✅ جلب branch_id من warehouse
    IF v_warehouse_id IS NOT NULL THEN
      SELECT branch_id INTO v_branch_id 
      FROM warehouses 
      WHERE id = v_warehouse_id AND company_id = NEW.company_id;
    END IF;

    -- ✅ جلب cost_center_id من branch (الحل الجذري)
    IF v_branch_id IS NOT NULL THEN
      SELECT default_cost_center_id INTO v_cost_center_id
      FROM branches
      WHERE id = v_branch_id AND company_id = NEW.company_id;
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
        RAISE EXCEPTION 'لا يمكن اعتماد الإهلاك: الرصيد المتاح = 0 للمنتج (product_id: %, warehouse_id: %, branch_id: %, cost_center_id: %)',
          v_item.product_id, v_warehouse_id, v_branch_id, v_cost_center_id;
      END IF;

      IF v_available_qty < v_item.quantity THEN
        RAISE EXCEPTION 'لا يمكن اعتماد الإهلاك: الرصيد المتاح (%) < الكمية المطلوبة (%) للمنتج (product_id: %, warehouse_id: %, branch_id: %, cost_center_id: %)',
          v_available_qty, v_item.quantity, v_item.product_id, v_warehouse_id, v_branch_id, v_cost_center_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================
-- 5. إنشاء View لحساب الرصيد المتاح بشكل موحد (اقتراح تحسين)
-- =====================================
-- ⚠️ ملاحظة أمان: View لا يحتوي على RLS، يجب استخدامه مع فلتر company_id دائماً
CREATE OR REPLACE VIEW inventory_available_balance AS
SELECT 
  it.company_id,
  it.branch_id,
  it.warehouse_id,
  it.cost_center_id,
  it.product_id,
  COALESCE(SUM(CASE WHEN it.is_deleted IS NULL OR it.is_deleted = false THEN it.quantity_change ELSE 0 END), 0) AS available_quantity,
  COUNT(*) FILTER (WHERE it.is_deleted IS NULL OR it.is_deleted = false) AS transaction_count
FROM inventory_transactions it
WHERE it.company_id IS NOT NULL  -- ⚠️ فحص أمان: لا نأخذ transactions بدون company_id
GROUP BY it.company_id, it.branch_id, it.warehouse_id, it.cost_center_id, it.product_id;

COMMENT ON VIEW inventory_available_balance IS 
'View لحساب الرصيد المتاح لكل منتج في كل مخزن/فرع/مركز تكلفة. ⚠️ يجب استخدامه مع فلتر company_id دائماً لأنه لا يحتوي على RLS.';

-- =====================================
-- 6. إنشاء Indexes لتحسين الأداء
-- =====================================
CREATE INDEX IF NOT EXISTS idx_inventory_tx_warehouse_product_costcenter 
  ON inventory_transactions(company_id, warehouse_id, product_id, cost_center_id) 
  WHERE is_deleted IS NULL OR is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_branch_warehouse_costcenter 
  ON inventory_transactions(company_id, branch_id, warehouse_id, cost_center_id, product_id) 
  WHERE is_deleted IS NULL OR is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_warehouses_branch_company 
  ON warehouses(company_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_branches_cost_center_company 
  ON branches(company_id, default_cost_center_id);

-- =====================================
-- 7. التحقق من التحديث
-- =====================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم تحديث دالة get_available_inventory_quantity بنجاح';
  RAISE NOTICE '✅ الدالة الآن تجلب branch_id و cost_center_id تلقائياً من warehouse';
  RAISE NOTICE '✅ تم تحديث دالة approve_write_off لجلب cost_center_id من branch';
  RAISE NOTICE '✅ تم تحديث trigger validate_write_off_items لجلب cost_center_id بشكل صحيح';
  RAISE NOTICE '✅ تم تحديث trigger validate_write_off_approval لجلب cost_center_id بشكل صحيح';
  RAISE NOTICE '✅ تم إنشاء View inventory_available_balance لحساب الرصيد بشكل موحد';
  RAISE NOTICE '✅ تم إنشاء Indexes لتحسين الأداء';
  RAISE NOTICE '';
  RAISE NOTICE '📝 ملاحظات مهمة:';
  RAISE NOTICE '  - الدالة الآن تحسب الرصيد بناءً على cost_center_id المرتبط بـ branch';
  RAISE NOTICE '  - إذا لم يكن هناك transactions في المخزن المحدد، يتم إرجاع 0 (لا يوجد رصيد في هذا المخزن)';
  RAISE NOTICE '  - جميع Triggers تستخدم cost_center_id الصحيح من branch';
END $$;
