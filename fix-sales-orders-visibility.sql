-- 🔍 فحص مشكلة عدم ظهور أوامر البيع للمستخدمين
-- تشخيص وإصلاح مشكلة نظام الحوكمة

-- 1️⃣ فحص بيانات المستخدمين وسياق الحوكمة
SELECT 
    cm.user_id,
    cm.role,
    cm.branch_id,
    cm.cost_center_id,
    cm.warehouse_id,
    up.display_name,
    up.username,
    c.name as company_name
FROM company_members cm
LEFT JOIN user_profiles up ON cm.user_id = up.user_id
LEFT JOIN companies c ON cm.company_id = c.id
WHERE cm.company_id = (SELECT id FROM companies LIMIT 1)
ORDER BY cm.role, up.display_name;

-- 2️⃣ فحص أوامر البيع الموجودة
SELECT 
    so.id,
    so.so_number,
    so.customer_id,
    so.branch_id,
    so.cost_center_id,
    so.warehouse_id,
    so.created_by_user_id,
    so.status,
    so.created_at,
    c.name as customer_name,
    up.display_name as created_by_name
FROM sales_orders so
LEFT JOIN customers c ON so.customer_id = c.id
LEFT JOIN user_profiles up ON so.created_by_user_id = up.user_id
WHERE so.company_id = (SELECT id FROM companies LIMIT 1)
ORDER BY so.created_at DESC
LIMIT 10;

-- 3️⃣ فحص الفروع ومراكز التكلفة والمخازن
SELECT 
    'branches' as type,
    b.id,
    b.name,
    b.company_id,
    NULL as branch_id,
    NULL as is_main
FROM branches b
WHERE b.company_id = (SELECT id FROM companies LIMIT 1)

UNION ALL

SELECT 
    'cost_centers' as type,
    cc.id,
    cc.name,
    cc.company_id,
    cc.branch_id,
    NULL as is_main
FROM cost_centers cc
WHERE cc.company_id = (SELECT id FROM companies LIMIT 1)

UNION ALL

SELECT 
    'warehouses' as type,
    w.id,
    w.name,
    w.company_id,
    w.branch_id,
    w.is_main::text
FROM warehouses w
WHERE w.company_id = (SELECT id FROM companies LIMIT 1)

ORDER BY type, name;

-- 4️⃣ إصلاح المشكلة: تحديث أوامر البيع القديمة بدون branch_id
UPDATE sales_orders 
SET 
    branch_id = (
        SELECT b.id 
        FROM branches b 
        WHERE b.company_id = sales_orders.company_id 
        LIMIT 1
    ),
    cost_center_id = (
        SELECT cc.id 
        FROM cost_centers cc 
        JOIN branches b ON cc.branch_id = b.id
        WHERE b.company_id = sales_orders.company_id 
        LIMIT 1
    ),
    warehouse_id = (
        SELECT w.id 
        FROM warehouses w 
        JOIN branches b ON w.branch_id = b.id
        WHERE b.company_id = sales_orders.company_id 
        AND w.is_main = true
        LIMIT 1
    )
WHERE branch_id IS NULL 
   OR cost_center_id IS NULL 
   OR warehouse_id IS NULL;

-- 5️⃣ إنشاء فرع افتراضي إذا لم يكن موجوداً
INSERT INTO branches (company_id, name, address, phone, is_active)
SELECT 
    c.id,
    'الفرع الرئيسي',
    'العنوان الرئيسي',
    NULL,
    true
FROM companies c
WHERE NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.company_id = c.id
);

-- 6️⃣ إنشاء مركز تكلفة افتراضي لكل فرع
INSERT INTO cost_centers (company_id, branch_id, name, description, is_active)
SELECT 
    b.company_id,
    b.id,
    'مركز التكلفة الرئيسي',
    'مركز التكلفة الافتراضي للفرع',
    true
FROM branches b
WHERE NOT EXISTS (
    SELECT 1 FROM cost_centers cc WHERE cc.branch_id = b.id
);

-- 7️⃣ إنشاء مخزن افتراضي لكل فرع
INSERT INTO warehouses (company_id, branch_id, name, location, is_main, is_active)
SELECT 
    b.company_id,
    b.id,
    'المخزن الرئيسي',
    'المخزن الافتراضي للفرع',
    true,
    true
FROM branches b
WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.branch_id = b.id AND w.is_main = true
);

-- 8️⃣ تحديث أعضاء الشركة بالفرع ومركز التكلفة والمخزن الافتراضي
UPDATE company_members 
SET 
    branch_id = COALESCE(branch_id, (
        SELECT b.id 
        FROM branches b 
        WHERE b.company_id = company_members.company_id 
        LIMIT 1
    )),
    cost_center_id = COALESCE(cost_center_id, (
        SELECT cc.id 
        FROM cost_centers cc 
        JOIN branches b ON cc.branch_id = b.id
        WHERE b.company_id = company_members.company_id 
        LIMIT 1
    )),
    warehouse_id = COALESCE(warehouse_id, (
        SELECT w.id 
        FROM warehouses w 
        JOIN branches b ON w.branch_id = b.id
        WHERE b.company_id = company_members.company_id 
        AND w.is_main = true
        LIMIT 1
    ))
WHERE branch_id IS NULL 
   OR cost_center_id IS NULL 
   OR warehouse_id IS NULL;

-- 9️⃣ فحص النتائج بعد الإصلاح
SELECT 
    'المستخدمون بعد الإصلاح' as check_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as with_branch,
    COUNT(CASE WHEN cost_center_id IS NOT NULL THEN 1 END) as with_cost_center,
    COUNT(CASE WHEN warehouse_id IS NOT NULL THEN 1 END) as with_warehouse
FROM company_members
WHERE company_id = (SELECT id FROM companies LIMIT 1)

UNION ALL

SELECT 
    'أوامر البيع بعد الإصلاح' as check_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as with_branch,
    COUNT(CASE WHEN cost_center_id IS NOT NULL THEN 1 END) as with_cost_center,
    COUNT(CASE WHEN warehouse_id IS NOT NULL THEN 1 END) as with_warehouse
FROM sales_orders
WHERE company_id = (SELECT id FROM companies LIMIT 1);

-- 🔟 اختبار الاستعلام مع نظام الحوكمة
-- محاكاة استعلام المستخدم العادي
WITH user_context AS (
    SELECT 
        cm.user_id,
        cm.company_id,
        cm.branch_id,
        cm.cost_center_id,
        cm.warehouse_id,
        cm.role
    FROM company_members cm
    WHERE cm.company_id = (SELECT id FROM companies LIMIT 1)
    LIMIT 1
)
SELECT 
    so.id,
    so.so_number,
    so.status,
    so.branch_id,
    so.cost_center_id,
    so.warehouse_id,
    so.created_by_user_id,
    uc.role as user_role,
    CASE 
        WHEN uc.role IN ('owner', 'admin', 'general_manager') THEN 'يرى كل شيء'
        WHEN uc.role IN ('manager', 'accountant') THEN 'يرى نطاقه'
        ELSE 'يرى ما أنشأه فقط'
    END as access_level,
    CASE 
        WHEN uc.role IN ('owner', 'admin', 'general_manager') THEN true
        WHEN uc.role IN ('manager', 'accountant') AND (
            so.branch_id = uc.branch_id OR so.branch_id IS NULL
        ) THEN true
        WHEN so.created_by_user_id = uc.user_id THEN true
        ELSE false
    END as can_see
FROM sales_orders so
CROSS JOIN user_context uc
WHERE so.company_id = uc.company_id
ORDER BY so.created_at DESC;