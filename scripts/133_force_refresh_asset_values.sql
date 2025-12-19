-- =============================================
-- Force Refresh Asset Values
-- إعادة تحديث قيم الأصل بالقوة
-- =============================================
-- USAGE: Call with asset_id parameter
-- الاستخدام: استدعاء مع معامل asset_id
-- =============================================
-- Example: SELECT * FROM force_refresh_asset_values('asset-uuid-here');
-- =============================================

CREATE OR REPLACE FUNCTION force_refresh_asset_values(
  p_asset_id UUID
)
RETURNS TABLE(
  asset_name TEXT,
  asset_code TEXT,
  purchase_cost DECIMAL(15, 2),
  accumulated_depreciation DECIMAL(15, 2),
  book_value DECIMAL(15, 2),
  posted_schedules_count INTEGER
) AS $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_purchase_cost DECIMAL(15, 2);
  v_accumulated_depreciation DECIMAL(15, 2);
  v_book_value DECIMAL(15, 2);
  v_calculated_depreciation DECIMAL(15, 2);
  v_schedules_count INTEGER;
BEGIN
  -- =====================================
  -- 1. العثور على الأصل
  -- =====================================
  SELECT fa.id, fa.company_id, fa.name, fa.asset_code, fa.purchase_cost,
         fa.accumulated_depreciation, fa.book_value
  INTO v_asset_id, v_company_id, v_asset_name, v_asset_code, v_purchase_cost,
       v_accumulated_depreciation, v_book_value
  FROM fixed_assets fa
  WHERE fa.id = p_asset_id
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset with ID % not found', p_asset_id;
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
  SELECT COALESCE(SUM(depreciation_amount), 0), COUNT(*)
  INTO v_calculated_depreciation, v_schedules_count
  FROM depreciation_schedules
  WHERE asset_id = v_asset_id
    AND status = 'posted';

  -- =====================================
  -- 3. إعادة تحديث قيم الأصل
  -- =====================================
  UPDATE fixed_assets
  SET
    accumulated_depreciation = v_calculated_depreciation,
    book_value = purchase_cost - v_calculated_depreciation,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = v_asset_id;

  -- التحقق من النتيجة
  SELECT accumulated_depreciation, book_value
  INTO v_accumulated_depreciation, v_book_value
  FROM fixed_assets
  WHERE id = v_asset_id;

  -- Return results
  RETURN QUERY SELECT 
    v_asset_name,
    v_asset_code,
    v_purchase_cost,
    v_accumulated_depreciation,
    v_book_value,
    v_schedules_count;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error refreshing asset values: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- Grant permissions
-- =====================================
GRANT EXECUTE ON FUNCTION force_refresh_asset_values(UUID) TO authenticated;

-- =====================================
-- Convenience wrapper for specific asset (FA-0001)
-- =====================================
-- ⚠️ TEMPORARY: For testing/debugging only
-- ⚠️ Remove or update company_id/asset_code before production use
-- =====================================
DO $$
DECLARE
  v_asset_id UUID;
  v_result RECORD;
BEGIN
  -- Find asset by code and company
  SELECT fa.id INTO v_asset_id
  FROM fixed_assets fa
  WHERE fa.asset_code = 'FA-0001'
    AND fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE NOTICE 'Asset FA-0001 not found. Skipping automatic execution.';
    RAISE NOTICE 'Use: SELECT * FROM force_refresh_asset_values(''asset-uuid'');';
    RETURN;
  END IF;

  -- Execute the function
  SELECT * INTO v_result
  FROM force_refresh_asset_values(v_asset_id);

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Auto-execution completed for FA-0001';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (%)', v_result.asset_name, v_result.asset_code;
  RAISE NOTICE 'Accumulated Depreciation: %', v_result.accumulated_depreciation;
  RAISE NOTICE 'Book Value: %', v_result.book_value;
  RAISE NOTICE 'Posted Schedules: %', v_result.posted_schedules_count;
  RAISE NOTICE '========================================';
END $$;

