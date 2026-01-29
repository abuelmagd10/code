-- =====================================================
-- إصلاح سياسة RLS لحذف الفواتير
-- السماح للمحاسبين بحذف الفواتير المسودة فقط
-- =====================================================

-- حذف السياسة القديمة
DROP POLICY IF EXISTS invoices_delete_members ON invoices;

-- إنشاء سياسة جديدة ذكية
CREATE POLICY invoices_delete_members ON invoices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = invoices.company_id
      AND cm.user_id = auth.uid()
      AND (
        -- owner, admin, manager يمكنهم حذف أي فاتورة
        cm.role IN ('owner','admin','manager')
        OR
        -- accountant, staff يمكنهم حذف الفواتير المسودة فقط
        (
          cm.role IN ('accountant','staff')
          AND invoices.status = 'draft'
        )
      )
    )
  );

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم تحديث سياسة RLS لحذف الفواتير - المحاسبون يمكنهم الآن حذف الفواتير المسودة' AS status;

