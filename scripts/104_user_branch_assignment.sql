-- =============================================
-- Script: 104_user_branch_assignment.sql
-- Purpose: Link users to branches, cost centers, and warehouses
-- =============================================

-- 1. Add branch/cost_center/warehouse to company_invitations
ALTER TABLE company_invitations
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

-- 2. Add branch/cost_center/warehouse to company_members
ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_company_invitations_branch ON company_invitations(branch_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_cost_center ON company_invitations(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_warehouse ON company_invitations(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_company_members_branch ON company_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_company_members_cost_center ON company_members(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_company_members_warehouse ON company_members(warehouse_id);

-- 4. Add constraint to ensure cost_center belongs to branch (if specified)
-- Note: This is a soft check - we'll enforce it in the application layer

-- 5. Add constraint to ensure warehouse belongs to branch (if specified)
-- Note: This is a soft check - we'll enforce it in the application layer

-- 6. Update existing members to have the main branch assigned
-- Get the main branch for each company and assign to members without branch
UPDATE company_members cm
SET branch_id = b.id
FROM branches b
WHERE cm.branch_id IS NULL
  AND b.company_id = cm.company_id
  AND b.is_main = true;

-- 7. Update existing members to have the main cost center assigned
UPDATE company_members cm
SET cost_center_id = cc.id
FROM cost_centers cc
WHERE cm.cost_center_id IS NULL
  AND cm.branch_id IS NOT NULL
  AND cc.branch_id = cm.branch_id
  AND cc.is_main = true;

-- 8. Update existing members to have the main warehouse assigned
UPDATE company_members cm
SET warehouse_id = w.id
FROM warehouses w
WHERE cm.warehouse_id IS NULL
  AND cm.branch_id IS NOT NULL
  AND w.branch_id = cm.branch_id
  AND w.is_main = true;

-- 9. Add comments for documentation
COMMENT ON COLUMN company_invitations.branch_id IS 'The branch the invited user will be assigned to';
COMMENT ON COLUMN company_invitations.cost_center_id IS 'The cost center the invited user will be assigned to';
COMMENT ON COLUMN company_invitations.warehouse_id IS 'The warehouse the invited user will be assigned to';

COMMENT ON COLUMN company_members.branch_id IS 'The branch this member is assigned to (null = all branches)';
COMMENT ON COLUMN company_members.cost_center_id IS 'The cost center this member is assigned to (null = all cost centers in branch)';
COMMENT ON COLUMN company_members.warehouse_id IS 'The warehouse this member is assigned to (null = all warehouses in branch)';

-- 10. Verify the changes
SELECT 
  'company_invitations columns' as check_type,
  COUNT(*) as total,
  COUNT(branch_id) as with_branch,
  COUNT(cost_center_id) as with_cost_center,
  COUNT(warehouse_id) as with_warehouse
FROM company_invitations
UNION ALL
SELECT 
  'company_members columns' as check_type,
  COUNT(*) as total,
  COUNT(branch_id) as with_branch,
  COUNT(cost_center_id) as with_cost_center,
  COUNT(warehouse_id) as with_warehouse
FROM company_members;

