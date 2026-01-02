-- =============================================
-- إصلاح سياسات RLS لجدول inventory_transactions
-- =============================================

-- حذف جميع السياسات القديمة
DROP POLICY IF EXISTS "inventory_transactions_access" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_insert" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_update" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_delete" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_select_members" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_insert_members" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_update_members" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_delete_members" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_select" ON inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_select_policy" ON inventory_transactions;

-- سياسة القراءة - جميع أعضاء الشركة
CREATE POLICY "inventory_transactions_select_members" ON inventory_transactions
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_transactions.company_id
      AND cm.user_id = auth.uid()
    )
  );

-- سياسة الإدراج - owner, admin, manager, accountant, staff
CREATE POLICY "inventory_transactions_insert_members" ON inventory_transactions
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_transactions.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner','admin','manager','accountant','staff')
    )
  );

-- سياسة التحديث - owner, admin, manager, accountant
CREATE POLICY "inventory_transactions_update_members" ON inventory_transactions
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_transactions.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner','admin','manager','accountant')
    )
  );

-- سياسة الحذف - owner, admin, manager فقط
CREATE POLICY "inventory_transactions_delete_members" ON inventory_transactions
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_transactions.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner','admin','manager')
    )
  );

