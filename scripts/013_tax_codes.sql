-- =============================================
-- Tax Codes: company-scoped VAT/Tax settings
-- =============================================

CREATE TABLE IF NOT EXISTS tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (rate >= 0 AND rate <= 100),
  scope TEXT NOT NULL DEFAULT 'both' CHECK (scope IN ('sales','purchase','both')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS enable
ALTER TABLE tax_codes ENABLE ROW LEVEL SECURITY;

-- Unique per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_codes_company_name ON tax_codes(company_id, name);
CREATE INDEX IF NOT EXISTS idx_tax_codes_company ON tax_codes(company_id);

-- RLS Policies: restrict access to rows of the user's company
DROP POLICY IF EXISTS tax_codes_select ON tax_codes;
DROP POLICY IF EXISTS tax_codes_insert ON tax_codes;
DROP POLICY IF EXISTS tax_codes_update ON tax_codes;
DROP POLICY IF EXISTS tax_codes_delete ON tax_codes;

CREATE POLICY tax_codes_select ON tax_codes
  FOR SELECT USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tax_codes_insert ON tax_codes
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tax_codes_update ON tax_codes
  FOR UPDATE USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tax_codes_delete ON tax_codes
  FOR DELETE USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

