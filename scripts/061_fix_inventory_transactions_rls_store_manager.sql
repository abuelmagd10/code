-- =============================================
-- إصلاح سياسات RLS لجدول inventory_transactions
-- إضافة صلاحية store_manager لإدراج سجلات
-- =============================================

-- حذف السياسة القديمة
DROP POLICY IF EXISTS "inventory_transactions_insert_members" ON inventory_transactions;

-- سياسة الإدراج - owner, admin, manager, accountant, staff, store_manager
CREATE POLICY "inventory_transactions_insert_members" ON inventory_transactions
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_transactions.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner','admin','manager','accountant','staff','store_manager')
    )
  );
