-- =============================================
-- Sales Returns System (مرتجعات المبيعات)
-- =============================================

-- Add return tracking fields to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT NULL CHECK (return_status IN (NULL, 'none', 'partial', 'full'));

-- Add return tracking fields to bills  
ALTER TABLE bills ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT NULL CHECK (return_status IN (NULL, 'none', 'partial', 'full'));

-- Add returned_quantity to invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0;

-- Add returned_quantity to bill_items
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0;

-- Create sales returns table (مرتجعات المبيعات)
CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  return_number TEXT NOT NULL,
  return_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  refund_amount DECIMAL(15, 2) DEFAULT 0,
  refund_method TEXT, -- cash, credit_note, bank_transfer
  status TEXT DEFAULT 'pending', -- pending, approved, completed, cancelled
  reason TEXT,
  notes TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, return_number)
);

-- Create sales return items table
CREATE TABLE IF NOT EXISTS sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create customer credit notes table (إشعارات دائن للعملاء)
CREATE TABLE IF NOT EXISTS customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  sales_return_id UUID REFERENCES sales_returns(id) ON DELETE SET NULL,
  credit_number TEXT NOT NULL,
  credit_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  applied_amount DECIMAL(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'open', -- open, partially_applied, applied, cancelled
  notes TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, credit_number)
);

-- Create customer credit applications table (تطبيق الإشعار على فاتورة)
CREATE TABLE IF NOT EXISTS customer_credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_credit_id UUID NOT NULL REFERENCES customer_credits(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_applied DECIMAL(15, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_credit_id, invoice_id)
);

-- Enable Row Level Security
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_applications ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sales_returns_company ON sales_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_status ON sales_returns(status);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(sales_return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_product ON sales_return_items(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_company ON customer_credits(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_apps_credit ON customer_credit_applications(customer_credit_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_apps_invoice ON customer_credit_applications(invoice_id);

-- RLS Policies for sales_returns
CREATE POLICY sales_returns_select ON sales_returns FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY sales_returns_insert ON sales_returns FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY sales_returns_update ON sales_returns FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY sales_returns_delete ON sales_returns FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- RLS Policies for sales_return_items
CREATE POLICY sales_return_items_select ON sales_return_items FOR SELECT
  USING (sales_return_id IN (SELECT id FROM sales_returns WHERE company_id IN
    (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())));

CREATE POLICY sales_return_items_insert ON sales_return_items FOR INSERT
  WITH CHECK (sales_return_id IN (SELECT id FROM sales_returns WHERE company_id IN
    (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())));

CREATE POLICY sales_return_items_update ON sales_return_items FOR UPDATE
  USING (sales_return_id IN (SELECT id FROM sales_returns WHERE company_id IN
    (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())));

CREATE POLICY sales_return_items_delete ON sales_return_items FOR DELETE
  USING (sales_return_id IN (SELECT id FROM sales_returns WHERE company_id IN
    (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())));

-- RLS Policies for customer_credits
CREATE POLICY customer_credits_select ON customer_credits FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY customer_credits_insert ON customer_credits FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY customer_credits_update ON customer_credits FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY customer_credits_delete ON customer_credits FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- RLS Policies for customer_credit_applications
CREATE POLICY customer_credit_apps_select ON customer_credit_applications FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY customer_credit_apps_insert ON customer_credit_applications FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY customer_credit_apps_update ON customer_credit_applications FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY customer_credit_apps_delete ON customer_credit_applications FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

