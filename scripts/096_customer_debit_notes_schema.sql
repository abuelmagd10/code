-- =============================================
-- Customer Debit Notes System - Database Schema
-- إشعارات مدين العملاء - البنية الأساسية
-- =============================================
-- Purpose: Create customer debit notes for additional charges
-- Use Cases: Price differences, additional fees, penalties, corrections
-- =============================================

-- 1️⃣ Create customer_debit_notes table
CREATE TABLE IF NOT EXISTS customer_debit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 ERP Context (Required)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  
  -- 👤 Customer Reference (Required)
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  
  -- 📄 Document Information
  debit_note_number VARCHAR(50) NOT NULL,
  debit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- 🔗 Source Invoice (Required)
  source_invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  
  -- 💰 Financial Information
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  applied_amount DECIMAL(15,2) DEFAULT 0,
  
  -- 💱 Multi-Currency Support
  currency_id UUID REFERENCES currencies(id) ON DELETE SET NULL,
  original_currency VARCHAR(3) DEFAULT 'EGP',
  original_subtotal DECIMAL(15,2),
  original_tax_amount DECIMAL(15,2),
  original_total_amount DECIMAL(15,2),
  exchange_rate DECIMAL(15,6) DEFAULT 1,
  exchange_rate_id UUID REFERENCES exchange_rates(id) ON DELETE SET NULL,
  
  -- 📊 Status Management
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'partially_applied', 'applied', 'cancelled')),
  
  -- 🔗 Reference Information
  reference_type VARCHAR(50) NOT NULL, -- 'price_difference', 'additional_fees', 'penalty', 'correction'
  reference_id UUID, -- Additional reference if needed
  
  -- 📝 Notes and Description
  reason TEXT NOT NULL, -- Required: Why this debit note was created
  notes TEXT,
  
  -- 🧾 Journal Entry Link
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  -- 📅 Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ✅ Constraints
  CONSTRAINT chk_customer_debit_amounts CHECK (
    subtotal >= 0 AND 
    tax_amount >= 0 AND 
    total_amount >= 0 AND
    applied_amount >= 0 AND
    applied_amount <= total_amount
  ),
  CONSTRAINT chk_customer_debit_currency CHECK (
    (currency_id IS NULL AND original_currency = 'EGP' AND exchange_rate = 1) OR
    (currency_id IS NOT NULL)
  ),
  UNIQUE(company_id, debit_note_number)
);

-- 2️⃣ Create customer_debit_note_items table
CREATE TABLE IF NOT EXISTS customer_debit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🔗 Parent Reference
  customer_debit_note_id UUID NOT NULL REFERENCES customer_debit_notes(id) ON DELETE CASCADE,
  
  -- 📦 Item Information (Optional - can be non-product charges)
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  
  -- 💰 Pricing
  quantity DECIMAL(15,2) DEFAULT 1,
  unit_price DECIMAL(15,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  line_total DECIMAL(15,2) NOT NULL,
  
  -- 📝 Item Type
  item_type VARCHAR(50) DEFAULT 'charge', -- 'product', 'service', 'charge', 'penalty', 'fee'
  
  -- 📅 Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ✅ Constraints
  CONSTRAINT chk_debit_item_amounts CHECK (
    quantity > 0 AND
    unit_price >= 0 AND
    line_total >= 0 AND
    tax_rate >= 0 AND
    tax_rate <= 100
  )
);

-- 3️⃣ Create customer_debit_note_applications table
-- Track how debit notes are applied to invoices or payments
CREATE TABLE IF NOT EXISTS customer_debit_note_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 Company Context
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- 🔗 References
  customer_debit_note_id UUID NOT NULL REFERENCES customer_debit_notes(id) ON DELETE CASCADE,
  applied_to_type VARCHAR(50) NOT NULL, -- 'invoice', 'payment', 'settlement'
  applied_to_id UUID NOT NULL, -- invoice_id or payment_id
  
  -- 💰 Application Details
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_applied DECIMAL(15,2) NOT NULL,
  
  -- 📝 Notes
  notes TEXT,
  
  -- 📅 Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ✅ Constraints
  CONSTRAINT chk_debit_application_amount CHECK (amount_applied > 0),
  UNIQUE(customer_debit_note_id, applied_to_type, applied_to_id)
);

-- 4️⃣ Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_company ON customer_debit_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_customer ON customer_debit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_invoice ON customer_debit_notes(source_invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_branch ON customer_debit_notes(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_status ON customer_debit_notes(status);
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_date ON customer_debit_notes(debit_note_date);
CREATE INDEX IF NOT EXISTS idx_customer_debit_note_items_note ON customer_debit_note_items(customer_debit_note_id);
CREATE INDEX IF NOT EXISTS idx_customer_debit_applications_note ON customer_debit_note_applications(customer_debit_note_id);

-- 5️⃣ Add Comments for Documentation
COMMENT ON TABLE customer_debit_notes IS 'Customer debit notes for additional charges on invoices';
COMMENT ON TABLE customer_debit_note_items IS 'Line items for customer debit notes';
COMMENT ON TABLE customer_debit_note_applications IS 'Track application of debit notes to invoices/payments';

