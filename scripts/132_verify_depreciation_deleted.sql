-- =============================================
-- Verify All Depreciation Data is Deleted
-- التحقق من حذف جميع بيانات الإهلاك
-- =============================================
-- USAGE: Call with asset_id parameter
-- الاستخدام: استدعاء مع معامل asset_id
-- =============================================
-- Example: SELECT * FROM verify_depreciation_deleted('asset-uuid-here');
-- =============================================

CREATE OR REPLACE FUNCTION verify_depreciation_deleted(
  p_asset_id UUID
)
RETURNS TABLE(
  asset_name TEXT,
  asset_code TEXT,
  remaining_schedules INTEGER,
  remaining_journals INTEGER,
  remaining_lines INTEGER,
  accumulated_depreciation DECIMAL(15, 2),
  book_value DECIMAL(15, 2),
  is_clean BOOLEAN
) AS $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_remaining_schedules INTEGER;
  v_remaining_journals INTEGER;
  v_remaining_lines INTEGER;
  v_asset_accumulated DECIMAL(15, 2);
  v_asset_book_value DECIMAL(15, 2);
  v_purchase_cost DECIMAL(15, 2);
BEGIN
  -- =====================================
  -- 1. العثور على الأصل
  -- =====================================
  SELECT fa.id, fa.company_id, fa.name, fa.asset_code,
         fa.accumulated_depreciation, fa.book_value, fa.purchase_cost
  INTO v_asset_id, v_company_id, v_asset_name, v_asset_code,
       v_asset_accumulated, v_asset_book_value, v_purchase_cost
  FROM fixed_assets fa
  WHERE fa.id = p_asset_id
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset with ID % not found', p_asset_id;
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Verification Report - تقرير التحقق';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (Code: %, ID: %)', v_asset_name, v_asset_code, v_asset_id;
  RAISE NOTICE '';

  -- =====================================
  -- 2. التحقق من جداول الإهلاك المتبقية
  -- =====================================
  SELECT COUNT(*) INTO v_remaining_schedules
  FROM depreciation_schedules
  WHERE asset_id = v_asset_id;

  RAISE NOTICE 'Depreciation Schedules:';
  IF v_remaining_schedules = 0 THEN
    RAISE NOTICE '  ✓ No schedules found (all deleted)';
  ELSE
    RAISE WARNING '  ⚠ Found % remaining schedules', v_remaining_schedules;
    
    -- عرض تفاصيل الجداول المتبقية
    DECLARE
      schedule_rec RECORD;
    BEGIN
      FOR schedule_rec IN
        SELECT period_number, period_date, status, depreciation_amount
        FROM depreciation_schedules
        WHERE asset_id = v_asset_id
        ORDER BY period_number
        LIMIT 10
      LOOP
        RAISE WARNING '    - Period %: Date %, Status: %, Amount: %', 
          schedule_rec.period_number, 
          schedule_rec.period_date, 
          schedule_rec.status,
          schedule_rec.depreciation_amount;
      END LOOP;
      IF v_remaining_schedules > 10 THEN
        RAISE WARNING '    ... and % more schedules', v_remaining_schedules - 10;
      END IF;
    END;
  END IF;

  -- =====================================
  -- 3. التحقق من القيود المحاسبية المتبقية
  -- =====================================
  SELECT COUNT(*) INTO v_remaining_journals
  FROM journal_entries
  WHERE reference_type = 'depreciation'
    AND reference_id = v_asset_id;

  RAISE NOTICE '';
  RAISE NOTICE 'Journal Entries:';
  IF v_remaining_journals = 0 THEN
    RAISE NOTICE '  ✓ No depreciation journal entries found (all deleted)';
  ELSE
    RAISE WARNING '  ⚠ Found % remaining depreciation journal entries', v_remaining_journals;
    
    -- عرض تفاصيل القيود المتبقية
    DECLARE
      journal_rec RECORD;
    BEGIN
      FOR journal_rec IN
        SELECT id, entry_date, description
        FROM journal_entries
        WHERE reference_type = 'depreciation'
          AND reference_id = v_asset_id
        ORDER BY entry_date DESC
        LIMIT 10
      LOOP
        RAISE WARNING '    - Entry %: Date %, Description: %', 
          journal_rec.id, 
          journal_rec.entry_date, 
          LEFT(journal_rec.description, 50);
      END LOOP;
      IF v_remaining_journals > 10 THEN
        RAISE WARNING '    ... and % more entries', v_remaining_journals - 10;
      END IF;
    END;
  END IF;

  -- =====================================
  -- 4. التحقق من سطور القيود المتبقية
  -- =====================================
  SELECT COUNT(*) INTO v_remaining_lines
  FROM journal_entry_lines jel
  INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.reference_type = 'depreciation'
    AND je.reference_id = v_asset_id;

  RAISE NOTICE '';
  RAISE NOTICE 'Journal Entry Lines:';
  IF v_remaining_lines = 0 THEN
    RAISE NOTICE '  ✓ No depreciation journal entry lines found (all deleted)';
  ELSE
    RAISE WARNING '  ⚠ Found % remaining journal entry lines', v_remaining_lines;
  END IF;

  -- =====================================
  -- 5. التحقق من قيم الأصل
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE 'Asset Values:';
  RAISE NOTICE '  Accumulated Depreciation: %', v_asset_accumulated;
  RAISE NOTICE '  Book Value: %', v_asset_book_value;
  
  IF v_asset_accumulated = 0 AND v_asset_book_value = 5000.00 THEN
    RAISE NOTICE '  ✓ Asset values reset correctly';
  ELSE
    RAISE WARNING '  ⚠ Asset values may need reset:';
    RAISE WARNING '     Expected: accumulated_depreciation = 0, book_value = 5000.00';
    RAISE WARNING '     Actual: accumulated_depreciation = %, book_value = %', 
      v_asset_accumulated, v_asset_book_value;
  END IF;

  -- =====================================
  -- 6. الملخص النهائي
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary - الملخص';
  RAISE NOTICE '========================================';
  
  IF v_remaining_schedules = 0 
     AND v_remaining_journals = 0 
     AND v_remaining_lines = 0 
     AND v_asset_accumulated = 0 
     AND v_asset_book_value = 5000.00 THEN
    RAISE NOTICE '✓ All depreciation data deleted successfully!';
    RAISE NOTICE '✓ Asset values reset correctly!';
    RAISE NOTICE '✓ Ready to regenerate with enhanced monthly depreciation system.';
  ELSE
    RAISE WARNING '⚠ Some depreciation data may still exist:';
    IF v_remaining_schedules > 0 THEN
      RAISE WARNING '  - % depreciation schedules', v_remaining_schedules;
    END IF;
    IF v_remaining_journals > 0 THEN
      RAISE WARNING '  - % journal entries', v_remaining_journals;
    END IF;
    IF v_remaining_lines > 0 THEN
      RAISE WARNING '  - % journal entry lines', v_remaining_lines;
    END IF;
    IF v_asset_accumulated != 0 OR v_asset_book_value != 5000.00 THEN
      RAISE WARNING '  - Asset values need reset';
    END IF;
    RAISE WARNING '';
    RAISE WARNING '⚠ Please run scripts/131_force_delete_all_depreciation_schedules.sql again.';
  END IF;
  
  -- Return results
  RETURN QUERY SELECT 
    v_asset_name,
    v_asset_code,
    v_remaining_schedules,
    v_remaining_journals,
    v_remaining_lines,
    v_asset_accumulated,
    v_asset_book_value,
    (v_remaining_schedules = 0 
     AND v_remaining_journals = 0 
     AND v_remaining_lines = 0 
     AND v_asset_accumulated = 0 
     AND v_asset_book_value = v_purchase_cost) as is_clean;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error verifying depreciation deletion: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- Grant permissions
-- =====================================
GRANT EXECUTE ON FUNCTION verify_depreciation_deleted(UUID) TO authenticated;

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
    RAISE NOTICE 'Use: SELECT * FROM verify_depreciation_deleted(''asset-uuid'');';
    RETURN;
  END IF;

  -- Execute the function
  SELECT * INTO v_result
  FROM verify_depreciation_deleted(v_asset_id);

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Verification Report for FA-0001';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (%)', v_result.asset_name, v_result.asset_code;
  RAISE NOTICE 'Remaining Schedules: %', v_result.remaining_schedules;
  RAISE NOTICE 'Remaining Journals: %', v_result.remaining_journals;
  RAISE NOTICE 'Remaining Lines: %', v_result.remaining_lines;
  RAISE NOTICE 'Accumulated Depreciation: %', v_result.accumulated_depreciation;
  RAISE NOTICE 'Book Value: %', v_result.book_value;
  RAISE NOTICE 'Is Clean: %', v_result.is_clean;
  RAISE NOTICE '========================================';
END $$;

