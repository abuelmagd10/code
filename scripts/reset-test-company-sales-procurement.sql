-- ============================================================================
-- One-off reset for test company Sales + Procurement transactional data.
-- Scope: company "تست" only.
-- Company ID expected: 8ef6338c-1713-4202-98ac-863633b76526
--
-- Run in Supabase SQL Editor.
-- This script is intentionally SQL-only so the reset runs in one transaction.
-- It does not delete the company, branches, customers, suppliers, products, COA,
-- bank accounts, shareholders, or intercompany/consolidation records.
--
-- What it does reset:
-- - Sales/procurement documents and child rows
-- - Customer/supplier payments and allocations/applications
-- - Sales/procurement journal entries and journal lines
-- - Sales/procurement inventory transactions and FIFO artifacts
-- - Financial traces/replay artifacts linked to this scope
-- - Warehouse/product stock snapshots for the test company products
-- ============================================================================

BEGIN;

CREATE TEMP TABLE reset_test_company_counts (
  domain TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'delete',
  rows_affected INTEGER NOT NULL DEFAULT 0,
  note TEXT
) ON COMMIT PRESERVE ROWS;

DO $$
DECLARE
  v_company_id CONSTANT UUID := '8ef6338c-1713-4202-98ac-863633b76526';
  v_company_name TEXT;

  v_invoice_ids UUID[] := ARRAY[]::UUID[];
  v_sales_order_ids UUID[] := ARRAY[]::UUID[];
  v_sales_return_ids UUID[] := ARRAY[]::UUID[];
  v_sales_return_request_ids UUID[] := ARRAY[]::UUID[];
  v_customer_debit_note_ids UUID[] := ARRAY[]::UUID[];
  v_customer_credit_ids UUID[] := ARRAY[]::UUID[];

  v_bill_ids UUID[] := ARRAY[]::UUID[];
  v_purchase_order_ids UUID[] := ARRAY[]::UUID[];
  v_purchase_return_ids UUID[] := ARRAY[]::UUID[];
  v_vendor_credit_ids UUID[] := ARRAY[]::UUID[];

  v_payment_ids UUID[] := ARRAY[]::UUID[];
  v_payment_journal_ids UUID[] := ARRAY[]::UUID[];
  v_doc_ids UUID[] := ARRAY[]::UUID[];
  v_journal_entry_ids UUID[] := ARRAY[]::UUID[];
  v_inventory_transaction_ids UUID[] := ARRAY[]::UUID[];
  v_trace_ids UUID[] := ARRAY[]::UUID[];
  v_replay_intent_ids UUID[] := ARRAY[]::UUID[];
  v_fifo_lot_ids UUID[] := ARRAY[]::UUID[];
  v_product_ids UUID[] := ARRAY[]::UUID[];
  v_warehouse_ids UUID[] := ARRAY[]::UUID[];

  v_count INTEGER := 0;
  v_trigger_name TEXT;
  v_sales_proc_reference_types TEXT[] := ARRAY[
    'invoice',
    'invoice_payment',
    'invoice_payment_reversal',
    'invoice_reversal',
    'credit_note',
    'customer_credit',
    'customer_credit_application',
    'customer_refund',
    'customer_voucher',
    'sales_order',
    'sales_order_payment',
    'sales_return',
    'sales_return_reversal',
    'bill',
    'bill_payment',
    'bill_payment_reversal',
    'bill_reversal',
    'vendor_credit',
    'vendor_credit_application',
    'supplier_payment',
    'supplier_payment_reversal',
    'purchase_order',
    'purchase_order_payment',
    'purchase_return',
    'purchase_return_reversal'
  ];
BEGIN
  SELECT name
    INTO v_company_name
  FROM public.companies
  WHERE id = v_company_id;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'RESET_ABORTED: company id % was not found', v_company_id;
  END IF;

  IF v_company_name <> 'تست' THEN
    RAISE EXCEPTION 'RESET_ABORTED: company id % resolved to %, expected تست', v_company_id, v_company_name;
  END IF;

  INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
  VALUES ('scope', 'companies', 'verify', 1, 'Verified company تست / ' || v_company_id::TEXT);

  -- Collect primary scope IDs.
  SELECT ARRAY(SELECT id FROM public.invoices WHERE company_id = v_company_id) INTO v_invoice_ids;
  SELECT ARRAY(SELECT id FROM public.sales_orders WHERE company_id = v_company_id) INTO v_sales_order_ids;
  SELECT ARRAY(SELECT id FROM public.sales_returns WHERE company_id = v_company_id) INTO v_sales_return_ids;
  SELECT ARRAY(SELECT id FROM public.sales_return_requests WHERE company_id = v_company_id) INTO v_sales_return_request_ids;
  SELECT ARRAY(SELECT id FROM public.customer_debit_notes WHERE company_id = v_company_id) INTO v_customer_debit_note_ids;
  SELECT ARRAY(SELECT id FROM public.customer_credits WHERE company_id = v_company_id) INTO v_customer_credit_ids;

  SELECT ARRAY(SELECT id FROM public.bills WHERE company_id = v_company_id) INTO v_bill_ids;
  SELECT ARRAY(SELECT id FROM public.purchase_orders WHERE company_id = v_company_id) INTO v_purchase_order_ids;
  SELECT ARRAY(SELECT id FROM public.purchase_returns WHERE company_id = v_company_id) INTO v_purchase_return_ids;
  SELECT ARRAY(SELECT id FROM public.vendor_credits WHERE company_id = v_company_id) INTO v_vendor_credit_ids;

  SELECT ARRAY(SELECT id FROM public.products WHERE company_id = v_company_id) INTO v_product_ids;
  SELECT ARRAY(SELECT id FROM public.warehouses WHERE company_id = v_company_id) INTO v_warehouse_ids;

  SELECT ARRAY(
    SELECT DISTINCT x.id
    FROM (
      SELECT unnest(v_invoice_ids) AS id
      UNION ALL SELECT unnest(v_sales_order_ids)
      UNION ALL SELECT unnest(v_sales_return_ids)
      UNION ALL SELECT unnest(v_sales_return_request_ids)
      UNION ALL SELECT unnest(v_customer_debit_note_ids)
      UNION ALL SELECT unnest(v_customer_credit_ids)
      UNION ALL SELECT unnest(v_bill_ids)
      UNION ALL SELECT unnest(v_purchase_order_ids)
      UNION ALL SELECT unnest(v_purchase_return_ids)
      UNION ALL SELECT unnest(v_vendor_credit_ids)
    ) x
    WHERE x.id IS NOT NULL
  ) INTO v_doc_ids;

  SELECT ARRAY(
    SELECT DISTINCT id
    FROM public.payments
    WHERE company_id = v_company_id
      AND (
        customer_id IS NOT NULL
        OR supplier_id IS NOT NULL
        OR invoice_id = ANY(v_invoice_ids)
        OR bill_id = ANY(v_bill_ids)
        OR purchase_order_id = ANY(v_purchase_order_ids)
      )
  ) INTO v_payment_ids;

  SELECT ARRAY(
    SELECT DISTINCT journal_entry_id
    FROM public.payments
    WHERE id = ANY(v_payment_ids)
      AND journal_entry_id IS NOT NULL
  ) INTO v_payment_journal_ids;

  SELECT ARRAY(
    SELECT DISTINCT id
    FROM public.journal_entries
    WHERE company_id = v_company_id
      AND (
        reference_type = ANY(v_sales_proc_reference_types)
        OR reference_id = ANY(v_doc_ids)
        OR id = ANY(v_payment_journal_ids)
      )
  ) INTO v_journal_entry_ids;

  SELECT ARRAY(
    SELECT DISTINCT id
    FROM public.inventory_transactions
    WHERE company_id = v_company_id
      AND (
        reference_id = ANY(v_doc_ids)
        OR journal_entry_id = ANY(v_journal_entry_ids)
        OR transaction_type IN (
          'purchase',
          'purchase_return',
          'sale',
          'sales_return',
          'sale_return',
          'sale_dispatch',
          'invoice',
          'return'
        )
      )
  ) INTO v_inventory_transaction_ids;

  IF to_regclass('public.financial_operation_traces') IS NOT NULL THEN
    SELECT ARRAY(
      SELECT DISTINCT fot.transaction_id
      FROM public.financial_operation_traces fot
      WHERE fot.company_id = v_company_id
        AND (
          fot.source_entity = ANY(ARRAY[
            'invoice',
            'payment',
            'customer_payment',
            'bill',
            'supplier_payment',
            'purchase_order',
            'purchase_return',
            'vendor_credit',
            'customer_credit',
            'sales_return',
            'journal_entry',
            'inventory_transaction'
          ])
          OR fot.source_id = ANY(v_doc_ids)
          OR fot.source_id = ANY(v_payment_ids)
          OR fot.source_id = ANY(v_journal_entry_ids)
          OR fot.source_id = ANY(v_inventory_transaction_ids)
        )
    ) INTO v_trace_ids;
  END IF;

  IF to_regclass('public.financial_replay_commit_intents') IS NOT NULL THEN
    SELECT ARRAY(
      SELECT DISTINCT id
      FROM public.financial_replay_commit_intents
      WHERE company_id = v_company_id
         OR source_trace_id = ANY(v_trace_ids)
    ) INTO v_replay_intent_ids;
  END IF;

  IF to_regclass('public.fifo_cost_lots') IS NOT NULL THEN
    SELECT ARRAY(
      SELECT DISTINCT id
      FROM public.fifo_cost_lots
      WHERE company_id = v_company_id
        AND (
          reference_id = ANY(v_doc_ids)
          OR reference_type = ANY(ARRAY['bill', 'invoice', 'purchase_return', 'sales_return'])
          OR product_id = ANY(v_product_ids)
        )
    ) INTO v_fifo_lot_ids;
  END IF;

  INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
  VALUES
    ('scope', 'invoices', 'collect', COALESCE(array_length(v_invoice_ids, 1), 0), NULL),
    ('scope', 'sales_orders', 'collect', COALESCE(array_length(v_sales_order_ids, 1), 0), NULL),
    ('scope', 'sales_returns', 'collect', COALESCE(array_length(v_sales_return_ids, 1), 0), NULL),
    ('scope', 'payments', 'collect', COALESCE(array_length(v_payment_ids, 1), 0), NULL),
    ('scope', 'bills', 'collect', COALESCE(array_length(v_bill_ids, 1), 0), NULL),
    ('scope', 'purchase_orders', 'collect', COALESCE(array_length(v_purchase_order_ids, 1), 0), NULL),
    ('scope', 'purchase_returns', 'collect', COALESCE(array_length(v_purchase_return_ids, 1), 0), NULL),
    ('scope', 'journal_entries', 'collect', COALESCE(array_length(v_journal_entry_ids, 1), 0), 'Sales/Procurement only'),
    ('scope', 'inventory_transactions', 'collect', COALESCE(array_length(v_inventory_transaction_ids, 1), 0), 'Sales/Procurement only'),
    ('scope', 'financial_operation_traces', 'collect', COALESCE(array_length(v_trace_ids, 1), 0), NULL);

  -- Temporarily disable immutability/protection triggers inside the transaction.
  FOREACH v_trigger_name IN ARRAY ARRAY[
    'trg_prevent_posted_journal_mod',
    'trg_prevent_posted_journal_modification'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.journal_entries'::regclass
        AND tgname = v_trigger_name
        AND NOT tgisinternal
    ) THEN
      EXECUTE format('ALTER TABLE public.journal_entries DISABLE TRIGGER %I', v_trigger_name);
      INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
      VALUES ('guard', 'journal_entries', 'disable_trigger', 1, v_trigger_name);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.inventory_transactions'::regclass
      AND tgname = 'trg_prevent_linked_inv_mod'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.inventory_transactions DISABLE TRIGGER trg_prevent_linked_inv_mod;
    INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
    VALUES ('guard', 'inventory_transactions', 'disable_trigger', 1, 'trg_prevent_linked_inv_mod');
  END IF;

  FOREACH v_trigger_name IN ARRAY ARRAY[
    'trigger_prevent_bill_deletion_with_vendor_credit',
    'trigger_prevent_vendor_credit_deletion'
  ]
  LOOP
    IF v_trigger_name = 'trigger_prevent_bill_deletion_with_vendor_credit'
       AND to_regclass('public.bills') IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.bills'::regclass AND tgname = v_trigger_name AND NOT tgisinternal) THEN
      EXECUTE format('ALTER TABLE public.bills DISABLE TRIGGER %I', v_trigger_name);
      INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
      VALUES ('guard', 'bills', 'disable_trigger', 1, v_trigger_name);
    ELSIF v_trigger_name = 'trigger_prevent_vendor_credit_deletion'
       AND to_regclass('public.vendor_credits') IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vendor_credits'::regclass AND tgname = v_trigger_name AND NOT tgisinternal) THEN
      EXECUTE format('ALTER TABLE public.vendor_credits DISABLE TRIGGER %I', v_trigger_name);
      INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
      VALUES ('guard', 'vendor_credits', 'disable_trigger', 1, v_trigger_name);
    END IF;
  END LOOP;

  -- Replay/audit artifacts first.
  IF to_regclass('public.financial_replay_executions') IS NOT NULL THEN
    DELETE FROM public.financial_replay_executions
    WHERE company_id = v_company_id
       OR commit_intent_id = ANY(v_replay_intent_ids)
       OR source_trace_id = ANY(v_trace_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('audit', 'financial_replay_executions', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.financial_replay_commit_intents') IS NOT NULL THEN
    DELETE FROM public.financial_replay_commit_intents
    WHERE company_id = v_company_id
       OR id = ANY(v_replay_intent_ids)
       OR source_trace_id = ANY(v_trace_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('audit', 'financial_replay_commit_intents', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.financial_operation_trace_links') IS NOT NULL THEN
    DELETE FROM public.financial_operation_trace_links
    WHERE transaction_id = ANY(v_trace_ids)
       OR entity_id = ANY(v_doc_ids)
       OR entity_id = ANY(v_payment_ids)
       OR entity_id = ANY(v_journal_entry_ids)
       OR entity_id = ANY(v_inventory_transaction_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('audit', 'financial_operation_trace_links', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.financial_operation_traces') IS NOT NULL THEN
    DELETE FROM public.financial_operation_traces
    WHERE transaction_id = ANY(v_trace_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('audit', 'financial_operation_traces', 'delete', v_count, NULL);
  END IF;

  -- Allocations/applications.
  IF to_regclass('public.payment_allocations') IS NOT NULL THEN
    DELETE FROM public.payment_allocations WHERE payment_id = ANY(v_payment_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('payments', 'payment_allocations', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.payment_applications') IS NOT NULL THEN
    DELETE FROM public.payment_applications WHERE payment_id = ANY(v_payment_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('payments', 'payment_applications', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.advance_applications') IS NOT NULL THEN
    DELETE FROM public.advance_applications
    WHERE payment_id = ANY(v_payment_ids)
       OR invoice_id = ANY(v_invoice_ids)
       OR bill_id = ANY(v_bill_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('payments', 'advance_applications', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.invoice_payments') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.invoice_payments WHERE invoice_id = ANY($1) OR payment_id = ANY($2)'
    USING v_invoice_ids, v_payment_ids;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'invoice_payments', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.bill_payments') IS NOT NULL THEN
    DELETE FROM public.bill_payments WHERE bill_id = ANY(v_bill_ids) OR payment_id = ANY(v_payment_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('procurement', 'bill_payments', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.customer_credit_applications') IS NOT NULL THEN
    DELETE FROM public.customer_credit_applications
    WHERE customer_credit_id = ANY(v_customer_credit_ids)
       OR invoice_id = ANY(v_invoice_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'customer_credit_applications', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.vendor_credit_applications') IS NOT NULL THEN
    DELETE FROM public.vendor_credit_applications
    WHERE vendor_credit_id = ANY(v_vendor_credit_ids)
       OR bill_id = ANY(v_bill_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('procurement', 'vendor_credit_applications', 'delete', v_count, NULL);
  END IF;

  -- FIFO/inventory side effects.
  IF to_regclass('public.fifo_lot_consumptions') IS NOT NULL THEN
    DELETE FROM public.fifo_lot_consumptions
    WHERE company_id = v_company_id
      AND (
        lot_id = ANY(v_fifo_lot_ids)
        OR reference_id = ANY(v_doc_ids)
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('inventory', 'fifo_lot_consumptions', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.fifo_cost_lots') IS NOT NULL THEN
    DELETE FROM public.fifo_cost_lots
    WHERE id = ANY(v_fifo_lot_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('inventory', 'fifo_cost_lots', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.inventory_transaction_lines') IS NOT NULL THEN
    DELETE FROM public.inventory_transaction_lines
    WHERE inventory_transaction_id = ANY(v_inventory_transaction_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('inventory', 'inventory_transaction_lines', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.third_party_inventory') IS NOT NULL THEN
    DELETE FROM public.third_party_inventory
    WHERE company_id = v_company_id
       OR invoice_id = ANY(v_invoice_ids)
       OR sales_order_id = ANY(v_sales_order_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('inventory', 'third_party_inventory', 'delete', v_count, NULL);
  END IF;

  DELETE FROM public.inventory_transactions
  WHERE id = ANY(v_inventory_transaction_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('inventory', 'inventory_transactions', 'delete', v_count, NULL);

  -- Journal artifacts.
  DELETE FROM public.journal_entry_lines
  WHERE journal_entry_id = ANY(v_journal_entry_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('gl', 'journal_entry_lines', 'delete', v_count, NULL);

  DELETE FROM public.journal_entries
  WHERE id = ANY(v_journal_entry_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('gl', 'journal_entries', 'delete', v_count, 'Sales/Procurement only');

  -- Payments.
  DELETE FROM public.payments
  WHERE id = ANY(v_payment_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('payments', 'payments', 'delete', v_count, NULL);

  -- Sales documents.
  IF to_regclass('public.sales_return_request_items') IS NOT NULL THEN
    DELETE FROM public.sales_return_request_items WHERE sales_return_request_id = ANY(v_sales_return_request_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'sales_return_request_items', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.sales_return_items') IS NOT NULL THEN
    DELETE FROM public.sales_return_items WHERE sales_return_id = ANY(v_sales_return_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'sales_return_items', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.customer_debit_note_items') IS NOT NULL THEN
    DELETE FROM public.customer_debit_note_items WHERE customer_debit_note_id = ANY(v_customer_debit_note_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'customer_debit_note_items', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.sent_invoice_return_items') IS NOT NULL
     AND to_regclass('public.sent_invoice_returns') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.sent_invoice_return_items WHERE return_id IN (SELECT id FROM public.sent_invoice_returns WHERE company_id = $1)'
    USING v_company_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'sent_invoice_return_items', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.sent_invoice_returns') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.sent_invoice_returns WHERE company_id = $1'
    USING v_company_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('sales', 'sent_invoice_returns', 'delete', v_count, NULL);
  END IF;

  DELETE FROM public.customer_debit_notes WHERE id = ANY(v_customer_debit_note_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'customer_debit_notes', 'delete', v_count, NULL);

  DELETE FROM public.customer_credits WHERE id = ANY(v_customer_credit_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'customer_credits', 'delete', v_count, NULL);

  DELETE FROM public.sales_returns WHERE id = ANY(v_sales_return_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'sales_returns', 'delete', v_count, NULL);

  DELETE FROM public.sales_return_requests WHERE id = ANY(v_sales_return_request_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'sales_return_requests', 'delete', v_count, NULL);

  DELETE FROM public.invoice_items WHERE invoice_id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'invoice_items', 'delete', v_count, NULL);

  DELETE FROM public.invoices WHERE id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'invoices', 'delete', v_count, NULL);

  DELETE FROM public.sales_order_items WHERE sales_order_id = ANY(v_sales_order_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'sales_order_items', 'delete', v_count, NULL);

  DELETE FROM public.sales_orders WHERE id = ANY(v_sales_order_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('sales', 'sales_orders', 'delete', v_count, NULL);

  -- Procurement documents.
  IF to_regclass('public.purchase_return_warehouse_items') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.purchase_return_warehouse_items WHERE purchase_return_id = ANY($1)'
    USING v_purchase_return_ids;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('procurement', 'purchase_return_warehouse_items', 'delete', v_count, NULL);
  END IF;

  IF to_regclass('public.purchase_return_warehouse_allocations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.purchase_return_warehouse_allocations WHERE purchase_return_id = ANY($1)'
    USING v_purchase_return_ids;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('procurement', 'purchase_return_warehouse_allocations', 'delete', v_count, NULL);
  END IF;

  DELETE FROM public.purchase_return_items WHERE purchase_return_id = ANY(v_purchase_return_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'purchase_return_items', 'delete', v_count, NULL);

  IF to_regclass('public.vendor_credit_items') IS NOT NULL THEN
    DELETE FROM public.vendor_credit_items WHERE vendor_credit_id = ANY(v_vendor_credit_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('procurement', 'vendor_credit_items', 'delete', v_count, NULL);
  END IF;

  DELETE FROM public.vendor_credits WHERE id = ANY(v_vendor_credit_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'vendor_credits', 'delete', v_count, NULL);

  DELETE FROM public.purchase_returns WHERE id = ANY(v_purchase_return_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'purchase_returns', 'delete', v_count, NULL);

  DELETE FROM public.bill_items WHERE bill_id = ANY(v_bill_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'bill_items', 'delete', v_count, NULL);

  DELETE FROM public.bills WHERE id = ANY(v_bill_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'bills', 'delete', v_count, NULL);

  DELETE FROM public.purchase_order_items WHERE purchase_order_id = ANY(v_purchase_order_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'purchase_order_items', 'delete', v_count, NULL);

  DELETE FROM public.purchase_orders WHERE id = ANY(v_purchase_order_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('procurement', 'purchase_orders', 'delete', v_count, NULL);

  -- Reset stock snapshots for clean Sales/Procurement testing.
  IF to_regclass('public.product_inventory') IS NOT NULL THEN
    DELETE FROM public.product_inventory
    WHERE product_id = ANY(v_product_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('inventory', 'product_inventory', 'delete', v_count, 'Reset warehouse product balances');
  END IF;

  IF to_regclass('public.warehouse_stock') IS NOT NULL THEN
    DELETE FROM public.warehouse_stock
    WHERE company_id = v_company_id
       OR warehouse_id = ANY(v_warehouse_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO reset_test_company_counts VALUES ('inventory', 'warehouse_stock', 'delete', v_count, 'Reset warehouse stock balances');
  END IF;

  UPDATE public.products
  SET quantity_on_hand = 0
  WHERE company_id = v_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO reset_test_company_counts VALUES ('inventory', 'products', 'update', v_count, 'quantity_on_hand reset to 0; products kept');

  -- Re-enable triggers before leaving the transaction.
  FOREACH v_trigger_name IN ARRAY ARRAY[
    'trg_prevent_posted_journal_mod',
    'trg_prevent_posted_journal_modification'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.journal_entries'::regclass
        AND tgname = v_trigger_name
        AND NOT tgisinternal
    ) THEN
      EXECUTE format('ALTER TABLE public.journal_entries ENABLE TRIGGER %I', v_trigger_name);
      INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
      VALUES ('guard', 'journal_entries', 'enable_trigger', 1, v_trigger_name);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.inventory_transactions'::regclass
      AND tgname = 'trg_prevent_linked_inv_mod'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.inventory_transactions ENABLE TRIGGER trg_prevent_linked_inv_mod;
    INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
    VALUES ('guard', 'inventory_transactions', 'enable_trigger', 1, 'trg_prevent_linked_inv_mod');
  END IF;

  IF to_regclass('public.bills') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.bills'::regclass AND tgname = 'trigger_prevent_bill_deletion_with_vendor_credit' AND NOT tgisinternal) THEN
    ALTER TABLE public.bills ENABLE TRIGGER trigger_prevent_bill_deletion_with_vendor_credit;
    INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
    VALUES ('guard', 'bills', 'enable_trigger', 1, 'trigger_prevent_bill_deletion_with_vendor_credit');
  END IF;

  IF to_regclass('public.vendor_credits') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vendor_credits'::regclass AND tgname = 'trigger_prevent_vendor_credit_deletion' AND NOT tgisinternal) THEN
    ALTER TABLE public.vendor_credits ENABLE TRIGGER trigger_prevent_vendor_credit_deletion;
    INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
    VALUES ('guard', 'vendor_credits', 'enable_trigger', 1, 'trigger_prevent_vendor_credit_deletion');
  END IF;

  -- Residual non-sales/proc financial rows are intentionally left untouched.
  INSERT INTO reset_test_company_counts(domain, table_name, operation, rows_affected, note)
  SELECT
    'warning',
    'journal_entries',
    'kept',
    COUNT(*)::INTEGER,
    'Non Sales/Procurement journal entries kept intentionally'
  FROM public.journal_entries
  WHERE company_id = v_company_id;
END;
$$;

COMMIT;

-- Final report: deleted/updated rows plus residual verification counts.
SELECT *
FROM reset_test_company_counts
ORDER BY
  CASE domain
    WHEN 'scope' THEN 0
    WHEN 'guard' THEN 1
    WHEN 'audit' THEN 2
    WHEN 'payments' THEN 3
    WHEN 'inventory' THEN 4
    WHEN 'gl' THEN 5
    WHEN 'sales' THEN 6
    WHEN 'procurement' THEN 7
    WHEN 'warning' THEN 8
    ELSE 99
  END,
  table_name,
  operation;

SELECT 'remaining_invoices' AS check_name, COUNT(*) AS remaining_count
FROM public.invoices
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
UNION ALL
SELECT 'remaining_payments', COUNT(*)
FROM public.payments
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
UNION ALL
SELECT 'remaining_bills', COUNT(*)
FROM public.bills
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
UNION ALL
SELECT 'remaining_purchase_orders', COUNT(*)
FROM public.purchase_orders
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
UNION ALL
SELECT 'remaining_purchase_returns', COUNT(*)
FROM public.purchase_returns
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
UNION ALL
SELECT 'remaining_sales_proc_journals', COUNT(*)
FROM public.journal_entries
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
  AND reference_type IN (
    'invoice',
    'invoice_payment',
    'invoice_payment_reversal',
    'invoice_reversal',
    'credit_note',
    'customer_credit',
    'customer_credit_application',
    'customer_refund',
    'customer_voucher',
    'sales_order',
    'sales_order_payment',
    'sales_return',
    'sales_return_reversal',
    'bill',
    'bill_payment',
    'bill_payment_reversal',
    'bill_reversal',
    'vendor_credit',
    'vendor_credit_application',
    'supplier_payment',
    'supplier_payment_reversal',
    'purchase_order',
    'purchase_order_payment',
    'purchase_return',
    'purchase_return_reversal'
  )
UNION ALL
SELECT 'remaining_inventory_transactions', COUNT(*)
FROM public.inventory_transactions
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
UNION ALL
SELECT 'remaining_financial_traces', COUNT(*)
FROM public.financial_operation_traces
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526';
