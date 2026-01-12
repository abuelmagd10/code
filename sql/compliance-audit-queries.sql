-- ============================================
-- استعلامات التدقيق الشاملة
-- ERB VitaSlims - Compliance Audit Queries
-- ============================================
-- جميع الاستعلامات يجب أن ترجع 0 rows
-- أي نتيجة > 0 تعتبر انتهاك حرج (P0)
-- ============================================

-- ============================================
-- 1. الحوكمة (Governance)
-- ============================================

-- 1.1 أوامر بيع بدون حوكمة كاملة
SELECT 
    'sales_orders' as table_name,
    id,
    CASE 
        WHEN company_id IS NULL THEN 'company_id'
        WHEN branch_id IS NULL THEN 'branch_id'
        WHEN warehouse_id IS NULL THEN 'warehouse_id'
        WHEN cost_center_id IS NULL THEN 'cost_center_id'
    END as missing_field
FROM sales_orders
WHERE company_id IS NULL 
   OR branch_id IS NULL 
   OR warehouse_id IS NULL 
   OR cost_center_id IS NULL;
-- المتوقع: 0 rows

-- 1.2 فواتير بدون حوكمة كاملة
SELECT 
    'invoices' as table_name,
    id,
    CASE 
        WHEN company_id IS NULL THEN 'company_id'
        WHEN branch_id IS NULL THEN 'branch_id'
        WHEN warehouse_id IS NULL THEN 'warehouse_id'
        WHEN cost_center_id IS NULL THEN 'cost_center_id'
    END as missing_field
FROM invoices
WHERE company_id IS NULL 
   OR branch_id IS NULL 
   OR warehouse_id IS NULL 
   OR cost_center_id IS NULL;
-- المتوقع: 0 rows

-- 1.3 حركات مخزون بدون حوكمة كاملة
SELECT 
    'inventory_transactions' as table_name,
    id,
    product_id,
    CASE 
        WHEN company_id IS NULL THEN 'company_id'
        WHEN branch_id IS NULL THEN 'branch_id'
        WHEN warehouse_id IS NULL THEN 'warehouse_id'
        WHEN cost_center_id IS NULL THEN 'cost_center_id'
    END as missing_field
FROM inventory_transactions
WHERE company_id IS NULL 
   OR branch_id IS NULL 
   OR warehouse_id IS NULL 
   OR cost_center_id IS NULL;
-- المتوقع: 0 rows

-- ============================================
-- 2. المخزون
-- ============================================

-- 2.1 حركات مخزون بدون مستودع (ممنوع)
SELECT 
    id,
    product_id
FROM inventory_transactions
WHERE warehouse_id IS NULL;
-- المتوقع: 0 rows

-- ============================================
-- 3. تقرير ملخص الانتهاكات
-- ============================================

SELECT 
    'Governance Violations' as category,
    (
        SELECT COUNT(*) FROM sales_orders 
        WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL
    ) +
    (
        SELECT COUNT(*) FROM invoices 
        WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL
    ) +
    (
        SELECT COUNT(*) FROM inventory_transactions 
        WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL
    ) as violation_count

UNION ALL

SELECT 
    'Inventory Violations',
    (
        SELECT COUNT(*) FROM inventory_transactions 
        WHERE warehouse_id IS NULL
    );

-- المتوقع: جميع القيم = 0
