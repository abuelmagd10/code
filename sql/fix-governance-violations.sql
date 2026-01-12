-- ============================================
-- إصلاح انتهاكات الحوكمة الحرجة
-- ERB VitaSlims - Fix Governance Violations
-- ============================================

-- ============================================
-- الخطوة 1: التحقق من الانتهاكات
-- ============================================

SELECT 
    'sales_orders' as table_name,
    COUNT(*) as violations,
    COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as missing_branch,
    COUNT(CASE WHEN warehouse_id IS NULL THEN 1 END) as missing_warehouse,
    COUNT(CASE WHEN cost_center_id IS NULL THEN 1 END) as missing_cost_center
FROM sales_orders
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL

UNION ALL

SELECT 
    'invoices',
    COUNT(*),
    COUNT(CASE WHEN branch_id IS NULL THEN 1 END),
    COUNT(CASE WHEN warehouse_id IS NULL THEN 1 END),
    COUNT(CASE WHEN cost_center_id IS NULL THEN 1 END)
FROM invoices
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL

UNION ALL

SELECT 
    'inventory_transactions',
    COUNT(*),
    COUNT(CASE WHEN branch_id IS NULL THEN 1 END),
    COUNT(CASE WHEN warehouse_id IS NULL THEN 1 END),
    COUNT(CASE WHEN cost_center_id IS NULL THEN 1 END)
FROM inventory_transactions
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL;

-- ============================================
-- الخطوة 2: إصلاح أوامر البيع
-- ============================================

UPDATE sales_orders
SET branch_id = (
    SELECT id FROM branches 
    WHERE company_id = sales_orders.company_id 
    LIMIT 1
)
WHERE branch_id IS NULL
  AND company_id IS NOT NULL;

UPDATE sales_orders
SET warehouse_id = (
    SELECT id FROM warehouses 
    WHERE company_id = sales_orders.company_id 
    LIMIT 1
)
WHERE warehouse_id IS NULL
  AND company_id IS NOT NULL;

UPDATE sales_orders
SET cost_center_id = (
    SELECT id FROM cost_centers 
    WHERE company_id = sales_orders.company_id 
    LIMIT 1
)
WHERE cost_center_id IS NULL
  AND company_id IS NOT NULL;

-- ============================================
-- الخطوة 3: إصلاح الفواتير
-- ============================================

UPDATE invoices
SET branch_id = (
    SELECT id FROM branches 
    WHERE company_id = invoices.company_id 
    LIMIT 1
)
WHERE branch_id IS NULL
  AND company_id IS NOT NULL;

UPDATE invoices
SET warehouse_id = (
    SELECT id FROM warehouses 
    WHERE company_id = invoices.company_id 
    LIMIT 1
)
WHERE warehouse_id IS NULL
  AND company_id IS NOT NULL;

UPDATE invoices
SET cost_center_id = (
    SELECT id FROM cost_centers 
    WHERE company_id = invoices.company_id 
    LIMIT 1
)
WHERE cost_center_id IS NULL
  AND company_id IS NOT NULL;

-- ============================================
-- الخطوة 4: إصلاح حركات المخزون
-- ============================================

UPDATE inventory_transactions
SET branch_id = (
    SELECT id FROM branches 
    WHERE company_id = inventory_transactions.company_id 
    LIMIT 1
)
WHERE branch_id IS NULL
  AND company_id IS NOT NULL;

UPDATE inventory_transactions
SET warehouse_id = (
    SELECT id FROM warehouses 
    WHERE company_id = inventory_transactions.company_id 
    LIMIT 1
)
WHERE warehouse_id IS NULL
  AND company_id IS NOT NULL;

UPDATE inventory_transactions
SET cost_center_id = (
    SELECT id FROM cost_centers 
    WHERE company_id = inventory_transactions.company_id 
    LIMIT 1
)
WHERE cost_center_id IS NULL
  AND company_id IS NOT NULL;

-- ============================================
-- الخطوة 5: التحقق من النتائج
-- ============================================

SELECT 
    'sales_orders' as table_name,
    COUNT(*) as remaining_violations
FROM sales_orders
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL

UNION ALL

SELECT 
    'invoices',
    COUNT(*)
FROM invoices
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL

UNION ALL

SELECT 
    'inventory_transactions',
    COUNT(*)
FROM inventory_transactions
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL;

-- المتوقع: جميع القيم = 0
