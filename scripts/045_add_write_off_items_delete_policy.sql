-- =====================================================
-- 🔧 إضافة سياسة DELETE لـ inventory_write_off_items
-- =====================================================
-- هذا الـ script يضيف سياسة RLS للسماح بحذف عناصر الإهلاك
-- فقط قبل الاعتماد (status = 'pending')
-- =====================================================

-- ✅ إضافة سياسة DELETE لعناصر الإهلاك
-- السماح بالحذف فقط:
-- 1. إذا كان المستخدم عضو في الشركة
-- 2. إذا كان الإهلاك في حالة pending (قبل الاعتماد)
DROP POLICY IF EXISTS write_off_items_delete ON inventory_write_off_items;

CREATE POLICY write_off_items_delete ON inventory_write_off_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM inventory_write_offs wo
      JOIN company_members cm ON cm.company_id = wo.company_id
      WHERE wo.id = inventory_write_off_items.write_off_id
        AND cm.user_id = auth.uid()
        AND wo.status = 'pending'  -- ✅ السماح بالحذف فقط قبل الاعتماد
    )
  );

-- ✅ إضافة سياسة UPDATE لعناصر الإهلاك (إن لم تكن موجودة)
DROP POLICY IF EXISTS write_off_items_update ON inventory_write_off_items;

CREATE POLICY write_off_items_update ON inventory_write_off_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM inventory_write_offs wo
      JOIN company_members cm ON cm.company_id = wo.company_id
      WHERE wo.id = inventory_write_off_items.write_off_id
        AND cm.user_id = auth.uid()
        AND wo.status = 'pending'  -- ✅ السماح بالتحديث فقط قبل الاعتماد
    )
  );

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم إضافة سياسات DELETE و UPDATE لعناصر الإهلاك بنجاح!' AS status;
