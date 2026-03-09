-- ============================================================
-- 📋 Purchase Requests Module - Migration
-- ============================================================
-- Date: 2024
-- Description: Create purchase_requests and purchase_request_items tables
--              with RLS policies, triggers, and RPC functions
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Create purchase_requests table
-- ============================================================

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
  -- department_id removed - departments table does not exist in current schema
  
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

-- Create unique constraint on request_number per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_requests_number_company 
ON purchase_requests(company_id, request_number);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_requests_company ON purchase_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_requested_by ON purchase_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_date ON purchase_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_po ON purchase_requests(converted_to_po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_governance ON purchase_requests(company_id, branch_id, cost_center_id, warehouse_id);

-- ============================================================
-- 2. Create purchase_request_items table
-- ============================================================

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request ON purchase_request_items(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_product ON purchase_request_items(product_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS Policies for purchase_requests
-- ============================================================

-- Select policy
DROP POLICY IF EXISTS "purchase_requests_select" ON purchase_requests;
CREATE POLICY "purchase_requests_select" ON purchase_requests FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Insert policy
DROP POLICY IF EXISTS "purchase_requests_insert" ON purchase_requests;
CREATE POLICY "purchase_requests_insert" ON purchase_requests FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Update policy
DROP POLICY IF EXISTS "purchase_requests_update" ON purchase_requests;
CREATE POLICY "purchase_requests_update" ON purchase_requests FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Delete policy (only draft)
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

-- ============================================================
-- 5. RLS Policies for purchase_request_items
-- ============================================================

-- Select policy
DROP POLICY IF EXISTS "purchase_request_items_select" ON purchase_request_items;
CREATE POLICY "purchase_request_items_select" ON purchase_request_items FOR SELECT
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- Insert policy
DROP POLICY IF EXISTS "purchase_request_items_insert" ON purchase_request_items;
CREATE POLICY "purchase_request_items_insert" ON purchase_request_items FOR INSERT
  WITH CHECK (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- Update policy
DROP POLICY IF EXISTS "purchase_request_items_update" ON purchase_request_items;
CREATE POLICY "purchase_request_items_update" ON purchase_request_items FOR UPDATE
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- Delete policy (only if request is draft)
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

-- ============================================================
-- 6. Auto-generate request number function
-- ============================================================

CREATE OR REPLACE FUNCTION auto_generate_purchase_request_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_company_prefix TEXT;
  v_next_number INTEGER;
  v_new_number TEXT;
BEGIN
  IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
    -- Use advisory lock to prevent race conditions
    v_lock_key := hashtext('purchase_request_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Get company prefix (default: PR-)
    SELECT COALESCE(settings->>'purchase_request_prefix', 'PR-')
    INTO v_company_prefix
    FROM companies
    WHERE id = NEW.company_id;
    
    -- Get next number
    SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM purchase_requests
    WHERE company_id = NEW.company_id
      AND request_number ~ ('^' || v_company_prefix || '[0-9]+$');
    
    -- Generate number
    v_new_number := v_company_prefix || LPAD(v_next_number::TEXT, 6, '0');
    NEW.request_number := v_new_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_generate_purchase_request_number ON purchase_requests;
CREATE TRIGGER trg_auto_generate_purchase_request_number
  BEFORE INSERT ON purchase_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
  EXECUTE FUNCTION auto_generate_purchase_request_number();

-- ============================================================
-- 7. RPC Function: Convert Purchase Request to PO
-- ============================================================

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
  -- 1. Validate user
  SELECT role, branch_id INTO v_user_role, v_user_branch
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  -- 2. Fetch and lock request
  SELECT * INTO v_request
  FROM purchase_requests
  WHERE id = p_request_id 
    AND company_id = p_company_id
    AND status = 'approved'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase request not found or not approved');
  END IF;
  
  -- 3. Branch isolation check
  IF v_user_branch IS NOT NULL AND v_request.branch_id IS NOT NULL 
     AND v_user_branch != v_request.branch_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation');
  END IF;
  
  -- 4. Calculate totals from approved items
  SELECT 
    COALESCE(SUM(estimated_total), 0),
    COALESCE(SUM(estimated_total * 0.15), 0) -- Default 15% tax (can be adjusted)
  INTO v_subtotal, v_tax_amount
  FROM purchase_request_items
  WHERE purchase_request_id = p_request_id
    AND quantity_approved > 0;
  
  v_total := v_subtotal + v_tax_amount;
  
  -- 5. Create Purchase Order
  INSERT INTO purchase_orders (
    company_id,
    supplier_id,
    po_date,
    due_date,
    status,
    currency,
    exchange_rate,
    subtotal,
    tax_amount,
    total,
    total_amount,
    branch_id,
    cost_center_id,
    warehouse_id,
    notes,
    created_by_user_id
  )
  VALUES (
    p_company_id,
    p_supplier_id,
    CURRENT_DATE,
    v_request.required_date,
    'draft',
    v_request.currency,
    v_request.exchange_rate,
    v_subtotal,
    v_tax_amount,
    v_total,
    v_total,
    v_request.branch_id,
    v_request.cost_center_id,
    v_request.warehouse_id,
    COALESCE(v_request.notes, '') || ' (Converted from PR: ' || v_request.request_number || ')',
    p_user_id
  )
  RETURNING id, po_number INTO v_po_id, v_po_number;
  
  -- 6. Create Purchase Order Items from Request Items
  FOR v_item IN 
    SELECT * FROM purchase_request_items
    WHERE purchase_request_id = p_request_id
      AND quantity_approved > 0
  LOOP
    INSERT INTO purchase_order_items (
      purchase_order_id,
      product_id,
      description,
      quantity,
      unit_price,
      tax_rate,
      line_total,
      item_type
    )
    VALUES (
      v_po_id,
      v_item.product_id,
      v_item.description,
      v_item.quantity_approved,
      v_item.estimated_unit_price,
      15.0, -- Default tax rate (can be adjusted)
      v_item.estimated_total,
      v_item.item_type
    );
  END LOOP;
  
  -- 7. Update request status
  UPDATE purchase_requests
  SET 
    status = 'converted_to_po',
    converted_to_po_id = v_po_id,
    converted_at = NOW(),
    converted_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  -- 8. Audit log
  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id,
    old_values, new_values, created_at
  )
  VALUES (
    p_company_id, p_user_id, 'purchase_request_converted', 'purchase_request', p_request_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'converted_to_po', 'po_id', v_po_id, 'po_number', v_po_number),
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'po_id', v_po_id,
    'po_number', v_po_number,
    'request_id', p_request_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 8. Create default approval workflows for purchase requests
-- ============================================================

-- Insert default workflow for each company
INSERT INTO approval_workflows (company_id, document_type, name, is_active)
SELECT 
  id,
  'purchase_request',
  'Default Purchase Request Workflow',
  true
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows 
  WHERE document_type = 'purchase_request' 
  AND company_id = companies.id
);

-- Create approval steps (Manager → Admin)
INSERT INTO approval_steps (workflow_id, step_order, role_required)
SELECT 
  wf.id,
  1,
  'manager'
FROM approval_workflows wf
WHERE wf.document_type = 'purchase_request'
  AND NOT EXISTS (
    SELECT 1 FROM approval_steps 
    WHERE workflow_id = wf.id AND step_order = 1
  );

INSERT INTO approval_steps (workflow_id, step_order, role_required)
SELECT 
  wf.id,
  2,
  'admin'
FROM approval_workflows wf
WHERE wf.document_type = 'purchase_request'
  AND NOT EXISTS (
    SELECT 1 FROM approval_steps 
    WHERE workflow_id = wf.id AND step_order = 2
  );

COMMENT ON TABLE purchase_requests IS 'Purchase requests for internal planning before creating purchase orders';
COMMENT ON TABLE purchase_request_items IS 'Items requested in purchase requests';

COMMIT;
