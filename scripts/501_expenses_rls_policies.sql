-- =============================================
-- RLS Policies for Expenses (المصروفات)
-- =============================================

-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
-- Owner/Admin: see all expenses in company
-- Manager/Accountant/Staff: see only their branch expenses
-- Viewer: see only their branch expenses (read-only)
CREATE POLICY expenses_select ON expenses
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND (
      -- Owner: see everything
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin: see everything in company
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
      )
      OR
      -- Manager/Accountant/Staff: see only their branch
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('manager', 'accountant', 'staff')
        AND (
          expenses.branch_id = cm.branch_id
          OR expenses.branch_id IS NULL
        )
      )
      OR
      -- Other roles: see only their branch (read-only)
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND (
          expenses.branch_id = cm.branch_id
          OR expenses.branch_id IS NULL
        )
      )
    )
  );

-- INSERT Policy
-- Only: Admin, Manager, Accountant, Staff, Owner
CREATE POLICY expenses_insert ON expenses
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
    AND (
      -- Owner
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin, Manager, Accountant, Staff
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'manager', 'accountant', 'staff')
      )
    )
  );

-- UPDATE Policy
-- Can update only if:
-- - Expense is in draft or rejected status
-- - User is creator or Owner/Admin
CREATE POLICY expenses_update ON expenses
  FOR UPDATE USING (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND (
      -- Owner: can update anything
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin: can update anything
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
      )
      OR
      -- Creator: can update only if draft or rejected
      (
        created_by = auth.uid()
        AND status IN ('draft', 'rejected')
      )
    )
  ) WITH CHECK (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

-- DELETE Policy
-- Can delete only if:
-- - Expense is in draft or rejected status
-- - User is creator or Owner/Admin
CREATE POLICY expenses_delete ON expenses
  FOR DELETE USING (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND status IN ('draft', 'rejected')
    AND (
      -- Owner
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
      )
      OR
      -- Creator
      created_by = auth.uid()
    )
  );
