-- =============================================
-- Fix Expenses UPDATE Policy
-- Allow creators to submit for approval
-- =============================================

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS expenses_update ON expenses;

-- CREATE new UPDATE Policy
-- Can update only if:
-- - Expense is in draft or rejected status
-- - User is creator or Owner/Admin/GM
-- - Creator can submit for approval (change status from draft/rejected to pending_approval)
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
      -- General Manager: can update anything
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('general_manager', 'gm', 'generalmanager')
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
    AND (
      -- Owner/Admin/GM: can set any status
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'general_manager', 'gm', 'generalmanager')
      )
      OR
      -- Creator: can only change to pending_approval, approved, rejected, or keep draft/rejected
      (
        created_by = auth.uid()
        AND status IN ('draft', 'rejected', 'pending_approval', 'approved', 'paid')
      )
    )
  );

