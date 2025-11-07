-- Profit Distribution Settings: default accounts for automated journal entries
CREATE TABLE IF NOT EXISTS profit_distribution_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  debit_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  credit_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id)
);

ALTER TABLE profit_distribution_settings ENABLE ROW LEVEL SECURITY;

-- RLS: allow access only to rows belonging to the current user's company
CREATE POLICY rls_profit_distribution_settings_select ON profit_distribution_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY rls_profit_distribution_settings_insert ON profit_distribution_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY rls_profit_distribution_settings_update ON profit_distribution_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profit_distribution_settings_company ON profit_distribution_settings(company_id);
