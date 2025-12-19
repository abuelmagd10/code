-- =============================================
-- Remove Depreciation by Asset ID
-- حذف الإهلاك باستخدام Asset ID مباشرة
-- =============================================
-- ⚠️ تحذير: هذا السكريبت يحذف بيانات محاسبية نهائياً
-- ⚠️ Warning: This script permanently deletes accounting data
-- =============================================
-- الاستخدام:
-- 1. قم بتشغيل scripts/127_find_asset_before_delete.sql أولاً
-- 2. انسخ asset_id من النتائج
-- 3. استبدل 'YOUR_ASSET_ID_HERE' بـ asset_id الفعلي
-- 4. شغّل هذا السكريبت
-- =============================================

DO $$
DECLARE
  v_asset_id UUID := 'YOUR_ASSET_ID_HERE';  -- ⚠️ استبدل هذا بـ asset_id الفعلي
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_journal_entry_ids UUID[];
  v_schedule_ids UUID[];
  v_deleted_journals INTEGER := 0;
  v_deleted_schedules INTEGER := 0;
  v_deleted_lines INTEGER := 0;
BEGIN
  -- =====================================
  -- 1. التحقق من وجود الأصل
  -- =====================================
  IF v_asset_id = 'YOUR_ASSET_ID_HERE' THEN
    RAISE EXCEPTION 'Please replace YOUR_ASSET_ID_HERE with the actual asset ID from scripts/127_find_asset_before_delete.sql';
  END IF;

  SELECT fa.id, fa.company_id, fa.name, fa.asset_code
  INTO v_asset_id, v_company_id, v_asset_name, v_asset_code
  FROM fixed_assets fa
  WHERE fa.id = v_asset_id;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset with ID % not found', v_asset_id;
  END IF;

  RAISE NOTICE '✓ Found asset: % (Code: %, ID: %, Company: %)', 
    v_asset_name, v_asset_code, v_asset_id, v_company_id;

  -- =====================================
  -- 2. جمع جميع journal_entry_ids المرتبطة بالإهلاك
  -- =====================================
  SELECT ARRAY_AGG(DISTINCT journal_entry_id)
  INTO v_journal_entry_ids
  FROM depreciation_schedules
  WHERE asset_id = v_asset_id
    AND journal_entry_id IS NOT NULL;

  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    RAISE NOTICE '✓ Found % journal entries linked to depreciation', array_length(v_journal_entry_ids, 1);
  ELSE
    RAISE NOTICE '✓ No journal entries found linked to depreciation';
  END IF;

  -- =====================================
  -- 3. جمع جميع schedule_ids
  -- =====================================
  SELECT ARRAY_AGG(id)
  INTO v_schedule_ids
  FROM depreciation_schedules
  WHERE asset_id = v_asset_id;

  IF v_schedule_ids IS NOT NULL AND array_length(v_schedule_ids, 1) > 0 THEN
    RAISE NOTICE '✓ Found % depreciation schedules', array_length(v_schedule_ids, 1);
  ELSE
    RAISE NOTICE '✓ No depreciation schedules found';
  END IF;

  -- =====================================
  -- 4. حذف سطور القيود (journal_entry_lines) المرتبطة بالإهلاك
  -- =====================================
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id = ANY(v_journal_entry_ids);
    
    GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % journal entry lines', v_deleted_lines;
  END IF;

  -- =====================================
  -- 5. حذف القيود المحاسبية (journal_entries) المرتبطة بالإهلاك
  -- =====================================
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entries
    WHERE id = ANY(v_journal_entry_ids)
      AND reference_type = 'depreciation'
      AND reference_id = v_asset_id;
    
    GET DIAGNOSTICS v_deleted_journals = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % journal entries', v_deleted_journals;
  END IF;

  -- =====================================
  -- 6. حذف جداول الإهلاك (depreciation_schedules)
  -- =====================================
  IF v_schedule_ids IS NOT NULL AND array_length(v_schedule_ids, 1) > 0 THEN
    DELETE FROM depreciation_schedules
    WHERE asset_id = v_asset_id;
    
    GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % depreciation schedules', v_deleted_schedules;
  END IF;

  -- =====================================
  -- 7. إعادة تعيين قيم الأصل إلى القيم الأولية
  -- =====================================
  UPDATE fixed_assets
  SET
    accumulated_depreciation = 0,
    book_value = purchase_cost,
    status = CASE 
      WHEN status = 'fully_depreciated' THEN 'active'
      ELSE status
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = v_asset_id;

  RAISE NOTICE '✓ Reset asset values: accumulated_depreciation = 0, book_value = purchase_cost';

  -- =====================================
  -- 8. ملخص العملية
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary - ملخص العملية';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (Code: %)', v_asset_name, v_asset_code;
  RAISE NOTICE 'Deleted Journal Entries: %', v_deleted_journals;
  RAISE NOTICE 'Deleted Journal Entry Lines: %', v_deleted_lines;
  RAISE NOTICE 'Deleted Depreciation Schedules: %', v_deleted_schedules;
  RAISE NOTICE 'Asset Status: Reset to initial values';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Process completed successfully!';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error removing depreciation: %', SQLERRM;
END $$;

-- =====================================
-- التحقق من النتائج
-- =====================================
DO $$
DECLARE
  v_asset_id UUID := 'YOUR_ASSET_ID_HERE';  -- ⚠️ استبدل هذا أيضاً
  v_remaining_schedules INTEGER;
  v_remaining_journals INTEGER;
BEGIN
  IF v_asset_id != 'YOUR_ASSET_ID_HERE' THEN
    -- التحقق من جداول الإهلاك المتبقية
    SELECT COUNT(*) INTO v_remaining_schedules
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id;

    -- التحقق من القيود المتبقية
    SELECT COUNT(*) INTO v_remaining_journals
    FROM journal_entries
    WHERE reference_type = 'depreciation'
      AND reference_id = v_asset_id;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Verification - التحقق من النتائج';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Remaining Depreciation Schedules: %', v_remaining_schedules;
    RAISE NOTICE 'Remaining Journal Entries: %', v_remaining_journals;
    
    IF v_remaining_schedules = 0 AND v_remaining_journals = 0 THEN
      RAISE NOTICE '✓ All depreciation data removed successfully!';
    ELSE
      RAISE WARNING '⚠ Some data may still exist. Please review manually.';
    END IF;
    RAISE NOTICE '========================================';
  END IF;
END $$;

