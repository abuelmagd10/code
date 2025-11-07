-- =============================================
-- Shareholders & Profit Distribution Tables
-- =============================================

-- Shareholders basic info and current percentage
CREATE TABLE IF NOT EXISTS shareholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  national_id TEXT,
  percentage DECIMAL(5, 2) NOT NULL DEFAULT 0, -- current ownership percentage
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Capital contributions by shareholders
CREATE TABLE IF NOT EXISTS capital_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(15, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Profit distribution headers (per event/period)
CREATE TABLE IF NOT EXISTS profit_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  distribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_profit DECIMAL(15, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Profit distribution lines per shareholder
CREATE TABLE IF NOT EXISTS profit_distribution_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID NOT NULL REFERENCES profit_distributions(id) ON DELETE CASCADE,
  shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
  percentage_at_distribution DECIMAL(5, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE shareholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_distribution_lines ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shareholders_company ON shareholders(company_id);
CREATE INDEX IF NOT EXISTS idx_contributions_company ON capital_contributions(company_id);
CREATE INDEX IF NOT EXISTS idx_contributions_shareholder ON capital_contributions(shareholder_id);
CREATE INDEX IF NOT EXISTS idx_distributions_company ON profit_distributions(company_id);
CREATE INDEX IF NOT EXISTS idx_distribution_lines_distribution ON profit_distribution_lines(distribution_id);
CREATE INDEX IF NOT EXISTS idx_distribution_lines_shareholder ON profit_distribution_lines(shareholder_id);

