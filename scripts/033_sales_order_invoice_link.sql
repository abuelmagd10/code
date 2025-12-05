-- =============================================
-- Link Sales Orders to Invoices
-- ربط أوامر البيع بالفواتير
-- =============================================

-- Add sales_order_id to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL;

-- Add invoice_id to sales_orders table for bidirectional link
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Add additional columns to sales_orders for full feature support
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent','amount'));
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_value DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_position TEXT DEFAULT 'before_tax' CHECK (discount_position IN ('before_tax','after_tax'));
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN DEFAULT FALSE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_tax_rate DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS adjustment DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EGP';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(15, 6) DEFAULT 1;

-- Add item_type to sales_order_items
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'product' CHECK (item_type IN ('product','service'));

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order_id ON invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_invoice_id ON sales_orders(invoice_id);

-- RLS policies for sales_orders (if not already created)
DO $$
BEGIN
  -- Enable RLS
  ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Drop existing policies if any
DROP POLICY IF EXISTS "sales_orders_select" ON sales_orders;
DROP POLICY IF EXISTS "sales_orders_insert" ON sales_orders;
DROP POLICY IF EXISTS "sales_orders_update" ON sales_orders;
DROP POLICY IF EXISTS "sales_orders_delete" ON sales_orders;

DROP POLICY IF EXISTS "sales_order_items_select" ON sales_order_items;
DROP POLICY IF EXISTS "sales_order_items_insert" ON sales_order_items;
DROP POLICY IF EXISTS "sales_order_items_update" ON sales_order_items;
DROP POLICY IF EXISTS "sales_order_items_delete" ON sales_order_items;

-- Create RLS policies for sales_orders
CREATE POLICY "sales_orders_select" ON sales_orders
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sales_orders_insert" ON sales_orders
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sales_orders_update" ON sales_orders
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sales_orders_delete" ON sales_orders
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- Create RLS policies for sales_order_items
CREATE POLICY "sales_order_items_select" ON sales_order_items
  FOR SELECT USING (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "sales_order_items_insert" ON sales_order_items
  FOR INSERT WITH CHECK (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "sales_order_items_update" ON sales_order_items
  FOR UPDATE USING (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "sales_order_items_delete" ON sales_order_items
  FOR DELETE USING (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

