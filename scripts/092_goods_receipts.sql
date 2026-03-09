-- ============================================================
-- 📦 Goods Receipts (GRN) Module - Migration
-- ============================================================
-- Date: 2024
-- Description: Create goods_receipts and goods_receipt_items tables
--              with RLS policies, triggers, and RPC functions
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Create goods_receipts table
-- ============================================================

CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Basic Info
  grn_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Links
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',
    'received',
    'partially_received',
    'rejected',
    'cancelled'
  )),
  
  -- Receipt Info
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  
  -- Rejection Info
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Governance
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  
  -- Totals (calculated from items)
  total_quantity_received NUMERIC(12,2) DEFAULT 0,
  total_quantity_accepted NUMERIC(12,2) DEFAULT 0,
  total_quantity_rejected NUMERIC(12,2) DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint on grn_number per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_receipts_number_company 
ON goods_receipts(company_id, grn_number);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_goods_receipts_company ON goods_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_bill ON goods_receipts(bill_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_date ON goods_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_warehouse ON goods_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_governance ON goods_receipts(company_id, branch_id, cost_center_id, warehouse_id);

-- ============================================================
-- 2. Create goods_receipt_items table
-- ============================================================

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  
  -- Links
  purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Quantities
  quantity_ordered NUMERIC(12,2) NOT NULL DEFAULT 0, -- From PO
  quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0, -- Actual received
  quantity_accepted NUMERIC(12,2) DEFAULT 0, -- Accepted (good quality)
  quantity_rejected NUMERIC(12,2) DEFAULT 0, -- Rejected (damaged/wrong)
  
  -- Pricing (from PO or Bill)
  unit_price NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(12,2) DEFAULT 0,
  
  -- Rejection Details
  rejection_reason TEXT,
  
  -- Item Type
  item_type TEXT DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_grn_quantity_received CHECK (quantity_received >= 0),
  CONSTRAINT check_grn_quantity_accepted CHECK (quantity_accepted >= 0),
  CONSTRAINT check_grn_quantity_rejected CHECK (quantity_rejected >= 0),
  CONSTRAINT check_grn_quantity_sum CHECK (quantity_received = quantity_accepted + quantity_rejected),
  CONSTRAINT check_grn_over_receipt CHECK (quantity_received <= quantity_ordered * 1.1) -- Allow 10% over-receipt tolerance
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_grn ON goods_receipt_items(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_po_item ON goods_receipt_items(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_product ON goods_receipt_items(product_id);

-- ============================================================
-- 3. Update purchase_orders and bills tables
-- ============================================================

-- Add goods_receipt_id to purchase_orders
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;

-- Add goods_receipt_id to bills
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_grn ON purchase_orders(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_bills_grn ON bills(goods_receipt_id);

-- ============================================================
-- 4. Enable RLS
-- ============================================================

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS Policies for goods_receipts
-- ============================================================

-- Select policy
DROP POLICY IF EXISTS "goods_receipts_select" ON goods_receipts;
CREATE POLICY "goods_receipts_select" ON goods_receipts FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Insert policy
DROP POLICY IF EXISTS "goods_receipts_insert" ON goods_receipts;
CREATE POLICY "goods_receipts_insert" ON goods_receipts FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Update policy
DROP POLICY IF EXISTS "goods_receipts_update" ON goods_receipts;
CREATE POLICY "goods_receipts_update" ON goods_receipts FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Delete policy (only draft)
DROP POLICY IF EXISTS "goods_receipts_delete" ON goods_receipts;
CREATE POLICY "goods_receipts_delete" ON goods_receipts FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft'
  );

-- ============================================================
-- 6. RLS Policies for goods_receipt_items
-- ============================================================

-- Select policy
DROP POLICY IF EXISTS "goods_receipt_items_select" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_select" ON goods_receipt_items FOR SELECT
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- Insert policy
DROP POLICY IF EXISTS "goods_receipt_items_insert" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_insert" ON goods_receipt_items FOR INSERT
  WITH CHECK (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- Update policy
DROP POLICY IF EXISTS "goods_receipt_items_update" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_update" ON goods_receipt_items FOR UPDATE
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- Delete policy (only if receipt is draft)
DROP POLICY IF EXISTS "goods_receipt_items_delete" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_delete" ON goods_receipt_items FOR DELETE
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft'
  ));

-- ============================================================
-- 7. Auto-generate GRN number function
-- ============================================================

CREATE OR REPLACE FUNCTION auto_generate_grn_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_company_prefix TEXT;
  v_next_number INTEGER;
  v_new_number TEXT;
BEGIN
  IF NEW.grn_number IS NULL OR NEW.grn_number = '' THEN
    -- Use advisory lock to prevent race conditions
    v_lock_key := hashtext('grn_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Get company prefix (default: GRN-)
    SELECT COALESCE(settings->>'grn_prefix', 'GRN-')
    INTO v_company_prefix
    FROM companies
    WHERE id = NEW.company_id;
    
    -- Get next number
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM goods_receipts
    WHERE company_id = NEW.company_id
      AND grn_number ~ ('^' || v_company_prefix || '[0-9]+$');
    
    -- Generate number
    v_new_number := v_company_prefix || LPAD(v_next_number::TEXT, 6, '0');
    NEW.grn_number := v_new_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_generate_grn_number ON goods_receipts;
CREATE TRIGGER trg_auto_generate_grn_number
  BEFORE INSERT ON goods_receipts
  FOR EACH ROW
  WHEN (NEW.grn_number IS NULL OR NEW.grn_number = '')
  EXECUTE FUNCTION auto_generate_grn_number();

-- ============================================================
-- 8. Function to update GRN totals from items
-- ============================================================

CREATE OR REPLACE FUNCTION update_grn_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE goods_receipts
  SET 
    total_quantity_received = (
      SELECT COALESCE(SUM(quantity_received), 0)
      FROM goods_receipt_items
      WHERE goods_receipt_id = NEW.goods_receipt_id
    ),
    total_quantity_accepted = (
      SELECT COALESCE(SUM(quantity_accepted), 0)
      FROM goods_receipt_items
      WHERE goods_receipt_id = NEW.goods_receipt_id
    ),
    total_quantity_rejected = (
      SELECT COALESCE(SUM(quantity_rejected), 0)
      FROM goods_receipt_items
      WHERE goods_receipt_id = NEW.goods_receipt_id
    ),
    updated_at = NOW()
  WHERE id = NEW.goods_receipt_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update totals when items change
DROP TRIGGER IF EXISTS trg_update_grn_totals ON goods_receipt_items;
CREATE TRIGGER trg_update_grn_totals
  AFTER INSERT OR UPDATE OR DELETE ON goods_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_grn_totals();

-- ============================================================
-- 9. RPC Function: Process Goods Receipt (Create Inventory Transactions)
-- ============================================================

CREATE OR REPLACE FUNCTION process_goods_receipt_atomic(
  p_grn_id UUID,
  p_user_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grn RECORD;
  v_user_role TEXT;
  v_item RECORD;
  v_inventory_tx_id UUID;
  v_po_status TEXT;
BEGIN
  -- 1. Validate user
  SELECT role INTO v_user_role
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  -- 2. Fetch and lock GRN
  SELECT * INTO v_grn
  FROM goods_receipts
  WHERE id = p_grn_id 
    AND company_id = p_company_id
    AND status = 'draft'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'GRN not found or not in draft status');
  END IF;
  
  -- 3. Validate warehouse
  IF v_grn.warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse is required');
  END IF;
  
  -- 4. Process each item and create inventory transactions
  FOR v_item IN 
    SELECT * FROM goods_receipt_items
    WHERE goods_receipt_id = p_grn_id
      AND quantity_accepted > 0
      AND item_type = 'product' -- Only products, not services
  LOOP
    -- Create inventory transaction
    INSERT INTO inventory_transactions (
      company_id,
      branch_id,
      warehouse_id,
      cost_center_id,
      product_id,
      transaction_type,
      quantity_change,
      reference_id,
      reference_type,
      notes,
      transaction_date
    )
    VALUES (
      p_company_id,
      v_grn.branch_id,
      v_grn.warehouse_id,
      v_grn.cost_center_id,
      v_item.product_id,
      'purchase',
      v_item.quantity_accepted, -- Only accepted quantity
      p_grn_id,
      'goods_receipt',
      'Goods receipt ' || v_grn.grn_number,
      v_grn.receipt_date
    )
    RETURNING id INTO v_inventory_tx_id;
  END LOOP;
  
  -- 5. Determine new status
  IF v_grn.total_quantity_rejected > 0 THEN
    v_po_status := 'partially_received';
  ELSE
    v_po_status := 'received';
  END IF;
  
  -- 6. Update GRN status
  UPDATE goods_receipts
  SET 
    status = v_po_status,
    received_by = p_user_id,
    received_at = NOW(),
    updated_at = NOW()
  WHERE id = p_grn_id;
  
  -- 7. Update PO status (if linked)
  IF v_grn.purchase_order_id IS NOT NULL THEN
    UPDATE purchase_orders
    SET 
      status = CASE 
        WHEN EXISTS (
          SELECT 1 FROM goods_receipt_items gri
          JOIN purchase_order_items poi ON gri.purchase_order_item_id = poi.id
          WHERE gri.goods_receipt_id = p_grn_id
            AND poi.quantity > gri.quantity_accepted
        ) THEN 'partially_received'
        ELSE 'received'
      END,
      goods_receipt_id = p_grn_id,
      updated_at = NOW()
    WHERE id = v_grn.purchase_order_id;
  END IF;
  
  -- 8. Audit log
  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id,
    old_values, new_values, created_at
  )
  VALUES (
    p_company_id, p_user_id, 'goods_receipt_processed', 'goods_receipt', p_grn_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', v_po_status),
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'grn_id', p_grn_id,
    'status', v_po_status
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON TABLE goods_receipts IS 'Goods Receipt Notes (GRN) for tracking received goods from suppliers';
COMMENT ON TABLE goods_receipt_items IS 'Items received in goods receipts';

COMMIT;
