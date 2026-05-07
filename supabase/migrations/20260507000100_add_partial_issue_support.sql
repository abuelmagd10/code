-- Migration: Add partial issue support columns
-- Date: 2026-05-07

-- Add line-level approval tracking to production_order_material_requirements
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_quantity numeric DEFAULT 0;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS issued_quantity numeric DEFAULT 0;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS shortage_quantity numeric DEFAULT 0;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS line_issue_status text DEFAULT 'pending';
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS warehouse_approval_notes text;

-- Add issue_type and notes to manufacturing_material_issue_approvals
ALTER TABLE manufacturing_material_issue_approvals ADD COLUMN IF NOT EXISTS issue_type text DEFAULT 'full';
ALTER TABLE manufacturing_material_issue_approvals ADD COLUMN IF NOT EXISTS warehouse_approval_notes text;
