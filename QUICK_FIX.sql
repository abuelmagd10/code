-- إصلاح فوري لجداول قاعدة البيانات
-- تشغيل هذا السكريبت في Supabase SQL Editor

-- 1. إضافة الأعمدة المفقودة
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS return_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS cost_center_id UUID,
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS return_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS cost_center_id UUID,
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS returned_quantity DECIMAL(15,2) DEFAULT 0;
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS returned_quantity DECIMAL(15,2) DEFAULT 0;

ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS cost_center_id UUID,
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS cost_center_id UUID,
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

ALTER TABLE inventory_transactions 
ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

ALTER TABLE journal_entries 
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS cost_center_id UUID;

ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS branch_id UUID,
ADD COLUMN IF NOT EXISTS account_id UUID;

-- 2. إنشاء الجداول المفقودة
CREATE TABLE IF NOT EXISTS vendor_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  bill_id UUID,
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) DEFAULT 0,
  applied_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  invoice_id UUID,
  credit_number VARCHAR(50) NOT NULL,
  credit_date DATE DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) DEFAULT 0,
  used_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. إنشاء الفهارس الأساسية
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_warehouse ON invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_bills_branch ON bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_bills_warehouse ON bills(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_branch ON sales_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_branch ON inventory_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_company ON vendor_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_supplier ON vendor_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_company ON customer_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);

-- 4. تفعيل RLS
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;

-- 5. سياسات RLS أساسية
CREATE POLICY IF NOT EXISTS "vendor_credits_company_access" ON vendor_credits
  FOR ALL USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "customer_credits_company_access" ON customer_credits
  FOR ALL USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- رسالة نجاح
SELECT 'تم تطبيق جميع الإصلاحات بنجاح ✅' as result;