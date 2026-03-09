-- ============================================================
-- 🔍 Three-Way Matching Module - Migration
-- ============================================================
-- Date: 2024
-- Description: Create matching_exceptions table and validation functions
--              for matching PO / GRN / Invoice quantities and prices
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Create matching_exceptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS matching_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Links
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Exception Details
  exception_type TEXT NOT NULL CHECK (exception_type IN (
    'quantity_mismatch',      -- Bill qty > GRN qty
    'price_mismatch',         -- Bill price ≠ PO price
    'missing_grn',            -- Bill without GRN
    'missing_po',             -- GRN without PO
    'over_receipt',           -- GRN qty > PO qty (beyond tolerance)
    'under_receipt'           -- GRN qty < PO qty (significant)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_company ON matching_exceptions(company_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_po ON matching_exceptions(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_grn ON matching_exceptions(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_bill ON matching_exceptions(bill_id);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_status ON matching_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_type ON matching_exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_matching_exceptions_product ON matching_exceptions(product_id);

-- ============================================================
-- 2. Enable RLS
-- ============================================================

ALTER TABLE matching_exceptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS Policies for matching_exceptions
-- ============================================================

-- Select policy
DROP POLICY IF EXISTS "matching_exceptions_select" ON matching_exceptions;
CREATE POLICY "matching_exceptions_select" ON matching_exceptions FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Insert policy (system only - via functions)
DROP POLICY IF EXISTS "matching_exceptions_insert" ON matching_exceptions;
CREATE POLICY "matching_exceptions_insert" ON matching_exceptions FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- Update policy (for resolving exceptions)
DROP POLICY IF EXISTS "matching_exceptions_update" ON matching_exceptions;
CREATE POLICY "matching_exceptions_update" ON matching_exceptions FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

-- ============================================================
-- 4. Function: Validate Three-Way Matching
-- ============================================================

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
  v_price_tolerance NUMERIC(12,2) := 0.01; -- Allow 0.01 difference in price
BEGIN
  -- 1. Fetch bill
  SELECT * INTO v_bill
  FROM bills
  WHERE id = p_bill_id AND company_id = p_company_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  -- 2. Fetch linked PO and GRN
  IF v_bill.purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po
    FROM purchase_orders
    WHERE id = v_bill.purchase_order_id;
  END IF;
  
  IF v_bill.goods_receipt_id IS NOT NULL THEN
    SELECT * INTO v_grn
    FROM goods_receipts
    WHERE id = v_bill.goods_receipt_id;
  END IF;
  
  -- 3. Validate each bill item
  FOR v_bill_item IN 
    SELECT * FROM bill_items
    WHERE bill_id = p_bill_id
      AND product_id IS NOT NULL
  LOOP
    -- Find corresponding PO item
    IF v_po IS NOT NULL THEN
      SELECT * INTO v_po_item
      FROM purchase_order_items
      WHERE purchase_order_id = v_bill.purchase_order_id
        AND product_id = v_bill_item.product_id
      LIMIT 1;
    END IF;
    
    -- Find corresponding GRN item
    IF v_grn IS NOT NULL THEN
      SELECT * INTO v_grn_item
      FROM goods_receipt_items
      WHERE goods_receipt_id = v_bill.goods_receipt_id
        AND product_id = v_bill_item.product_id
      LIMIT 1;
    END IF;
    
    -- Check 1: Bill quantity vs GRN accepted quantity
    IF v_grn_item IS NOT NULL THEN
      IF v_bill_item.quantity > v_grn_item.quantity_accepted THEN
        -- Create exception
        INSERT INTO matching_exceptions (
          company_id,
          purchase_order_id,
          goods_receipt_id,
          bill_id,
          product_id,
          exception_type,
          po_quantity,
          grn_quantity,
          bill_quantity,
          severity,
          description
        )
        VALUES (
          p_company_id,
          v_bill.purchase_order_id,
          v_bill.goods_receipt_id,
          p_bill_id,
          v_bill_item.product_id,
          'quantity_mismatch',
          COALESCE(v_po_item.quantity, 0),
          v_grn_item.quantity_accepted,
          v_bill_item.quantity,
          'error',
          'Bill quantity (' || v_bill_item.quantity || ') exceeds GRN accepted quantity (' || v_grn_item.quantity_accepted || ')'
        )
        RETURNING id INTO v_exception_id;
        
        v_exception := jsonb_build_object(
          'id', v_exception_id,
          'type', 'quantity_mismatch',
          'product_id', v_bill_item.product_id,
          'message', 'Bill quantity exceeds GRN accepted quantity',
          'bill_qty', v_bill_item.quantity,
          'grn_qty', v_grn_item.quantity_accepted
        );
        v_exceptions := v_exceptions || v_exception;
      END IF;
    END IF;
    
    -- Check 2: Price mismatch (if PO exists)
    IF v_po_item IS NOT NULL AND v_bill_item.unit_price IS NOT NULL AND v_po_item.unit_price IS NOT NULL THEN
      IF ABS(v_bill_item.unit_price - v_po_item.unit_price) > v_price_tolerance THEN
        INSERT INTO matching_exceptions (
          company_id,
          purchase_order_id,
          goods_receipt_id,
          bill_id,
          product_id,
          exception_type,
          po_price,
          bill_price,
          severity,
          description
        )
        VALUES (
          p_company_id,
          v_bill.purchase_order_id,
          v_bill.goods_receipt_id,
          p_bill_id,
          v_bill_item.product_id,
          'price_mismatch',
          v_po_item.unit_price,
          v_bill_item.unit_price,
          'warning',
          'Bill price (' || v_bill_item.unit_price || ') differs from PO price (' || v_po_item.unit_price || ')'
        )
        RETURNING id INTO v_exception_id;
        
        v_exception := jsonb_build_object(
          'id', v_exception_id,
          'type', 'price_mismatch',
          'product_id', v_bill_item.product_id,
          'message', 'Bill price differs from PO price',
          'po_price', v_po_item.unit_price,
          'bill_price', v_bill_item.unit_price
        );
        v_exceptions := v_exceptions || v_exception;
      END IF;
    END IF;
  END LOOP;
  
  -- Check 3: Missing GRN (if PO exists)
  IF v_bill.purchase_order_id IS NOT NULL AND v_bill.goods_receipt_id IS NULL THEN
    INSERT INTO matching_exceptions (
      company_id,
      purchase_order_id,
      bill_id,
      exception_type,
      severity,
      description
    )
    VALUES (
      p_company_id,
      v_bill.purchase_order_id,
      p_bill_id,
      'missing_grn',
      'warning',
      'Bill linked to PO but no GRN found'
    )
    RETURNING id INTO v_exception_id;
    
    v_exception := jsonb_build_object(
      'id', v_exception_id,
      'type', 'missing_grn',
      'message', 'Bill linked to PO but no GRN found'
    );
    v_exceptions := v_exceptions || v_exception;
  END IF;
  
  -- Return result
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

-- ============================================================
-- 5. Function: Check Bill Quantities vs GRN
-- ============================================================

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
  -- Check each bill item against GRN
  FOR v_bill_item IN 
    SELECT bi.*, p.name as product_name
    FROM bill_items bi
    LEFT JOIN products p ON p.id = bi.product_id
    WHERE bi.bill_id = p_bill_id
      AND bi.product_id IS NOT NULL
  LOOP
    -- Find corresponding GRN item
    SELECT * INTO v_grn_item
    FROM goods_receipt_items
    WHERE goods_receipt_id = p_grn_id
      AND product_id = v_bill_item.product_id
    LIMIT 1;
    
    IF v_grn_item IS NULL THEN
      v_valid := false;
      v_mismatch := jsonb_build_object(
        'product_id', v_bill_item.product_id,
        'product_name', v_bill_item.product_name,
        'bill_qty', v_bill_item.quantity,
        'grn_qty', 0,
        'difference', v_bill_item.quantity,
        'message', 'Product not found in GRN'
      );
      v_mismatches := v_mismatches || v_mismatch;
    ELSIF v_bill_item.quantity > v_grn_item.quantity_accepted THEN
      v_valid := false;
      v_mismatch := jsonb_build_object(
        'product_id', v_bill_item.product_id,
        'product_name', v_bill_item.product_name,
        'bill_qty', v_bill_item.quantity,
        'grn_qty', v_grn_item.quantity_accepted,
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

-- ============================================================
-- 6. Trigger: Auto-validate on bill_items insert/update
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_validate_bill_matching()
RETURNS TRIGGER AS $$
DECLARE
  v_bill RECORD;
  v_validation_result JSONB;
BEGIN
  -- Get bill info
  SELECT * INTO v_bill
  FROM bills
  WHERE id = NEW.bill_id;
  
  -- Only validate if bill has PO or GRN
  IF v_bill.purchase_order_id IS NOT NULL OR v_bill.goods_receipt_id IS NOT NULL THEN
    -- Run validation (non-blocking - just logs exceptions)
    SELECT validate_three_way_matching(NEW.bill_id, v_bill.company_id)
    INTO v_validation_result;
    
    -- Log validation result (don't block the operation)
    RAISE NOTICE 'Three-way matching validation for bill %: %', NEW.bill_id, v_validation_result;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on bill_items
DROP TRIGGER IF EXISTS trg_validate_bill_matching ON bill_items;
CREATE TRIGGER trg_validate_bill_matching
  AFTER INSERT OR UPDATE ON bill_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_validate_bill_matching();

COMMENT ON TABLE matching_exceptions IS 'Exceptions found during three-way matching (PO/GRN/Bill)';
COMMENT ON FUNCTION validate_three_way_matching IS 'Validates three-way matching for a bill and creates exceptions if mismatches found';
COMMENT ON FUNCTION check_bill_quantities IS 'Checks if bill quantities are within GRN accepted quantities';

COMMIT;
