-- =====================================================
-- 📦 WAREHOUSES SYSTEM – Multi-Warehouse Support
-- =====================================================
-- This script creates the warehouses table and updates
-- related tables to support multi-warehouse inventory tracking.
-- Each warehouse is linked to: company, branch, cost_center
-- =====================================================

-- 1️⃣ Create warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    phone VARCHAR(50),
    manager_name VARCHAR(255),
    is_main BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
);

-- 2️⃣ Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_warehouses_company ON warehouses(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_branch ON warehouses(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_cost_center ON warehouses(cost_center_id);

-- 3️⃣ Add warehouse_id to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 4️⃣ Add warehouse_id to bills
ALTER TABLE bills ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 5️⃣ Add warehouse_id to inventory_transactions
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 6️⃣ Add branch_id, cost_center_id, warehouse_id to journal_entries
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 7️⃣ Add branch_id, cost_center_id to journal_entry_lines (for detailed reporting)
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 8️⃣ Add warehouse_id to sales_returns
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 9️⃣ Add warehouse_id to purchase_returns (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_returns') THEN
        EXECUTE 'ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL';
    END IF;
END $$;

-- 🔟 Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_invoices_warehouse ON invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_bills_warehouse ON bills(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse ON inventory_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch ON journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_cost_center ON journal_entries(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_warehouse ON journal_entries(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_warehouse ON sales_returns(warehouse_id);

-- 1️⃣1️⃣ RLS Policies for warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Users can only see warehouses of their company
DROP POLICY IF EXISTS warehouses_select_policy ON warehouses;
CREATE POLICY warehouses_select_policy ON warehouses FOR SELECT USING (
    company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
);

-- Only owner/admin can create warehouses
DROP POLICY IF EXISTS warehouses_insert_policy ON warehouses;
CREATE POLICY warehouses_insert_policy ON warehouses FOR INSERT WITH CHECK (
    company_id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
);

-- Only owner/admin can update warehouses
DROP POLICY IF EXISTS warehouses_update_policy ON warehouses;
CREATE POLICY warehouses_update_policy ON warehouses FOR UPDATE USING (
    company_id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
);

-- Only owner can delete warehouses (but not main warehouse)
DROP POLICY IF EXISTS warehouses_delete_policy ON warehouses;
CREATE POLICY warehouses_delete_policy ON warehouses FOR DELETE USING (
    company_id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() AND role = 'owner'
    )
    AND is_main = FALSE
);

-- 1️⃣2️⃣ Trigger to auto-create main warehouse when company is created
CREATE OR REPLACE FUNCTION create_main_warehouse()
RETURNS TRIGGER AS $$
DECLARE
    main_branch_id UUID;
BEGIN
    -- Get the main branch for this company
    SELECT id INTO main_branch_id FROM branches 
    WHERE company_id = NEW.id AND (is_main = TRUE OR is_head_office = TRUE)
    LIMIT 1;
    
    -- Create main warehouse
    INSERT INTO warehouses (company_id, branch_id, name, code, is_main, is_active)
    VALUES (NEW.id, main_branch_id, 'المخزن الرئيسي', 'MAIN', TRUE, TRUE);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_create_main_warehouse ON companies;

-- Create trigger (runs after company creation)
CREATE TRIGGER trigger_create_main_warehouse
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION create_main_warehouse();

-- 1️⃣3️⃣ Create main warehouses for existing companies that don't have one
INSERT INTO warehouses (company_id, branch_id, name, code, is_main, is_active)
SELECT c.id, b.id, 'المخزن الرئيسي', 'MAIN', TRUE, TRUE
FROM companies c
LEFT JOIN branches b ON b.company_id = c.id AND (b.is_main = TRUE OR b.is_head_office = TRUE)
WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.company_id = c.id AND w.is_main = TRUE
);

-- =====================================================
-- ✅ WAREHOUSES SYSTEM INSTALLED SUCCESSFULLY
-- =====================================================

