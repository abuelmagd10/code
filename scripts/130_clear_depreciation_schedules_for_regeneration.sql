-- =============================================
-- Clear Depreciation Schedules for Regeneration
-- حذف جداول الإهلاك لإعادة الإنشاء بالنمط الجديد
-- =============================================
-- ⚠️ هذا السكريبت يحذف جداول الإهلاك فقط (pending/approved)
-- ⚠️ لا يحذف القيود المحاسبية المرحلة (posted)
-- =============================================
-- Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
-- Asset Code: FA-0001
-- =============================================

DO $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_deleted_schedules INTEGER := 0;
  v_pending_count INTEGER := 0;
  v_approved_count INTEGER := 0;
  v_posted_count INTEGER := 0;
BEGIN
  -- =====================================
  -- 1. العثور على الأصل
  -- =====================================
  SELECT fa.id, fa.company_id, fa.name, fa.asset_code
  INTO v_asset_id, v_company_id, v_asset_name, v_asset_code
  FROM fixed_assets fa
  WHERE fa.asset_code = 'FA-0001'
    AND fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset FA-0001 not found in company 3a663f6b-0689-4952-93c1-6d958c737089';
  END IF;

  RAISE NOTICE '✓ Found asset: % (Code: %, ID: %)', v_asset_name, v_asset_code, v_asset_id;

  -- =====================================
  -- 2. التحقق من جداول الإهلاك الموجودة
  -- =====================================
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
  RAISE NOTICE 'Current Depreciation Schedules:';
  RAISE NOTICE '  - Pending: %', v_pending_count;
  RAISE NOTICE '  - Approved: %', v_approved_count;
  RAISE NOTICE '  - Posted: %', v_posted_count;

  IF v_posted_count > 0 THEN
    RAISE WARNING '⚠ Warning: There are % posted schedules. These will NOT be deleted.', v_posted_count;
    RAISE WARNING '⚠ Only pending and approved schedules will be deleted.';
  END IF;

  -- =====================================
  -- 3. حذف جداول الإهلاك (pending و approved فقط)
  -- =====================================
  DELETE FROM depreciation_schedules
  WHERE asset_id = v_asset_id
    AND status IN ('pending', 'approved');
  
  GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;
  
  RAISE NOTICE '';
  RAISE NOTICE '✓ Deleted % depreciation schedules (pending/approved)', v_deleted_schedules;

  -- =====================================
  -- 4. إعادة تعيين قيم الأصل (إذا لم تكن هناك قيود مرحلة)
  -- =====================================
  IF v_posted_count = 0 THEN
    UPDATE fixed_assets
    SET
      accumulated_depreciation = 0,
      book_value = purchase_cost,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_asset_id;

    RAISE NOTICE '✓ Reset asset values: accumulated_depreciation = 0, book_value = purchase_cost';
  ELSE
    RAISE NOTICE '⚠ Asset values NOT reset because there are posted schedules.';
    RAISE NOTICE '⚠ You may need to manually adjust accumulated_depreciation and book_value.';
  END IF;

  -- =====================================
  -- 5. ملخص العملية
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary - ملخص العملية';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (FA-0001)', v_asset_name;
  RAISE NOTICE 'Deleted Schedules: %', v_deleted_schedules;
  RAISE NOTICE 'Remaining Posted Schedules: %', v_posted_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Depreciation schedules cleared successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Step: Run scripts/129_regenerate_depreciation_schedule.sql';
  RAISE NOTICE '          to regenerate using the enhanced monthly depreciation system.';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error clearing depreciation schedules: %', SQLERRM;
END $$;

-- =====================================
-- التحقق من النتائج
-- =====================================
DO $$
DECLARE
  v_asset_id UUID;
  v_remaining_schedules INTEGER;
  v_pending_count INTEGER;
  v_approved_count INTEGER;
  v_posted_count INTEGER;
BEGIN
  SELECT fa.id
  INTO v_asset_id
  FROM fixed_assets fa
  WHERE fa.asset_code = 'FA-0001'
    AND fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  LIMIT 1;

  IF v_asset_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_remaining_schedules
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
    RAISE NOTICE 'Verification - التحقق من النتائج';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Remaining Schedules: %', v_remaining_schedules;
    RAISE NOTICE '  - Pending: %', v_pending_count;
    RAISE NOTICE '  - Approved: %', v_approved_count;
    RAISE NOTICE '  - Posted: %', v_posted_count;
    
    IF v_pending_count = 0 AND v_approved_count = 0 THEN
      RAISE NOTICE '✓ All pending/approved schedules cleared successfully!';
      IF v_posted_count = 0 THEN
        RAISE NOTICE '✓ Ready to regenerate with enhanced monthly depreciation system.';
      ELSE
        RAISE WARNING '⚠ There are still % posted schedules. Consider removing them if needed.', v_posted_count;
      END IF;
    ELSE
      RAISE WARNING '⚠ Some schedules may still exist. Please review manually.';
    END IF;
    RAISE NOTICE '========================================';
  END IF;
END $$;

