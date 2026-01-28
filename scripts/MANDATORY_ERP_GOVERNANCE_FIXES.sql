-- =====================================================
-- 🔒 MANDATORY ERP GOVERNANCE FIXES
-- =====================================================
-- Company → Branch → Cost Center → Warehouse hierarchy
-- MUST be enforced everywhere for professional ERP
-- =====================================================

-- =====================================
-- 1️⃣ FIX SUPPLIERS - Add branch & cost center
-- =====================================

-- Add required columns to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill suppliers with creator's branch & cost center
UPDATE suppliers SET 
  branch_id = (
    SELECT ubcc.branch_id 
    FROM user_branch_cost_center ubcc 
    WHERE ubcc.company_id = suppliers.company_id 
    LIMIT 1
  ),
  cost_center_id = (
    SELECT ubcc.cost_center_id 
    FROM user_branch_cost_center ubcc 
    WHERE ubcc.company_id = suppliers.company_id 
    LIMIT 1
  ),
  created_by_user_id = (
    SELECT cm.user_id 
    FROM company_members cm 
    WHERE cm.company_id = suppliers.company_id 
    AND cm.role = 'owner' 
    LIMIT 1
  )
WHERE branch_id IS NULL OR cost_center_id IS NULL OR created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE suppliers ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 2️⃣ FIX INVENTORY TRANSACTIONS - Add warehouse, branch & cost center
-- =====================================

-- Add required columns
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill warehouse_id from related documents
UPDATE inventory_transactions SET 
  warehouse_id = COALESCE(
    (SELECT i.warehouse_id FROM invoices i WHERE i.id = inventory_transactions.reference_id),
    (SELECT b.warehouse_id FROM bills b WHERE b.id = inventory_transactions.reference_id),
    (SELECT w.id FROM warehouses w WHERE w.company_id = inventory_transactions.company_id AND w.is_main = TRUE LIMIT 1)
  )
WHERE warehouse_id IS NULL;

-- Backfill branch_id from warehouse or main branch
UPDATE inventory_transactions SET 
  branch_id = COALESCE(
    (SELECT w.branch_id FROM warehouses w WHERE w.id = inventory_transactions.warehouse_id),
    (SELECT b.id FROM branches b WHERE b.company_id = inventory_transactions.company_id AND b.is_main = TRUE LIMIT 1)
  )
WHERE branch_id IS NULL;

-- Backfill cost_center_id from branch
UPDATE inventory_transactions SET 
  cost_center_id = (
    SELECT cc.id FROM cost_centers cc 
    WHERE cc.branch_id = inventory_transactions.branch_id 
    LIMIT 1
  )
WHERE cost_center_id IS NULL;

-- Backfill created_by_user_id from source document or company owner
UPDATE inventory_transactions SET 
  created_by_user_id = COALESCE(
    (SELECT i.created_by_user_id FROM invoices i WHERE i.id = inventory_transactions.reference_id),
    (SELECT b.created_by_user_id FROM bills b WHERE b.id = inventory_transactions.reference_id),
    (SELECT cm.user_id FROM company_members cm WHERE cm.company_id = inventory_transactions.company_id AND cm.role = 'owner' LIMIT 1)
  )
WHERE created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE inventory_transactions ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE inventory_transactions ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE inventory_transactions ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE inventory_transactions ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 3️⃣ FIX INVOICES - Ensure governance fields
-- =====================================

-- Add created_by_user_id if missing
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill missing governance fields
UPDATE invoices SET 
  branch_id = (
    SELECT b.id FROM branches b 
    WHERE b.company_id = invoices.company_id AND b.is_main = TRUE 
    LIMIT 1
  )
WHERE branch_id IS NULL;

UPDATE invoices SET 
  cost_center_id = (
    SELECT cc.id FROM cost_centers cc 
    WHERE cc.branch_id = invoices.branch_id 
    LIMIT 1
  )
WHERE cost_center_id IS NULL;

UPDATE invoices SET 
  warehouse_id = (
    SELECT w.id FROM warehouses w 
    WHERE w.company_id = invoices.company_id AND w.is_main = TRUE 
    LIMIT 1
  )
WHERE warehouse_id IS NULL;

UPDATE invoices SET 
  created_by_user_id = (
    SELECT cm.user_id FROM company_members cm 
    WHERE cm.company_id = invoices.company_id AND cm.role = 'owner' 
    LIMIT 1
  )
WHERE created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE invoices ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 4️⃣ FIX BILLS - Ensure governance fields
-- =====================================

-- Add created_by_user_id if missing
ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);

-- Backfill missing governance fields
UPDATE bills SET 
  branch_id = (
    SELECT b.id FROM branches b 
    WHERE b.company_id = bills.company_id AND b.is_main = TRUE 
    LIMIT 1
  )
WHERE branch_id IS NULL;

UPDATE bills SET 
  cost_center_id = (
    SELECT cc.id FROM cost_centers cc 
    WHERE cc.branch_id = bills.branch_id 
    LIMIT 1
  )
WHERE cost_center_id IS NULL;

UPDATE bills SET 
  warehouse_id = (
    SELECT w.id FROM warehouses w 
    WHERE w.company_id = bills.company_id AND w.is_main = TRUE 
    LIMIT 1
  )
WHERE warehouse_id IS NULL;

UPDATE bills SET 
  created_by_user_id = (
    SELECT cm.user_id FROM company_members cm 
    WHERE cm.company_id = bills.company_id AND cm.role = 'owner' 
    LIMIT 1
  )
WHERE created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE bills ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 5️⃣ FIX SALES ORDERS - Ensure governance fields
-- =====================================

-- Add missing columns to sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill sales_orders
UPDATE sales_orders SET 
  branch_id = (SELECT b.id FROM branches b WHERE b.company_id = sales_orders.company_id AND b.is_main = TRUE LIMIT 1),
  cost_center_id = (SELECT cc.id FROM cost_centers cc JOIN branches b ON cc.branch_id = b.id WHERE b.company_id = sales_orders.company_id LIMIT 1),
  warehouse_id = (SELECT w.id FROM warehouses w WHERE w.company_id = sales_orders.company_id AND w.is_main = TRUE LIMIT 1),
  created_by_user_id = (SELECT cm.user_id FROM company_members cm WHERE cm.company_id = sales_orders.company_id AND cm.role = 'owner' LIMIT 1)
WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL OR created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE sales_orders ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE sales_orders ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE sales_orders ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE sales_orders ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 6️⃣ FIX PURCHASE ORDERS - Ensure governance fields
-- =====================================

-- Add missing columns to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill purchase_orders
UPDATE purchase_orders SET 
  branch_id = (SELECT b.id FROM branches b WHERE b.company_id = purchase_orders.company_id AND b.is_main = TRUE LIMIT 1),
  cost_center_id = (SELECT cc.id FROM cost_centers cc JOIN branches b ON cc.branch_id = b.id WHERE b.company_id = purchase_orders.company_id LIMIT 1),
  warehouse_id = (SELECT w.id FROM warehouses w WHERE w.company_id = purchase_orders.company_id AND w.is_main = TRUE LIMIT 1),
  created_by_user_id = (SELECT cm.user_id FROM company_members cm WHERE cm.company_id = purchase_orders.company_id AND cm.role = 'owner' LIMIT 1)
WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL OR created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE purchase_orders ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 7️⃣ FIX CUSTOMERS - Add governance fields
-- =====================================

-- Add missing columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

-- Backfill customers
UPDATE customers SET 
  branch_id = (SELECT b.id FROM branches b WHERE b.company_id = customers.company_id AND b.is_main = TRUE LIMIT 1),
  cost_center_id = (SELECT cc.id FROM cost_centers cc JOIN branches b ON cc.branch_id = b.id WHERE b.company_id = customers.company_id LIMIT 1),
  created_by_user_id = (SELECT cm.user_id FROM company_members cm WHERE cm.company_id = customers.company_id AND cm.role = 'owner' LIMIT 1)
WHERE branch_id IS NULL OR cost_center_id IS NULL OR created_by_user_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE customers ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN created_by_user_id SET NOT NULL;

-- =====================================
-- 8️⃣ REMOVE NULL GOVERNANCE ESCAPES
-- =====================================

-- This will be handled by application code updates
-- Remove any OR branch_id IS NULL, OR cost_center_id IS NULL, OR warehouse_id IS NULL
-- from all queries and filters

-- =====================================
-- 9️⃣ DATABASE LEVEL GOVERNANCE TRIGGERS
-- =====================================

-- Trigger function to enforce governance on INSERT
CREATE OR REPLACE FUNCTION enforce_governance_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
  v_old_receipt_status TEXT;
  v_is_closed BOOLEAN;
  v_content_changed BOOLEAN;
  v_creator UUID;
BEGIN
  -- Ensure company_id is not null
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id cannot be NULL - ERP governance violation';
  END IF;
  
  -- Ensure branch_id is not null (if column exists)
  IF TG_TABLE_NAME IN ('invoices', 'bills', 'sales_orders', 'purchase_orders', 'inventory_transactions', 'suppliers', 'customers') THEN
    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_id cannot be NULL for % - ERP governance violation', TG_TABLE_NAME;
    END IF;
  END IF;
  
  -- Ensure cost_center_id is not null (if column exists)
  IF TG_TABLE_NAME IN ('invoices', 'bills', 'sales_orders', 'purchase_orders', 'inventory_transactions', 'suppliers', 'customers') THEN
    IF NEW.cost_center_id IS NULL THEN
      RAISE EXCEPTION 'cost_center_id cannot be NULL for % - ERP governance violation', TG_TABLE_NAME;
    END IF;
  END IF;
  
  -- Ensure warehouse_id is not null for inventory-related tables
  IF TG_TABLE_NAME IN ('invoices', 'bills', 'sales_orders', 'purchase_orders', 'inventory_transactions') THEN
    IF NEW.warehouse_id IS NULL THEN
      RAISE EXCEPTION 'warehouse_id cannot be NULL for % - ERP governance violation', TG_TABLE_NAME;
    END IF;
  END IF;

  -- ===========================================================
  -- 📌 Purchase Bills Mandatory Approval Governance (Backend)
  -- ===========================================================
  IF TG_TABLE_NAME = 'bills' AND TG_OP = 'UPDATE' THEN
    -- حالات الفاتورة قبل وبعد التعديل
    v_old_status := lower(coalesce(OLD.status, ''));
    v_new_status := lower(coalesce(NEW.status, ''));
    v_old_receipt_status := lower(coalesce(OLD.receipt_status, ''));

    -- الحالات المغلقة محاسبيًا
    v_is_closed := v_old_status IN ('paid', 'partially_paid', 'cancelled', 'voided', 'fully_returned');

    -- ✅ تحديد ما إذا كان هناك تعديل "مؤثر" (محاسبيًا / مخزنيًا / حوكمة)
    v_content_changed :=
      OLD.supplier_id        IS DISTINCT FROM NEW.supplier_id        OR
      OLD.bill_date          IS DISTINCT FROM NEW.bill_date          OR
      OLD.due_date           IS DISTINCT FROM NEW.due_date           OR
      OLD.subtotal           IS DISTINCT FROM NEW.subtotal           OR
      OLD.tax_amount         IS DISTINCT FROM NEW.tax_amount         OR
      OLD.total_amount       IS DISTINCT FROM NEW.total_amount       OR
      OLD.discount_type      IS DISTINCT FROM NEW.discount_type      OR
      OLD.discount_value     IS DISTINCT FROM NEW.discount_value     OR
      OLD.discount_position  IS DISTINCT FROM NEW.discount_position  OR
      OLD.tax_inclusive      IS DISTINCT FROM NEW.tax_inclusive      OR
      OLD.shipping           IS DISTINCT FROM NEW.shipping           OR
      OLD.shipping_tax_rate  IS DISTINCT FROM NEW.shipping_tax_rate  OR
      OLD.adjustment         IS DISTINCT FROM NEW.adjustment         OR
      OLD.branch_id          IS DISTINCT FROM NEW.branch_id          OR
      OLD.warehouse_id       IS DISTINCT FROM NEW.warehouse_id       OR
      OLD.cost_center_id     IS DISTINCT FROM NEW.cost_center_id;

    -- ✅ 1) قاعدة: أي تعديل مؤثر على فاتورة في دورة اعتماد (وليست draft/مغلقة)
    IF v_content_changed
       AND NOT v_is_closed
       AND (v_old_status <> 'draft' OR v_old_receipt_status = 'rejected')
    THEN
      -- إعادة دورة الاعتماد بالكامل من البداية
      NEW.status := 'pending_approval';
      NEW.approval_status := 'pending_approval';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.receipt_status := NULL;
      NEW.receipt_rejection_reason := NULL;

      -- تحديد المستخدم الذي يُسجَّل كمنشئ للإشعار (created_by لا يمكن أن يكون NULL)
      v_creator := COALESCE(NEW.created_by_user_id, OLD.created_by_user_id);
      IF v_creator IS NULL THEN
        SELECT cm.user_id
        INTO v_creator
        FROM company_members cm
        WHERE cm.company_id = NEW.company_id
          AND cm.role IN ('owner', 'admin')
        LIMIT 1;
      END IF;
      IF v_creator IS NULL THEN
        RAISE EXCEPTION 'No creator user found for bill % in company % - cannot create governance notifications', NEW.id, NEW.company_id;
      END IF;

      -- إرسال إشعارين للمالك والمدير العام عبر دالة create_notification (idempotent بالـ event_key)
      PERFORM create_notification(
        NEW.company_id,
        'bill',
        NEW.id,
        'فاتورة مشتريات بانتظار الاعتماد الإداري',
        format('تم تعديل فاتورة مشتريات رقم %s وتحتاج إلى إعادة اعتماد إداري.', NEW.bill_number),
        v_creator,
        NEW.branch_id,
        NEW.cost_center_id,
        NEW.warehouse_id,
        'owner',
        NULL,
        'high',
        format('bill:%s:pending_approval_owner_after_edit', NEW.id),
        'warning',
        'approvals'
      );

      PERFORM create_notification(
        NEW.company_id,
        'bill',
        NEW.id,
        'فاتورة مشتريات بانتظار الاعتماد الإداري',
        format('تم تعديل فاتورة مشتريات رقم %s وتحتاج إلى إعادة اعتماد إداري.', NEW.bill_number),
        v_creator,
        NEW.branch_id,
        NEW.cost_center_id,
        NEW.warehouse_id,
        'general_manager',
        NULL,
        'high',
        format('bill:%s:pending_approval_gm_after_edit', NEW.id),
        'warning',
        'approvals'
      );
    END IF;

    -- ✅ 2) قاعدة: أي Void يمسح كل آثار الاعتماد والاستلام
    IF v_new_status = 'voided' AND v_old_status <> 'voided' THEN
      NEW.approval_status := NULL;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.receipt_status := NULL;
      NEW.receipt_rejection_reason := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply governance triggers to all critical tables
DROP TRIGGER IF EXISTS governance_trigger_invoices ON invoices;
CREATE TRIGGER governance_trigger_invoices
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

DROP TRIGGER IF EXISTS governance_trigger_bills ON bills;
CREATE TRIGGER governance_trigger_bills
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

DROP TRIGGER IF EXISTS governance_trigger_sales_orders ON sales_orders;
CREATE TRIGGER governance_trigger_sales_orders
  BEFORE INSERT OR UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

DROP TRIGGER IF EXISTS governance_trigger_purchase_orders ON purchase_orders;
CREATE TRIGGER governance_trigger_purchase_orders
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

DROP TRIGGER IF EXISTS governance_trigger_inventory_transactions ON inventory_transactions;
CREATE TRIGGER governance_trigger_inventory_transactions
  BEFORE INSERT OR UPDATE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

DROP TRIGGER IF EXISTS governance_trigger_suppliers ON suppliers;
CREATE TRIGGER governance_trigger_suppliers
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

DROP TRIGGER IF EXISTS governance_trigger_customers ON customers;
CREATE TRIGGER governance_trigger_customers
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION enforce_governance_on_insert();

-- =====================================
-- 🔟 CREATE INDEXES FOR PERFORMANCE
-- =====================================

CREATE INDEX IF NOT EXISTS idx_suppliers_branch_id ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_cost_center_id ON suppliers(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by_user_id ON suppliers(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_cost_center_id ON customers(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_by_user_id ON customers(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_cost_center_id ON inventory_transactions(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_by_user_id ON inventory_transactions(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_cost_center_id ON invoices(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by_user_id ON invoices(created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_bills_cost_center_id ON bills(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_by_user_id ON bills(created_by_user_id);

-- =====================================
-- ✅ MANDATORY ERP GOVERNANCE FIXES COMPLETED
-- =====================================

-- Verification queries to ensure compliance:
/*
SELECT 'suppliers' as table_name, COUNT(*) as total, 
       COUNT(branch_id) as with_branch, COUNT(cost_center_id) as with_cost_center
FROM suppliers
UNION ALL
SELECT 'customers', COUNT(*), COUNT(branch_id), COUNT(cost_center_id) FROM customers
UNION ALL
SELECT 'invoices', COUNT(*), COUNT(branch_id), COUNT(cost_center_id) FROM invoices
UNION ALL
SELECT 'bills', COUNT(*), COUNT(branch_id), COUNT(cost_center_id) FROM bills
UNION ALL
SELECT 'inventory_transactions', COUNT(*), COUNT(branch_id), COUNT(cost_center_id) FROM inventory_transactions;
*/