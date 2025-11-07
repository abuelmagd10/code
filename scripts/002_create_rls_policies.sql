-- RLS Policies for companies table
CREATE POLICY "companies_select_own"
  ON companies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "companies_insert_own"
  ON companies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "companies_update_own"
  ON companies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "companies_delete_own"
  ON companies FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for chart_of_accounts
CREATE POLICY "chart_accounts_access"
  ON chart_of_accounts FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "chart_accounts_insert"
  ON chart_of_accounts FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "chart_accounts_update"
  ON chart_of_accounts FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "chart_accounts_delete"
  ON chart_of_accounts FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for customers
CREATE POLICY "customers_access"
  ON customers FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "customers_insert"
  ON customers FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "customers_update"
  ON customers FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "customers_delete"
  ON customers FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for suppliers
CREATE POLICY "suppliers_access"
  ON suppliers FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "suppliers_insert"
  ON suppliers FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "suppliers_update"
  ON suppliers FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "suppliers_delete"
  ON suppliers FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for products
CREATE POLICY "products_access"
  ON products FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "products_insert"
  ON products FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "products_update"
  ON products FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "products_delete"
  ON products FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for invoices
CREATE POLICY "invoices_access"
  ON invoices FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "invoices_insert"
  ON invoices FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "invoices_update"
  ON invoices FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "invoices_delete"
  ON invoices FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for invoice items
CREATE POLICY "invoice_items_access"
  ON invoice_items FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "invoice_items_insert"
  ON invoice_items FOR INSERT
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "invoice_items_update"
  ON invoice_items FOR UPDATE
  USING (invoice_id IN (SELECT id FROM invoices WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "invoice_items_delete"
  ON invoice_items FOR DELETE
  USING (invoice_id IN (SELECT id FROM invoices WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

-- RLS Policies for purchase orders
CREATE POLICY "purchase_orders_access"
  ON purchase_orders FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "purchase_orders_insert"
  ON purchase_orders FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "purchase_orders_update"
  ON purchase_orders FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "purchase_orders_delete"
  ON purchase_orders FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for purchase order items
CREATE POLICY "purchase_order_items_access"
  ON purchase_order_items FOR SELECT
  USING (purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "purchase_order_items_insert"
  ON purchase_order_items FOR INSERT
  WITH CHECK (purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "purchase_order_items_update"
  ON purchase_order_items FOR UPDATE
  USING (purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "purchase_order_items_delete"
  ON purchase_order_items FOR DELETE
  USING (purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

-- RLS Policies for journal entries
CREATE POLICY "journal_entries_access"
  ON journal_entries FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "journal_entries_insert"
  ON journal_entries FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "journal_entries_update"
  ON journal_entries FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "journal_entries_delete"
  ON journal_entries FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for journal entry lines
CREATE POLICY "journal_entry_lines_access"
  ON journal_entry_lines FOR SELECT
  USING (journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "journal_entry_lines_insert"
  ON journal_entry_lines FOR INSERT
  WITH CHECK (journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "journal_entry_lines_update"
  ON journal_entry_lines FOR UPDATE
  USING (journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "journal_entry_lines_delete"
  ON journal_entry_lines FOR DELETE
  USING (journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

-- RLS Policies for payments
CREATE POLICY "payments_access"
  ON payments FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "payments_insert"
  ON payments FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "payments_update"
  ON payments FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "payments_delete"
  ON payments FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for account balances
CREATE POLICY "account_balances_access"
  ON account_balances FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "account_balances_insert"
  ON account_balances FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "account_balances_update"
  ON account_balances FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for inventory transactions
CREATE POLICY "inventory_transactions_access"
  ON inventory_transactions FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "inventory_transactions_insert"
  ON inventory_transactions FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
