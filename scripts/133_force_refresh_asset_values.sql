-- =============================================
-- Force Refresh Asset Values
-- إعادة تحديث قيم الأصل بالقوة
-- =============================================
-- Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
-- Asset Code: FA-0001
-- =============================================
-- هذا السكريبت يضمن أن قيم الأصل محدثة بشكل صحيح
-- =============================================

DO $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_purchase_cost DECIMAL(15, 2);
  v_accumulated_depreciation DECIMAL(15, 2);
  v_book_value DECIMAL(15, 2);
BEGIN
  -- =====================================
  -- 1. العثور على الأصل
  -- =====================================
  SELECT fa.id, fa.company_id, fa.name, fa.asset_code, fa.purchase_cost,
         fa.accumulated_depreciation, fa.book_value
  INTO v_asset_id, v_company_id, v_asset_name, v_asset_code, v_purchase_cost,
       v_accumulated_depreciation, v_book_value
  FROM fixed_assets fa
  WHERE fa.asset_code = 'FA-0001'
    AND fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset FA-0001 not found in company 3a663f6b-0689-4952-93c1-6d958c737089';
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Force Refresh Asset Values';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (Code: %, ID: %)', v_asset_name, v_asset_code, v_asset_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Current Values:';
  RAISE NOTICE '  Purchase Cost: %', v_purchase_cost;
  RAISE NOTICE '  Accumulated Depreciation: %', v_accumulated_depreciation;
  RAISE NOTICE '  Book Value: %', v_book_value;
  RAISE NOTICE '';

  -- =====================================
  -- 2. حساب accumulated_depreciation من جداول الإهلاك المرحلة
  -- =====================================
  DECLARE
    v_calculated_depreciation DECIMAL(15, 2) := 0;
    v_schedules_count INTEGER;
  BEGIN
    SELECT COALESCE(SUM(depreciation_amount), 0), COUNT(*)
    INTO v_calculated_depreciation, v_schedules_count
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id
      AND status = 'posted';

    RAISE NOTICE 'Calculated from Posted Schedules:';
    RAISE NOTICE '  Posted Schedules Count: %', v_schedules_count;
    RAISE NOTICE '  Calculated Accumulated Depreciation: %', v_calculated_depreciation;

    -- =====================================
    -- 3. إعادة تحديث قيم الأصل
    -- =====================================
    UPDATE fixed_assets
    SET
      accumulated_depreciation = v_calculated_depreciation,
      book_value = purchase_cost - v_calculated_depreciation,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_asset_id;

    RAISE NOTICE '';
    RAISE NOTICE 'Updated Values:';
    RAISE NOTICE '  Accumulated Depreciation: %', v_calculated_depreciation;
    RAISE NOTICE '  Book Value: %', (v_purchase_cost - v_calculated_depreciation);
    RAISE NOTICE '';

    -- التحقق من النتيجة
    SELECT accumulated_depreciation, book_value
    INTO v_accumulated_depreciation, v_book_value
    FROM fixed_assets
    WHERE id = v_asset_id;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification:';
    RAISE NOTICE '  Accumulated Depreciation: %', v_accumulated_depreciation;
    RAISE NOTICE '  Book Value: %', v_book_value;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '✓ Asset values refreshed successfully!';
  END;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error refreshing asset values: %', SQLERRM;
END $$;

-- =====================================
-- عرض القيم النهائية
-- =====================================
SELECT 
  fa.asset_code,
  fa.name,
  fa.purchase_cost,
  fa.accumulated_depreciation,
  fa.book_value,
  fa.status,
  COUNT(DISTINCT CASE WHEN ds.status = 'posted' THEN ds.id END) as posted_schedules,
  COUNT(DISTINCT CASE WHEN ds.status IN ('pending', 'approved') THEN ds.id END) as pending_schedules
FROM fixed_assets fa
LEFT JOIN depreciation_schedules ds ON ds.asset_id = fa.id
WHERE fa.asset_code = 'FA-0001'
  AND fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
GROUP BY fa.id, fa.asset_code, fa.name, fa.purchase_cost, 
         fa.accumulated_depreciation, fa.book_value, fa.status;

