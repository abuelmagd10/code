-- =====================================
-- ENHANCED FIXED ASSETS SCHEMA
-- =====================================
-- This migration upgrades the Fixed Assets module to support
-- full lifecycle management (additions, revaluations, etc.)
-- =====================================

-- 1. Add new columns to fixed_assets
ALTER TABLE fixed_assets 
ADD COLUMN IF NOT EXISTS barcode TEXT,
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Assigned Employee
ADD COLUMN IF NOT EXISTS location_details TEXT,
ADD COLUMN IF NOT EXISTS last_depreciation_date DATE;

-- Create index for barcode for faster lookup
CREATE INDEX IF NOT EXISTS idx_fixed_assets_barcode ON fixed_assets(barcode);

-- 2. Create asset_transactions table
CREATE TABLE IF NOT EXISTS asset_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'acquisition',      -- Initial Purchase
    'depreciation',     -- Periodic Depreciation
    'addition',         -- Capital Improvement / Additions
    'revaluation',      -- Revaluation (Up/Down)
    'suspension',       -- Suspend Depreciation
    'resumption',       -- Resume Depreciation
    'disposal',         -- Sale or Write-off
    'adjustment'        -- Manual Adjustment
  )),
  
  transaction_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0, -- Impact on Book Value (can be 0 for status changes)
  
  -- Links
  reference_id UUID, -- Link to Journal Entry or other source
  reference_type TEXT, -- 'journal_entry', 'invoice', etc.
  
  -- Snapshot of state details (JSONB is flexible for different event types)
  -- e.g. { "old_life": 60, "new_life": 48 } or { "revaluation_reason": "Market price increase" }
  details JSONB DEFAULT '{}'::JSONB,
  
  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_asset_transactions_asset_id ON asset_transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_transactions_date ON asset_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_asset_transactions_company ON asset_transactions(company_id);

-- RLS Policies
ALTER TABLE asset_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_transactions_company_policy" ON asset_transactions;
CREATE POLICY "asset_transactions_company_policy" ON asset_transactions
  FOR ALL USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- 3. Update existing assets to have an 'acquisition' transaction if missing
-- This is a backfill step to ensure history continuity
DO $$
DECLARE
  v_asset RECORD;
BEGIN
  FOR v_asset IN SELECT * FROM fixed_assets LOOP
    -- Check if acquisition transaction exists
    IF NOT EXISTS (
        SELECT 1 FROM asset_transactions 
        WHERE asset_id = v_asset.id AND transaction_type = 'acquisition'
    ) THEN
      INSERT INTO asset_transactions (
        company_id, asset_id, transaction_type, transaction_date, amount, details, created_by
      ) VALUES (
        v_asset.company_id,
        v_asset.id,
        'acquisition',
        v_asset.purchase_date,
        v_asset.purchase_cost,
        jsonb_build_object(
            'note', 'Backfilled from existing record',
            'original_cost', v_asset.purchase_cost
        ),
        v_asset.created_by
      );
    END IF;
  END LOOP;
END $$;
