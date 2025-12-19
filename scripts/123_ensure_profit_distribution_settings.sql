-- =============================================
-- Ensure profit_distribution_settings table exists
-- =============================================
-- This script ensures the profit_distribution_settings table exists
-- and is properly configured with RLS policies
-- =============================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS profit_distribution_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  debit_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  credit_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE profit_distribution_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS rls_profit_distribution_settings_select ON profit_distribution_settings;
DROP POLICY IF EXISTS rls_profit_distribution_settings_insert ON profit_distribution_settings;
DROP POLICY IF EXISTS rls_profit_distribution_settings_update ON profit_distribution_settings;
DROP POLICY IF EXISTS rls_profit_distribution_settings_delete ON profit_distribution_settings;

-- RLS: allow access only to rows belonging to the current user's company
-- Using company_members for multi-user support
CREATE POLICY rls_profit_distribution_settings_select ON profit_distribution_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = profit_distribution_settings.company_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY rls_profit_distribution_settings_insert ON profit_distribution_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = profit_distribution_settings.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY rls_profit_distribution_settings_update ON profit_distribution_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = profit_distribution_settings.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = profit_distribution_settings.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY rls_profit_distribution_settings_delete ON profit_distribution_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = profit_distribution_settings.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profit_distribution_settings_company ON profit_distribution_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_profit_distribution_settings_debit_account ON profit_distribution_settings(debit_account_id);
CREATE INDEX IF NOT EXISTS idx_profit_distribution_settings_credit_account ON profit_distribution_settings(credit_account_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON profit_distribution_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profit_distribution_settings TO anon;

-- Verification query (for manual check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'profit_distribution_settings'
  ) THEN
    RAISE NOTICE '✓ Table profit_distribution_settings exists and is configured';
  ELSE
    RAISE EXCEPTION '✗ Table profit_distribution_settings was not created';
  END IF;
END $$;

