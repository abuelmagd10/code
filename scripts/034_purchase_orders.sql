-- Migration: Create purchase_orders and purchase_order_items tables
-- Similar structure to sales_orders for consistency

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  discount_type TEXT DEFAULT 'amount' CHECK (discount_type IN ('amount', 'percent')),
  discount_value NUMERIC(12,2) DEFAULT 0,
  discount_position TEXT DEFAULT 'before_tax' CHECK (discount_position IN ('before_tax', 'after_tax')),
  tax_inclusive BOOLEAN DEFAULT FALSE,
  shipping NUMERIC(12,2) DEFAULT 0,
  shipping_tax_rate NUMERIC(5,2) DEFAULT 0,
  adjustment NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'billed', 'cancelled')),
  notes TEXT,
  currency TEXT DEFAULT 'SAR',
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create purchase_order_items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  line_total NUMERIC(12,2) DEFAULT 0,
  item_type TEXT DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add purchase_order_id to bills table for linking
ALTER TABLE bills ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(po_date);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_bills_purchase_order ON bills(purchase_order_id);

-- Enable RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for purchase_orders
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_orders_delete" ON purchase_orders FOR DELETE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for purchase_order_items (via purchase_order)
CREATE POLICY "purchase_order_items_select" ON purchase_order_items FOR SELECT
  USING (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "purchase_order_items_insert" ON purchase_order_items FOR INSERT
  WITH CHECK (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "purchase_order_items_update" ON purchase_order_items FOR UPDATE
  USING (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "purchase_order_items_delete" ON purchase_order_items FOR DELETE
  USING (purchase_order_id IN (
    SELECT id FROM purchase_orders WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

