-- ==========================================
-- 🔒 Enterprise ERP Governance Upgrade
-- Feature: Strict Branch Isolation for Products
-- Effect: Prevents cross-branch product selection
-- ==========================================

-- Function to validate product branch matches document branch
CREATE OR REPLACE FUNCTION validate_product_branch_isolation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_branch_id UUID;
  v_doc_branch_id UUID;
  v_table_name TEXT := TG_TABLE_NAME;
  v_parent_id UUID;
  v_company_id UUID;
BEGIN
  -- 1) Skip check if there is no product id or it's a service (optional based on your product setup)
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2) Determine parent document ID and parent table based on the line item table
  CASE v_table_name
    WHEN 'purchase_order_items' THEN
      v_parent_id := NEW.purchase_order_id;
      SELECT branch_id, company_id INTO v_doc_branch_id, v_company_id FROM purchase_orders WHERE id = v_parent_id;
    WHEN 'bill_items' THEN
      v_parent_id := NEW.bill_id;
      SELECT branch_id, company_id INTO v_doc_branch_id, v_company_id FROM bills WHERE id = v_parent_id;
    WHEN 'sales_order_items' THEN
      v_parent_id := NEW.sales_order_id;
      SELECT branch_id, company_id INTO v_doc_branch_id, v_company_id FROM sales_orders WHERE id = v_parent_id;
    WHEN 'invoice_items' THEN
      v_parent_id := NEW.invoice_id;
      SELECT branch_id, company_id INTO v_doc_branch_id, v_company_id FROM invoices WHERE id = v_parent_id;
    WHEN 'purchase_return_items' THEN
      v_parent_id := NEW.purchase_return_id;
      SELECT branch_id, company_id INTO v_doc_branch_id, v_company_id FROM purchase_returns WHERE id = v_parent_id;
    WHEN 'vendor_credit_items' THEN
      v_parent_id := NEW.vendor_credit_id;
      SELECT branch_id, company_id INTO v_doc_branch_id, v_company_id FROM vendor_credits WHERE id = v_parent_id;
    ELSE
      -- Unhandled table, skip check but log warning (or keep it if only applied to specific tables)
      RETURN NEW;
  END CASE;

  -- If the document doesn't belong to a branch (e.g. global context), we can skip isolation check
  IF v_doc_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3) Fetch the product's branch id
  SELECT branch_id INTO v_product_branch_id FROM products WHERE id = NEW.product_id;

  -- Global products (no branch) might be allowed to be used anywhere. 
  -- But if a product belongs to a specific branch, it MUST match the doc's branch.
  IF v_product_branch_id IS NOT NULL AND v_product_branch_id != v_doc_branch_id THEN
    RAISE EXCEPTION 'Branch Isolation Violation: Product (%) belongs to a different branch than the document.', NEW.product_id
      USING ERRCODE = 'P0001',
            HINT = 'Products are isolated per branch. You cannot add products from another branch to this document.';
  END IF;

  RETURN NEW;
END;
$$;

-- Apply triggers to relevant line item tables if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items') THEN
        DROP TRIGGER IF EXISTS ensure_po_item_branch_isolation ON purchase_order_items;
        CREATE TRIGGER ensure_po_item_branch_isolation
          BEFORE INSERT OR UPDATE ON purchase_order_items
          FOR EACH ROW EXECUTE FUNCTION validate_product_branch_isolation();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_items') THEN
        DROP TRIGGER IF EXISTS ensure_bill_item_branch_isolation ON bill_items;
        CREATE TRIGGER ensure_bill_item_branch_isolation
          BEFORE INSERT OR UPDATE ON bill_items
          FOR EACH ROW EXECUTE FUNCTION validate_product_branch_isolation();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_order_items') THEN
        DROP TRIGGER IF EXISTS ensure_so_item_branch_isolation ON sales_order_items;
        CREATE TRIGGER ensure_so_item_branch_isolation
          BEFORE INSERT OR UPDATE ON sales_order_items
          FOR EACH ROW EXECUTE FUNCTION validate_product_branch_isolation();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_items') THEN
        DROP TRIGGER IF EXISTS ensure_invoice_item_branch_isolation ON invoice_items;
        CREATE TRIGGER ensure_invoice_item_branch_isolation
          BEFORE INSERT OR UPDATE ON invoice_items
          FOR EACH ROW EXECUTE FUNCTION validate_product_branch_isolation();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_return_items') THEN
        DROP TRIGGER IF EXISTS ensure_pr_item_branch_isolation ON purchase_return_items;
        CREATE TRIGGER ensure_pr_item_branch_isolation
          BEFORE INSERT OR UPDATE ON purchase_return_items
          FOR EACH ROW EXECUTE FUNCTION validate_product_branch_isolation();
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_credit_items') THEN
        DROP TRIGGER IF EXISTS ensure_vc_item_branch_isolation ON vendor_credit_items;
        CREATE TRIGGER ensure_vc_item_branch_isolation
          BEFORE INSERT OR UPDATE ON vendor_credit_items
          FOR EACH ROW EXECUTE FUNCTION validate_product_branch_isolation();
    END IF;
END $$;
