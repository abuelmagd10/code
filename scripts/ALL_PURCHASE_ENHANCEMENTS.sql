-- ============================================================
-- 🚀 Purchase Cycle Enhancements - Complete Migration
-- ============================================================
-- Date: 2024
-- Description: Complete migration for Purchase Requests, Goods Receipts, and Three-Way Matching
-- 
-- IMPORTANT: Execute this file in Supabase SQL Editor
-- Order: Must be executed in sequence (PR → GRN → Matching)
-- ============================================================

-- ============================================================
-- PART 1: PURCHASE REQUESTS MODULE
-- ============================================================

BEGIN;

-- 1. Create purchase_requests table
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Basic Info
  request_number TEXT NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date DATE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Status & Approval
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 
    'submitted', 
    'pending_approval', 
    'approved', 
    'rejected', 
    'converted_to_po',
    'cancelled'
  )),
  approval_status TEXT DEFAULT 'pending',
  
  -- Requester Info
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  -- Financial Estimates
  total_estimated_cost NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'EGP',
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  
  -- Governance
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- Approval Tracking
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Conversion Tracking
  converted_to_po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for purchase_requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_requests_number_company 
ON purchase_requests(company_id, request_number);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_company ON purchase_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_requested_by ON purchase_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_date ON purchase_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_po ON purchase_requests(converted_to_po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_governance ON purchase_requests(company_id, branch_id, cost_center_id, warehouse_id);

-- 2. Create purchase_request_items table
CREATE TABLE IF NOT EXISTS purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  
  -- Product Info
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT,
  
  -- Quantities
  quantity_requested NUMERIC(12,2) NOT NULL DEFAULT 1,
  quantity_approved NUMERIC(12,2) DEFAULT 0,
  
  -- Pricing (Estimates)
  estimated_unit_price NUMERIC(12,2) DEFAULT 0,
  estimated_total NUMERIC(12,2) DEFAULT 0,
  
  -- Item Type
  item_type TEXT DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_quantity_requested CHECK (quantity_requested > 0),
  CONSTRAINT check_quantity_approved CHECK (quantity_approved >= 0),
  CONSTRAINT check_quantity_approved_limit CHECK (quantity_approved <= quantity_requested)
);

-- Indexes for purchase_request_items
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request ON purchase_request_items(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_product ON purchase_request_items(product_id);

-- 3. Enable RLS
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for purchase_requests
DROP POLICY IF EXISTS "purchase_requests_select" ON purchase_requests;
CREATE POLICY "purchase_requests_select" ON purchase_requests FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "purchase_requests_insert" ON purchase_requests;
CREATE POLICY "purchase_requests_insert" ON purchase_requests FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "purchase_requests_update" ON purchase_requests;
CREATE POLICY "purchase_requests_update" ON purchase_requests FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "purchase_requests_delete" ON purchase_requests;
CREATE POLICY "purchase_requests_delete" ON purchase_requests FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft'
  );

-- 5. RLS Policies for purchase_request_items
DROP POLICY IF EXISTS "purchase_request_items_select" ON purchase_request_items;
CREATE POLICY "purchase_request_items_select" ON purchase_request_items FOR SELECT
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "purchase_request_items_insert" ON purchase_request_items;
CREATE POLICY "purchase_request_items_insert" ON purchase_request_items FOR INSERT
  WITH CHECK (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "purchase_request_items_update" ON purchase_request_items;
CREATE POLICY "purchase_request_items_update" ON purchase_request_items FOR UPDATE
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "purchase_request_items_delete" ON purchase_request_items;
CREATE POLICY "purchase_request_items_delete" ON purchase_request_items FOR DELETE
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft'
  ));

-- 6. Auto-generate request number function
CREATE OR REPLACE FUNCTION auto_generate_purchase_request_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_company_prefix TEXT;
  v_next_number INTEGER;
  v_new_number TEXT;
BEGIN
  IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
    v_lock_key := hashtext('purchase_request_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    SELECT COALESCE(settings->>'purchase_request_prefix', 'PR-')
    INTO v_company_prefix
    FROM companies
    WHERE id = NEW.company_id;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM purchase_requests
    WHERE company_id = NEW.company_id
      AND request_number ~ ('^' || v_company_prefix || '[0-9]+$');
    
    v_new_number := v_company_prefix || LPAD(v_next_number::TEXT, 6, '0');
    NEW.request_number := v_new_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_purchase_request_number ON purchase_requests;
CREATE TRIGGER trg_auto_generate_purchase_request_number
  BEFORE INSERT ON purchase_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
  EXECUTE FUNCTION auto_generate_purchase_request_number();

-- 7. RPC Function: Convert Purchase Request to PO
CREATE OR REPLACE FUNCTION convert_purchase_request_to_po(
  p_request_id UUID,
  p_user_id UUID,
  p_company_id UUID,
  p_supplier_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_user_role TEXT;
  v_user_branch UUID;
  v_po_id UUID;
  v_po_number TEXT;
  v_item RECORD;
  v_subtotal NUMERIC(12,2) := 0;
  v_tax_amount NUMERIC(12,2) := 0;
  v_total NUMERIC(12,2) := 0;
BEGIN
  SELECT role, branch_id INTO v_user_role, v_user_branch
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  SELECT * INTO v_request
  FROM purchase_requests
  WHERE id = p_request_id 
    AND company_id = p_company_id
    AND status = 'approved'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase request not found or not approved');
  END IF;
  
  IF v_user_branch IS NOT NULL AND v_request.branch_id IS NOT NULL 
     AND v_user_branch != v_request.branch_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation');
  END IF;
  
  SELECT 
    COALESCE(SUM(estimated_total), 0),
    COALESCE(SUM(estimated_total * 0.15), 0)
  INTO v_subtotal, v_tax_amount
  FROM purchase_request_items
  WHERE purchase_request_id = p_request_id
    AND quantity_approved > 0;
  
  v_total := v_subtotal + v_tax_amount;
  
  INSERT INTO purchase_orders (
    company_id, supplier_id, po_date, due_date, status, currency, exchange_rate,
    subtotal, tax_amount, total, total_amount, branch_id, cost_center_id, warehouse_id,
    notes, created_by_user_id
  )
  VALUES (
    p_company_id, p_supplier_id, CURRENT_DATE, v_request.required_date, 'draft',
    v_request.currency, v_request.exchange_rate, v_subtotal, v_tax_amount, v_total, v_total,
    v_request.branch_id, v_request.cost_center_id, v_request.warehouse_id,
    COALESCE(v_request.notes, '') || ' (Converted from PR: ' || v_request.request_number || ')',
    p_user_id
  )
  RETURNING id, po_number INTO v_po_id, v_po_number;
  
  FOR v_item IN 
    SELECT * FROM purchase_request_items
    WHERE purchase_request_id = p_request_id
      AND quantity_approved > 0
  LOOP
    INSERT INTO purchase_order_items (
      purchase_order_id, product_id, description, quantity, unit_price, tax_rate, line_total, item_type
    )
    VALUES (
      v_po_id, v_item.product_id, v_item.description, v_item.quantity_approved,
      v_item.estimated_unit_price, 15.0, v_item.estimated_total, v_item.item_type
    );
  END LOOP;
  
  UPDATE purchase_requests
  SET 
    status = 'converted_to_po',
    converted_to_po_id = v_po_id,
    converted_at = NOW(),
    converted_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
  )
  VALUES (
    p_company_id, p_user_id, 'purchase_request_converted', 'purchase_request', p_request_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'converted_to_po', 'po_id', v_po_id, 'po_number', v_po_number),
    NOW()
  );
  
  RETURN jsonb_build_object('success', true, 'po_id', v_po_id, 'po_number', v_po_number, 'request_id', p_request_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. Create default approval workflows (compatible with both old and new schema)
DO $$
DECLARE
  v_has_document_type BOOLEAN;
  v_has_workflow_type BOOLEAN;
  v_workflow_id UUID;
BEGIN
  -- Check which schema is being used
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'approval_workflows' AND column_name = 'document_type'
  ) INTO v_has_document_type;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'approval_workflows' AND column_name = 'workflow_type'
  ) INTO v_has_workflow_type;
  
  -- If using new schema (document_type)
  IF v_has_document_type THEN
    -- Ensure required columns exist
    ALTER TABLE approval_workflows ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE approval_workflows ADD COLUMN IF NOT EXISTS name TEXT;
    
    -- Insert workflows using document_type
    INSERT INTO approval_workflows (company_id, document_type, name, is_active)
    SELECT id, 'purchase_request', 'Default Purchase Request Workflow', true
    FROM companies
    WHERE NOT EXISTS (
      SELECT 1 FROM approval_workflows 
      WHERE document_type = 'purchase_request' AND company_id = companies.id
    )
    RETURNING id INTO v_workflow_id;
    
    -- Create approval steps
    INSERT INTO approval_steps (workflow_id, step_order, role_required)
    SELECT wf.id, 1, 'manager'
    FROM approval_workflows wf
    WHERE wf.document_type = 'purchase_request'
      AND NOT EXISTS (SELECT 1 FROM approval_steps WHERE workflow_id = wf.id AND step_order = 1);

    INSERT INTO approval_steps (workflow_id, step_order, role_required)
    SELECT wf.id, 2, 'admin'
    FROM approval_workflows wf
    WHERE wf.document_type = 'purchase_request'
      AND NOT EXISTS (SELECT 1 FROM approval_steps WHERE workflow_id = wf.id AND step_order = 2);
  
  -- If using old schema (workflow_type), skip workflow creation
  -- The old schema uses a different approach where workflows are created per request
  ELSIF v_has_workflow_type THEN
    -- Old schema doesn't need pre-created workflows
    -- Workflows are created dynamically when requests are submitted
    RAISE NOTICE 'Using old approval_workflows schema (workflow_type). Purchase requests will create workflows dynamically.';
  END IF;
END $$;

COMMENT ON TABLE purchase_requests IS 'Purchase requests for internal planning before creating purchase orders';
COMMENT ON TABLE purchase_request_items IS 'Items requested in purchase requests';

COMMIT;

-- ============================================================
-- PART 2: GOODS RECEIPTS (GRN) MODULE
-- ============================================================

BEGIN;

-- 1. Create goods_receipts table
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
    'draft', 'received', 'partially_received', 'rejected', 'cancelled'
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
  
  -- Totals
  total_quantity_received NUMERIC(12,2) DEFAULT 0,
  total_quantity_accepted NUMERIC(12,2) DEFAULT 0,
  total_quantity_rejected NUMERIC(12,2) DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_receipts_number_company 
ON goods_receipts(company_id, grn_number);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_company ON goods_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_bill ON goods_receipts(bill_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_date ON goods_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_warehouse ON goods_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_governance ON goods_receipts(company_id, branch_id, cost_center_id, warehouse_id);

-- 2. Create goods_receipt_items table
CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  
  -- Links
  purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Quantities
  quantity_ordered NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_accepted NUMERIC(12,2) DEFAULT 0,
  quantity_rejected NUMERIC(12,2) DEFAULT 0,
  
  -- Pricing
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
  CONSTRAINT check_grn_over_receipt CHECK (quantity_received <= quantity_ordered * 1.1)
);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_grn ON goods_receipt_items(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_po_item ON goods_receipt_items(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_product ON goods_receipt_items(product_id);

-- 3. Update purchase_orders and bills tables
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_grn ON purchase_orders(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_bills_grn ON bills(goods_receipt_id);

-- 4. Enable RLS
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for goods_receipts
DROP POLICY IF EXISTS "goods_receipts_select" ON goods_receipts;
CREATE POLICY "goods_receipts_select" ON goods_receipts FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "goods_receipts_insert" ON goods_receipts;
CREATE POLICY "goods_receipts_insert" ON goods_receipts FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "goods_receipts_update" ON goods_receipts;
CREATE POLICY "goods_receipts_update" ON goods_receipts FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

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

-- 6. RLS Policies for goods_receipt_items
DROP POLICY IF EXISTS "goods_receipt_items_select" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_select" ON goods_receipt_items FOR SELECT
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "goods_receipt_items_insert" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_insert" ON goods_receipt_items FOR INSERT
  WITH CHECK (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "goods_receipt_items_update" ON goods_receipt_items;
CREATE POLICY "goods_receipt_items_update" ON goods_receipt_items FOR UPDATE
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

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

-- 7. Auto-generate GRN number function
CREATE OR REPLACE FUNCTION auto_generate_grn_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_company_prefix TEXT;
  v_next_number INTEGER;
  v_new_number TEXT;
BEGIN
  IF NEW.grn_number IS NULL OR NEW.grn_number = '' THEN
    v_lock_key := hashtext('grn_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    SELECT COALESCE(settings->>'grn_prefix', 'GRN-')
    INTO v_company_prefix
    FROM companies
    WHERE id = NEW.company_id;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM goods_receipts
    WHERE company_id = NEW.company_id
      AND grn_number ~ ('^' || v_company_prefix || '[0-9]+$');
    
    v_new_number := v_company_prefix || LPAD(v_next_number::TEXT, 6, '0');
    NEW.grn_number := v_new_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_grn_number ON goods_receipts;
CREATE TRIGGER trg_auto_generate_grn_number
  BEFORE INSERT ON goods_receipts
  FOR EACH ROW
  WHEN (NEW.grn_number IS NULL OR NEW.grn_number = '')
  EXECUTE FUNCTION auto_generate_grn_number();

-- 8. Function to update GRN totals
CREATE OR REPLACE FUNCTION update_grn_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE goods_receipts
  SET 
    total_quantity_received = (SELECT COALESCE(SUM(quantity_received), 0) FROM goods_receipt_items WHERE goods_receipt_id = NEW.goods_receipt_id),
    total_quantity_accepted = (SELECT COALESCE(SUM(quantity_accepted), 0) FROM goods_receipt_items WHERE goods_receipt_id = NEW.goods_receipt_id),
    total_quantity_rejected = (SELECT COALESCE(SUM(quantity_rejected), 0) FROM goods_receipt_items WHERE goods_receipt_id = NEW.goods_receipt_id),
    updated_at = NOW()
  WHERE id = NEW.goods_receipt_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_grn_totals ON goods_receipt_items;
CREATE TRIGGER trg_update_grn_totals
  AFTER INSERT OR UPDATE OR DELETE ON goods_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_grn_totals();

-- 9. RPC Function: Process Goods Receipt
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
  SELECT role INTO v_user_role
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  SELECT * INTO v_grn
  FROM goods_receipts
  WHERE id = p_grn_id AND company_id = p_company_id AND status = 'draft'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'GRN not found or not in draft status');
  END IF;
  
  IF v_grn.warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse is required');
  END IF;
  
  FOR v_item IN 
    SELECT * FROM goods_receipt_items
    WHERE goods_receipt_id = p_grn_id
      AND quantity_accepted > 0
      AND item_type = 'product'
  LOOP
    INSERT INTO inventory_transactions (
      company_id, branch_id, warehouse_id, cost_center_id, product_id,
      transaction_type, quantity_change, reference_id, reference_type, notes, transaction_date
    )
    VALUES (
      p_company_id, v_grn.branch_id, v_grn.warehouse_id, v_grn.cost_center_id, v_item.product_id,
      'purchase', v_item.quantity_accepted, p_grn_id, 'goods_receipt',
      'Goods receipt ' || v_grn.grn_number, v_grn.receipt_date
    )
    RETURNING id INTO v_inventory_tx_id;
  END LOOP;
  
  IF v_grn.total_quantity_rejected > 0 THEN
    v_po_status := 'partially_received';
  ELSE
    v_po_status := 'received';
  END IF;
  
  UPDATE goods_receipts
  SET status = v_po_status, received_by = p_user_id, received_at = NOW(), updated_at = NOW()
  WHERE id = p_grn_id;
  
  IF v_grn.purchase_order_id IS NOT NULL THEN
    UPDATE purchase_orders
    SET 
      status = CASE 
        WHEN EXISTS (
          SELECT 1 FROM goods_receipt_items gri
          JOIN purchase_order_items poi ON gri.purchase_order_item_id = poi.id
          WHERE gri.goods_receipt_id = p_grn_id AND poi.quantity > gri.quantity_accepted
        ) THEN 'partially_received'
        ELSE 'received'
      END,
      goods_receipt_id = p_grn_id,
      updated_at = NOW()
    WHERE id = v_grn.purchase_order_id;
  END IF;
  
  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
  )
  VALUES (
    p_company_id, p_user_id, 'goods_receipt_processed', 'goods_receipt', p_grn_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', v_po_status),
    NOW()
  );
  
  RETURN jsonb_build_object('success', true, 'grn_id', p_grn_id, 'status', v_po_status);
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON TABLE goods_receipts IS 'Goods Receipt Notes (GRN) for tracking received goods from suppliers';
COMMENT ON TABLE goods_receipt_items IS 'Items received in goods receipts';

COMMIT;

-- ============================================================
-- PART 3: THREE-WAY MATCHING MODULE
-- ============================================================

BEGIN;

-- 1. Create matching_exceptions table
CREATE TABLE IF NOT EXISTS matching_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Links
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Exception Details
  exception_type TEXT NOT NULL CHECK (exception_type IN (
    'quantity_mismatch', 'price_mismatch', 'missing_grn', 'missing_po', 'over_receipt', 'under_receipt'
  )),
  
  -- Product Details
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Quantities
  po_quantity NUMERIC(12,2),
  grn_quantity NUMERIC(12,2),
  bill_quantity NUMERIC(12,2),
  
  -- Prices
  po_price NUMERIC(12,2),
  bill_price NUMERIC(12,2),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'approved', 'rejected')),
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Metadata
  description TEXT,
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matching_exceptions_company ON matching_exceptions(company_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_po ON matching_exceptions(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_grn ON matching_exceptions(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_bill ON matching_exceptions(bill_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_status ON matching_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_type ON matching_exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_product ON matching_exceptions(product_id);

-- 2. Enable RLS
ALTER TABLE matching_exceptions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "matching_exceptions_select" ON matching_exceptions;
CREATE POLICY "matching_exceptions_select" ON matching_exceptions FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "matching_exceptions_insert" ON matching_exceptions;
CREATE POLICY "matching_exceptions_insert" ON matching_exceptions FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "matching_exceptions_update" ON matching_exceptions;
CREATE POLICY "matching_exceptions_update" ON matching_exceptions FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- 4. Function: Validate Three-Way Matching
CREATE OR REPLACE FUNCTION validate_three_way_matching(
  p_bill_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill RECORD;
  v_po RECORD;
  v_grn RECORD;
  v_bill_item RECORD;
  v_po_item RECORD;
  v_grn_item RECORD;
  v_exception_id UUID;
  v_exceptions JSONB := '[]'::JSONB;
  v_exception JSONB;
  v_price_tolerance NUMERIC(12,2) := 0.01;
BEGIN
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id AND company_id = p_company_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  IF v_bill.purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM purchase_orders WHERE id = v_bill.purchase_order_id;
  END IF;
  
  IF v_bill.goods_receipt_id IS NOT NULL THEN
    SELECT * INTO v_grn FROM goods_receipts WHERE id = v_bill.goods_receipt_id;
  END IF;
  
  FOR v_bill_item IN 
    SELECT * FROM bill_items
    WHERE bill_id = p_bill_id AND product_id IS NOT NULL
  LOOP
    IF v_po IS NOT NULL THEN
      SELECT * INTO v_po_item FROM purchase_order_items
      WHERE purchase_order_id = v_bill.purchase_order_id AND product_id = v_bill_item.product_id LIMIT 1;
    END IF;
    
    IF v_grn IS NOT NULL THEN
      SELECT * INTO v_grn_item FROM goods_receipt_items
      WHERE goods_receipt_id = v_bill.goods_receipt_id AND product_id = v_bill_item.product_id LIMIT 1;
    END IF;
    
    IF v_grn_item IS NOT NULL AND v_bill_item.quantity > v_grn_item.quantity_accepted THEN
      INSERT INTO matching_exceptions (
        company_id, purchase_order_id, goods_receipt_id, bill_id, product_id,
        exception_type, po_quantity, grn_quantity, bill_quantity, severity, description
      )
      VALUES (
        p_company_id, v_bill.purchase_order_id, v_bill.goods_receipt_id, p_bill_id, v_bill_item.product_id,
        'quantity_mismatch', COALESCE(v_po_item.quantity, 0), v_grn_item.quantity_accepted,
        v_bill_item.quantity, 'error',
        'Bill quantity (' || v_bill_item.quantity || ') exceeds GRN accepted quantity (' || v_grn_item.quantity_accepted || ')'
      )
      RETURNING id INTO v_exception_id;
      
      v_exception := jsonb_build_object(
        'id', v_exception_id, 'type', 'quantity_mismatch', 'product_id', v_bill_item.product_id,
        'message', 'Bill quantity exceeds GRN accepted quantity',
        'bill_qty', v_bill_item.quantity, 'grn_qty', v_grn_item.quantity_accepted
      );
      v_exceptions := v_exceptions || v_exception;
    END IF;
    
    IF v_po_item IS NOT NULL AND v_bill_item.unit_price IS NOT NULL AND v_po_item.unit_price IS NOT NULL THEN
      IF ABS(v_bill_item.unit_price - v_po_item.unit_price) > v_price_tolerance THEN
        INSERT INTO matching_exceptions (
          company_id, purchase_order_id, goods_receipt_id, bill_id, product_id,
          exception_type, po_price, bill_price, severity, description
        )
        VALUES (
          p_company_id, v_bill.purchase_order_id, v_bill.goods_receipt_id, p_bill_id, v_bill_item.product_id,
          'price_mismatch', v_po_item.unit_price, v_bill_item.unit_price, 'warning',
          'Bill price (' || v_bill_item.unit_price || ') differs from PO price (' || v_po_item.unit_price || ')'
        )
        RETURNING id INTO v_exception_id;
        
        v_exception := jsonb_build_object(
          'id', v_exception_id, 'type', 'price_mismatch', 'product_id', v_bill_item.product_id,
          'message', 'Bill price differs from PO price',
          'po_price', v_po_item.unit_price, 'bill_price', v_bill_item.unit_price
        );
        v_exceptions := v_exceptions || v_exception;
      END IF;
    END IF;
  END LOOP;
  
  IF v_bill.purchase_order_id IS NOT NULL AND v_bill.goods_receipt_id IS NULL THEN
    INSERT INTO matching_exceptions (
      company_id, purchase_order_id, bill_id, exception_type, severity, description
    )
    VALUES (
      p_company_id, v_bill.purchase_order_id, p_bill_id, 'missing_grn', 'warning',
      'Bill linked to PO but no GRN found'
    )
    RETURNING id INTO v_exception_id;
    
    v_exception := jsonb_build_object('id', v_exception_id, 'type', 'missing_grn', 'message', 'Bill linked to PO but no GRN found');
    v_exceptions := v_exceptions || v_exception;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'has_exceptions', jsonb_array_length(v_exceptions) > 0,
    'exceptions', v_exceptions,
    'exceptions_count', jsonb_array_length(v_exceptions)
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Function: Check Bill Quantities vs GRN
CREATE OR REPLACE FUNCTION check_bill_quantities(
  p_bill_id UUID,
  p_grn_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill_item RECORD;
  v_grn_item RECORD;
  v_mismatches JSONB := '[]'::JSONB;
  v_mismatch JSONB;
  v_valid BOOLEAN := true;
BEGIN
  FOR v_bill_item IN 
    SELECT bi.*, p.name as product_name
    FROM bill_items bi
    LEFT JOIN products p ON p.id = bi.product_id
    WHERE bi.bill_id = p_bill_id AND bi.product_id IS NOT NULL
  LOOP
    SELECT * INTO v_grn_item FROM goods_receipt_items
    WHERE goods_receipt_id = p_grn_id AND product_id = v_bill_item.product_id LIMIT 1;
    
    IF v_grn_item IS NULL THEN
      v_valid := false;
      v_mismatch := jsonb_build_object(
        'product_id', v_bill_item.product_id, 'product_name', v_bill_item.product_name,
        'bill_qty', v_bill_item.quantity, 'grn_qty', 0, 'difference', v_bill_item.quantity,
        'message', 'Product not found in GRN'
      );
      v_mismatches := v_mismatches || v_mismatch;
    ELSIF v_bill_item.quantity > v_grn_item.quantity_accepted THEN
      v_valid := false;
      v_mismatch := jsonb_build_object(
        'product_id', v_bill_item.product_id, 'product_name', v_bill_item.product_name,
        'bill_qty', v_bill_item.quantity, 'grn_qty', v_grn_item.quantity_accepted,
        'difference', v_bill_item.quantity - v_grn_item.quantity_accepted,
        'message', 'Bill quantity exceeds GRN accepted quantity'
      );
      v_mismatches := v_mismatches || v_mismatch;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'valid', v_valid,
    'mismatches', v_mismatches,
    'mismatch_count', jsonb_array_length(v_mismatches)
  );
END;
$$;

-- 6. Trigger: Auto-validate on bill_items insert/update
CREATE OR REPLACE FUNCTION trigger_validate_bill_matching()
RETURNS TRIGGER AS $$
DECLARE
  v_bill RECORD;
  v_validation_result JSONB;
BEGIN
  SELECT * INTO v_bill FROM bills WHERE id = NEW.bill_id;
  
  IF v_bill.purchase_order_id IS NOT NULL OR v_bill.goods_receipt_id IS NOT NULL THEN
    SELECT validate_three_way_matching(NEW.bill_id, v_bill.company_id) INTO v_validation_result;
    RAISE NOTICE 'Three-way matching validation for bill %: %', NEW.bill_id, v_validation_result;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_bill_matching ON bill_items;
CREATE TRIGGER trg_validate_bill_matching
  AFTER INSERT OR UPDATE ON bill_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_validate_bill_matching();

COMMENT ON TABLE matching_exceptions IS 'Exceptions found during three-way matching (PO/GRN/Bill)';
COMMENT ON FUNCTION validate_three_way_matching IS 'Validates three-way matching for a bill and creates exceptions if mismatches found';
COMMENT ON FUNCTION check_bill_quantities IS 'Checks if bill quantities are within GRN accepted quantities';

COMMIT;

-- ============================================================
-- ✅ MIGRATION COMPLETE
-- ============================================================
-- All three modules have been successfully created:
-- 1. Purchase Requests (purchase_requests, purchase_request_items)
-- 2. Goods Receipts (goods_receipts, goods_receipt_items)
-- 3. Three-Way Matching (matching_exceptions)
-- ============================================================
