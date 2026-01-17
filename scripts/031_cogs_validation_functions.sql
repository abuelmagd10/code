-- =====================================================
-- Validation & Safety Layer لنظام COGS Professional
-- =====================================================
-- هذا السكريبت يضيف Validation Functions دورية:
-- 1. كشف COGS بدون FIFO
-- 2. كشف Write-Off بدون branch / warehouse
-- 3. تقرير Integrity Check (Read-only)
-- =====================================================

-- =====================================================
-- 1. دالة التحقق من COGS بدون FIFO Consumption
-- =====================================================
CREATE OR REPLACE FUNCTION validate_cogs_with_fifo()
RETURNS TABLE (
  issue_type TEXT,
  cogs_transaction_id UUID,
  source_type TEXT,
  source_id UUID,
  product_id UUID,
  product_name TEXT,
  company_id UUID,
  transaction_date DATE,
  quantity NUMERIC,
  unit_cost NUMERIC,
  total_cost NUMERIC,
  fifo_consumption_id UUID,
  issue_description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'COGS بدون FIFO Consumption'::TEXT as issue_type,
    ct.id as cogs_transaction_id,
    ct.source_type,
    ct.source_id,
    ct.product_id,
    p.name as product_name,
    ct.company_id,
    ct.transaction_date,
    ct.quantity,
    ct.unit_cost,
    ct.total_cost,
    ct.fifo_consumption_id,
    CASE 
      WHEN ct.fifo_consumption_id IS NULL THEN 'COGS transaction بدون fifo_consumption_id'
      WHEN NOT EXISTS (
        SELECT 1 FROM fifo_lot_consumptions flc 
        WHERE flc.id = ct.fifo_consumption_id
      ) THEN 'fifo_consumption_id غير موجود في fifo_lot_consumptions'
      ELSE 'COGS transaction بدون FIFO consumption مرتبط'
    END as issue_description
  FROM cogs_transactions ct
  JOIN products p ON ct.product_id = p.id
  WHERE ct.fifo_consumption_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM fifo_lot_consumptions flc 
       WHERE flc.id = ct.fifo_consumption_id
     )
  ORDER BY ct.transaction_date DESC, ct.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_cogs_with_fifo() IS 
'التحقق من COGS transactions بدون FIFO Consumption.
يجب أن يكون لكل COGS transaction fifo_consumption_id مرتبط.';

-- =====================================================
-- 2. دالة التحقق من Write-Offs بدون Governance
-- =====================================================
CREATE OR REPLACE FUNCTION validate_write_off_governance()
RETURNS TABLE (
  issue_type TEXT,
  write_off_id UUID,
  write_off_number TEXT,
  status TEXT,
  write_off_date DATE,
  company_id UUID,
  branch_id UUID,
  cost_center_id UUID,
  warehouse_id UUID,
  issue_description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'Write-Off بدون Governance'::TEXT as issue_type,
    wo.id as write_off_id,
    wo.write_off_number,
    wo.status,
    wo.write_off_date,
    wo.company_id,
    wo.branch_id,
    wo.cost_center_id,
    wo.warehouse_id,
    CASE 
      WHEN wo.branch_id IS NULL AND wo.cost_center_id IS NULL AND wo.warehouse_id IS NULL 
      THEN 'جميع الحقول مفقودة: branch_id, cost_center_id, warehouse_id'
      WHEN wo.branch_id IS NULL THEN 'branch_id مفقود'
      WHEN wo.cost_center_id IS NULL THEN 'cost_center_id مفقود'
      WHEN wo.warehouse_id IS NULL THEN 'warehouse_id مفقود'
      ELSE 'غير معروف'
    END as issue_description
  FROM inventory_write_offs wo
  WHERE wo.status IN ('pending', 'approved')
    AND (wo.branch_id IS NULL OR wo.cost_center_id IS NULL OR wo.warehouse_id IS NULL)
  ORDER BY wo.write_off_date DESC, wo.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_write_off_governance() IS 
'التحقق من Write-Offs بدون Governance كامل (branch_id, cost_center_id, warehouse_id).
يجب أن يكون لكل Write-Off جميع الحقول الإلزامية.';

-- =====================================================
-- 3. دالة Integrity Check (FIFO vs COGS vs Journal)
-- =====================================================
CREATE OR REPLACE FUNCTION validate_cogs_integrity(
  p_company_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  check_type TEXT,
  source_type TEXT,
  source_id UUID,
  source_number TEXT,
  fifo_total_cost NUMERIC,
  cogs_total_cost NUMERIC,
  journal_total_cost NUMERIC,
  difference NUMERIC,
  integrity_status TEXT,
  issue_description TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH source_data AS (
    -- Invoices
    SELECT 
      'invoice'::TEXT as source_type,
      i.id as source_id,
      i.invoice_number as source_number,
      i.company_id,
      i.invoice_date as transaction_date,
      i.branch_id,
      i.cost_center_id,
      i.warehouse_id
    FROM invoices i
    WHERE i.status IN ('sent', 'partially_paid', 'paid')
      AND (p_company_id IS NULL OR i.company_id = p_company_id)
      AND i.invoice_date BETWEEN p_date_from AND p_date_to
    
    UNION ALL
    
    -- Write-Offs
    SELECT 
      'depreciation'::TEXT as source_type,
      wo.id as source_id,
      wo.write_off_number as source_number,
      wo.company_id,
      wo.write_off_date as transaction_date,
      wo.branch_id,
      wo.cost_center_id,
      wo.warehouse_id
    FROM inventory_write_offs wo
    WHERE wo.status = 'approved'
      AND (p_company_id IS NULL OR wo.company_id = p_company_id)
      AND wo.write_off_date BETWEEN p_date_from AND p_date_to
  ),
  fifo_costs AS (
    SELECT 
      sd.source_type,
      sd.source_id,
      SUM(flc.total_cost) as fifo_total_cost
    FROM source_data sd
    LEFT JOIN fifo_lot_consumptions flc ON 
      flc.reference_type = CASE 
        WHEN sd.source_type = 'invoice' THEN 'invoice'
        WHEN sd.source_type = 'depreciation' THEN 'write_off'
        ELSE sd.source_type
      END
      AND flc.reference_id = sd.source_id
    GROUP BY sd.source_type, sd.source_id
  ),
  cogs_costs AS (
    SELECT 
      sd.source_type,
      sd.source_id,
      SUM(ct.total_cost) as cogs_total_cost
    FROM source_data sd
    LEFT JOIN cogs_transactions ct ON 
      ct.source_type = sd.source_type
      AND ct.source_id = sd.source_id
    GROUP BY sd.source_type, sd.source_id
  ),
  journal_costs AS (
    SELECT 
      sd.source_type,
      sd.source_id,
      SUM(CASE 
        WHEN jel.account_id = (SELECT id FROM chart_of_accounts WHERE account_type = 'expense' LIMIT 1)
        THEN jel.debit_amount
        ELSE 0
      END) as journal_total_cost
    FROM source_data sd
    LEFT JOIN journal_entries je ON 
      je.reference_type = CASE 
        WHEN sd.source_type = 'invoice' THEN 'invoice'
        WHEN sd.source_type = 'depreciation' THEN 'write_off'
        ELSE sd.source_type
      END
      AND je.reference_id = sd.source_id
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    GROUP BY sd.source_type, sd.source_id
  )
  SELECT 
    'Integrity Check (FIFO vs COGS vs Journal)'::TEXT as check_type,
    sd.source_type,
    sd.source_id,
    sd.source_number,
    COALESCE(fc.fifo_total_cost, 0) as fifo_total_cost,
    COALESCE(cc.cogs_total_cost, 0) as cogs_total_cost,
    COALESCE(jc.journal_total_cost, 0) as journal_total_cost,
    ABS(COALESCE(fc.fifo_total_cost, 0) - COALESCE(cc.cogs_total_cost, 0)) as difference,
    CASE 
      WHEN ABS(COALESCE(fc.fifo_total_cost, 0) - COALESCE(cc.cogs_total_cost, 0)) < 0.01
        AND ABS(COALESCE(cc.cogs_total_cost, 0) - COALESCE(jc.journal_total_cost, 0)) < 0.01
      THEN '✅ سليم'
      ELSE '⚠️ عدم تطابق'
    END as integrity_status,
    CASE 
      WHEN ABS(COALESCE(fc.fifo_total_cost, 0) - COALESCE(cc.cogs_total_cost, 0)) >= 0.01
      THEN 'FIFO vs COGS: فرق ' || ROUND(ABS(COALESCE(fc.fifo_total_cost, 0) - COALESCE(cc.cogs_total_cost, 0)), 2)
      WHEN ABS(COALESCE(cc.cogs_total_cost, 0) - COALESCE(jc.journal_total_cost, 0)) >= 0.01
      THEN 'COGS vs Journal: فرق ' || ROUND(ABS(COALESCE(cc.cogs_total_cost, 0) - COALESCE(jc.journal_total_cost, 0)), 2)
      ELSE 'لا توجد مشاكل'
    END as issue_description
  FROM source_data sd
  LEFT JOIN fifo_costs fc ON fc.source_type = sd.source_type AND fc.source_id = sd.source_id
  LEFT JOIN cogs_costs cc ON cc.source_type = sd.source_type AND cc.source_id = sd.source_id
  LEFT JOIN journal_costs jc ON jc.source_type = sd.source_type AND jc.source_id = sd.source_id
  WHERE COALESCE(fc.fifo_total_cost, 0) > 0 
     OR COALESCE(cc.cogs_total_cost, 0) > 0
     OR COALESCE(jc.journal_total_cost, 0) > 0
  ORDER BY sd.transaction_date DESC, sd.source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_cogs_integrity(UUID, DATE, DATE) IS 
'التحقق من Integrity بين FIFO, COGS, Journal.
يقارن FIFO total_cost مع COGS total_cost مع Journal debit_amount.
يجب أن تكون جميع القيم متطابقة (فارق < 0.01).';

-- =====================================================
-- 4. دالة التحقق الشاملة (All-in-One Report)
-- =====================================================
CREATE OR REPLACE FUNCTION validate_cogs_system(
  p_company_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_cogs_without_fifo_count INTEGER;
  v_write_off_governance_count INTEGER;
  v_integrity_issues_count INTEGER;
BEGIN
  -- حساب عدد المشاكل
  SELECT COUNT(*) INTO v_cogs_without_fifo_count
  FROM validate_cogs_with_fifo();
  
  SELECT COUNT(*) INTO v_write_off_governance_count
  FROM validate_write_off_governance();
  
  SELECT COUNT(*) INTO v_integrity_issues_count
  FROM validate_cogs_integrity(p_company_id, p_date_from, p_date_to)
  WHERE integrity_status != '✅ سليم';
  
  -- بناء النتيجة
  v_result := jsonb_build_object(
    'validation_date', CURRENT_TIMESTAMP,
    'company_id', p_company_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'checks', jsonb_build_object(
      'cogs_without_fifo', jsonb_build_object(
        'count', v_cogs_without_fifo_count,
        'status', CASE WHEN v_cogs_without_fifo_count = 0 THEN '✅ سليم' ELSE '⚠️ مشاكل' END
      ),
      'write_off_governance', jsonb_build_object(
        'count', v_write_off_governance_count,
        'status', CASE WHEN v_write_off_governance_count = 0 THEN '✅ سليم' ELSE '⚠️ مشاكل' END
      ),
      'integrity', jsonb_build_object(
        'count', v_integrity_issues_count,
        'status', CASE WHEN v_integrity_issues_count = 0 THEN '✅ سليم' ELSE '⚠️ مشاكل' END
      )
    ),
    'overall_status', CASE 
      WHEN v_cogs_without_fifo_count = 0 
        AND v_write_off_governance_count = 0 
        AND v_integrity_issues_count = 0 
      THEN '✅ جميع الاختبارات نجحت'
      ELSE '⚠️ توجد مشاكل - يرجى المراجعة'
    END,
    'total_issues', v_cogs_without_fifo_count + v_write_off_governance_count + v_integrity_issues_count
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_cogs_system(UUID, DATE, DATE) IS 
'التحقق الشامل من نظام COGS Professional.
يضم جميع الاختبارات: COGS بدون FIFO, Write-Off Governance, Integrity Check.
يرجع JSONB summary.';

-- =====================================================
-- 5. تعليقات توضيحية
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم إنشاء Validation Functions:';
  RAISE NOTICE '  1. validate_cogs_with_fifo() - كشف COGS بدون FIFO';
  RAISE NOTICE '  2. validate_write_off_governance() - كشف Write-Off بدون Governance';
  RAISE NOTICE '  3. validate_cogs_integrity() - Integrity Check (FIFO vs COGS vs Journal)';
  RAISE NOTICE '  4. validate_cogs_system() - التحقق الشامل (All-in-One Report)';
END $$;
