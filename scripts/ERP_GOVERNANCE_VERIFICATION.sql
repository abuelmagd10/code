-- =====================================================
-- 🔍 ERP GOVERNANCE VERIFICATION SCRIPT
-- =====================================================
-- Verifies that all mandatory governance fixes are applied
-- and the system is ready for professional ERP operations
-- =====================================================

-- =====================================
-- 1️⃣ VERIFY TABLE STRUCTURE
-- =====================================

-- Check that all required columns exist
SELECT 
  'suppliers' as table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'branch_id'
  ) THEN '✅' ELSE '❌' END as has_branch_id,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'cost_center_id'
  ) THEN '✅' ELSE '❌' END as has_cost_center_id,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'created_by_user_id'
  ) THEN '✅' ELSE '❌' END as has_created_by_user_id

UNION ALL

SELECT 
  'customers' as table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'branch_id'
  ) THEN '✅' ELSE '❌' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'cost_center_id'
  ) THEN '✅' ELSE '❌' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'created_by_user_id'
  ) THEN '✅' ELSE '❌' END

UNION ALL

SELECT 
  'inventory_transactions' as table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'branch_id'
  ) THEN '✅' ELSE '❌' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'cost_center_id'
  ) THEN '✅' ELSE '❌' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'created_by_user_id'
  ) THEN '✅' ELSE '❌' END;

-- =====================================
-- 2️⃣ VERIFY NOT NULL CONSTRAINTS
-- =====================================

SELECT 
  table_name,
  column_name,
  CASE WHEN is_nullable = 'NO' THEN '✅ NOT NULL' ELSE '❌ NULLABLE' END as constraint_status
FROM information_schema.columns 
WHERE table_name IN ('suppliers', 'customers', 'invoices', 'bills', 'inventory_transactions', 'sales_orders', 'purchase_orders')
  AND column_name IN ('company_id', 'branch_id', 'cost_center_id', 'warehouse_id', 'created_by_user_id')
ORDER BY table_name, column_name;

-- =====================================
-- 3️⃣ VERIFY DATA INTEGRITY
-- =====================================

-- Check for NULL values in critical governance fields
SELECT 
  'suppliers' as table_name,
  COUNT(*) as total_records,
  COUNT(company_id) as with_company_id,
  COUNT(branch_id) as with_branch_id,
  COUNT(cost_center_id) as with_cost_center_id,
  COUNT(created_by_user_id) as with_created_by_user_id,
  CASE 
    WHEN COUNT(*) = COUNT(company_id) AND COUNT(*) = COUNT(branch_id) 
         AND COUNT(*) = COUNT(cost_center_id) AND COUNT(*) = COUNT(created_by_user_id)
    THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END as governance_status
FROM suppliers

UNION ALL

SELECT 
  'customers',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  COUNT(created_by_user_id),
  CASE 
    WHEN COUNT(*) = COUNT(company_id) AND COUNT(*) = COUNT(branch_id) 
         AND COUNT(*) = COUNT(cost_center_id) AND COUNT(*) = COUNT(created_by_user_id)
    THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END
FROM customers

UNION ALL

SELECT 
  'invoices',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  COUNT(created_by_user_id),
  CASE 
    WHEN COUNT(*) = COUNT(company_id) AND COUNT(*) = COUNT(branch_id) 
         AND COUNT(*) = COUNT(cost_center_id) AND COUNT(*) = COUNT(created_by_user_id)
    THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END
FROM invoices

UNION ALL

SELECT 
  'bills',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  COUNT(created_by_user_id),
  CASE 
    WHEN COUNT(*) = COUNT(company_id) AND COUNT(*) = COUNT(branch_id) 
         AND COUNT(*) = COUNT(cost_center_id) AND COUNT(*) = COUNT(created_by_user_id)
    THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END
FROM bills

UNION ALL

SELECT 
  'inventory_transactions',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  COUNT(created_by_user_id),
  CASE 
    WHEN COUNT(*) = COUNT(company_id) AND COUNT(*) = COUNT(branch_id) 
         AND COUNT(*) = COUNT(cost_center_id) AND COUNT(*) = COUNT(created_by_user_id)
    THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END
FROM inventory_transactions;

-- =====================================
-- 4️⃣ VERIFY WAREHOUSE GOVERNANCE
-- =====================================

-- Check warehouse governance for inventory-related tables
SELECT 
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(warehouse_id) as with_warehouse_id,
  CASE 
    WHEN COUNT(*) = COUNT(warehouse_id) THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END as warehouse_governance_status
FROM invoices

UNION ALL

SELECT 
  'bills',
  COUNT(*),
  COUNT(warehouse_id),
  CASE 
    WHEN COUNT(*) = COUNT(warehouse_id) THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END
FROM bills

UNION ALL

SELECT 
  'inventory_transactions',
  COUNT(*),
  COUNT(warehouse_id),
  CASE 
    WHEN COUNT(*) = COUNT(warehouse_id) THEN '✅ COMPLIANT' 
    ELSE '❌ VIOLATIONS' 
  END
FROM inventory_transactions;

-- =====================================
-- 5️⃣ VERIFY GOVERNANCE TRIGGERS
-- =====================================

-- Check that governance triggers are installed
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  CASE 
    WHEN trigger_name LIKE 'governance_trigger_%' THEN '✅ INSTALLED' 
    ELSE '❌ MISSING' 
  END as trigger_status
FROM information_schema.triggers 
WHERE trigger_name LIKE 'governance_trigger_%'
ORDER BY event_object_table;

-- =====================================
-- 6️⃣ VERIFY HIERARCHY INTEGRITY
-- =====================================

-- Check that all branches belong to valid companies
SELECT 
  'branch_company_integrity' as check_name,
  COUNT(*) as total_branches,
  COUNT(CASE WHEN c.id IS NOT NULL THEN 1 END) as valid_company_refs,
  CASE 
    WHEN COUNT(*) = COUNT(CASE WHEN c.id IS NOT NULL THEN 1 END) 
    THEN '✅ VALID' 
    ELSE '❌ BROKEN REFS' 
  END as integrity_status
FROM branches b
LEFT JOIN companies c ON b.company_id = c.id

UNION ALL

-- Check that all cost centers belong to valid branches
SELECT 
  'cost_center_branch_integrity',
  COUNT(*),
  COUNT(CASE WHEN b.id IS NOT NULL THEN 1 END),
  CASE 
    WHEN COUNT(*) = COUNT(CASE WHEN b.id IS NOT NULL THEN 1 END) 
    THEN '✅ VALID' 
    ELSE '❌ BROKEN REFS' 
  END
FROM cost_centers cc
LEFT JOIN branches b ON cc.branch_id = b.id

UNION ALL

-- Check that all warehouses belong to valid branches
SELECT 
  'warehouse_branch_integrity',
  COUNT(*),
  COUNT(CASE WHEN b.id IS NOT NULL THEN 1 END),
  CASE 
    WHEN COUNT(*) = COUNT(CASE WHEN b.id IS NOT NULL THEN 1 END) 
    THEN '✅ VALID' 
    ELSE '❌ BROKEN REFS' 
  END
FROM warehouses w
LEFT JOIN branches b ON w.branch_id = b.id;

-- =====================================
-- 7️⃣ VERIFY USER GOVERNANCE ASSIGNMENTS
-- =====================================

-- Check that all users have proper governance assignments
SELECT 
  'user_governance_assignments' as check_name,
  COUNT(DISTINCT cm.user_id) as total_users,
  COUNT(DISTINCT ubcc.user_id) as users_with_governance,
  CASE 
    WHEN COUNT(DISTINCT cm.user_id) = COUNT(DISTINCT ubcc.user_id) 
    THEN '✅ ALL ASSIGNED' 
    ELSE '❌ MISSING ASSIGNMENTS' 
  END as assignment_status
FROM company_members cm
LEFT JOIN user_branch_cost_center ubcc ON cm.user_id = ubcc.user_id AND cm.company_id = ubcc.company_id;

-- =====================================
-- 8️⃣ VERIFY DEFAULT ENTITIES EXIST
-- =====================================

-- Check that every company has a main branch
SELECT 
  'main_branch_existence' as check_name,
  COUNT(DISTINCT c.id) as total_companies,
  COUNT(DISTINCT b.company_id) as companies_with_main_branch,
  CASE 
    WHEN COUNT(DISTINCT c.id) = COUNT(DISTINCT b.company_id) 
    THEN '✅ ALL HAVE MAIN BRANCH' 
    ELSE '❌ MISSING MAIN BRANCHES' 
  END as main_branch_status
FROM companies c
LEFT JOIN branches b ON c.id = b.company_id AND b.is_main = TRUE

UNION ALL

-- Check that every company has a main warehouse
SELECT 
  'main_warehouse_existence',
  COUNT(DISTINCT c.id),
  COUNT(DISTINCT w.company_id),
  CASE 
    WHEN COUNT(DISTINCT c.id) = COUNT(DISTINCT w.company_id) 
    THEN '✅ ALL HAVE MAIN WAREHOUSE' 
    ELSE '❌ MISSING MAIN WAREHOUSES' 
  END
FROM companies c
LEFT JOIN warehouses w ON c.id = w.company_id AND w.is_main = TRUE;

-- =====================================
-- 9️⃣ FINAL GOVERNANCE COMPLIANCE REPORT
-- =====================================

-- Overall compliance summary
WITH compliance_checks AS (
  SELECT 
    CASE 
      WHEN (
        SELECT COUNT(*) FROM suppliers WHERE branch_id IS NULL OR cost_center_id IS NULL OR created_by_user_id IS NULL
      ) = 0 THEN 1 ELSE 0 
    END as suppliers_compliant,
    
    CASE 
      WHEN (
        SELECT COUNT(*) FROM customers WHERE branch_id IS NULL OR cost_center_id IS NULL OR created_by_user_id IS NULL
      ) = 0 THEN 1 ELSE 0 
    END as customers_compliant,
    
    CASE 
      WHEN (
        SELECT COUNT(*) FROM invoices WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL OR created_by_user_id IS NULL
      ) = 0 THEN 1 ELSE 0 
    END as invoices_compliant,
    
    CASE 
      WHEN (
        SELECT COUNT(*) FROM bills WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL OR created_by_user_id IS NULL
      ) = 0 THEN 1 ELSE 0 
    END as bills_compliant,
    
    CASE 
      WHEN (
        SELECT COUNT(*) FROM inventory_transactions WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL OR created_by_user_id IS NULL
      ) = 0 THEN 1 ELSE 0 
    END as inventory_compliant
)
SELECT 
  '🔒 ERP GOVERNANCE COMPLIANCE REPORT' as report_title,
  suppliers_compliant + customers_compliant + invoices_compliant + bills_compliant + inventory_compliant as compliant_entities,
  5 as total_entities,
  CASE 
    WHEN suppliers_compliant + customers_compliant + invoices_compliant + bills_compliant + inventory_compliant = 5 
    THEN '✅ FULLY COMPLIANT - READY FOR PRODUCTION' 
    ELSE '❌ COMPLIANCE VIOLATIONS - FIX REQUIRED' 
  END as overall_status
FROM compliance_checks;

-- =====================================
-- ✅ GOVERNANCE VERIFICATION COMPLETED
-- =====================================