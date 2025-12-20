-- =============================================
-- Delete All Depreciation Journals for foodcana Company
-- حذف جميع القيود المرتبطة بالإهلاك لشركة foodcana
-- =============================================
-- ⚠️ تحذير: هذا السكريبت يحذف جميع القيود المرتبطة بالإهلاك
-- ⚠️ لجميع الأصول في شركة foodcana
-- ⚠️ استخدام بحذر! لا يمكن التراجع عن هذه العملية
-- =============================================
-- Company: foodcana
-- Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
-- =============================================
-- هذا السكريبت مخصص لحذف القيود التي تم إنشاؤها قبل النمط الجديد
-- =============================================

DO $$
DECLARE
  v_company_id UUID := '3a663f6b-0689-4952-93c1-6d958c737089';
  v_company_name TEXT;
  v_deleted_journals INTEGER := 0;
  v_deleted_lines INTEGER := 0;
  v_affected_assets INTEGER := 0;
  v_journal_entry_ids UUID[];
  v_asset_ids UUID[];
BEGIN
  -- التحقق من وجود الشركة
  SELECT name INTO v_company_name
  FROM companies
  WHERE id = v_company_id
  LIMIT 1;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Company with ID % not found', v_company_id;
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Delete All Depreciation Journals for foodcana';
  RAISE NOTICE 'حذف جميع القيود المرتبطة بالإهلاك لشركة foodcana';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company: % (ID: %)', v_company_name, v_company_id;
  RAISE NOTICE '';

  -- =====================================
  -- 1. جمع جميع الأصول في الشركة
  -- =====================================
  SELECT ARRAY_AGG(DISTINCT fa.id)
  INTO v_asset_ids
  FROM fixed_assets fa
  WHERE fa.company_id = v_company_id;

  IF v_asset_ids IS NULL OR array_length(v_asset_ids, 1) IS NULL THEN
    RAISE NOTICE 'No fixed assets found for company %', v_company_name;
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT fa.id) INTO v_affected_assets
  FROM fixed_assets fa
  WHERE fa.company_id = v_company_id;

  RAISE NOTICE 'Found % asset(s) in company', v_affected_assets;

  -- =====================================
  -- 2. جمع جميع journal_entry_ids المرتبطة بالإهلاك
  -- =====================================
  SELECT ARRAY_AGG(DISTINCT je.id)
  INTO v_journal_entry_ids
  FROM journal_entries je
  WHERE je.company_id = v_company_id
    AND je.reference_type = 'depreciation'
    AND je.reference_id = ANY(v_asset_ids);

  IF v_journal_entry_ids IS NULL OR array_length(v_journal_entry_ids, 1) IS NULL THEN
    RAISE NOTICE 'No depreciation journal entries found for company %', v_company_name;
    RETURN;
  END IF;

  RAISE NOTICE 'Found % depreciation journal entry(ies) to delete', array_length(v_journal_entry_ids, 1);
  RAISE NOTICE '';

  -- =====================================
  -- 3. حذف سطور القيود (journal_entry_lines)
  -- =====================================
  DELETE FROM journal_entry_lines
  WHERE journal_entry_id = ANY(v_journal_entry_ids);

  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
  RAISE NOTICE '✓ Deleted % journal entry lines', v_deleted_lines;

  -- =====================================
  -- 4. حذف القيود المحاسبية (journal_entries)
  -- =====================================
  DELETE FROM journal_entries
  WHERE id = ANY(v_journal_entry_ids);

  GET DIAGNOSTICS v_deleted_journals = ROW_COUNT;
  RAISE NOTICE '✓ Deleted % depreciation journal entries', v_deleted_journals;

  -- =====================================
  -- 5. إعادة تعيين journal_entry_id في جداول الإهلاك
  -- =====================================
  UPDATE depreciation_schedules
  SET journal_entry_id = NULL,
      status = CASE 
        WHEN status = 'posted' THEN 'approved'
        ELSE status
      END,
      posted_by = NULL,
      posted_at = NULL
  WHERE asset_id = ANY(v_asset_ids)
    AND journal_entry_id IS NOT NULL;

  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
  RAISE NOTICE '✓ Reset journal_entry_id in % depreciation schedules', v_deleted_lines;
  RAISE NOTICE '✓ Changed posted schedules back to approved status';

  -- =====================================
  -- 6. إعادة تعيين accumulated_depreciation و book_value للأصول
  -- =====================================
  UPDATE fixed_assets fa
  SET accumulated_depreciation = 0,
      book_value = purchase_cost,
      status = CASE 
        WHEN status = 'fully_depreciated' THEN 'active'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE fa.company_id = v_company_id;

  RAISE NOTICE '✓ Reset asset accumulated_depreciation and book_value';
  RAISE NOTICE '';

  -- =====================================
  -- 7. ملخص العملية
  -- =====================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary - ملخص العملية';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company: %', v_company_name;
  RAISE NOTICE 'Affected Assets: %', v_affected_assets;
  RAISE NOTICE 'Deleted Journal Entries: %', v_deleted_journals;
  RAISE NOTICE 'Deleted Journal Entry Lines: %', v_deleted_lines;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✓ All depreciation journals deleted successfully!';
  RAISE NOTICE '⚠ Note: Depreciation schedules are still present but unlinked';
  RAISE NOTICE '⚠ You may want to regenerate schedules or delete them separately';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error deleting depreciation journals: %', SQLERRM;
END $$;

