-- =============================================
-- 🔍 تشخيص شامل لمشكلة الإهلاك - جاهز للتنفيذ
-- =============================================
-- المعلومات من رسالة الخطأ:
-- SKU: suk (1001)
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- الرصيد المتاح = 0
-- المطلوب = 50
-- =============================================

-- =====================================
-- الخطوة 1: البحث عن المنتج من SKU
-- =====================================
DO $$
DECLARE
  v_product_id UUID;
  v_company_id UUID;
  v_product_name TEXT;
  v_product_sku TEXT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'الخطوة 1: البحث عن المنتج من SKU';
  RAISE NOTICE '========================================';
  
  SELECT id, company_id, name, sku 
  INTO v_product_id, v_company_id, v_product_name, v_product_sku
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_product_id IS NULL THEN
    RAISE NOTICE '❌ لم يتم العثور على المنتج!';
    RAISE NOTICE 'يرجى التحقق من SKU أو اسم المنتج';
  ELSE
    RAISE NOTICE '✅ تم العثور على المنتج:';
    RAISE NOTICE '  Product ID: %', v_product_id;
    RAISE NOTICE '  Company ID: %', v_company_id;
    RAISE NOTICE '  Name: %', v_product_name;
    RAISE NOTICE '  SKU: %', v_product_sku;
    
    -- استمرار التشخيص
    PERFORM diagnose_write_off_issue(
      v_company_id,
      v_product_id,
      '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
    );
  END IF;
END $$;

-- =====================================
-- دالة التشخيص الشاملة
-- =====================================
CREATE OR REPLACE FUNCTION diagnose_write_off_issue(
  p_company_id UUID,
  p_product_id UUID,
  p_warehouse_id UUID
)
RETURNS TABLE (
  step_number INTEGER,
  section TEXT,
  status TEXT,
  details TEXT,
  recommendation TEXT
) AS $$
DECLARE
  v_warehouse_name TEXT;
  v_warehouse_branch_id UUID;
  v_branch_name TEXT;
  v_branch_default_cost_center_id UUID;
  v_cost_center_name TEXT;
  v_transaction_count INTEGER;
  v_available_qty INTEGER;
  v_product_qty INTEGER;
  v_transaction_cost_center_id UUID;
  v_has_mismatch BOOLEAN := false;
BEGIN
  -- =====================================
  -- الخطوة 2: فحص Warehouse والربط
  -- =====================================
  SELECT 
    w.name,
    w.branch_id,
    b.name,
    b.default_cost_center_id,
    cc.name
  INTO 
    v_warehouse_name,
    v_warehouse_branch_id,
    v_branch_name,
    v_branch_default_cost_center_id,
    v_cost_center_name
  FROM warehouses w
  LEFT JOIN branches b ON b.id = w.branch_id
  LEFT JOIN cost_centers cc ON cc.id = b.default_cost_center_id
  WHERE w.id = p_warehouse_id
    AND w.company_id = p_company_id;
  
  IF v_warehouse_name IS NULL THEN
    RETURN QUERY SELECT 
      2::INTEGER,
      'Warehouse Check'::TEXT,
      '❌ ERROR'::TEXT,
      'المخزن غير موجود أو لا ينتمي للشركة'::TEXT,
      'تحقق من warehouse_id و company_id'::TEXT;
    RETURN;
  END IF;
  
  -- الخطوة 2.1: فحص ربط Warehouse بـ Branch
  step_number := 2;
  section := 'Warehouse-Branch Link';
  IF v_warehouse_branch_id IS NULL THEN
    status := '❌ ERROR';
    details := 'Warehouse غير مرتبط بـ Branch!';
    recommendation := 'قم بتحديث warehouse لربطه بـ branch: UPDATE warehouses SET branch_id = ''BRANCH_ID'' WHERE id = ''' || p_warehouse_id || ''';';
  ELSE
    status := '✅ OK';
    details := 'Warehouse مرتبط بـ Branch: ' || v_warehouse_branch_id;
    recommendation := 'لا يوجد مشكلة';
  END IF;
  RETURN QUERY SELECT step_number, section, status, details, recommendation;
  
  -- الخطوة 2.2: فحص Branch Default Cost Center
  IF v_warehouse_branch_id IS NOT NULL THEN
    step_number := 3;
    section := 'Branch Cost Center';
    IF v_branch_default_cost_center_id IS NULL THEN
      status := '❌ ERROR';
      details := 'Branch ليس له default_cost_center_id!';
      recommendation := 'قم بتحديث branch: UPDATE branches SET default_cost_center_id = ''COST_CENTER_ID'' WHERE id = ''' || v_warehouse_branch_id || ''';';
    ELSE
      status := '✅ OK';
      details := 'Branch له default_cost_center_id: ' || v_branch_default_cost_center_id || ' (' || COALESCE(v_cost_center_name, 'N/A') || ')';
      recommendation := 'لا يوجد مشكلة';
    END IF;
    RETURN QUERY SELECT step_number, section, status, details, recommendation;
  END IF;
  
  -- =====================================
  -- الخطوة 3: فحص Transactions
  -- =====================================
  step_number := 4;
  section := 'Transactions Check';
  
  SELECT COUNT(*), SUM(quantity_change)
  INTO v_transaction_count, v_available_qty
  FROM inventory_transactions
  WHERE company_id = p_company_id
    AND product_id = p_product_id
    AND warehouse_id = p_warehouse_id
    AND (is_deleted IS NULL OR is_deleted = false);
  
  IF v_transaction_count = 0 THEN
    status := '⚠️ WARNING';
    details := 'لا توجد transactions للمنتج في هذا المخزن';
    recommendation := 'سيتم استخدام quantity_on_hand من جدول products';
  ELSE
    status := '✅ FOUND';
    details := 'عدد Transactions: ' || v_transaction_count || ', الرصيد المحسوب: ' || COALESCE(v_available_qty, 0);
    recommendation := 'تم العثور على transactions';
  END IF;
  RETURN QUERY SELECT step_number, section, status, details, recommendation;
  
  -- =====================================
  -- الخطوة 4: فحص Cost Center Mismatch
  -- =====================================
  IF v_transaction_count > 0 AND v_branch_default_cost_center_id IS NOT NULL THEN
    SELECT DISTINCT cost_center_id
    INTO v_transaction_cost_center_id
    FROM inventory_transactions
    WHERE company_id = p_company_id
      AND product_id = p_product_id
      AND warehouse_id = p_warehouse_id
      AND (is_deleted IS NULL OR is_deleted = false)
    LIMIT 1;
    
    IF v_transaction_cost_center_id IS NOT NULL AND v_transaction_cost_center_id != v_branch_default_cost_center_id THEN
      v_has_mismatch := true;
      
      step_number := 5;
      section := 'Cost Center Mismatch';
      status := '❌ ERROR';
      details := 'cost_center_id في transactions (' || v_transaction_cost_center_id || ') مختلف عن default_cost_center_id في branch (' || v_branch_default_cost_center_id || ')';
      recommendation := 'قم بتحديث default_cost_center_id في branch أو تحديث transactions';
      RETURN QUERY SELECT step_number, section, status, details, recommendation;
    END IF;
  END IF;
  
  -- =====================================
  -- الخطوة 5: حساب الرصيد النهائي
  -- =====================================
  step_number := 6;
  section := 'Final Balance Calculation';
  
  IF v_transaction_count = 0 THEN
    SELECT COALESCE(quantity_on_hand, 0)
    INTO v_product_qty
    FROM products
    WHERE id = p_product_id AND company_id = p_company_id;
    
    status := '📊 INFO';
    details := 'لا توجد transactions، تم استخدام quantity_on_hand: ' || v_product_qty;
    recommendation := 'الرصيد المتاح: ' || v_product_qty;
  ELSE
    status := '📊 INFO';
    details := 'تم حساب الرصيد من transactions: ' || COALESCE(v_available_qty, 0);
    recommendation := 'الرصيد المتاح: ' || COALESCE(v_available_qty, 0);
  END IF;
  RETURN QUERY SELECT step_number, section, status, details, recommendation;
  
  -- =====================================
  -- الخطوة 6: استخدام دالة التشخيص الأصلية
  -- =====================================
  step_number := 7;
  section := 'Detailed Debug';
  status := '📋 INFO';
  details := 'راجع نتائج debug_available_inventory_quantity أدناه';
  recommendation := 'شغّل: SELECT * FROM debug_available_inventory_quantity(''' || p_company_id || ''', NULL, ''' || p_warehouse_id || ''', NULL, ''' || p_product_id || ''');';
  RETURN QUERY SELECT step_number, section, status, details, recommendation;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION diagnose_write_off_issue IS 'دالة تشخيصية شاملة لمشكلة الرصيد المتاح في الإهلاك';

-- =====================================
-- تشغيل التشخيص الكامل
-- =====================================
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'بدء التشخيص الشامل...';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  FOR rec IN 
    SELECT * FROM diagnose_write_off_issue(
      NULL::UUID,  -- سيتم تعبئته تلقائياً
      NULL::UUID,  -- سيتم تعبئته تلقائياً
      '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
    )
    ORDER BY step_number
  LOOP
    RAISE NOTICE '[%] %', rec.step_number, rec.section;
    RAISE NOTICE '  Status: %', rec.status;
    RAISE NOTICE '  Details: %', rec.details;
    RAISE NOTICE '  Recommendation: %', rec.recommendation;
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'انتهى التشخيص';
  RAISE NOTICE '========================================';
END $$;

-- =====================================
-- عرض النتائج بشكل منظم
-- =====================================
SELECT 
  step_number as "خطوة",
  section as "القسم",
  status as "الحالة",
  details as "التفاصيل",
  recommendation as "التوصية"
FROM diagnose_write_off_issue(
  (SELECT company_id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1),
  (SELECT id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1),
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
)
ORDER BY step_number;
