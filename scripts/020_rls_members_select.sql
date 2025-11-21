-- Broaden SELECT RLS to allow company members (any role) to read company data
-- Multiple policies are ORed; these complement existing owner-only policies

-- Invoices
DROP POLICY IF EXISTS invoices_select_members ON invoices;
CREATE POLICY invoices_select_members ON invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = invoices.company_id AND cm.user_id = auth.uid()));

-- Invoice items
DROP POLICY IF EXISTS invoice_items_select_members ON invoice_items;
CREATE POLICY invoice_items_select_members ON invoice_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN company_members cm ON cm.company_id = i.company_id AND cm.user_id = auth.uid()
    WHERE i.id = invoice_items.invoice_id
  ));

-- Bills
DROP POLICY IF EXISTS bills_select_members ON bills;
CREATE POLICY bills_select_members ON bills FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = bills.company_id AND cm.user_id = auth.uid()));

-- Bill items
DROP POLICY IF EXISTS bill_items_select_members ON bill_items;
CREATE POLICY bill_items_select_members ON bill_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM bills b
    JOIN company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
    WHERE b.id = bill_items.bill_id
  ));

-- Products
DROP POLICY IF EXISTS products_select_members ON products;
CREATE POLICY products_select_members ON products FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid()));

-- Inventory transactions
DROP POLICY IF EXISTS inventory_transactions_select_members ON inventory_transactions;
CREATE POLICY inventory_transactions_select_members ON inventory_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = inventory_transactions.company_id AND cm.user_id = auth.uid()));

-- Customers
DROP POLICY IF EXISTS customers_select_members ON customers;
CREATE POLICY customers_select_members ON customers FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = customers.company_id AND cm.user_id = auth.uid()));

-- Suppliers
DROP POLICY IF EXISTS suppliers_select_members ON suppliers;
CREATE POLICY suppliers_select_members ON suppliers FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = suppliers.company_id AND cm.user_id = auth.uid()));

-- Payments
DROP POLICY IF EXISTS payments_select_members ON payments;
CREATE POLICY payments_select_members ON payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = payments.company_id AND cm.user_id = auth.uid()));

-- Journal entries
DROP POLICY IF EXISTS journal_entries_select_members ON journal_entries;
CREATE POLICY journal_entries_select_members ON journal_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = journal_entries.company_id AND cm.user_id = auth.uid()));

-- Journal entry lines
DROP POLICY IF EXISTS journal_entry_lines_select_members ON journal_entry_lines;
CREATE POLICY journal_entry_lines_select_members ON journal_entry_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    JOIN company_members cm ON cm.company_id = je.company_id AND cm.user_id = auth.uid()
    WHERE je.id = journal_entry_lines.journal_entry_id
  ));

-- Purchase Orders
DROP POLICY IF EXISTS purchase_orders_select_members ON purchase_orders;
CREATE POLICY purchase_orders_select_members ON purchase_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = purchase_orders.company_id AND cm.user_id = auth.uid()));

-- Vendor Credits
DROP POLICY IF EXISTS vendor_credits_select_members ON vendor_credits;
CREATE POLICY vendor_credits_select_members ON vendor_credits FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = vendor_credits.company_id AND cm.user_id = auth.uid()));