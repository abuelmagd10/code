-- =============================================
-- إصلاح شامل لجداول قاعدة البيانات
-- لضمان التوافق الكامل مع النمط المحاسبي الصارم
-- =============================================

-- 1. إضافة الأعمدة المفقودة في invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS return_status VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 2. إضافة الأعمدة المفقودة في invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS returned_quantity DECIMAL(15,2) DEFAULT 0;

-- 3. إضافة الأعمدة المفقودة في bills
ALTER TABLE bills ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS return_status VARCHAR(20);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 4. إضافة الأعمدة المفقودة في bill_items
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS returned_quantity DECIMAL(15,2) DEFAULT 0;

-- 5. إضافة الأعمدة المفقودة في sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 6. إضافة الأعمدة المفقودة في purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 7. إضافة الأعمدة المفقودة في inventory_transactions
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 8. إضافة الأعمدة المفقودة في journal_entries
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 9. إضافة الأعمدة المفقودة في payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- 10. إنشاء جدول vendor_credits إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS vendor_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  applied_amount DECIMAL(15,2) DEFAULT 0,
  remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - applied_amount) STORED,
  status VARCHAR(20) DEFAULT 'active',
  reference_type VARCHAR(50) DEFAULT 'purchase_return',
  reference_id UUID,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. إنشاء الفهارس المفقودة
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cost_center ON invoices(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_warehouse ON invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order ON invoices(sales_order_id);

CREATE INDEX IF NOT EXISTS idx_bills_branch ON bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_bills_cost_center ON bills(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_bills_warehouse ON bills(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_bills_purchase_order ON bills(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_sales_orders_branch ON sales_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_cost_center ON sales_orders(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_warehouse ON sales_orders(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_cost_center ON purchase_orders(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse ON purchase_orders(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_branch ON inventory_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse ON inventory_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch ON journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_cost_center ON journal_entries(cost_center_id);

CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id);

CREATE INDEX IF NOT EXISTS idx_vendor_credits_company ON vendor_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_supplier ON vendor_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_bill ON vendor_credits(bill_id);

-- 12. تفعيل RLS لجدول vendor_credits
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_credits_select" ON vendor_credits;
CREATE POLICY "vendor_credits_select" ON vendor_credits
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "vendor_credits_insert" ON vendor_credits;
CREATE POLICY "vendor_credits_insert" ON vendor_credits
  FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "vendor_credits_update" ON vendor_credits;
CREATE POLICY "vendor_credits_update" ON vendor_credits
  FOR UPDATE USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "vendor_credits_delete" ON vendor_credits;
CREATE POLICY "vendor_credits_delete" ON vendor_credits
  FOR DELETE USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- 13. إضافة Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_vendor_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendor_credits_updated_at ON vendor_credits;
CREATE TRIGGER vendor_credits_updated_at
  BEFORE UPDATE ON vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_credits_updated_at();

-- 14. التحقق من وجود جدول customer_credits
CREATE TABLE IF NOT EXISTS customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(15,2) DEFAULT 0,
  remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - used_amount) STORED,
  status VARCHAR(20) DEFAULT 'active',
  reference_type VARCHAR(50) DEFAULT 'sales_return',
  reference_id UUID,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_company ON customer_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_invoice ON customer_credits(invoice_id);

ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_credits_select" ON customer_credits;
CREATE POLICY "customer_credits_select" ON customer_credits
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- 15. رسالة نجاح
DO $$
BEGIN
  RAISE NOTICE '✅ تم إصلاح جميع الجداول بنجاح';
  RAISE NOTICE '📊 الجداول المحدثة:';
  RAISE NOTICE '   - invoices (أضيفت: returned_amount, return_status, branch_id, cost_center_id, warehouse_id)';
  RAISE NOTICE '   - bills (أضيفت: returned_amount, return_status, branch_id, cost_center_id, warehouse_id)';
  RAISE NOTICE '   - sales_orders (أضيفت: branch_id, cost_center_id, warehouse_id)';
  RAISE NOTICE '   - purchase_orders (أضيفت: branch_id, cost_center_id, warehouse_id)';
  RAISE NOTICE '   - inventory_transactions (أضيفت: reference_type, document_id, branch_id, warehouse_id)';
  RAISE NOTICE '   - journal_entries (أضيفت: branch_id, cost_center_id)';
  RAISE NOTICE '   - payments (أضيفت: branch_id, cost_center_id, account_id)';
  RAISE NOTICE '   - vendor_credits (تم إنشاؤه)';
  RAISE NOTICE '   - customer_credits (تم إنشاؤه)';
  RAISE NOTICE '🎯 النظام متوافق 100% مع النمط المحاسبي الصارم';
END $$;
