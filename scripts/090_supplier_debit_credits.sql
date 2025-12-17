-- =====================================================
-- إنشاء جدول أرصدة الموردين المدينة (Supplier Debit Credits)
-- Create supplier_debit_credits table for tracking supplier debit balances
-- يُستخدم عند مرتجع المشتريات حيث يكون المدفوع أكبر من صافي الفاتورة
-- =====================================================

-- إنشاء الجدول
CREATE TABLE IF NOT EXISTS supplier_debit_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_return_id UUID, -- سيتم ربطه بعد إنشاء جدول purchase_returns
  debit_number VARCHAR(50),
  debit_date DATE DEFAULT CURRENT_DATE,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(15,2) DEFAULT 0,
  applied_amount DECIMAL(15,2) DEFAULT 0, -- المبلغ المطبق على فواتير أخرى
  remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (amount - used_amount - applied_amount) STORED,
  reference_type VARCHAR(50), -- bill_return, purchase_return, adjustment
  reference_id UUID,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active', -- active, used, expired, cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_company ON supplier_debit_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_supplier ON supplier_debit_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_status ON supplier_debit_credits(status);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_bill ON supplier_debit_credits(bill_id);

-- تفعيل RLS
ALTER TABLE supplier_debit_credits ENABLE ROW LEVEL SECURITY;

-- سياسات RLS
CREATE POLICY "supplier_debit_credits_select" ON supplier_debit_credits
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "supplier_debit_credits_insert" ON supplier_debit_credits
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "supplier_debit_credits_update" ON supplier_debit_credits
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "supplier_debit_credits_delete" ON supplier_debit_credits
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_supplier_debit_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_debit_credits_updated_at ON supplier_debit_credits;
CREATE TRIGGER supplier_debit_credits_updated_at
  BEFORE UPDATE ON supplier_debit_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_debit_credits_updated_at();

-- تعليقات على الجدول
COMMENT ON TABLE supplier_debit_credits IS 'جدول أرصدة الموردين المدينة - يُنشأ عند مرتجع مشتريات المدفوع فيها أكبر من الصافي';
COMMENT ON COLUMN supplier_debit_credits.amount IS 'المبلغ الإجمالي للرصيد المدين';
COMMENT ON COLUMN supplier_debit_credits.used_amount IS 'المبلغ المستخدم/المسترد من الرصيد';
COMMENT ON COLUMN supplier_debit_credits.remaining_amount IS 'المبلغ المتبقي (محسوب تلقائياً)';
COMMENT ON COLUMN supplier_debit_credits.reference_type IS 'نوع المرجع: bill_return, purchase_return, adjustment';
COMMENT ON COLUMN supplier_debit_credits.bill_id IS 'معرف فاتورة الشراء المرتبطة (إن وجدت)';

-- =====================================================
-- جدول مرتجعات المشتريات (Purchase Returns)
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  return_number TEXT NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  settlement_amount DECIMAL(15, 2) DEFAULT 0, -- المبلغ المسترد نقداً
  settlement_method TEXT DEFAULT 'debit_note', -- debit_note, cash, bank_transfer
  status TEXT DEFAULT 'completed', -- draft, pending, completed, cancelled
  reason TEXT,
  notes TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  -- Multi-currency support
  original_currency VARCHAR(3) DEFAULT 'EGP',
  original_subtotal DECIMAL(15, 2),
  original_tax_amount DECIMAL(15, 2),
  original_total_amount DECIMAL(15, 2),
  exchange_rate_used DECIMAL(15, 6) DEFAULT 1,
  exchange_rate_id UUID REFERENCES exchange_rates(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- فهارس مرتجعات المشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_returns_company ON purchase_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_bill ON purchase_returns(bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns(return_date);

-- جدول بنود مرتجعات المشتريات
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  bill_item_id UUID REFERENCES bill_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity DECIMAL(15, 2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON purchase_return_items(product_id);

-- تفعيل RLS لمرتجعات المشتريات
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;

-- سياسات RLS لمرتجعات المشتريات
CREATE POLICY "purchase_returns_select" ON purchase_returns
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

CREATE POLICY "purchase_returns_insert" ON purchase_returns
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "purchase_returns_update" ON purchase_returns
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "purchase_returns_delete" ON purchase_returns
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- سياسات RLS لبنود مرتجعات المشتريات
CREATE POLICY "purchase_return_items_select" ON purchase_return_items
  FOR SELECT USING (
    purchase_return_id IN (
      SELECT id FROM purchase_returns WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "purchase_return_items_insert" ON purchase_return_items
  FOR INSERT WITH CHECK (
    purchase_return_id IN (
      SELECT id FROM purchase_returns WHERE company_id IN (
        SELECT company_id FROM company_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'accountant')
      )
    )
  );

CREATE POLICY "purchase_return_items_update" ON purchase_return_items
  FOR UPDATE USING (
    purchase_return_id IN (
      SELECT id FROM purchase_returns WHERE company_id IN (
        SELECT company_id FROM company_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'accountant')
      )
    )
  );

CREATE POLICY "purchase_return_items_delete" ON purchase_return_items
  FOR DELETE USING (
    purchase_return_id IN (
      SELECT id FROM purchase_returns WHERE company_id IN (
        SELECT company_id FROM company_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- تعليقات
COMMENT ON TABLE purchase_returns IS 'جدول مرتجعات المشتريات';
COMMENT ON TABLE purchase_return_items IS 'جدول بنود مرتجعات المشتريات';

-- إضافة Foreign Key لربط supplier_debit_credits بـ purchase_returns
ALTER TABLE supplier_debit_credits
  ADD CONSTRAINT fk_supplier_debit_credits_purchase_return
  FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE SET NULL;

-- إنشاء فهرس للربط
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_purchase_return ON supplier_debit_credits(purchase_return_id);

