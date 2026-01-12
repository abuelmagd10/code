-- Migration: Add default warehouse and cost center columns to branches table
-- Created: 2025-01-12
-- Purpose: Add enterprise-grade branch defaults for proper ERP governance

-- Add default warehouse and cost center columns to branches table
ALTER TABLE branches 
ADD COLUMN default_warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
ADD COLUMN default_cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_branches_default_warehouse ON branches(default_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_branches_default_cost_center ON branches(default_cost_center_id);

-- Add comment for documentation
COMMENT ON COLUMN branches.default_warehouse_id IS 'Default warehouse for this branch - used for sales orders and inventory movements';
COMMENT ON COLUMN branches.default_cost_center_id IS 'Default cost center for this branch - used for accounting entries and financial reporting';