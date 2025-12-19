-- =============================================
-- Force Delete ALL Depreciation Schedules
-- حذف قسري لجميع جداول الإهلاك (بجميع الحالات)
-- =============================================
-- ⚠️ تحذير: هذا السكريبت يحذف جميع جداول الإهلاك
-- ⚠️ بما في ذلك المرحلة (posted) - استخدام بحذر!
-- =============================================
-- USAGE: Call with asset_id parameter
-- الاستخدام: استدعاء مع معامل asset_id
-- =============================================
-- Example: SELECT force_delete_all_depreciation_schedules('asset-uuid-here');
-- =============================================

CREATE OR REPLACE FUNCTION force_delete_all_depreciation_schedules(
  p_asset_id UUID
)
RETURNS TABLE(
  deleted_schedules INTEGER,
  deleted_journals INTEGER,
  deleted_lines INTEGER,
  asset_name TEXT,
  asset_code TEXT
) AS $$
DECLARE
  v_asset_id UUID;
  v_company_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_deleted_schedules INTEGER := 0;
  v_deleted_journals INTEGER := 0;
  v_deleted_lines INTEGER := 0;
  v_pending_count INTEGER := 0;
  v_approved_count INTEGER := 0;
  v_posted_count INTEGER := 0;
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
  RAISE NOTICE '  - Total: %', (v_pending_count + v_approved_count + v_posted_count);

  -- =====================================
  -- 3. جمع journal_entry_ids المرتبطة بالإهلاك (مع التحقق من صحتها)
  -- =====================================
  -- جمع فقط القيود التي تتوافق مع قيود الإهلاك الفعلية
  -- هذا يمنع حذف سطور قيود غير متعلقة بالإهلاك
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
    RAISE WARNING '⚠ Found % orphaned journal entry references in depreciation schedules', v_orphaned_count;
    RAISE WARNING '⚠ These will be cleaned up (lines deleted, entries remain if not depreciation-related).';
  END IF;

  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    RAISE NOTICE '✓ Found % verified depreciation journal entries', array_length(v_journal_entry_ids, 1);
  ELSE
    RAISE NOTICE '✓ No verified depreciation journal entries found';
  END IF;

  -- =====================================
  -- 4. حذف سطور القيود (journal_entry_lines) المرتبطة بالإهلاك
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
  -- 5. حذف القيود المحاسبية (journal_entries) المرتبطة بالإهلاك
  -- =====================================
  -- حذف القيود التي تم التحقق منها مع فلاتر دفاعية إضافية
  -- الفلاتر الدفاعية تمنع حذف قيود غير متوقعة في حالة race conditions
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entries
    WHERE id = ANY(v_journal_entry_ids)
      AND reference_type = 'depreciation'
      AND reference_id = v_asset_id;
    
    GET DIAGNOSTICS v_deleted_journals = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % verified depreciation journal entries', v_deleted_journals;
    
    -- التحقق من أن عدد القيود المحذوفة يطابق العدد المتوقع
    IF v_deleted_journals != array_length(v_journal_entry_ids, 1) THEN
      RAISE WARNING '⚠ Expected to delete % journal entries, but deleted %. Please verify manually.', 
        array_length(v_journal_entry_ids, 1), v_deleted_journals;
    END IF;
  END IF;

  -- =====================================
  -- 6. حذف جميع جداول الإهلاك (بجميع الحالات)
  -- =====================================
  DELETE FROM depreciation_schedules
  WHERE asset_id = v_asset_id;
  
  GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;
  
  RAISE NOTICE '';
  RAISE NOTICE '✓ Deleted % depreciation schedules (ALL statuses)', v_deleted_schedules;

  -- =====================================
  -- 7. إعادة تعيين قيم الأصل
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
  RAISE NOTICE 'Asset: % (%)', v_asset_name, v_asset_code;
  RAISE NOTICE 'Deleted Depreciation Schedules: %', v_deleted_schedules;
  RAISE NOTICE 'Deleted Journal Entries: %', v_deleted_journals;
  RAISE NOTICE 'Deleted Journal Entry Lines: %', v_deleted_lines;
  RAISE NOTICE 'Asset Status: Reset to initial values';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ All depreciation data deleted successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Step: Run scripts/129_regenerate_depreciation_schedule.sql';
  RAISE NOTICE '          to regenerate using the enhanced monthly depreciation system.';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error deleting depreciation: %', SQLERRM;
END $$;

-- =====================================
-- Grant permissions
-- =====================================
GRANT EXECUTE ON FUNCTION force_delete_all_depreciation_schedules(UUID) TO authenticated;

-- =====================================
-- Verification function (optional)
-- =====================================
CREATE OR REPLACE FUNCTION verify_depreciation_deleted(
  p_asset_id UUID
)
RETURNS TABLE(
  remaining_schedules INTEGER,
  remaining_journals INTEGER,
  remaining_lines INTEGER,
  asset_name TEXT,
  asset_code TEXT
) AS $$
DECLARE
  v_asset_id UUID;
  v_asset_name TEXT;
  v_asset_code TEXT;
  v_remaining_schedules INTEGER;
  v_remaining_journals INTEGER;
  v_remaining_lines INTEGER;
BEGIN
  SELECT fa.id, fa.name, fa.asset_code
  INTO v_asset_id, v_asset_name, v_asset_code
  FROM fixed_assets fa
  WHERE fa.id = p_asset_id
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Asset with ID % not found', p_asset_id;
  END IF;

    -- التحقق من جداول الإهلاك المتبقية
    SELECT COUNT(*) INTO v_remaining_schedules
    FROM depreciation_schedules
    WHERE asset_id = v_asset_id;

    -- التحقق من القيود المتبقية
    SELECT COUNT(*) INTO v_remaining_journals
    FROM journal_entries
    WHERE reference_type = 'depreciation'
      AND reference_id = v_asset_id;

    -- التحقق من سطور القيود المتبقية
    SELECT COUNT(*) INTO v_remaining_lines
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.reference_type = 'depreciation'
      AND je.reference_id = v_asset_id;

    -- Return results
    RETURN QUERY SELECT 
      v_remaining_schedules,
      v_remaining_journals,
      v_remaining_lines,
      v_asset_name,
      v_asset_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- Note: To verify deletion results, use the function return values
-- or call: SELECT * FROM verify_depreciation_deleted('asset-uuid-here');
-- =====================================

