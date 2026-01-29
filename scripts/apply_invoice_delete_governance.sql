-- =====================================================
-- تطبيق قاعدة الحوكمة لحذف الفواتير
-- قاعدة الحوكمة: فقط مدير الفرع، المالك، والمدير العام يمكنهم حذف الفواتير المسودة
-- =====================================================

-- ⚠️ حذف جميع السياسات القديمة لتجنب تضارب OR logic
DROP POLICY IF EXISTS invoices_delete ON invoices;
DROP POLICY IF EXISTS invoices_delete_members ON invoices;
DROP POLICY IF EXISTS invoices_delete_unified ON invoices;
DROP POLICY IF EXISTS invoices_delete_governance ON invoices;

-- ✅ إنشاء سياسة جديدة مع قيود الحوكمة الصارمة
-- النمط المحاسبي الصارم: فقط الفواتير المسودة يمكن حذفها
-- قيود الصلاحيات: فقط مدير الفرع، المالك، والمدير العام
CREATE POLICY invoices_delete_governance ON invoices FOR DELETE
  USING (
    -- يجب أن تكون الفاتورة في حالة مسودة
    invoices.status = 'draft'
    AND
    -- يجب أن يكون المستخدم أحد الأدوار المصرح لها بالحذف
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = invoices.company_id
      AND cm.user_id = auth.uid()
      AND (
        -- المالك والمدير العام يمكنهم حذف أي فاتورة مسودة
        cm.role IN ('owner', 'general_manager')
        OR
        -- مدير الفرع يمكنه حذف فواتير فرعه فقط
        (cm.role = 'manager' AND cm.branch_id = invoices.branch_id)
      )
    )
  );

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم تطبيق قاعدة الحوكمة لحذف الفواتير - مدير الفرع، المالك، والمدير العام فقط' AS status;

