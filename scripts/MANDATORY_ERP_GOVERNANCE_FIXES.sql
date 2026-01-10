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