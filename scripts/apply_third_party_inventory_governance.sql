-- =====================================================
-- تطبيق قاعدة الحوكمة لصفحة "بضائع لدى الغير"
-- Third Party Inventory Governance Rules
-- =====================================================
-- 
-- 🎯 قاعدة الصلاحيات (Data Visibility Rules):
-- 
-- 👑 Owner / Admin / General Manager:
--    ✅ يرون جميع البضائع في جميع الفروع
-- 
-- 🏢 Branch Manager / Accountant:
--    ✅ يرون البضائع التابعة لفرعهم فقط
--    ❌ لا يرون بيانات فروع أخرى
-- 
-- 👨‍💼 Staff:
--    ✅ يرون فقط البضائع الناتجة عن أوامر البيع التي أنشأوها
--    ❌ لا يرون بضائع أنشأها مستخدمون آخرون
-- 
-- الربط: Sales Order → Invoice → Third Party Inventory
-- =====================================================

-- ⚠️ حذف السياسات القديمة
DROP POLICY IF EXISTS "third_party_inventory_select" ON third_party_inventory;
DROP POLICY IF EXISTS "third_party_inventory_select_governance" ON third_party_inventory;

-- ✅ إنشاء سياسة جديدة مع قيود الحوكمة الصارمة
CREATE POLICY "third_party_inventory_select_governance" ON third_party_inventory
  FOR SELECT USING (
    -- يجب أن يكون المستخدم عضواً في الشركة
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = third_party_inventory.company_id
      AND cm.user_id = auth.uid()
      AND (
        -- 👑 Owner / Admin / General Manager: يرون كل شيء
        cm.role IN ('owner', 'admin', 'general_manager')
        OR
        -- 🏢 Branch Manager / Accountant: يرون فرعهم فقط
        (
          cm.role IN ('manager', 'accountant')
          AND cm.branch_id = third_party_inventory.branch_id
        )
        OR
        -- 👨‍💼 Staff: يرون فقط البضائع من أوامر البيع التي أنشأوها
        (
          cm.role IN ('staff', 'sales', 'employee')
          AND EXISTS (
            -- الربط: third_party_inventory → invoice → sales_order → created_by
            SELECT 1 FROM invoices inv
            INNER JOIN sales_orders so ON inv.sales_order_id = so.id
            WHERE inv.id = third_party_inventory.invoice_id
            AND so.created_by_user_id = auth.uid()
          )
        )
      )
    )
  );

-- ✅ سياسة الإدراج - نفس القاعدة (فقط المصرح لهم)
DROP POLICY IF EXISTS "third_party_inventory_insert" ON third_party_inventory;
DROP POLICY IF EXISTS "third_party_inventory_insert_governance" ON third_party_inventory;

CREATE POLICY "third_party_inventory_insert_governance" ON third_party_inventory
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = third_party_inventory.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'general_manager', 'manager', 'accountant', 'staff', 'sales', 'store_manager')
    )
  );

-- ✅ سياسة التحديث - نفس قاعدة القراءة
DROP POLICY IF EXISTS "third_party_inventory_update" ON third_party_inventory;
DROP POLICY IF EXISTS "third_party_inventory_update_governance" ON third_party_inventory;

CREATE POLICY "third_party_inventory_update_governance" ON third_party_inventory
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = third_party_inventory.company_id
      AND cm.user_id = auth.uid()
      AND (
        -- 👑 Owner / Admin / General Manager: يمكنهم تحديث كل شيء
        cm.role IN ('owner', 'admin', 'general_manager')
        OR
        -- 🏢 Branch Manager / Accountant: يمكنهم تحديث فرعهم فقط
        (
          cm.role IN ('manager', 'accountant', 'store_manager')
          AND cm.branch_id = third_party_inventory.branch_id
        )
      )
    )
  );

-- ✅ سياسة الحذف - فقط Owner / Admin / General Manager
DROP POLICY IF EXISTS "third_party_inventory_delete" ON third_party_inventory;
DROP POLICY IF EXISTS "third_party_inventory_delete_governance" ON third_party_inventory;

CREATE POLICY "third_party_inventory_delete_governance" ON third_party_inventory
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = third_party_inventory.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'general_manager')
    )
  );

-- ✅ إنشاء فهرس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_third_party_inventory_branch_id ON third_party_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order_id ON invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_created_by ON sales_orders(created_by_user_id);

-- ✅ تم الإصلاح بنجاح
SELECT '✅ تم تطبيق قاعدة الحوكمة لصفحة "بضائع لدى الغير" - Owner/GM: كل شيء | Manager/Accountant: فرعهم | Staff: ما أنشأوه' AS status;

