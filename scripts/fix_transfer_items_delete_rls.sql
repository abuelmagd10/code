-- =====================================================
-- 🔧 إصلاح سياسات RLS لـ inventory_transfer_items
-- =====================================================
-- السماح بحذف وتحديث بنود طلبات النقل للمحاسب المنشئ
-- فقط إذا كان الطلب في حالة draft أو rejected
-- =====================================================

-- ✅ حذف السياسات القديمة إن وجدت
DROP POLICY IF EXISTS transfer_items_delete ON inventory_transfer_items;
DROP POLICY IF EXISTS transfer_items_delete_governance ON inventory_transfer_items;
DROP POLICY IF EXISTS transfer_items_update ON inventory_transfer_items;
DROP POLICY IF EXISTS transfer_items_update_governance ON inventory_transfer_items;

-- ✅ سياسة DELETE لبنود طلبات النقل
-- السماح بالحذف فقط:
-- 1. إذا كان المستخدم هو منشئ الطلب
-- 2. إذا كان الطلب في حالة draft أو rejected
-- 3. أو إذا كان المستخدم owner/admin
CREATE POLICY transfer_items_delete_governance ON inventory_transfer_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM inventory_transfers t
      JOIN company_members cm ON cm.company_id = t.company_id AND cm.user_id = auth.uid()
      WHERE t.id = inventory_transfer_items.transfer_id
        AND (
          -- المنشئ يمكنه الحذف إذا كان الطلب draft أو rejected
          (t.created_by = auth.uid() AND t.status IN ('draft', 'rejected'))
          OR
          -- Owner/Admin يمكنهم الحذف دائماً
          cm.role IN ('owner', 'admin')
        )
    )
  );

-- ✅ سياسة UPDATE لبنود طلبات النقل
CREATE POLICY transfer_items_update_governance ON inventory_transfer_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM inventory_transfers t
      JOIN company_members cm ON cm.company_id = t.company_id AND cm.user_id = auth.uid()
      WHERE t.id = inventory_transfer_items.transfer_id
        AND (
          -- المنشئ يمكنه التحديث إذا كان الطلب draft أو rejected
          (t.created_by = auth.uid() AND t.status IN ('draft', 'rejected'))
          OR
          -- Owner/Admin يمكنهم التحديث دائماً
          cm.role IN ('owner', 'admin')
          OR
          -- مسؤول المخزن يمكنه تحديث الكميات المستلمة
          (cm.role IN ('warehouse_manager', 'store_manager') AND t.status IN ('in_transit', 'pending'))
        )
    )
  );

-- ✅ التحقق من وجود سياسة INSERT
DROP POLICY IF EXISTS transfer_items_insert ON inventory_transfer_items;
DROP POLICY IF EXISTS transfer_items_insert_governance ON inventory_transfer_items;

CREATE POLICY transfer_items_insert_governance ON inventory_transfer_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_transfers t
      JOIN company_members cm ON cm.company_id = t.company_id AND cm.user_id = auth.uid()
      WHERE t.id = inventory_transfer_items.transfer_id
        AND (
          -- المنشئ يمكنه الإضافة إذا كان الطلب draft أو rejected أو pending_approval
          (t.created_by = auth.uid() AND t.status IN ('draft', 'rejected', 'pending_approval'))
          OR
          -- Owner/Admin يمكنهم الإضافة دائماً
          cm.role IN ('owner', 'admin')
        )
    )
  );

-- ✅ التحقق من وجود سياسة SELECT
DROP POLICY IF EXISTS transfer_items_select ON inventory_transfer_items;
DROP POLICY IF EXISTS transfer_items_select_governance ON inventory_transfer_items;

CREATE POLICY transfer_items_select_governance ON inventory_transfer_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inventory_transfers t
      JOIN company_members cm ON cm.company_id = t.company_id AND cm.user_id = auth.uid()
      WHERE t.id = inventory_transfer_items.transfer_id
    )
  );

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم إضافة سياسات RLS لبنود طلبات النقل بنجاح!' AS status;

