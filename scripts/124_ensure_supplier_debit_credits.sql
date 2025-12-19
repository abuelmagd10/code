-- =============================================
-- Ensure supplier_debit_credits table exists
-- =============================================
-- This script ensures the supplier_debit_credits table exists
-- and is properly configured with RLS policies
-- =============================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS supplier_debit_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(15, 2) DEFAULT 0,
  applied_amount DECIMAL(15, 2) DEFAULT 0,
  remaining_amount DECIMAL(15, 2) GENERATED ALWAYS AS (amount - COALESCE(used_amount, 0) - COALESCE(applied_amount, 0)) STORED,
  reference_type TEXT, -- bill_return, purchase_return, adjustment
  reference_id UUID,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  purchase_return_id UUID,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  notes TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE supplier_debit_credits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS supplier_debit_credits_select ON supplier_debit_credits;
DROP POLICY IF EXISTS supplier_debit_credits_insert ON supplier_debit_credits;
DROP POLICY IF EXISTS supplier_debit_credits_update ON supplier_debit_credits;
DROP POLICY IF EXISTS supplier_debit_credits_delete ON supplier_debit_credits;

-- RLS: allow access only to rows belonging to the current user's company
-- Using company_members for multi-user support
CREATE POLICY supplier_debit_credits_select ON supplier_debit_credits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = supplier_debit_credits.company_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY supplier_debit_credits_insert ON supplier_debit_credits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = supplier_debit_credits.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY supplier_debit_credits_update ON supplier_debit_credits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = supplier_debit_credits.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'accountant')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = supplier_debit_credits.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY supplier_debit_credits_delete ON supplier_debit_credits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = supplier_debit_credits.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_company ON supplier_debit_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_supplier ON supplier_debit_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_status ON supplier_debit_credits(status);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_bill ON supplier_debit_credits(bill_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_branch_id ON supplier_debit_credits(branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_cost_center_id ON supplier_debit_credits(cost_center_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_debit_credits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_debit_credits TO anon;

-- Verification query (for manual check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'supplier_debit_credits'
  ) THEN
    RAISE NOTICE '✓ Table supplier_debit_credits exists and is configured';
  ELSE
    RAISE EXCEPTION '✗ Table supplier_debit_credits was not created';
  END IF;
END $$;

