-- =====================================================
-- إصلاح سياسة RLS لحذف الفواتير
-- السماح للمحاسبين بحذف الفواتير المسودة فقط
-- =====================================================

-- ⚠️ حذف جميع السياسات القديمة لتجنب تضارب OR logic
DROP POLICY IF EXISTS invoices_delete ON invoices;
DROP POLICY IF EXISTS invoices_delete_members ON invoices;

-- ✅ إنشاء سياسة واحدة موحدة مع قيود الحالة
-- النمط المحاسبي الصارم: فقط الفواتير المسودة يمكن حذفها
CREATE POLICY invoices_delete_unified ON invoices FOR DELETE
  USING (
    -- يجب أن تكون الفاتورة في حالة مسودة
    invoices.status = 'draft'
    AND
    -- يجب أن يكون المستخدم عضو في الشركة بأحد الأدوار المسموحة
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = invoices.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner','admin','manager','accountant','staff')
    )
  );

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم تحديث سياسة RLS لحذف الفواتير - فقط الفواتير المسودة يمكن حذفها (النمط المحاسبي الصارم)' AS status;

