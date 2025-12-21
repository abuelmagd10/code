-- =============================================
-- تحسينات الأداء - فهارس إضافية
-- Performance Improvements - Additional Indexes
-- =============================================

-- فهارس للفواتير
CREATE INDEX IF NOT EXISTS idx_invoices_company_branch_date ON invoices(company_id, branch_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status_date ON invoices(status, invoice_date) WHERE status IN ('sent', 'paid', 'partially_paid');
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON invoices(customer_id, status);

-- فهارس لفواتير الشراء
CREATE INDEX IF NOT EXISTS idx_bills_company_branch_date ON bills(company_id, branch_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_status_date ON bills(status, bill_date) WHERE status IN ('received', 'paid', 'partially_paid');
CREATE INDEX IF NOT EXISTS idx_bills_supplier_status ON bills(supplier_id, status);

-- فهارس للقيود المحاسبية
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_branch_date ON journal_entries(company_id, branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_date ON journal_entry_lines(account_id, journal_entries.entry_date);

-- فهارس لحركات المخزون
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_warehouse ON inventory_transactions(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date_type ON inventory_transactions(transaction_date, transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);

-- فهارس للمدفوعات
CREATE INDEX IF NOT EXISTS idx_payments_company_branch_date ON payments(company_id, branch_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments(bill_id) WHERE bill_id IS NOT NULL;

-- فهارس للعملاء والموردين
CREATE INDEX IF NOT EXISTS idx_customers_company_branch ON customers(company_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_branch ON suppliers(company_id, branch_id);

-- فهارس للمنتجات
CREATE INDEX IF NOT EXISTS idx_products_company_type ON products(company_id, item_type);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- فهارس لسجل التدقيق
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_date ON audit_logs(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- فهارس للأعضاء
CREATE INDEX IF NOT EXISTS idx_company_members_branch_role ON company_members(branch_id, role);
CREATE INDEX IF NOT EXISTS idx_company_members_cost_center ON company_members(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_company_members_warehouse ON company_members(warehouse_id);

-- فهارس للفروع ومراكز التكلفة
CREATE INDEX IF NOT EXISTS idx_branches_company_active ON branches(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cost_centers_branch_active ON cost_centers(branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_warehouses_branch_active ON warehouses(branch_id, is_active);

-- فهارس للحسابات البنكية
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_branch ON bank_accounts(company_id, branch_id);

-- فهارس للشجرة المحاسبية
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_type ON chart_of_accounts(company_id, account_type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON chart_of_accounts(parent_id) WHERE parent_id IS NOT NULL;

-- إحصائيات الجداول لتحسين Query Planner
ANALYZE invoices;
ANALYZE bills;
ANALYZE journal_entries;
ANALYZE journal_entry_lines;
ANALYZE inventory_transactions;
ANALYZE payments;
ANALYZE customers;
ANALYZE suppliers;
ANALYZE products;
ANALYZE audit_logs;
ANALYZE company_members;

-- =============================================
-- Views محسنة للتقارير
-- =============================================

-- View للفواتير مع معلومات الفرع
CREATE OR REPLACE VIEW v_invoices_with_branch AS
SELECT 
  i.*,
  b.name as branch_name,
  b.code as branch_code,
  cc.name as cost_center_name,
  cc.code as cost_center_code,
  w.name as warehouse_name,
  w.code as warehouse_code,
  c.name as customer_name
FROM invoices i
LEFT JOIN branches b ON i.branch_id = b.id
LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
LEFT JOIN warehouses w ON i.warehouse_id = w.id
LEFT JOIN customers c ON i.customer_id = c.id;

-- View للمخزون الحالي
CREATE OR REPLACE VIEW v_current_inventory AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.cost_price,
  p.unit_price,
  p.reorder_level,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  b.name as branch_name,
  COALESCE(SUM(
    CASE 
      WHEN it.transaction_type IN ('purchase', 'return', 'adjustment_in') THEN it.quantity
      WHEN it.transaction_type IN ('sale', 'write_off', 'adjustment_out') THEN -it.quantity
      ELSE 0
    END
  ), 0) as current_quantity
FROM products p
CROSS JOIN warehouses w
LEFT JOIN inventory_transactions it ON p.id = it.product_id AND w.id = it.warehouse_id
LEFT JOIN branches b ON w.branch_id = b.id
WHERE p.item_type = 'product' OR p.item_type IS NULL
GROUP BY p.id, p.name, p.sku, p.cost_price, p.unit_price, p.reorder_level, 
         w.id, w.name, w.branch_id, b.name;

-- View للذمم المدينة
CREATE OR REPLACE VIEW v_accounts_receivable AS
SELECT 
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.total_amount,
  i.paid_amount,
  (i.total_amount - COALESCE(i.paid_amount, 0)) as outstanding_amount,
  c.id as customer_id,
  c.name as customer_name,
  b.name as branch_name,
  cc.name as cost_center_name,
  CASE 
    WHEN i.due_date < CURRENT_DATE THEN 'overdue'
    WHEN i.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
    ELSE 'current'
  END as aging_status
FROM invoices i
JOIN customers c ON i.customer_id = c.id
LEFT JOIN branches b ON i.branch_id = b.id
LEFT JOIN cost_centers cc ON i.cost_center_id = cc.id
WHERE i.status IN ('sent', 'partially_paid')
  AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0;

-- منح الصلاحيات للـ Views
GRANT SELECT ON v_invoices_with_branch TO authenticated;
GRANT SELECT ON v_current_inventory TO authenticated;
GRANT SELECT ON v_accounts_receivable TO authenticated;

-- =============================================
-- تحسين RLS Policies
-- =============================================

-- تحسين policy للفواتير
DROP POLICY IF EXISTS invoices_select_policy ON invoices;
CREATE POLICY invoices_select_policy ON invoices FOR SELECT
USING (
  company_id IN (
    SELECT cm.company_id 
    FROM company_members cm 
    WHERE cm.user_id = auth.uid()
    AND (
      cm.role IN ('owner', 'admin') 
      OR cm.branch_id = invoices.branch_id
    )
  )
);

-- تحسين policy للمخزون
DROP POLICY IF EXISTS inventory_transactions_select_policy ON inventory_transactions;
CREATE POLICY inventory_transactions_select_policy ON inventory_transactions FOR SELECT
USING (
  company_id IN (
    SELECT cm.company_id 
    FROM company_members cm 
    WHERE cm.user_id = auth.uid()
    AND (
      cm.role IN ('owner', 'admin', 'store_manager')
      OR cm.warehouse_id = inventory_transactions.warehouse_id
    )
  )
);

-- =============================================
-- دوال محسنة للاستعلامات الشائعة
-- =============================================

-- دالة للحصول على إحصائيات المبيعات بكفاءة
CREATE OR REPLACE FUNCTION get_sales_stats(
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_sales DECIMAL,
  paid_sales DECIMAL,
  unpaid_sales DECIMAL,
  invoice_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(i.total_amount), 0) as total_sales,
    COALESCE(SUM(i.paid_amount), 0) as paid_sales,
    COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0) as unpaid_sales,
    COUNT(*)::INTEGER as invoice_count
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND (p_from_date IS NULL OR i.invoice_date >= p_from_date)
    AND (p_to_date IS NULL OR i.invoice_date <= p_to_date)
    AND (i.is_deleted IS NULL OR i.is_deleted = false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION get_sales_stats TO authenticated;

-- =============================================
-- رسالة نجاح
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم تطبيق تحسينات الأداء بنجاح';
  RAISE NOTICE '📊 تم إنشاء الفهارس الإضافية';
  RAISE NOTICE '🔍 تم إنشاء Views محسنة للتقارير';
  RAISE NOTICE '🔒 تم تحسين RLS Policies';
  RAISE NOTICE '⚡ تم إنشاء دوال محسنة للاستعلامات';
END $$;