-- =============================================
-- Delete Fixed Asset for foodcana Company
-- حذف الأصل الثابت لشركة foodcana
-- =============================================
-- ⚠️ تحذير: هذا السكريبت يحذف الأصل بالكامل
-- ⚠️ بما في ذلك جميع جداول الإهلاك والقيود المرتبطة
-- ⚠️ استخدام بحذر! لا يمكن التراجع عن هذه العملية
-- =============================================
-- Company: foodcana
-- Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
-- Asset Code: FA-0001 (يمكن تعديله)
-- =============================================
-- هذا السكريبت مخصص لحذف الأصل الذي تم إنشاؤه قبل النمط الجديد
-- =============================================

DO $$
DECLARE
  v_company_id UUID := '3a663f6b-0689-4952-93c1-6d958c737089';
  v_asset_code TEXT := 'FA-0001';  -- يمكن تعديل كود الأصل هنا
  v_asset_id UUID;
  v_company_name TEXT;
  v_asset_name TEXT;
  v_asset_code_found TEXT;
  v_deleted_schedules INTEGER := 0;
  v_deleted_journals INTEGER := 0;
  v_deleted_lines INTEGER := 0;
  v_journal_entry_ids UUID[];
  v_orphaned_journal_ids UUID[];
  v_orphaned_count INTEGER := 0;
BEGIN
  -- التحقق من وجود الشركة
  SELECT name INTO v_company_name
  FROM companies
  WHERE id = v_company_id
  LIMIT 1;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Company with ID % not found', v_company_id;
  END IF;

  -- =====================================
  -- 1. العثور على الأصل
  -- =====================================
  SELECT fa.id, fa.name, fa.asset_code
  INTO v_asset_id, v_asset_name, v_asset_code_found
  FROM fixed_assets fa
  WHERE fa.asset_code = v_asset_code
    AND fa.company_id = v_company_id
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset with code % not found in company % (ID: %)', 
      v_asset_code, v_company_name, v_company_id;
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Delete Fixed Asset Completely';
  RAISE NOTICE 'حذف الأصل الثابت بالكامل';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company: % (ID: %)', v_company_name, v_company_id;
  RAISE NOTICE 'Asset: % (Code: %, ID: %)', v_asset_name, v_asset_code_found, v_asset_id;
  RAISE NOTICE '';

  -- =====================================
  -- 2. جمع journal_entry_ids المرتبطة بالإهلاك
  -- =====================================
  SELECT ARRAY_AGG(DISTINCT ds.journal_entry_id)
  INTO v_journal_entry_ids
  FROM depreciation_schedules ds
  INNER JOIN journal_entries je ON ds.journal_entry_id = je.id
  WHERE ds.asset_id = v_asset_id
    AND ds.journal_entry_id IS NOT NULL
    AND je.reference_type = 'depreciation'
    AND je.reference_id = v_asset_id;

  -- جمع القيود المقطوعة (orphaned) للتنظيف
  SELECT ARRAY_AGG(DISTINCT ds.journal_entry_id), COUNT(DISTINCT ds.journal_entry_id)
  INTO v_orphaned_journal_ids, v_orphaned_count
  FROM depreciation_schedules ds
  LEFT JOIN journal_entries je ON ds.journal_entry_id = je.id
  WHERE ds.asset_id = v_asset_id
    AND ds.journal_entry_id IS NOT NULL
    AND (je.id IS NULL 
         OR je.reference_type != 'depreciation' 
         OR je.reference_id != v_asset_id);
  
  IF v_orphaned_count > 0 THEN
    RAISE WARNING '⚠ Found % orphaned journal entry references', v_orphaned_count;
  END IF;

  -- =====================================
  -- 3. حذف سطور القيود (journal_entry_lines)
  -- =====================================
  -- حذف سطور القيود للقيود التي تم التحقق منها
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id = ANY(v_journal_entry_ids);
    
    GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % journal entry lines from verified depreciation entries', v_deleted_lines;
  END IF;

  -- حذف سطور القيود المقطوعة (orphaned) أيضاً
  IF v_orphaned_journal_ids IS NOT NULL AND array_length(v_orphaned_journal_ids, 1) > 0 THEN
    DECLARE
      v_orphaned_lines_deleted INTEGER;
    BEGIN
      DELETE FROM journal_entry_lines
      WHERE journal_entry_id = ANY(v_orphaned_journal_ids);
      
      GET DIAGNOSTICS v_orphaned_lines_deleted = ROW_COUNT;
      IF v_orphaned_lines_deleted > 0 THEN
        RAISE NOTICE '✓ Deleted % journal entry lines from orphaned entries', v_orphaned_lines_deleted;
        v_deleted_lines := v_deleted_lines + v_orphaned_lines_deleted;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING '⚠ Error deleting orphaned journal entry lines: %', SQLERRM;
    END;
  END IF;

  -- =====================================
  -- 4. حذف القيود المحاسبية (journal_entries)
  -- =====================================
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entries
    WHERE id = ANY(v_journal_entry_ids)
      AND reference_type = 'depreciation'
      AND reference_id = v_asset_id;
    
    GET DIAGNOSTICS v_deleted_journals = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % verified depreciation journal entries', v_deleted_journals;
  END IF;

  -- =====================================
  -- 5. حذف جميع جداول الإهلاك
  -- =====================================
  DELETE FROM depreciation_schedules
  WHERE asset_id = v_asset_id;
  
  GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;
  RAISE NOTICE '✓ Deleted % depreciation schedules', v_deleted_schedules;

  -- =====================================
  -- 6. حذف الأصل نفسه
  -- =====================================
  DELETE FROM fixed_assets
  WHERE id = v_asset_id;

  RAISE NOTICE '✓ Deleted fixed asset: % (%)', v_asset_name, v_asset_code_found;

  -- =====================================
  -- 7. ملخص العملية
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary - ملخص العملية';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company: %', v_company_name;
  RAISE NOTICE 'Asset: % (%)', v_asset_name, v_asset_code_found;
  RAISE NOTICE 'Deleted Depreciation Schedules: %', v_deleted_schedules;
  RAISE NOTICE 'Deleted Journal Entries: %', v_deleted_journals;
  RAISE NOTICE 'Deleted Journal Entry Lines: %', v_deleted_lines;
  RAISE NOTICE 'Deleted Fixed Asset: YES';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Asset deleted completely!';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error deleting fixed asset: %', SQLERRM;
END $$;

