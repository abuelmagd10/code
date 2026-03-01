-- =====================================================
-- 📌 نظام بضائع لدى الغير (Goods with Third Party)
-- =====================================================
-- هذا الجدول يتتبع البضائع المرسلة لشركات الشحن قبل تسليمها للعميل

-- ===== 1) جدول بضائع لدى الغير =====
CREATE TABLE IF NOT EXISTS third_party_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  shipping_provider_id UUID REFERENCES shipping_providers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'returned', 'partial')),
  cleared_quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
  returned_quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
  cleared_at TIMESTAMPTZ,
  notes TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 2) الفهارس =====
CREATE INDEX IF NOT EXISTS idx_third_party_inventory_company ON third_party_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_third_party_inventory_invoice ON third_party_inventory(invoice_id);
CREATE INDEX IF NOT EXISTS idx_third_party_inventory_product ON third_party_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_third_party_inventory_provider ON third_party_inventory(shipping_provider_id);
CREATE INDEX IF NOT EXISTS idx_third_party_inventory_status ON third_party_inventory(status);

-- ===== 3) إضافة أعمدة جديدة لجدول inventory_transactions =====
DO $$ 
BEGIN
  -- إضافة عمود نوع الموقع المصدر
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'from_location_type') THEN
    ALTER TABLE inventory_transactions ADD COLUMN from_location_type TEXT;
  END IF;
  
  -- إضافة عمود معرف الموقع المصدر
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'from_location_id') THEN
    ALTER TABLE inventory_transactions ADD COLUMN from_location_id UUID;
  END IF;
  
  -- إضافة عمود نوع الموقع الهدف
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'to_location_type') THEN
    ALTER TABLE inventory_transactions ADD COLUMN to_location_type TEXT;
  END IF;
  
  -- إضافة عمود معرف الموقع الهدف
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'to_location_id') THEN
    ALTER TABLE inventory_transactions ADD COLUMN to_location_id UUID;
  END IF;
  
  -- إضافة عمود شركة الشحن
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' AND column_name = 'shipping_provider_id') THEN
    ALTER TABLE inventory_transactions ADD COLUMN shipping_provider_id UUID REFERENCES shipping_providers(id);
  END IF;
END $$;

-- ===== 4) تفعيل RLS =====
ALTER TABLE third_party_inventory ENABLE ROW LEVEL SECURITY;

-- سياسة RLS للقراءة
DROP POLICY IF EXISTS "third_party_inventory_select" ON third_party_inventory;
CREATE POLICY "third_party_inventory_select" ON third_party_inventory
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- سياسة RLS للإدراج
DROP POLICY IF EXISTS "third_party_inventory_insert" ON third_party_inventory;
CREATE POLICY "third_party_inventory_insert" ON third_party_inventory
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- سياسة RLS للتحديث
DROP POLICY IF EXISTS "third_party_inventory_update" ON third_party_inventory;
CREATE POLICY "third_party_inventory_update" ON third_party_inventory
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- سياسة RLS للحذف
DROP POLICY IF EXISTS "third_party_inventory_delete" ON third_party_inventory;
CREATE POLICY "third_party_inventory_delete" ON third_party_inventory
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- ===== 5) إنشاء حساب بضائع لدى الغير =====
-- سيتم إنشاؤه يدوياً أو عبر API لكل شركة

