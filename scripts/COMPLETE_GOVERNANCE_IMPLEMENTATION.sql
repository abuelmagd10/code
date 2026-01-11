-- ============================================================================
-- 🔒 COMPLETE ERP GOVERNANCE IMPLEMENTATION
-- ============================================================================
-- This script implements full governance hierarchy:
-- Company → Branch → Cost Center → Warehouse → Created By
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1️⃣ ADD GOVERNANCE COLUMNS TO SALES_ORDERS
-- ============================================================================

DO $$ 
BEGIN
    -- Add branch_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales_orders' AND column_name = 'branch_id') THEN
        ALTER TABLE sales_orders ADD COLUMN branch_id UUID;
        RAISE NOTICE '✅ Added branch_id to sales_orders';
    END IF;

    -- Add cost_center_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales_orders' AND column_name = 'cost_center_id') THEN
        ALTER TABLE sales_orders ADD COLUMN cost_center_id UUID;
        RAISE NOTICE '✅ Added cost_center_id to sales_orders';
    END IF;

    -- Add warehouse_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales_orders' AND column_name = 'warehouse_id') THEN
        ALTER TABLE sales_orders ADD COLUMN warehouse_id UUID;
        RAISE NOTICE '✅ Added warehouse_id to sales_orders';
    END IF;

    -- Ensure created_by_user_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sales_orders' AND column_name = 'created_by_user_id') THEN
        ALTER TABLE sales_orders ADD COLUMN created_by_user_id UUID;
        RAISE NOTICE '✅ Added created_by_user_id to sales_orders';
    END IF;
END $$;

-- ============================================================================
-- 2️⃣ ADD GOVERNANCE COLUMNS TO INVOICES
-- ============================================================================

DO $$ 
BEGIN
    -- Add branch_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'branch_id') THEN
        ALTER TABLE invoices ADD COLUMN branch_id UUID;
        RAISE NOTICE '✅ Added branch_id to invoices';
    END IF;

    -- Add cost_center_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'cost_center_id') THEN
        ALTER TABLE invoices ADD COLUMN cost_center_id UUID;
        RAISE NOTICE '✅ Added cost_center_id to invoices';
    END IF;

    -- Add warehouse_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'warehouse_id') THEN
        ALTER TABLE invoices ADD COLUMN warehouse_id UUID;
        RAISE NOTICE '✅ Added warehouse_id to invoices';
    END IF;

    -- Ensure created_by_user_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoices' AND column_name = 'created_by_user_id') THEN
        ALTER TABLE invoices ADD COLUMN created_by_user_id UUID;
        RAISE NOTICE '✅ Added created_by_user_id to invoices';
    END IF;
END $$;

-- ============================================================================
-- 3️⃣ CREATE DEFAULT BRANCH/COST_CENTER/WAREHOUSE FOR EACH COMPANY
-- ============================================================================

-- Create default branches for companies without branches
INSERT INTO branches (company_id, branch_name, branch_code, is_active)
SELECT 
    c.id,
    'الفرع الرئيسي' as branch_name,
    'MAIN' as branch_code,
    true as is_active
FROM companies c
WHERE NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.company_id = c.id
)
ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ Created default branches';

-- Create default cost centers for branches without cost centers
INSERT INTO cost_centers (company_id, branch_id, cost_center_name, cost_center_code, is_active)
SELECT 
    b.company_id,
    b.id as branch_id,
    'مركز التكلفة الرئيسي' as cost_center_name,
    'CC-MAIN' as cost_center_code,
    true as is_active
FROM branches b
WHERE NOT EXISTS (
    SELECT 1 FROM cost_centers cc WHERE cc.branch_id = b.id
)
ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ Created default cost centers';

-- Create default warehouses for branches without warehouses
INSERT INTO warehouses (company_id, branch_id, warehouse_name, warehouse_code, is_active)
SELECT 
    b.company_id,
    b.id as branch_id,
    'المخزن الرئيسي' as warehouse_name,
    'WH-MAIN' as warehouse_code,
    true as is_active
FROM branches b
WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.branch_id = b.id
)
ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ Created default warehouses';

-- ============================================================================
-- 4️⃣ UPDATE EXISTING SALES_ORDERS WITH GOVERNANCE DATA
-- ============================================================================

-- Update sales_orders from company_members data
WITH member_data AS (
    SELECT DISTINCT ON (cm.user_id, so.company_id)
        so.id as sales_order_id,
        cm.branch_id,
        cm.cost_center_id,
        cm.warehouse_id,
        so.created_by_user_id
    FROM sales_orders so
    LEFT JOIN company_members cm ON cm.user_id = so.created_by_user_id 
        AND cm.company_id = so.company_id
    WHERE so.branch_id IS NULL
)
UPDATE sales_orders so
SET 
    branch_id = COALESCE(md.branch_id, (SELECT id FROM branches WHERE company_id = so.company_id LIMIT 1)),
    cost_center_id = COALESCE(md.cost_center_id, (SELECT id FROM cost_centers WHERE company_id = so.company_id LIMIT 1)),
    warehouse_id = COALESCE(md.warehouse_id, (SELECT id FROM warehouses WHERE company_id = so.company_id LIMIT 1))
FROM member_data md
WHERE so.id = md.sales_order_id;

RAISE NOTICE '✅ Updated sales_orders with governance data';

-- ============================================================================
-- 5️⃣ UPDATE INVOICES FROM LINKED SALES_ORDERS
-- ============================================================================

-- Copy governance data from sales_orders to invoices
UPDATE invoices i
SET 
    branch_id = so.branch_id,
    cost_center_id = so.cost_center_id,
    warehouse_id = so.warehouse_id,
    created_by_user_id = COALESCE(i.created_by_user_id, so.created_by_user_id)
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.branch_id IS NULL;

RAISE NOTICE '✅ Updated invoices from linked sales_orders';

-- ============================================================================
-- 6️⃣ UPDATE DIRECT INVOICES (WITHOUT SALES_ORDERS)
-- ============================================================================

-- Update direct invoices from company_members data
WITH member_data AS (
    SELECT DISTINCT ON (cm.user_id, i.company_id)
        i.id as invoice_id,
        cm.branch_id,
        cm.cost_center_id,
        cm.warehouse_id
    FROM invoices i
    LEFT JOIN company_members cm ON cm.user_id = i.created_by_user_id 
        AND cm.company_id = i.company_id
    WHERE i.branch_id IS NULL
      AND i.sales_order_id IS NULL
)
UPDATE invoices i
SET 
    branch_id = COALESCE(md.branch_id, (SELECT id FROM branches WHERE company_id = i.company_id LIMIT 1)),
    cost_center_id = COALESCE(md.cost_center_id, (SELECT id FROM cost_centers WHERE company_id = i.company_id LIMIT 1)),
    warehouse_id = COALESCE(md.warehouse_id, (SELECT id FROM warehouses WHERE company_id = i.company_id LIMIT 1))
FROM member_data md
WHERE i.id = md.invoice_id;

RAISE NOTICE '✅ Updated direct invoices with governance data';

-- ============================================================================
-- 7️⃣ CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Sales Orders Indexes
CREATE INDEX IF NOT EXISTS idx_sales_orders_branch_id ON sales_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_cost_center_id ON sales_orders(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_warehouse_id ON sales_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_by ON sales_orders(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_branch ON sales_orders(company_id, branch_id);

-- Invoices Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cost_center_id ON invoices(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_warehouse_id ON invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_branch ON invoices(company_id, branch_id);

RAISE NOTICE '✅ Created performance indexes';

-- ============================================================================
-- 8️⃣ ADD FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Sales Orders Foreign Keys
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_orders_branch') THEN
        ALTER TABLE sales_orders 
        ADD CONSTRAINT fk_sales_orders_branch 
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_orders_cost_center') THEN
        ALTER TABLE sales_orders 
        ADD CONSTRAINT fk_sales_orders_cost_center 
        FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_orders_warehouse') THEN
        ALTER TABLE sales_orders 
        ADD CONSTRAINT fk_sales_orders_warehouse 
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Invoices Foreign Keys
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_branch') THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT fk_invoices_branch 
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_cost_center') THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT fk_invoices_cost_center 
        FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_warehouse') THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT fk_invoices_warehouse 
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL;
    END IF;
END $$;

RAISE NOTICE '✅ Added foreign key constraints';

-- ============================================================================
-- 9️⃣ VERIFICATION QUERIES
-- ============================================================================

-- Count records by governance status
DO $$
DECLARE
    so_total INT;
    so_with_branch INT;
    so_with_creator INT;
    inv_total INT;
    inv_with_branch INT;
    inv_with_creator INT;
BEGIN
    SELECT COUNT(*) INTO so_total FROM sales_orders;
    SELECT COUNT(*) INTO so_with_branch FROM sales_orders WHERE branch_id IS NOT NULL;
    SELECT COUNT(*) INTO so_with_creator FROM sales_orders WHERE created_by_user_id IS NOT NULL;
    
    SELECT COUNT(*) INTO inv_total FROM invoices;
    SELECT COUNT(*) INTO inv_with_branch FROM invoices WHERE branch_id IS NOT NULL;
    SELECT COUNT(*) INTO inv_with_creator FROM invoices WHERE created_by_user_id IS NOT NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 GOVERNANCE VERIFICATION RESULTS:';
    RAISE NOTICE '=====================================';
    RAISE NOTICE 'Sales Orders:';
    RAISE NOTICE '  Total: %', so_total;
    RAISE NOTICE '  With Branch: % (%.1f%%)', so_with_branch, (so_with_branch::FLOAT / NULLIF(so_total, 0) * 100);
    RAISE NOTICE '  With Creator: % (%.1f%%)', so_with_creator, (so_with_creator::FLOAT / NULLIF(so_total, 0) * 100);
    RAISE NOTICE '';
    RAISE NOTICE 'Invoices:';
    RAISE NOTICE '  Total: %', inv_total;
    RAISE NOTICE '  With Branch: % (%.1f%%)', inv_with_branch, (inv_with_branch::FLOAT / NULLIF(inv_total, 0) * 100);
    RAISE NOTICE '  With Creator: % (%.1f%%)', inv_with_creator, (inv_with_creator::FLOAT / NULLIF(inv_total, 0) * 100);
END $$;

COMMIT;

-- ============================================================================
-- ✅ GOVERNANCE IMPLEMENTATION COMPLETE
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '✅ Complete ERP Governance Implementation Finished!';
RAISE NOTICE '==================================================';
RAISE NOTICE 'Next Steps:';
RAISE NOTICE '1. Update application code to use governance filters';
RAISE NOTICE '2. Test role-based access (Staff, Accountant, Manager, Admin)';
RAISE NOTICE '3. Verify data visibility for each role';
RAISE NOTICE '4. Deploy to production';
