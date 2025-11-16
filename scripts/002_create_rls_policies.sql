-- RLS Policies for companies table (owner or member)
CREATE POLICY "companies_select_own"
  ON companies FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "companies_select_members"
  ON companies FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = id AND cm.user_id = auth.uid()));

CREATE POLICY "companies_insert_own"
  ON companies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "companies_update_own"
  ON companies FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "companies_update_admin"
  ON companies FOR UPDATE
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')));

CREATE POLICY "companies_delete_own"
  ON companies FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for chart_of_accounts
CREATE POLICY "chart_accounts_access"
  ON chart_of_accounts FOR SELECT
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = chart_of_accounts.company_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "chart_accounts_insert"
  ON chart_of_accounts FOR INSERT
  WITH CHECK (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = chart_of_accounts.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant'))
  );

CREATE POLICY "chart_accounts_update"
  ON chart_of_accounts FOR UPDATE
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = chart_of_accounts.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant'))
  );

CREATE POLICY "chart_accounts_delete"
  ON chart_of_accounts FOR DELETE
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = chart_of_accounts.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
  );

-- RLS Policies for customers
CREATE POLICY "customers_access"
  ON customers FOR SELECT
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = customers.company_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "customers_insert"
  ON customers FOR INSERT
  WITH CHECK (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = customers.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant'))
  );

CREATE POLICY "customers_update"
  ON customers FOR UPDATE
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = customers.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant'))
  );

CREATE POLICY "customers_delete"
  ON customers FOR DELETE
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = customers.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
  );

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

-- RLS Policies for bills
CREATE POLICY "bills_access"
  ON bills FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "bills_insert"
  ON bills FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "bills_update"
  ON bills FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "bills_delete"
  ON bills FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for bill items
CREATE POLICY "bill_items_access"
  ON bill_items FOR SELECT
  USING (bill_id IN (SELECT id FROM bills WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "bill_items_insert"
  ON bill_items FOR INSERT
  WITH CHECK (bill_id IN (SELECT id FROM bills WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "bill_items_update"
  ON bill_items FOR UPDATE
  USING (bill_id IN (SELECT id FROM bills WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "bill_items_delete"
  ON bill_items FOR DELETE
  USING (bill_id IN (SELECT id FROM bills WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

-- RLS Policies for vendor credits
CREATE POLICY "vendor_credits_access"
  ON vendor_credits FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "vendor_credits_insert"
  ON vendor_credits FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "vendor_credits_update"
  ON vendor_credits FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "vendor_credits_delete"
  ON vendor_credits FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for vendor credit items
CREATE POLICY "vendor_credit_items_access"
  ON vendor_credit_items FOR SELECT
  USING (vendor_credit_id IN (SELECT id FROM vendor_credits WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "vendor_credit_items_insert"
  ON vendor_credit_items FOR INSERT
  WITH CHECK (vendor_credit_id IN (SELECT id FROM vendor_credits WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "vendor_credit_items_update"
  ON vendor_credit_items FOR UPDATE
  USING (vendor_credit_id IN (SELECT id FROM vendor_credits WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "vendor_credit_items_delete"
  ON vendor_credit_items FOR DELETE
  USING (vendor_credit_id IN (SELECT id FROM vendor_credits WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

-- RLS Policies for purchase orders
-- RLS Policies for vendor credit applications
CREATE POLICY "vendor_credit_applications_access"
  ON vendor_credit_applications FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "vendor_credit_applications_insert"
  ON vendor_credit_applications FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "vendor_credit_applications_update"
  ON vendor_credit_applications FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "vendor_credit_applications_delete"
  ON vendor_credit_applications FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

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

-- RLS Policies for bank_reconciliations
CREATE POLICY "bank_reconciliations_access"
  ON bank_reconciliations FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "bank_reconciliations_insert"
  ON bank_reconciliations FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "bank_reconciliations_update"
  ON bank_reconciliations FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "bank_reconciliations_delete"
  ON bank_reconciliations FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- RLS Policies for bank_reconciliation_lines
CREATE POLICY "bank_reconciliation_lines_access"
  ON bank_reconciliation_lines FOR SELECT
  USING (
    bank_reconciliation_id IN (
      SELECT id FROM bank_reconciliations
      WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "bank_reconciliation_lines_insert"
  ON bank_reconciliation_lines FOR INSERT
  WITH CHECK (
    bank_reconciliation_id IN (
      SELECT id FROM bank_reconciliations
      WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "bank_reconciliation_lines_update"
  ON bank_reconciliation_lines FOR UPDATE
  USING (
    bank_reconciliation_id IN (
      SELECT id FROM bank_reconciliations
      WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "bank_reconciliation_lines_delete"
  ON bank_reconciliation_lines FOR DELETE
  USING (
    bank_reconciliation_id IN (
      SELECT id FROM bank_reconciliations
      WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

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

-- =============================================
-- RLS Policies for Shareholders & Distributions
-- =============================================

-- Shareholders
CREATE POLICY "shareholders_access"
  ON shareholders FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "shareholders_insert"
  ON shareholders FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "shareholders_update"
  ON shareholders FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "shareholders_delete"
  ON shareholders FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Capital contributions
CREATE POLICY "capital_contributions_access"
  ON capital_contributions FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "capital_contributions_insert"
  ON capital_contributions FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "capital_contributions_update"
  ON capital_contributions FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "capital_contributions_delete"
  ON capital_contributions FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Profit distributions
CREATE POLICY "profit_distributions_access"
  ON profit_distributions FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "profit_distributions_insert"
  ON profit_distributions FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "profit_distributions_update"
  ON profit_distributions FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "profit_distributions_delete"
  ON profit_distributions FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Profit distribution lines: join via distributions table
CREATE POLICY "profit_distribution_lines_access"
  ON profit_distribution_lines FOR SELECT
  USING (distribution_id IN (SELECT id FROM profit_distributions WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "profit_distribution_lines_insert"
  ON profit_distribution_lines FOR INSERT
  WITH CHECK (distribution_id IN (SELECT id FROM profit_distributions WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "profit_distribution_lines_update"
  ON profit_distribution_lines FOR UPDATE
  USING (distribution_id IN (SELECT id FROM profit_distributions WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));

CREATE POLICY "profit_distribution_lines_delete"
  ON profit_distribution_lines FOR DELETE
  USING (distribution_id IN (SELECT id FROM profit_distributions WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())));
-- =============================================
-- RLS Policies for company members
-- =============================================
CREATE POLICY "company_members_select"
  ON company_members FOR SELECT
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "company_members_insert"
  ON company_members FOR INSERT
  WITH CHECK (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
  );

CREATE POLICY "company_members_update"
  ON company_members FOR UPDATE
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
  );

CREATE POLICY "company_members_delete"
  ON company_members FOR DELETE
  USING (
    company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
  );
