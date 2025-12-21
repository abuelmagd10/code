-- إنشاء جدول vendor_credits (أرصدة الموردين الدائنة)
-- Create vendor_credits table for supplier credit balances

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
  status VARCHAR(20) DEFAULT 'active', -- active, applied, expired, cancelled
  reference_type VARCHAR(50) DEFAULT 'purchase_return', -- purchase_return, adjustment, overpayment
  reference_id UUID,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_vendor_credits_company ON vendor_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_supplier ON vendor_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_bill ON vendor_credits(bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_status ON vendor_credits(status);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_date ON vendor_credits(credit_date);

-- تفعيل RLS
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;

-- سياسات RLS
CREATE POLICY "vendor_credits_select" ON vendor_credits
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "vendor_credits_insert" ON vendor_credits
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "vendor_credits_update" ON vendor_credits
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "vendor_credits_delete" ON vendor_credits
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Trigger لتحديث updated_at
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

-- تعليقات
COMMENT ON TABLE vendor_credits IS 'جدول أرصدة الموردين الدائنة - يُنشأ عند مرتجع المشتريات أو الدفع الزائد';
COMMENT ON COLUMN vendor_credits.total_amount IS 'المبلغ الإجمالي للرصيد الدائن';
COMMENT ON COLUMN vendor_credits.applied_amount IS 'المبلغ المطبق على فواتير أخرى';
COMMENT ON COLUMN vendor_credits.remaining_amount IS 'المبلغ المتبقي (محسوب تلقائياً)';