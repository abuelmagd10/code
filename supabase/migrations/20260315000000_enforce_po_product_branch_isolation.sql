-- Migration: Enforce Product Branch Isolation for Purchase Orders and Bills
-- Description: Ensures that when creating a PO item or Bill item, the product belongs to the same branch as the parent document, unless the product is global (branch_id IS NULL) or the user is an admin.

CREATE OR REPLACE FUNCTION check_product_branch_isolation()
RETURNS trigger AS $$
DECLARE
  v_parent_branch_id UUID;
  v_product_branch_id UUID;
  v_user_role TEXT;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. Get the branch_id of the parent document
  IF TG_TABLE_NAME = 'purchase_order_items' THEN
    SELECT branch_id INTO v_parent_branch_id FROM purchase_orders WHERE id = NEW.purchase_order_id;
  ELSIF TG_TABLE_NAME = 'bill_items' THEN
    SELECT branch_id INTO v_parent_branch_id FROM bills WHERE id = NEW.bill_id;
  ELSIF TG_TABLE_NAME = 'sales_order_items' THEN
    SELECT branch_id INTO v_parent_branch_id FROM sales_orders WHERE id = NEW.sales_order_id;
  ELSIF TG_TABLE_NAME = 'invoice_items' THEN
    SELECT branch_id INTO v_parent_branch_id FROM invoices WHERE id = NEW.invoice_id;
  ELSIF TG_TABLE_NAME = 'vendor_credit_items' THEN
    SELECT branch_id INTO v_parent_branch_id FROM vendor_credits WHERE id = NEW.vendor_credit_id;
  ELSIF TG_TABLE_NAME = 'purchase_return_items' THEN
    SELECT branch_id INTO v_parent_branch_id FROM purchase_returns WHERE id = NEW.return_id;
  END IF;

  -- 2. Get the branch_id of the product
  IF NEW.product_id IS NOT NULL THEN
    SELECT branch_id INTO v_product_branch_id FROM products WHERE id = NEW.product_id;
    
    -- If product is global (branch_id is NULL), allow it
    IF v_product_branch_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- If parent document doesn't have a branch_id (e.g. created by admin as global document), allow it
    IF v_parent_branch_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 3. Check if branches match
    IF v_product_branch_id != v_parent_branch_id THEN
      -- Optional: Check if the user is an admin (admins might be allowed to cross-branch, but usually even admins should keep document consistent)
      -- For strict accounting, we throw an error regardless of user role if the document branch doesn't match the product branch.
      RAISE EXCEPTION 'Product Branch Isolation Violation: Product (branch %) cannot be added to document (branch %)', v_product_branch_id, v_parent_branch_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_po_product_branch_isolation ON purchase_order_items;
CREATE TRIGGER trg_po_product_branch_isolation
BEFORE INSERT OR UPDATE ON purchase_order_items
FOR EACH ROW EXECUTE FUNCTION check_product_branch_isolation();

DROP TRIGGER IF EXISTS trg_bill_product_branch_isolation ON bill_items;
CREATE TRIGGER trg_bill_product_branch_isolation
BEFORE INSERT OR UPDATE ON bill_items
FOR EACH ROW EXECUTE FUNCTION check_product_branch_isolation();

DROP TRIGGER IF EXISTS trg_so_product_branch_isolation ON sales_order_items;
CREATE TRIGGER trg_so_product_branch_isolation
BEFORE INSERT OR UPDATE ON sales_order_items
FOR EACH ROW EXECUTE FUNCTION check_product_branch_isolation();

DROP TRIGGER IF EXISTS trg_invoice_product_branch_isolation ON invoice_items;
CREATE TRIGGER trg_invoice_product_branch_isolation
BEFORE INSERT OR UPDATE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION check_product_branch_isolation();

DROP TRIGGER IF EXISTS trg_vc_product_branch_isolation ON vendor_credit_items;
CREATE TRIGGER trg_vc_product_branch_isolation
BEFORE INSERT OR UPDATE ON vendor_credit_items
FOR EACH ROW EXECUTE FUNCTION check_product_branch_isolation();

DROP TRIGGER IF EXISTS trg_pr_product_branch_isolation ON purchase_return_items;
CREATE TRIGGER trg_pr_product_branch_isolation
BEFORE INSERT OR UPDATE ON purchase_return_items
FOR EACH ROW EXECUTE FUNCTION check_product_branch_isolation();
