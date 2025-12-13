-- =============================================
-- نظام بونص المبيعات للموظفين
-- Sales Bonus System for Employees
-- =============================================

-- 1. إضافة حقول إعدادات البونص للشركة
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_type TEXT DEFAULT 'percentage' CHECK (bonus_type IN ('percentage', 'fixed', 'points'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_percentage DECIMAL(5, 2) DEFAULT 2.00;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_fixed_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_points_per_value DECIMAL(15, 2) DEFAULT 100;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_daily_cap DECIMAL(15, 2) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_monthly_cap DECIMAL(15, 2) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonus_payout_mode TEXT DEFAULT 'payroll' CHECK (bonus_payout_mode IN ('immediate', 'payroll'));

-- 2. إضافة حقل user_id لجدول employees للربط مع auth.users
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);

-- 3. إضافة حقل created_by_user_id لأوامر البيع والفواتير
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_created_by ON sales_orders(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by_user_id);

-- 4. إنشاء جدول البونصات
CREATE TABLE IF NOT EXISTS user_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  bonus_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  bonus_currency TEXT NOT NULL DEFAULT 'EGP',
  bonus_type TEXT NOT NULL DEFAULT 'percentage' CHECK (bonus_type IN ('percentage', 'fixed', 'points')),
  calculation_base DECIMAL(15, 2) DEFAULT 0,
  calculation_rate DECIMAL(10, 4) DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'paid', 'reversed', 'cancelled')),
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_user_bonuses_company ON user_bonuses(company_id);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_user ON user_bonuses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_employee ON user_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_invoice ON user_bonuses(invoice_id);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_sales_order ON user_bonuses(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_status ON user_bonuses(status);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_payroll ON user_bonuses(payroll_run_id);

-- فهرس فريد لمنع تكرار البونص على نفس الفاتورة
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bonuses_unique_invoice 
  ON user_bonuses(company_id, user_id, invoice_id) 
  WHERE invoice_id IS NOT NULL AND status NOT IN ('reversed', 'cancelled');

-- 6. إنشاء سياسات RLS
ALTER TABLE user_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_bonuses_select ON user_bonuses;
CREATE POLICY user_bonuses_select ON user_bonuses FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_bonuses_insert ON user_bonuses;
CREATE POLICY user_bonuses_insert ON user_bonuses FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS user_bonuses_update ON user_bonuses;
CREATE POLICY user_bonuses_update ON user_bonuses FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS user_bonuses_delete ON user_bonuses;
CREATE POLICY user_bonuses_delete ON user_bonuses FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- 7. إضافة حقل sales_bonus للـ payslips لتتبع بونص المبيعات المدفوع
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS sales_bonus DECIMAL(15, 2) DEFAULT 0;

-- 8. دالة لحساب البونص
CREATE OR REPLACE FUNCTION calculate_bonus_amount(
  p_invoice_total DECIMAL,
  p_bonus_type TEXT,
  p_bonus_percentage DECIMAL,
  p_bonus_fixed DECIMAL,
  p_bonus_points_per_value DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
  CASE p_bonus_type
    WHEN 'percentage' THEN
      RETURN ROUND(p_invoice_total * (p_bonus_percentage / 100), 2);
    WHEN 'fixed' THEN
      RETURN p_bonus_fixed;
    WHEN 'points' THEN
      RETURN FLOOR(p_invoice_total / NULLIF(p_bonus_points_per_value, 0));
    ELSE
      RETURN 0;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 9. تعليق توضيحي
COMMENT ON TABLE user_bonuses IS 'جدول بونصات المبيعات للموظفين - يتم إنشاء سجل عند دفع الفاتورة بالكامل';
COMMENT ON COLUMN user_bonuses.status IS 'pending: في الانتظار, scheduled: مجدول للصرف, paid: تم الصرف, reversed: تم العكس, cancelled: ملغي';

