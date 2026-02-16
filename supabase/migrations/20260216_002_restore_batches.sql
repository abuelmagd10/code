-- =============================================
-- SCALABLE BACKUP & RESTORE: Batches Support
-- Date: 2026-02-16
-- Description: Adds restore_batches table and updates RPC to support chunked data
-- =============================================

BEGIN;

-- 1. Create Restore Batches Table
CREATE TABLE IF NOT EXISTS restore_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES restore_queue(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  batch_index INT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restore_batches_queue ON restore_batches(queue_id, table_name, batch_index);

-- 2. Update the Atomic Restore RPC Function to support Batches
CREATE OR REPLACE FUNCTION restore_company_backup(
  p_queue_id UUID,
  p_dry_run BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
  v_queue_record restore_queue%ROWTYPE;
  v_backup_data JSONB;
  v_metadata JSONB;
  v_data JSONB; -- Used if single JSONB
  v_table_name TEXT;
  v_rows JSONB;
  v_company_id UUID;
  v_report JSONB := '{}'::JSONB;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_duration_ms INT;
  v_error_msg TEXT;
  v_total_records INT := 0;
  
  -- Validation Variables
  v_before_counts JSONB := '{}'::JSONB;
  v_after_counts JSONB := '{}'::JSONB;
  v_balance_check RECORD;
  v_orphan_check INT;
  
  -- Cursor for topological order (Insert Order)
  c_tables TEXT[] := ARRAY[
    'companies',
    'branches', 'warehouses', 'cost_centers',
    'chart_of_accounts',
    'customers', 'suppliers', 'employees', 'shareholders',
    'company_members',
    'products', 'services', 
    'sales_orders', 'purchase_orders',
    'invoices', 'bills',
    'sales_order_items', 'purchase_order_items', 'invoice_items', 'bill_items',
    'sales_returns', 'purchase_returns', 'sales_return_items', 'purchase_return_items',
    'customer_debit_notes', 'customer_debit_note_items', 'customer_credits', 'customer_credit_applications',
    'supplier_debit_notes', 'vendor_credits',
    'inventory_transactions',
    'inventory_write_offs',
    'fixed_assets', 'asset_transactions', 'depreciation_schedules',
    'journal_entries', 'journal_entry_lines',
    'payments',
    'bank_accounts', 'bank_transactions', 'bank_reconciliations',
    'payroll_runs', 'payslips', 'user_bonuses'
  ];
  
  -- Temp record for loops
  r_record RECORD;
  i INT;
  j INT;
  v_row_json JSONB;
  
  -- Batch Processing Variables
  v_use_batches BOOLEAN := FALSE;
  r_batch RECORD;
BEGIN
  v_start_time := NOW();
  
  -- A. Fetch Queue Record & Lock
  SELECT * INTO v_queue_record FROM restore_queue WHERE id = p_queue_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue record not found');
  END IF;

  v_company_id := v_queue_record.company_id;
  
  -- B. Determine Data Source
  v_backup_data := v_queue_record.backup_data;
  
  IF v_backup_data IS NOT NULL THEN
     -- Small Backup: Use direct JSON
     v_metadata := v_backup_data->'metadata';
     v_data := v_backup_data->'data';
     v_use_batches := FALSE;
  ELSE
     -- Large Backup: Check for Batches and Metadata in Queue (Metadata should be in backup_data or separate?)
     -- We assume backup_data MIGHT allow null data but contain metadata? 
     -- Or we look for a "meta" batch? 
     -- Let's assume queue record has a 'report' or 'backup_data' that at least contains metadata.
     -- If v_backup_data is NULL, we can't get metadata easily.
     -- FIX: Client should ALWAYS populate metadata in 'backup_data' column even if 'data' key is empty/null/ref.
     -- Or we check if 'data' key is missing.
     
     -- Let's check if there are batches
     PERFORM 1 FROM restore_batches WHERE queue_id = p_queue_id;
     IF FOUND THEN
        v_use_batches := TRUE;
        -- Assume metadata is in v_backup_data (which shouldn't be null, just 'data' might be empty)
        -- If v_backup_data is truly null, we have a problem. Client must validly init the queue.
        IF v_backup_data IS NULL THEN
           RETURN jsonb_build_object('success', false, 'error', 'Queue must contain metadata even if data is batched');
        END IF;
        v_metadata := v_backup_data->'metadata';
     ELSE
        RETURN jsonb_build_object('success', false, 'error', 'No backup data or batches found');
     END IF;
  END IF;

  -- D. DRY RUN SIMULATION INIT
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
       -- Verify table exists to avoid errors
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
      
      IF v_use_batches THEN
         -- Process Batches for this table
         FOR r_batch IN SELECT data FROM restore_batches WHERE queue_id = p_queue_id AND table_name = v_table_name ORDER BY batch_index LOOP
             v_rows := r_batch.data;
             IF v_rows IS NOT NULL AND jsonb_array_length(v_rows) > 0 THEN
                 FOR j IN 0 .. jsonb_array_length(v_rows) - 1 LOOP
                     v_row_json := v_rows->j;
                     v_row_json := jsonb_set(v_row_json, '{company_id}', to_jsonb(v_company_id));
                     EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)', v_table_name, v_table_name) USING v_row_json;
                 END LOOP;
                 v_total_records := v_total_records + jsonb_array_length(v_rows);
             END IF;
         END LOOP;
      ELSE
         -- Process Single JSON
         v_rows := v_data->v_table_name;
         IF v_rows IS NOT NULL AND jsonb_array_length(v_rows) > 0 THEN
             FOR j IN 0 .. jsonb_array_length(v_rows) - 1 LOOP
                 v_row_json := v_rows->j;
                 v_row_json := jsonb_set(v_row_json, '{company_id}', to_jsonb(v_company_id));
                 EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)', v_table_name, v_table_name) USING v_row_json;
             END LOOP;
             v_total_records := v_total_records + jsonb_array_length(v_rows);
         END IF;
      END IF;
    END LOOP;

    -- 4. Post-Restore Integrity Checks
    -- A. Financial Balance
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
    
    -- B. Orphan Checks (Invoice Items)
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
       RAISE EXCEPTION 'DRY_RUN_COMPLETED'; 
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
       v_error_msg := SQLERRM;
       
       IF v_error_msg = 'DRY_RUN_COMPLETED' THEN
          v_report := jsonb_build_object(
             'success', true,
             'mode', 'DRY_RUN',
             'counts_before', v_before_counts,
             'counts_expected', v_after_counts,
             'financial_status', 'BALANCED',
             'message', 'Dry Run Successful. Data is valid.',
             'summary', jsonb_build_object('totalRecords', v_total_records)
          );
          v_error_msg := NULL;
       ELSE
          v_report := jsonb_build_object(
             'success', false,
             'mode', CASE WHEN p_dry_run THEN 'DRY_RUN' ELSE 'RESTORE' END,
             'error', v_error_msg
          );
       END IF;
  END;

  v_end_time := NOW();
  v_duration_ms := EXTRACT(MILLISECOND FROM (v_end_time - v_start_time));
  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT, INSERT, UPDATE, DELETE ON restore_batches TO authenticated;

COMMIT;
