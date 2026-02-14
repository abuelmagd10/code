-- =============================================
-- Equity System Upgrade - Professional ERP Capital Governance
-- =============================================
-- This migration upgrades the shareholders/equity system to ERP-grade
-- with full dividend lifecycle, drawings, and atomic transactions
-- =============================================

-- =============================================
-- PART 1: Enhance shareholders table
-- =============================================
ALTER TABLE shareholders ADD COLUMN IF NOT EXISTS 
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'));
ALTER TABLE shareholders ADD COLUMN IF NOT EXISTS 
  capital_account_id UUID REFERENCES chart_of_accounts(id);
ALTER TABLE shareholders ADD COLUMN IF NOT EXISTS 
  drawings_account_id UUID REFERENCES chart_of_accounts(id);
ALTER TABLE shareholders ADD COLUMN IF NOT EXISTS 
  join_date DATE;
ALTER TABLE shareholders ADD COLUMN IF NOT EXISTS 
  exit_date DATE;

-- =============================================
-- PART 2: Enhance profit_distributions table (add status lifecycle)
-- =============================================
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  status TEXT DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'partially_paid', 'paid', 'cancelled'));
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  fiscal_year INTEGER;
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  fiscal_period TEXT;
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  approved_by UUID REFERENCES auth.users(id);
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  approved_at TIMESTAMPTZ;
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  journal_entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  available_retained_earnings DECIMAL(15, 2);
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  branch_id UUID REFERENCES branches(id);
ALTER TABLE profit_distributions ADD COLUMN IF NOT EXISTS 
  cost_center_id UUID REFERENCES cost_centers(id);

-- =============================================
-- PART 3: Enhance profit_distribution_lines (add payment tracking)
-- =============================================
ALTER TABLE profit_distribution_lines ADD COLUMN IF NOT EXISTS 
  paid_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE profit_distribution_lines ADD COLUMN IF NOT EXISTS 
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid'));

-- =============================================
-- PART 4: Create dividend_payments table
-- =============================================
CREATE TABLE IF NOT EXISTS dividend_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  distribution_line_id UUID NOT NULL REFERENCES profit_distribution_lines(id) ON DELETE RESTRICT,
  shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  payment_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check')),
  reference_number TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  status TEXT DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
  created_by UUID REFERENCES auth.users(id),
  branch_id UUID REFERENCES branches(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PART 5: Create shareholder_drawings table
-- =============================================
CREATE TABLE IF NOT EXISTS shareholder_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
  drawing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  payment_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  description TEXT,
  status TEXT DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  branch_id UUID REFERENCES branches(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PART 6: Create shareholder_percentage_history table
-- =============================================
CREATE TABLE IF NOT EXISTS shareholder_percentage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
  percentage DECIMAL(5, 2) NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PART 7: Create indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_dividend_payments_company ON dividend_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_shareholder ON dividend_payments(shareholder_id);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_distribution_line ON dividend_payments(distribution_line_id);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_date ON dividend_payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_shareholder_drawings_company ON shareholder_drawings(company_id);
CREATE INDEX IF NOT EXISTS idx_shareholder_drawings_shareholder ON shareholder_drawings(shareholder_id);
CREATE INDEX IF NOT EXISTS idx_shareholder_drawings_date ON shareholder_drawings(drawing_date);

CREATE INDEX IF NOT EXISTS idx_percentage_history_shareholder ON shareholder_percentage_history(shareholder_id);
CREATE INDEX IF NOT EXISTS idx_percentage_history_date ON shareholder_percentage_history(effective_date);

CREATE INDEX IF NOT EXISTS idx_profit_distributions_status ON profit_distributions(status);
CREATE INDEX IF NOT EXISTS idx_profit_distribution_lines_status ON profit_distribution_lines(status);

-- =============================================
-- PART 8: Enable RLS on new tables
-- =============================================
ALTER TABLE dividend_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shareholder_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shareholder_percentage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dividend_payments
DROP POLICY IF EXISTS "dividend_payments_select" ON dividend_payments;
CREATE POLICY "dividend_payments_select" ON dividend_payments FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "dividend_payments_insert" ON dividend_payments;
CREATE POLICY "dividend_payments_insert" ON dividend_payments FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "dividend_payments_update" ON dividend_payments;
CREATE POLICY "dividend_payments_update" ON dividend_payments FOR UPDATE
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- RLS Policies for shareholder_drawings
DROP POLICY IF EXISTS "shareholder_drawings_select" ON shareholder_drawings;
CREATE POLICY "shareholder_drawings_select" ON shareholder_drawings FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "shareholder_drawings_insert" ON shareholder_drawings;
CREATE POLICY "shareholder_drawings_insert" ON shareholder_drawings FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "shareholder_drawings_update" ON shareholder_drawings;
CREATE POLICY "shareholder_drawings_update" ON shareholder_drawings FOR UPDATE
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- RLS Policies for shareholder_percentage_history
DROP POLICY IF EXISTS "shareholder_percentage_history_select" ON shareholder_percentage_history;
CREATE POLICY "shareholder_percentage_history_select" ON shareholder_percentage_history FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "shareholder_percentage_history_insert" ON shareholder_percentage_history;
CREATE POLICY "shareholder_percentage_history_insert" ON shareholder_percentage_history FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

