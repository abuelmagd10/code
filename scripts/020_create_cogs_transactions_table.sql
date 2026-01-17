-- =====================================================
-- جدول cogs_transactions: المصدر الوحيد للحقيقة لـ COGS
-- =====================================================
-- يمنع نهائيًا حساب COGS من products.cost_price في التقارير الرسمية
-- FIFO Engine هو الجهة الوحيدة المخولة بتحديد unit_cost
-- =====================================================

-- إنشاء جدول cogs_transactions
CREATE TABLE IF NOT EXISTS cogs_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- الحوكمة الإلزامية (Governance)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  
  -- معلومات المنتج
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  -- معلومات المصدر (Source)
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('invoice', 'return', 'adjustment', 'depreciation', 'write_off')),
  source_id UUID NOT NULL, -- يمكن أن يكون invoice_id, return_id, etc.
  
  -- معلومات COGS (من FIFO Engine فقط)
  quantity DECIMAL(15, 4) NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(15, 4) NOT NULL CHECK (unit_cost >= 0), -- من FIFO Lot
  total_cost DECIMAL(15, 2) NOT NULL CHECK (total_cost >= 0), -- quantity × unit_cost
  
  -- ربط مع FIFO
  fifo_consumption_id UUID REFERENCES fifo_lot_consumptions(id) ON DELETE SET NULL, -- رابط اختياري مع FIFO consumption
  
  -- التاريخ
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- التتبع
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- ملاحظات
  notes TEXT,
  
  -- الفهرس المركب للاستعلامات السريعة
  CONSTRAINT cogs_transactions_company_date_idx UNIQUE NULLS NOT DISTINCT (company_id, transaction_date, id)
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_company ON cogs_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_branch ON cogs_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_cost_center ON cogs_transactions(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_warehouse ON cogs_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_product ON cogs_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_source ON cogs_transactions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_date ON cogs_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_fifo ON cogs_transactions(fifo_consumption_id) WHERE fifo_consumption_id IS NOT NULL;

-- فهرس مركب للاستعلامات الشائعة (company + date range + branch)
CREATE INDEX IF NOT EXISTS idx_cogs_transactions_company_date_branch 
  ON cogs_transactions(company_id, transaction_date, branch_id);

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_cogs_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_cogs_transactions_updated_at
  BEFORE UPDATE ON cogs_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_cogs_transactions_updated_at();

-- =====================================================
-- RLS Policies (Row Level Security)
-- =====================================================
ALTER TABLE cogs_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: المستخدمون يمكنهم رؤية COGS لشركاتهم فقط
CREATE POLICY "Users can view COGS for their companies"
  ON cogs_transactions FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: فقط المستخدمون المصرح لهم يمكنهم إدراج COGS
CREATE POLICY "Authorized users can insert COGS"
  ON cogs_transactions FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

-- Policy: منع التعديل (COGS ثابتة بعد الإنشاء)
CREATE POLICY "No updates allowed on COGS"
  ON cogs_transactions FOR UPDATE
  USING (false);

-- Policy: فقط المدراء يمكنهم حذف COGS (للاستثناءات فقط)
CREATE POLICY "Only admins can delete COGS"
  ON cogs_transactions FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE cogs_transactions IS 'المصدر الوحيد للحقيقة لـ COGS - يمنع استخدام products.cost_price في التقارير الرسمية';
COMMENT ON COLUMN cogs_transactions.company_id IS 'إلزامي: عزل تعدد الشركات';
COMMENT ON COLUMN cogs_transactions.branch_id IS 'إلزامي: الحوكمة على مستوى الفرع';
COMMENT ON COLUMN cogs_transactions.cost_center_id IS 'إلزامي: الحوكمة على مستوى مركز التكلفة';
COMMENT ON COLUMN cogs_transactions.warehouse_id IS 'إلزامي: الحوكمة على مستوى المخزن';
COMMENT ON COLUMN cogs_transactions.unit_cost IS 'من FIFO Engine فقط - لا يُستخدم products.cost_price';
COMMENT ON COLUMN cogs_transactions.source_type IS 'نوع المصدر: invoice, return, adjustment, depreciation, write_off';
COMMENT ON COLUMN cogs_transactions.fifo_consumption_id IS 'رابط اختياري مع fifo_lot_consumptions للتدقيق';

-- =====================================================
-- Function: حساب إجمالي COGS مع الحوكمة
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_cogs_total(
  p_company_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_total NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_total
  FROM cogs_transactions
  WHERE company_id = p_company_id
    AND (p_from_date IS NULL OR transaction_date >= p_from_date)
    AND (p_to_date IS NULL OR transaction_date <= p_to_date)
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_cogs_total IS 'حساب إجمالي COGS مع الحوكمة (الشركة، الفرع، مركز التكلفة، المخزن، الفترة)';
