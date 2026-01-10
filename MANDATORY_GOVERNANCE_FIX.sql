-- 🔥 MANDATORY GOVERNANCE FIX – ERP CORE INTEGRITY
-- تاريخ التنفيذ: فوري - قبل أي ميزة جديدة
-- الهدف: إصلاح خروقات الحوكمة الحرجة

-- =====================================================
-- 🚨 تحذير: قم بأخذ نسخة احتياطية قبل التنفيذ
-- =====================================================

BEGIN;

-- =====================================================
-- 1️⃣ SUPPLIERS MUST BELONG TO A BRANCH
-- =====================================================

-- إضافة الأعمدة المطلوبة للموردين
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);

-- ملء البيانات الموجودة من المستخدم المنشئ
UPDATE suppliers s
SET 
  branch_id = cm.branch_id,
  cost_center_id = cm.cost_center_id
FROM company_members cm
WHERE s.created_by_user_id = cm.user_id
  AND s.company_id = cm.company_id
  AND (s.branch_id IS NULL OR s.cost_center_id IS NULL);

-- للموردين بدون منشئ محدد: استخدام الفرع الرئيسي
UPDATE suppliers s
SET 
  branch_id = b.id,
  cost_center_id = cc.id
FROM branches b
JOIN cost_centers cc ON cc.branch_id = b.id AND cc.is_main = true
WHERE s.branch_id IS NULL
  AND b.company_id = s.company_id
  AND b.is_main = true;

-- فرض عدم السماح بـ NULL
ALTER TABLE suppliers 
ALTER COLUMN branch_id SET NOT NULL,
ALTER COLUMN cost_center_id SET NOT NULL;

-- =====================================================
-- 2️⃣ INVENTORY MOVEMENTS WITHOUT WAREHOUSE = DATA CORRUPTION
-- =====================================================

-- إصلاح warehouse_id من الفواتير
UPDATE inventory_transactions it
SET warehouse_id = inv.warehouse_id
FROM invoices inv
WHERE it.reference_id = inv.id
  AND it.transaction_type IN ('sale', 'sale_return')
  AND it.warehouse_id IS NULL
  AND inv.warehouse_id IS NOT NULL;

-- إصلاح warehouse_id من فواتير الشراء
UPDATE inventory_transactions it
SET warehouse_id = b.warehouse_id
FROM bills b
WHERE it.reference_id = b.id
  AND it.transaction_type IN ('purchase', 'purchase_return')
  AND it.warehouse_id IS NULL
  AND b.warehouse_id IS NOT NULL;

-- إصلاح warehouse_id من أوامر البيع
UPDATE inventory_transactions it
SET warehouse_id = so.warehouse_id
FROM sales_orders so
WHERE it.reference_id = so.id
  AND it.transaction_type = 'sale'
  AND it.warehouse_id IS NULL
  AND so.warehouse_id IS NOT NULL;

-- إصلاح warehouse_id من أوامر الشراء
UPDATE inventory_transactions it
SET warehouse_id = po.warehouse_id
FROM purchase_orders po
WHERE it.reference_id = po.id
  AND it.transaction_type = 'purchase'
  AND it.warehouse_id IS NULL
  AND po.warehouse_id IS NOT NULL;

-- إصلاح branch_id من الفواتير
UPDATE inventory_transactions it
SET branch_id = inv.branch_id
FROM invoices inv
WHERE it.reference_id = inv.id
  AND it.transaction_type IN ('sale', 'sale_return')
  AND it.branch_id IS NULL
  AND inv.branch_id IS NOT NULL;

-- إصلاح branch_id من فواتير الشراء
UPDATE inventory_transactions it
SET branch_id = b.branch_id
FROM bills b
WHERE it.reference_id = b.id
  AND it.transaction_type IN ('purchase', 'purchase_return')
  AND it.branch_id IS NULL
  AND b.branch_id IS NOT NULL;

-- إصلاح cost_center_id من الفواتير
UPDATE inventory_transactions it
SET cost_center_id = inv.cost_center_id
FROM invoices inv
WHERE it.reference_id = inv.id
  AND it.transaction_type IN ('sale', 'sale_return')
  AND it.cost_center_id IS NULL
  AND inv.cost_center_id IS NOT NULL;

-- إصلاح cost_center_id من فواتير الشراء
UPDATE inventory_transactions it
SET cost_center_id = b.cost_center_id
FROM bills b
WHERE it.reference_id = b.id
  AND it.transaction_type IN ('purchase', 'purchase_return')
  AND it.cost_center_id IS NULL
  AND b.cost_center_id IS NOT NULL;

-- للحركات المتبقية بدون warehouse: استخدام المخزن الرئيسي للفرع
UPDATE inventory_transactions it
SET warehouse_id = w.id
FROM warehouses w
WHERE it.warehouse_id IS NULL
  AND w.company_id = it.company_id
  AND w.branch_id = it.branch_id
  AND w.is_main = true;

-- للحركات المتبقية بدون branch: استخدام الفرع الرئيسي
UPDATE inventory_transactions it
SET branch_id = b.id
FROM branches b
WHERE it.branch_id IS NULL
  AND b.company_id = it.company_id
  AND b.is_main = true;

-- للحركات المتبقية بدون cost_center: استخدام مركز التكلفة الرئيسي
UPDATE inventory_transactions it
SET cost_center_id = cc.id
FROM cost_centers cc
WHERE it.cost_center_id IS NULL
  AND cc.company_id = it.company_id
  AND cc.branch_id = it.branch_id
  AND cc.is_main = true;

-- =====================================================
-- 3️⃣ EVERY STOCK MOVEMENT MUST HAVE AN OWNER
-- =====================================================

-- إضافة عمود المنشئ
ALTER TABLE inventory_transactions 
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- ملء من الفواتير
UPDATE inventory_transactions it
SET created_by_user_id = inv.created_by_user_id
FROM invoices inv
WHERE it.reference_id = inv.id
  AND it.transaction_type IN ('sale', 'sale_return')
  AND it.created_by_user_id IS NULL
  AND inv.created_by_user_id IS NOT NULL;

-- ملء من فواتير الشراء
UPDATE inventory_transactions it
SET created_by_user_id = b.created_by_user_id
FROM bills b
WHERE it.reference_id = b.id
  AND it.transaction_type IN ('purchase', 'purchase_return')
  AND it.created_by_user_id IS NULL
  AND b.created_by_user_id IS NOT NULL;

-- ملء من أوامر البيع
UPDATE inventory_transactions it
SET created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE it.reference_id = so.id
  AND it.transaction_type = 'sale'
  AND it.created_by_user_id IS NULL
  AND so.created_by_user_id IS NOT NULL;

-- ملء من أوامر الشراء
UPDATE inventory_transactions it
SET created_by_user_id = po.created_by_user_id
FROM purchase_orders po
WHERE it.reference_id = po.id
  AND it.transaction_type = 'purchase'
  AND it.created_by_user_id IS NULL
  AND po.created_by_user_id IS NOT NULL;

-- للحركات المتبقية: استخدام مالك الشركة
UPDATE inventory_transactions it
SET created_by_user_id = c.user_id
FROM companies c
WHERE it.created_by_user_id IS NULL
  AND c.id = it.company_id;

-- فرض عدم السماح بـ NULL
ALTER TABLE inventory_transactions 
ALTER COLUMN warehouse_id SET NOT NULL,
ALTER COLUMN branch_id SET NOT NULL,
ALTER COLUMN cost_center_id SET NOT NULL,
ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================================
-- 5️⃣ LOCK GOVERNANCE AT DATABASE LEVEL
-- =====================================================

-- دالة فرض الحوكمة
CREATE OR REPLACE FUNCTION enforce_governance()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من الحقول الإلزامية
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Governance violation: company_id cannot be NULL in table %', TG_TABLE_NAME;
  END IF;
  
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Governance violation: branch_id cannot be NULL in table %', TG_TABLE_NAME;
  END IF;
  
  IF NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Governance violation: cost_center_id cannot be NULL in table %', TG_TABLE_NAME;
  END IF;
  
  -- التحقق من warehouse_id للجداول التي تحتاجه
  IF TG_TABLE_NAME IN ('inventory_transactions', 'invoices', 'bills', 'sales_orders', 'purchase_orders') 
     AND NEW.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Governance violation: warehouse_id cannot be NULL in table %', TG_TABLE_NAME;
  END IF;
  
  -- التحقق من created_by_user_id للجداول التي تحتاجه
  IF TG_TABLE_NAME IN ('inventory_transactions', 'invoices', 'bills', 'sales_orders', 'purchase_orders', 'customers', 'suppliers') 
     AND NEW.created_by_user_id IS NULL THEN
    RAISE EXCEPTION 'Governance violation: created_by_user_id cannot be NULL in table %', TG_TABLE_NAME;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق الحماية على الجداول الحرجة
DROP TRIGGER IF EXISTS enforce_governance_invoices ON invoices;
CREATE TRIGGER enforce_governance_invoices
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

DROP TRIGGER IF EXISTS enforce_governance_bills ON bills;
CREATE TRIGGER enforce_governance_bills
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

DROP TRIGGER IF EXISTS enforce_governance_sales_orders ON sales_orders;
CREATE TRIGGER enforce_governance_sales_orders
  BEFORE INSERT OR UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

DROP TRIGGER IF EXISTS enforce_governance_purchase_orders ON purchase_orders;
CREATE TRIGGER enforce_governance_purchase_orders
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

DROP TRIGGER IF EXISTS enforce_governance_inventory_transactions ON inventory_transactions;
CREATE TRIGGER enforce_governance_inventory_transactions
  BEFORE INSERT OR UPDATE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

DROP TRIGGER IF EXISTS enforce_governance_suppliers ON suppliers;
CREATE TRIGGER enforce_governance_suppliers
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

DROP TRIGGER IF EXISTS enforce_governance_customers ON customers;
CREATE TRIGGER enforce_governance_customers
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION enforce_governance();

-- =====================================================
-- 📊 تقرير التحقق النهائي
-- =====================================================

-- التحقق من عدم وجود خروقات
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  -- فحص الموردين
  SELECT COUNT(*) INTO violation_count
  FROM suppliers 
  WHERE branch_id IS NULL OR cost_center_id IS NULL;
  
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'GOVERNANCE FIX FAILED: % suppliers still missing branch/cost_center', violation_count;
  END IF;
  
  -- فحص حركات المخزون
  SELECT COUNT(*) INTO violation_count
  FROM inventory_transactions 
  WHERE warehouse_id IS NULL OR branch_id IS NULL OR cost_center_id IS NULL OR created_by_user_id IS NULL;
  
  IF violation_count > 0 THEN
    RAISE EXCEPTION 'GOVERNANCE FIX FAILED: % inventory transactions still missing required fields', violation_count;
  END IF;
  
  RAISE NOTICE '✅ GOVERNANCE FIX COMPLETED SUCCESSFULLY - All entities now comply with ERP governance rules';
END $$;

COMMIT;

-- =====================================================
-- 📋 ملخص الإصلاحات المطبقة
-- =====================================================

/*
✅ 1. الموردين الآن مربوطون بالفروع ومراكز التكلفة
✅ 2. جميع حركات المخزون لها warehouse_id و branch_id و cost_center_id
✅ 3. جميع حركات المخزون لها created_by_user_id
✅ 4. تم فرض NOT NULL على الحقول الحرجة
✅ 5. تم تطبيق حماية على مستوى قاعدة البيانات

🎯 النتيجة: النظام الآن SAP-grade في سلامة البيانات
🔒 الحماية: أي محاولة لإدخال بيانات تخرق الحوكمة ستفشل تلقائياً
🚀 الجاهزية: يمكن الآن إضافة Refunds، Approvals، وأي ميزة مالية بأمان
*/