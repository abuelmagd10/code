-- =============================================
-- Delete Fixed Asset Completely
-- حذف الأصل الثابت بالكامل
-- =============================================
-- ⚠️ تحذير: هذا السكريبت يحذف الأصل بالكامل
-- ⚠️ بما في ذلك جميع جداول الإهلاك والقيود المرتبطة
-- ⚠️ استخدام بحذر! لا يمكن التراجع عن هذه العملية
-- =============================================
-- USAGE: Call with asset_id parameter
-- الاستخدام: استدعاء مع معامل asset_id
-- =============================================
-- Example: SELECT * FROM delete_fixed_asset_completely('asset-uuid-here');
-- =============================================

CREATE OR REPLACE FUNCTION delete_fixed_asset_completely(
  p_asset_id UUID
)
RETURNS TABLE(
  asset_name TEXT,
  asset_code TEXT,
  deleted_schedules INTEGER,
  deleted_journals INTEGER,
  deleted_lines INTEGER,
  success BOOLEAN
) AS $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_deleted_schedules INTEGER := 0;
  v_deleted_journals INTEGER := 0;
  v_deleted_lines INTEGER := 0;
  v_journal_entry_ids UUID[];
  v_orphaned_journal_ids UUID[];
  v_orphaned_count INTEGER := 0;
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

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Deleting Fixed Asset Completely';
  RAISE NOTICE 'حذف الأصل الثابت بالكامل';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (Code: %, ID: %)', v_asset_name, v_asset_code, v_asset_id;
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

  RAISE NOTICE '✓ Deleted fixed asset: % (%)', v_asset_name, v_asset_code;

  -- =====================================
  -- 7. ملخص العملية
  -- =====================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary - ملخص العملية';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (%)', v_asset_name, v_asset_code;
  RAISE NOTICE 'Deleted Depreciation Schedules: %', v_deleted_schedules;
  RAISE NOTICE 'Deleted Journal Entries: %', v_deleted_journals;
  RAISE NOTICE 'Deleted Journal Entry Lines: %', v_deleted_lines;
  RAISE NOTICE 'Deleted Fixed Asset: YES';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Asset deleted completely!';

  -- Return results
  RETURN QUERY SELECT 
    v_asset_name,
    v_asset_code,
    v_deleted_schedules,
    v_deleted_journals,
    v_deleted_lines,
    TRUE as success;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error deleting fixed asset: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- Grant permissions
-- =====================================
GRANT EXECUTE ON FUNCTION delete_fixed_asset_completely(UUID) TO authenticated;

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
    RAISE NOTICE 'Use: SELECT * FROM delete_fixed_asset_completely(''asset-uuid'');';
    RETURN;
  END IF;

  -- Execute the function
  SELECT * INTO v_result
  FROM delete_fixed_asset_completely(v_asset_id);

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Auto-execution completed for FA-0001';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Asset: % (%)', v_result.asset_name, v_result.asset_code;
  RAISE NOTICE 'Deleted Schedules: %', v_result.deleted_schedules;
  RAISE NOTICE 'Deleted Journals: %', v_result.deleted_journals;
  RAISE NOTICE 'Deleted Lines: %', v_result.deleted_lines;
  RAISE NOTICE 'Success: %', v_result.success;
  RAISE NOTICE '========================================';
END $$;

