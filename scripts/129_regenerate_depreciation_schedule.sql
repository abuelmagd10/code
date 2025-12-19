-- =============================================
-- Regenerate Depreciation Schedule
-- إعادة إنشاء جدول الإهلاك
-- =============================================
-- USAGE: Call with asset_id parameter
-- الاستخدام: استدعاء مع معامل asset_id
-- =============================================
-- Example: SELECT regenerate_depreciation_schedule('asset-uuid-here');
-- =============================================

CREATE OR REPLACE FUNCTION regenerate_depreciation_schedule(
  p_asset_id UUID
)
RETURNS TABLE(
  periods_count INTEGER,
  asset_name TEXT,
  asset_code TEXT
) AS $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_periods_count INTEGER;
BEGIN
  -- =====================================
  -- 1. العثور على الأصل
  -- =====================================
  SELECT fa.id, fa.company_id, fa.name, fa.asset_code
  INTO v_asset_id, v_company_id, v_asset_name, v_asset_code
  FROM fixed_assets fa
  WHERE fa.id = p_asset_id
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset with ID % not found', p_asset_id;
  END IF;

  RAISE NOTICE '✓ Found asset: % (Code: %, ID: %)', v_asset_name, v_asset_code, v_asset_id;

  -- =====================================
  -- 2. التحقق من حالة الأصل
  -- =====================================
  DECLARE
    v_purchase_cost DECIMAL(15, 2);
    v_salvage_value DECIMAL(15, 2);
    v_useful_life_months INTEGER;
    v_depreciation_method TEXT;
    v_status TEXT;
  BEGIN
    SELECT purchase_cost, salvage_value, useful_life_months, depreciation_method, status
    INTO v_purchase_cost, v_salvage_value, v_useful_life_months, v_depreciation_method, v_status
    FROM fixed_assets
    WHERE id = v_asset_id;

    RAISE NOTICE 'Asset Details:';
    RAISE NOTICE '  Purchase Cost: %', v_purchase_cost;
    RAISE NOTICE '  Salvage Value: %', v_salvage_value;
    RAISE NOTICE '  Useful Life: % months', v_useful_life_months;
    RAISE NOTICE '  Depreciation Method: %', v_depreciation_method;
    RAISE NOTICE '  Status: %', v_status;

    IF v_status NOT IN ('active', 'draft') THEN
      RAISE WARNING 'Asset status is %, not active. Consider changing status to active first.', v_status;
    END IF;
  END;

  -- =====================================
  -- 3. إعادة إنشاء جدول الإهلاك
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE 'Generating depreciation schedule...';
  
  SELECT generate_depreciation_schedule(v_asset_id) INTO v_periods_count;

  RAISE NOTICE '✓ Generated % depreciation periods', v_periods_count;

  -- =====================================
  -- 4. التحقق من النتائج
  -- =====================================
  DECLARE
    v_schedules_count INTEGER;
    v_pending_count INTEGER;
    v_approved_count INTEGER;
    v_posted_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_schedules_count
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id;

    SELECT COUNT(*) INTO v_pending_count
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id AND status = 'pending';

    SELECT COUNT(*) INTO v_approved_count
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id AND status = 'approved';

    SELECT COUNT(*) INTO v_posted_count
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id AND status = 'posted';

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Depreciation Schedule Summary';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total Schedules: %', v_schedules_count;
    RAISE NOTICE '  - Pending: %', v_pending_count;
    RAISE NOTICE '  - Approved: %', v_approved_count;
    RAISE NOTICE '  - Posted: %', v_posted_count;
    RAISE NOTICE '========================================';
  END;

  -- =====================================
  -- 5. ملخص العملية
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE '✓ Depreciation schedule regenerated successfully!';
  RAISE NOTICE 'Asset: % (FA-0001)', v_asset_name;
  RAISE NOTICE 'Total Periods: %', v_periods_count;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error regenerating depreciation schedule: %', SQLERRM;
END $$;

-- =====================================
-- Grant permissions
-- =====================================
GRANT EXECUTE ON FUNCTION regenerate_depreciation_schedule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION regenerate_depreciation_schedule(UUID) TO anon;

