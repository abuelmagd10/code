-- ============================================================================
-- Script: Create Vendor Credits from Existing Bill Returns
-- Purpose: Auto-create Vendor Credits for bills with returned_amount > 0
-- Target: Bills with status = 'paid' or 'partially_paid' that have returns
-- Author: System Migration
-- Date: 2026-01-06
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE FUNCTION TO GENERATE VENDOR CREDITS
-- ============================================================================

CREATE OR REPLACE FUNCTION create_vendor_credit_from_bill_return(
  p_bill_id UUID
) RETURNS UUID AS $$
DECLARE
  v_bill RECORD;
  v_vendor_credit_id UUID;
  v_credit_number TEXT;
  v_next_number INTEGER;
  v_company_prefix TEXT;
BEGIN
  -- Get bill details
  SELECT
    b.id,
    b.company_id,
    b.branch_id,
    b.cost_center_id,
    b.supplier_id,
    b.returned_amount,
    b.bill_date,
    b.bill_number,
    b.status,
    b.return_status,
    c.name as company_name
  INTO v_bill
  FROM bills b
  INNER JOIN companies c ON c.id = b.company_id
  WHERE b.id = p_bill_id;

  -- Validation: Bill must exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found: %', p_bill_id;
  END IF;

  -- Validation: Bill must be Paid or Partially Paid or Fully Returned
  IF v_bill.status NOT IN ('paid', 'partially_paid', 'fully_returned') THEN
    RAISE NOTICE 'Bill % is not eligible (status: %). Skipping.',
      v_bill.bill_number, v_bill.status;
    RETURN NULL;
  END IF;

  -- Validation: Must have returned amount
  IF v_bill.returned_amount IS NULL OR v_bill.returned_amount <= 0 THEN
    RAISE NOTICE 'Bill % has no returned amount. Skipping.', v_bill.bill_number;
    RETURN NULL;
  END IF;

  -- Check if Vendor Credit already exists for this bill
  SELECT id INTO v_vendor_credit_id
  FROM vendor_credits
  WHERE source_purchase_invoice_id = p_bill_id
    AND reference_type = 'bill_return'
  LIMIT 1;

  IF FOUND THEN
    RAISE NOTICE 'Vendor Credit already exists for bill %. Skipping.', v_bill.bill_number;
    RETURN v_vendor_credit_id;
  END IF;

  -- Generate credit number
  -- Get company prefix (first 3 letters)
  v_company_prefix := UPPER(LEFT(REGEXP_REPLACE(v_bill.company_name, '[^a-zA-Z]', '', 'g'), 3));
  IF v_company_prefix = '' THEN
    v_company_prefix := 'VC';
  END IF;

  -- Get next number for this company
  SELECT COALESCE(MAX(
    CASE 
      WHEN credit_number ~ '^[A-Z]+-VC-[0-9]+$' 
      THEN CAST(SUBSTRING(credit_number FROM '[0-9]+$') AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_next_number
  FROM vendor_credits
  WHERE company_id = v_bill.company_id;

  v_credit_number := v_company_prefix || '-VC-' || LPAD(v_next_number::TEXT, 4, '0');

  -- Create Vendor Credit
  INSERT INTO vendor_credits (
    company_id,
    branch_id,
    cost_center_id,
    supplier_id,
    credit_number,
    credit_date,
    subtotal,
    tax_amount,
    total_amount,
    applied_amount,
    status,
    source_purchase_invoice_id,
    reference_type,
    reference_id,
    notes,
    created_at,
    updated_at
  ) VALUES (
    v_bill.company_id,
    v_bill.branch_id,
    v_bill.cost_center_id,
    v_bill.supplier_id,
    v_credit_number,
    v_bill.bill_date, -- Use bill date as credit date
    v_bill.returned_amount, -- subtotal
    0, -- tax_amount
    v_bill.returned_amount, -- total_amount
    0, -- No amount applied yet
    'open', -- Initial status
    p_bill_id,
    'bill_return',
    p_bill_id, -- reference_id points to bill
    'Auto-generated from bill return: ' || v_bill.bill_number ||
      ' (Returned: ' || v_bill.returned_amount || ', Status: ' || COALESCE(v_bill.return_status, 'N/A') || ')',
    NOW(),
    NOW()
  ) RETURNING id INTO v_vendor_credit_id;

  RAISE NOTICE 'Created Vendor Credit % (ID: %) for bill % with amount %',
    v_credit_number, v_vendor_credit_id, v_bill.bill_number, v_bill.returned_amount;

  RETURN v_vendor_credit_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating vendor credit for bill %: %', p_bill_id, SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: CREATE BATCH FUNCTION TO PROCESS ALL ELIGIBLE BILLS
-- ============================================================================

CREATE OR REPLACE FUNCTION create_vendor_credits_for_all_returns()
RETURNS TABLE (
  bill_id UUID,
  bill_number TEXT,
  company_name TEXT,
  returned_amount NUMERIC,
  vendor_credit_id UUID,
  status TEXT
) AS $$
DECLARE
  v_bill RECORD;
  v_vc_id UUID;
  v_processed INTEGER := 0;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting Vendor Credits Migration';
  RAISE NOTICE '========================================';

  -- Loop through all eligible bills
  FOR v_bill IN
    SELECT 
      b.id,
      b.bill_number,
      c.name as company_name,
      b.returned_amount,
      b.status,
      b.return_status
    FROM bills b
    INNER JOIN companies c ON c.id = b.company_id
    WHERE b.returned_amount > 0
      AND b.status IN ('paid', 'partially_paid', 'fully_returned')
    ORDER BY c.name, b.bill_number
  LOOP
    v_processed := v_processed + 1;
    
    BEGIN
      -- Create vendor credit
      v_vc_id := create_vendor_credit_from_bill_return(v_bill.id);
      
      IF v_vc_id IS NOT NULL THEN
        v_created := v_created + 1;
        
        RETURN QUERY SELECT 
          v_bill.id,
          v_bill.bill_number,
          v_bill.company_name,
          v_bill.returned_amount,
          v_vc_id,
          'created'::TEXT;
      ELSE
        v_skipped := v_skipped + 1;
        
        RETURN QUERY SELECT 
          v_bill.id,
          v_bill.bill_number,
          v_bill.company_name,
          v_bill.returned_amount,
          NULL::UUID,
          'skipped'::TEXT;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        
        RETURN QUERY SELECT 
          v_bill.id,
          v_bill.bill_number,
          v_bill.company_name,
          v_bill.returned_amount,
          NULL::UUID,
          ('error: ' || SQLERRM)::TEXT;
    END;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete';
  RAISE NOTICE 'Processed: %', v_processed;
  RAISE NOTICE 'Created: %', v_created;
  RAISE NOTICE 'Skipped: %', v_skipped;
  RAISE NOTICE 'Errors: %', v_errors;
  RAISE NOTICE '========================================';

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: ADD COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_vendor_credit_from_bill_return(UUID) IS 
'Creates a Vendor Credit for a bill that has returned_amount > 0. Only processes bills with status paid/partially_paid.';

COMMENT ON FUNCTION create_vendor_credits_for_all_returns() IS 
'Batch processes all bills with returns and creates corresponding Vendor Credits. Returns summary of results.';

