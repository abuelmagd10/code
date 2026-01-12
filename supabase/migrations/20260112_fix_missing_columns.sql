-- Fix: Add missing default columns to branches table safely
-- Run this in Supabase SQL Editor

DO $$ 
BEGIN 
    -- 1. Add default_warehouse_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_warehouse_id') THEN
        ALTER TABLE branches ADD COLUMN default_warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added default_warehouse_id column';
    END IF;

    -- 2. Add default_cost_center_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_cost_center_id') THEN
        ALTER TABLE branches ADD COLUMN default_cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added default_cost_center_id column';
    END IF;
END $$;

-- 3. Create indexes (IF NOT EXISTS handles safety automatically)
CREATE INDEX IF NOT EXISTS idx_branches_default_warehouse ON branches(default_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_branches_default_cost_center ON branches(default_cost_center_id);

-- 4. Verify columns exist (Optional: purely for confirmation output)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'branches' 
AND column_name IN ('default_warehouse_id', 'default_cost_center_id');
