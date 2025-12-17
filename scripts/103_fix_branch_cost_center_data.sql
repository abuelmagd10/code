-- =====================================================
-- سكريبت إصلاح البيانات المحاسبية والمخزنية
-- تحديث جميع البيانات لربطها بالفرع ومركز التكلفة والمخزن
-- تاريخ التنفيذ: 2025-12-17
-- =====================================================

-- 1️⃣ إصلاح الفرع الرئيسي لأي شركة لا يوجد لها فرع رئيسي
UPDATE branches
SET is_main = true
WHERE is_head_office = true
AND NOT EXISTS (
    SELECT 1 FROM branches b2
    WHERE b2.company_id = branches.company_id
    AND b2.is_main = true
);

-- 2️⃣ إضافة حقول الفرع ومركز التكلفة والمخزن لجدول أوامر البيع
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id),
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

-- 3️⃣ إضافة حقول الفرع ومركز التكلفة والمخزن لجدول أوامر الشراء
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id),
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

-- 4️⃣ إنشاء مراكز تكلفة رئيسية لكل شركة إذا لم تكن موجودة
INSERT INTO cost_centers (id, company_id, branch_id, cost_center_code, cost_center_name, is_active)
SELECT 
    gen_random_uuid(),
    c.id,
    b.id,
    'MAIN',
    'مركز التكلفة الرئيسي',
    true
FROM companies c
JOIN branches b ON b.company_id = c.id AND b.is_main = true
WHERE NOT EXISTS (
    SELECT 1 FROM cost_centers cc WHERE cc.company_id = c.id AND cc.branch_id = b.id
)
ON CONFLICT DO NOTHING;

-- 5️⃣ تحديث الفواتير لربطها بالفرع الرئيسي والمخزن الرئيسي
UPDATE invoices i
SET 
    branch_id = COALESCE(i.branch_id, b.id),
    warehouse_id = COALESCE(i.warehouse_id, w.id),
    cost_center_id = COALESCE(i.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE i.company_id = b.company_id 
AND b.is_main = true
AND (i.branch_id IS NULL OR i.warehouse_id IS NULL);

-- 6️⃣ تحديث فواتير الشراء لربطها بالفرع الرئيسي والمخزن الرئيسي
UPDATE bills bl
SET 
    branch_id = COALESCE(bl.branch_id, b.id),
    warehouse_id = COALESCE(bl.warehouse_id, w.id),
    cost_center_id = COALESCE(bl.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE bl.company_id = b.company_id 
AND b.is_main = true
AND (bl.branch_id IS NULL OR bl.warehouse_id IS NULL);

-- 7️⃣ تحديث القيود المحاسبية لربطها بالفرع الرئيسي
UPDATE journal_entries je
SET 
    branch_id = COALESCE(je.branch_id, b.id),
    cost_center_id = COALESCE(je.cost_center_id, cc.id)
FROM branches b
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE je.company_id = b.company_id 
AND b.is_main = true
AND je.branch_id IS NULL;

-- 8️⃣ تحديث سطور القيود المحاسبية لربطها بالفرع الرئيسي
UPDATE journal_entry_lines jel
SET 
    branch_id = COALESCE(jel.branch_id, je.branch_id),
    cost_center_id = COALESCE(jel.cost_center_id, je.cost_center_id)
FROM journal_entries je
WHERE jel.journal_entry_id = je.id
AND jel.branch_id IS NULL;

-- 9️⃣ تحديث حركات المخزون لربطها بالفرع الرئيسي والمخزن الرئيسي
UPDATE inventory_transactions it
SET 
    branch_id = COALESCE(it.branch_id, b.id),
    warehouse_id = COALESCE(it.warehouse_id, w.id),
    cost_center_id = COALESCE(it.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE it.company_id = b.company_id 
AND b.is_main = true
AND (it.branch_id IS NULL OR it.warehouse_id IS NULL);

-- 🔟 تحديث أوامر البيع لربطها بالفرع الرئيسي والمخزن الرئيسي
UPDATE sales_orders so
SET 
    branch_id = COALESCE(so.branch_id, b.id),
    warehouse_id = COALESCE(so.warehouse_id, w.id),
    cost_center_id = COALESCE(so.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE so.company_id = b.company_id 
AND b.is_main = true
AND (so.branch_id IS NULL OR so.warehouse_id IS NULL);

-- 1️⃣1️⃣ تحديث أوامر الشراء لربطها بالفرع الرئيسي والمخزن الرئيسي
UPDATE purchase_orders po
SET
    branch_id = COALESCE(po.branch_id, b.id),
    warehouse_id = COALESCE(po.warehouse_id, w.id),
    cost_center_id = COALESCE(po.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE po.company_id = b.company_id
AND b.is_main = true
AND (po.branch_id IS NULL OR po.warehouse_id IS NULL);

-- 1️⃣2️⃣ تحديث الحسابات المصرفية لربطها بالفرع الرئيسي
UPDATE chart_of_accounts coa
SET
    branch_id = COALESCE(coa.branch_id, b.id),
    cost_center_id = COALESCE(coa.cost_center_id, cc.id)
FROM branches b
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE coa.company_id = b.company_id
AND b.is_main = true
AND coa.account_type = 'bank'
AND coa.branch_id IS NULL;

-- 1️⃣3️⃣ تحديث المدفوعات لربطها بالفرع الرئيسي
UPDATE payments p
SET
    branch_id = COALESCE(p.branch_id, b.id),
    cost_center_id = COALESCE(p.cost_center_id, cc.id)
FROM branches b
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE p.company_id = b.company_id
AND b.is_main = true
AND p.branch_id IS NULL;

-- 1️⃣4️⃣ تحديث مراكز التكلفة لربط المخازن بها
UPDATE warehouses w
SET cost_center_id = cc.id
FROM cost_centers cc
WHERE w.company_id = cc.company_id
AND w.branch_id = cc.branch_id
AND w.cost_center_id IS NULL;

-- 1️⃣5️⃣ إضافة حقول الفرع ومركز التكلفة لجدول إتلاف المخزون
ALTER TABLE inventory_write_offs
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);

-- 1️⃣6️⃣ إضافة حقل warehouse_id لجدول مرتجعات الشراء
ALTER TABLE purchase_returns
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

-- 1️⃣7️⃣ تحديث مرتجعات البيع لربطها بالفرع والمخزن
UPDATE sales_returns sr
SET
    branch_id = COALESCE(sr.branch_id, b.id),
    warehouse_id = COALESCE(sr.warehouse_id, w.id),
    cost_center_id = COALESCE(sr.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE sr.company_id = b.company_id
AND b.is_main = true
AND (sr.branch_id IS NULL OR sr.warehouse_id IS NULL);

-- 1️⃣8️⃣ تحديث مرتجعات الشراء لربطها بالفرع والمخزن
UPDATE purchase_returns pr
SET
    branch_id = COALESCE(pr.branch_id, b.id),
    warehouse_id = COALESCE(pr.warehouse_id, w.id),
    cost_center_id = COALESCE(pr.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE pr.company_id = b.company_id
AND b.is_main = true
AND (pr.branch_id IS NULL OR pr.warehouse_id IS NULL);

-- 1️⃣9️⃣ تحديث إشعارات العملاء لربطها بالفرع
UPDATE customer_credits cc
SET
    branch_id = COALESCE(cc.branch_id, b.id),
    cost_center_id = COALESCE(cc.cost_center_id, ccc.id)
FROM branches b
LEFT JOIN cost_centers ccc ON ccc.company_id = b.company_id AND ccc.branch_id = b.id
WHERE cc.company_id = b.company_id
AND b.is_main = true
AND cc.branch_id IS NULL;

-- 2️⃣0️⃣ تحديث إتلاف المخزون لربطها بالفرع والمخزن
UPDATE inventory_write_offs iw
SET
    branch_id = COALESCE(iw.branch_id, b.id),
    warehouse_id = COALESCE(iw.warehouse_id, w.id),
    cost_center_id = COALESCE(iw.cost_center_id, cc.id)
FROM branches b
JOIN warehouses w ON w.company_id = b.company_id AND w.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = b.company_id AND cc.branch_id = b.id
WHERE iw.company_id = b.company_id
AND b.is_main = true
AND (iw.branch_id IS NULL OR iw.warehouse_id IS NULL);

-- =====================================================
-- استعلامات التحقق
-- =====================================================

-- عرض ملخص البيانات بعد التحديث
SELECT 'invoices' as table_name, COUNT(*) as total, COUNT(branch_id) as with_branch, COUNT(cost_center_id) as with_cost_center, COUNT(warehouse_id) as with_warehouse FROM invoices
UNION ALL
SELECT 'bills', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM bills
UNION ALL
SELECT 'journal_entries', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM journal_entries
UNION ALL
SELECT 'inventory_transactions', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM inventory_transactions
UNION ALL
SELECT 'sales_orders', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM sales_orders
UNION ALL
SELECT 'purchase_orders', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM purchase_orders
UNION ALL
SELECT 'payments', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), 0 FROM payments
UNION ALL
SELECT 'sales_returns', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM sales_returns
UNION ALL
SELECT 'purchase_returns', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM purchase_returns
UNION ALL
SELECT 'customer_credits', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), 0 FROM customer_credits
UNION ALL
SELECT 'inventory_write_offs', COUNT(*), COUNT(branch_id), COUNT(cost_center_id), COUNT(warehouse_id) FROM inventory_write_offs;

-- عرض مراكز التكلفة المنشأة
SELECT cc.id, cc.company_id, cc.branch_id, cc.cost_center_code, cc.cost_center_name, b.branch_name
FROM cost_centers cc
JOIN branches b ON b.id = cc.branch_id;

-- عرض الهيكل الكامل للشركات
SELECT c.name as company_name, b.branch_name, cc.cost_center_name, w.name as warehouse_name
FROM companies c
LEFT JOIN branches b ON b.company_id = c.id AND b.is_main = true
LEFT JOIN cost_centers cc ON cc.company_id = c.id AND cc.branch_id = b.id
LEFT JOIN warehouses w ON w.company_id = c.id AND w.is_main = true
ORDER BY c.name;

