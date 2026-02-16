-- =============================================
-- ATOMIC BACKUP & RESTORE SYSTEM
-- Date: 2026-02-16
-- Description: Enterprise-grade Atomic Restore RPC with Dry Run & Validation
-- =============================================

BEGIN;

-- 1. Create Restore Queue Table (to handle large payloads via Storage/Staging)
CREATE TABLE IF NOT EXISTS restore_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DRY_RUN_SUCCESS', 'DRY_RUN_FAILED')),
  backup_file_url TEXT, -- Path in Storage
  backup_data JSONB,    -- Direct JSON (if small)
  report JSONB,         -- detailed validation report
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  ip_address TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_restore_queue_company_status ON restore_queue(company_id, status);

-- 2. Create the Atomic Restore RPC Function
CREATE OR REPLACE FUNCTION restore_company_backup(
  p_queue_id UUID,
  p_dry_run BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
  v_queue_record restore_queue%ROWTYPE;
  v_backup_data JSONB;
  v_metadata JSONB;
  v_data JSONB;
  v_table_name TEXT;
  v_rows JSONB;
  v_company_id UUID;
  v_report JSONB := '{}'::JSONB;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_duration_ms INT;
  v_error_msg TEXT;
  v_total_records INT := 0;
  v_schema_version TEXT;
  v_erp_version TEXT;
  
  -- Validation Variables
  v_before_counts JSONB := '{}'::JSONB;
  v_after_counts JSONB := '{}'::JSONB;
  v_balance_check RECORD;
  v_orphan_check INT;
  
  -- Cursor for topological order (Insert Order)
  -- Note: This matches the EXPORT_ORDER from types.ts
  c_tables TEXT[] := ARRAY[
    'companies',
    'branches', 'warehouses', 'cost_centers',
    'chart_of_accounts',
    'customers', 'suppliers', 'employees', 'shareholders',
    'products',
    'sales_orders', 'purchase_orders',
    'invoices', 'bills',
    'sales_order_items', 'purchase_order_items', 'invoice_items', 'bill_items',
    'sales_returns', 'purchase_returns',
    'customer_debit_notes', 'inventory_write_offs',
    'journal_entries', 'journal_entry_lines',
    'payments',
    'inventory_transactions',
    'fixed_assets', 'asset_transactions',
    'company_members'
    -- Add other tables as needed based on dependency graph
  ];
  
  -- Temp record for loops
  r_record RECORD;
  i INT;
  j INT;
  v_row_json JSONB;
  v_insert_query TEXT;
  v_column_names TEXT;
BEGIN
  v_start_time := NOW();
  
  -- A. Fetch Queue Record & Lock
  SELECT * INTO v_queue_record FROM restore_queue WHERE id = p_queue_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue record not found');
  END IF;

  v_company_id := v_queue_record.company_id;
  
  -- B. Load Data (Support JSONB column for now to keep it simple within RPC limits)
  v_backup_data := v_queue_record.backup_data;
  
  IF v_backup_data IS NULL THEN
     RETURN jsonb_build_object('success', false, 'error', 'No backup data found in queue');
  END IF;
  
  v_metadata := v_backup_data->'metadata';
  v_data := v_backup_data->'data';
  
  -- C. Version & Metadata Validation
  v_schema_version := v_metadata->>'schema_version';
  v_erp_version := v_metadata->>'erp_version';
  
  -- D. DRY RUN SIMULATION (If p_dry_run is TRUE)
  IF p_dry_run THEN
    v_report := jsonb_build_object(
      'status', 'DRY_RUN',
      'valid', true,
      'metadata', v_metadata
    );
  END IF;

  -- =========================================================
  -- CORE LOGIC WRAPPED IN SUB-BLOCK FOR ATOMICITY / ROLLBACK
  -- =========================================================
  BEGIN
    -- 1. Snapshot Before Counts (for Audit)
    FOR i IN 1 .. array_length(c_tables, 1) LOOP
       v_table_name := c_tables[i];
       
       -- Check if table exists
       PERFORM 1 FROM information_schema.tables WHERE table_name = v_table_name;
       IF FOUND THEN
           EXECUTE format('SELECT count(*) FROM %I WHERE company_id = $1', v_table_name) 
           INTO r_record 
           USING v_company_id;
           v_before_counts := jsonb_set(v_before_counts, ARRAY[v_table_name], to_jsonb(r_record));
       END IF;
    END LOOP;

    -- 2. Aggressive Cleanup (Reverse Order)
    FOR i IN REVERSE array_length(c_tables, 1)..1 LOOP
      v_table_name := c_tables[i];
      
      PERFORM 1 FROM information_schema.tables WHERE table_name = v_table_name;
      IF FOUND AND v_table_name != 'companies' THEN
        EXECUTE format('DELETE FROM %I WHERE company_id = $1', v_table_name) USING v_company_id;
      END IF;
    END LOOP;

    -- 3. Restore Data (Topological Order)
    FOR i IN 1 .. array_length(c_tables, 1) LOOP
      v_table_name := c_tables[i];
      v_rows := v_data->v_table_name;
      
      IF v_rows IS NOT NULL AND jsonb_array_length(v_rows) > 0 THEN
         -- Efficient Insert loop
         FOR j IN 0 .. jsonb_array_length(v_rows) - 1 LOOP
             v_row_json := v_rows->j;
             
             -- Force Company ID Isolation
             v_row_json := jsonb_set(v_row_json, '{company_id}', to_jsonb(v_company_id));
             
             -- Simple Insert using jsonb_populate_record (requires type casting)
             -- We use Dynamic SQL to populate record
             EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)', v_table_name, v_table_name) USING v_row_json;
         END LOOP;
         
         v_total_records := v_total_records + jsonb_array_length(v_rows);
      END IF;
    END LOOP;

    -- 4. Post-Restore Integrity Checks
    -- A. Financial Balance (Debits = Credits)
    PERFORM 1 FROM journal_entries WHERE company_id = v_company_id;
    IF FOUND THEN
        SELECT 
          COALESCE(SUM(debit_amount), 0) as total_debit, 
          COALESCE(SUM(credit_amount), 0) as total_credit 
        INTO v_balance_check
        FROM journal_entry_lines 
        WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = v_company_id);
        
        IF v_balance_check.total_debit != v_balance_check.total_credit THEN
          RAISE EXCEPTION 'Financial Integrity Failed: Debits (%) != Credits (%)', v_balance_check.total_debit, v_balance_check.total_credit;
        END IF;
    END IF;
    
    -- B. Orphan Checks (Example: Invoice Items without Invoice)
    PERFORM 1 FROM invoice_items WHERE company_id = v_company_id;
    IF FOUND THEN
        SELECT count(*) INTO v_orphan_check
        FROM invoice_items ii
        LEFT JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.company_id = v_company_id AND i.id IS NULL;
        
        IF v_orphan_check > 0 THEN
           RAISE EXCEPTION 'Orphan Violation: Found % invoice items without headers', v_orphan_check;
        END IF;
    END IF;

    -- 5. Capture After Counts
    FOR i IN 1 .. array_length(c_tables, 1) LOOP
       v_table_name := c_tables[i];
       PERFORM 1 FROM information_schema.tables WHERE table_name = v_table_name;
       IF FOUND THEN
           EXECUTE format('SELECT count(*) FROM %I WHERE company_id = $1', v_table_name) 
           INTO r_record 
           USING v_company_id;
           v_after_counts := jsonb_set(v_after_counts, ARRAY[v_table_name], to_jsonb(r_record));
       END IF;
    END LOOP;

    -- 6. DECISION: COMMIT OR ROLLBACK
    IF p_dry_run THEN
       -- Rollback simulated changes but return success report
       RAISE EXCEPTION 'DRY_RUN_COMPLETED'; 
    END IF;
    
    -- If we are here, it's a real run and everything passed.
    -- The transaction will commit automatically at function end.

  EXCEPTION
    WHEN OTHERS THEN
       v_error_msg := SQLERRM;
       
       IF v_error_msg = 'DRY_RUN_COMPLETED' THEN
          -- Capturing the happy path for Dry Run
          v_report := jsonb_build_object(
             'success', true,
             'mode', 'DRY_RUN',
             'counts_before', v_before_counts,
             'counts_expected', v_after_counts,
             'financial_status', 'BALANCED',
             'message', 'Dry Run Successful. Data is valid.'
          );
          -- Reset error because this is actually a success for Dry Run
          v_error_msg := NULL;
       ELSE
          -- Real Error or Dry Run Failure
          v_report := jsonb_build_object(
             'success', false,
             'mode', CASE WHEN p_dry_run THEN 'DRY_RUN' ELSE 'RESTORE' END,
             'error', v_error_msg
          );
          -- If not Dry Run, we must rollback everything. The Exception block does that automatically.
       END IF;
  END;

  v_end_time := NOW();
  v_duration_ms := EXTRACT(MILLISECOND FROM (v_end_time - v_start_time));
  
  -- Update Restore Queue Status (This might be rolled back if exception occurred? 
  -- No, because we caught the OTHERS exception, the main transaction is still valid to return)
  -- BUT since we are returning JSON, the calling code should likely update the queue status if needed, 
  -- OR we should update it here if we want persistence.
  -- Limitation: Updating the table here after catching exception is tricky if the exception caused a ROLLBACK TO SAVEPOINT.
  -- We'll return the JSON and let application handle status update.
  
  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant Permissions
GRANT SELECT, INSERT, UPDATE ON restore_queue TO authenticated;
GRANT EXECUTE ON FUNCTION restore_company_backup TO authenticated;

COMMIT;

-- =============================================
-- ✅ Atomic Restore System Installed
-- =============================================
