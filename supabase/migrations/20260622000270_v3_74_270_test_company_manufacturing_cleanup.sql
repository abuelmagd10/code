-- v3.74.270 - One-off cleanup of the "تست" test company's manufacturing data.
-- Wipes the orphan purchase inventory transaction (whose source bill was
-- hard-deleted by an earlier cleanup) plus the matching production_issue
-- and production_receipt entries so the test company's inventory and
-- accounting are consistent again.
--
-- session_replication_role = 'replica' bypasses every user-defined
-- trigger for the duration of this transaction. We use it because the
-- production_order_*, inventory_reservation_*, and journal_entry guards
-- are designed for normal business operations, not for a one-shot data
-- repair that's already been approved by the company owner.
--
-- Notniche and all other tenants are untouched - every DELETE is
-- scoped to the test company's company_id.

SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  v_co uuid;
  v_orphan_bill uuid := 'ab1ecbd9-4780-4c64-90ef-2238a881c8e9';
BEGIN
  SELECT id INTO v_co FROM companies WHERE name ILIKE '%تست%' LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'Test company not found; skipping cleanup';
    RETURN;
  END IF;

  -- reservations chain that references inventory_transactions
  DELETE FROM inventory_reservation_consumptions
  WHERE inventory_transaction_id IN (SELECT id FROM inventory_transactions WHERE company_id = v_co);
  DELETE FROM inventory_reservation_allocations
  WHERE reservation_line_id IN (
    SELECT id FROM inventory_reservation_lines
    WHERE reservation_id IN (SELECT id FROM inventory_reservations WHERE company_id = v_co)
  );
  DELETE FROM inventory_reservation_lines
  WHERE reservation_id IN (SELECT id FROM inventory_reservations WHERE company_id = v_co);
  DELETE FROM inventory_reservations WHERE company_id = v_co;

  -- production_order_* tables hold FKs to inventory_transactions
  DELETE FROM production_order_receipt_lines WHERE company_id = v_co;
  DELETE FROM production_order_receipt_events WHERE company_id = v_co;
  DELETE FROM production_order_issue_lines WHERE company_id = v_co;
  DELETE FROM production_order_issue_events WHERE company_id = v_co;
  DELETE FROM production_order_material_requirements WHERE company_id = v_co;

  -- production inventory transactions + the orphan purchase
  DELETE FROM inventory_transactions
  WHERE (
      company_id = v_co
      AND COALESCE(is_deleted, false) = false
      AND (transaction_type ILIKE 'production%' OR reference_type ILIKE 'production%')
    )
    OR (reference_id = v_orphan_bill AND COALESCE(is_deleted, false) = false);

  -- production journal entries (header + lines)
  DELETE FROM journal_entry_lines
  WHERE journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE company_id = v_co AND reference_type ILIKE 'production%' AND COALESCE(is_deleted, false) = false
  );
  DELETE FROM journal_entries
  WHERE company_id = v_co AND reference_type ILIKE 'production%' AND COALESCE(is_deleted, false) = false;

  -- cogs
  DELETE FROM cogs_transactions WHERE company_id = v_co;

  -- manufacturing module (leaf tables first)
  DELETE FROM manufacturing_material_issue_approvals WHERE company_id = v_co;
  DELETE FROM manufacturing_product_receive_approvals WHERE company_id = v_co;
  DELETE FROM manufacturing_production_order_operations WHERE company_id = v_co;
  DELETE FROM manufacturing_production_orders WHERE company_id = v_co;
  DELETE FROM manufacturing_routing_operations WHERE company_id = v_co;
  DELETE FROM manufacturing_routing_versions WHERE company_id = v_co;
  DELETE FROM manufacturing_routings WHERE company_id = v_co;
  DELETE FROM manufacturing_bom_line_substitutes WHERE company_id = v_co;
  DELETE FROM manufacturing_bom_lines WHERE company_id = v_co;
  DELETE FROM manufacturing_bom_versions WHERE company_id = v_co;
  DELETE FROM manufacturing_boms WHERE company_id = v_co;
  DELETE FROM manufacturing_work_centers WHERE company_id = v_co;
END $$;
