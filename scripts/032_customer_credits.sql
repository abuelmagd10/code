-- =====================================================
-- إنشاء جدول أرصدة العملاء (Customer Credits)
-- Create customer_credits table for tracking customer credit balances
-- =====================================================

-- إنشاء الجدول
CREATE TABLE IF NOT EXISTS customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  credit_number VARCHAR(50),
  credit_date DATE DEFAULT CURRENT_DATE,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(15,2) DEFAULT 0,
  remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (amount - used_amount) STORED,
  reference_type VARCHAR(50), -- invoice_return, payment, etc.
  reference_id UUID,
  status VARCHAR(20) DEFAULT 'active', -- active, used, expired
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_customer_credits_company ON customer_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_status ON customer_credits(status);

-- تفعيل RLS
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;

-- سياسات RLS
CREATE POLICY "customer_credits_select" ON customer_credits
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "customer_credits_insert" ON customer_credits
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "customer_credits_update" ON customer_credits
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "customer_credits_delete" ON customer_credits
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_customer_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_credits_updated_at ON customer_credits;
CREATE TRIGGER customer_credits_updated_at
  BEFORE UPDATE ON customer_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_credits_updated_at();

-- تعليق على الجدول
COMMENT ON TABLE customer_credits IS 'جدول أرصدة العملاء الدائنة';
COMMENT ON COLUMN customer_credits.amount IS 'المبلغ الإجمالي للرصيد';
COMMENT ON COLUMN customer_credits.used_amount IS 'المبلغ المستخدم من الرصيد';
COMMENT ON COLUMN customer_credits.remaining_amount IS 'المبلغ المتبقي (محسوب تلقائياً)';

