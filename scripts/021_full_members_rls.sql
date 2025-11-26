-- =============================================
-- سياسات RLS الكاملة لأعضاء الشركة
-- تمنح الأعضاء صلاحيات القراءة والكتابة والتعديل حسب دورهم
-- =============================================

-- =====================================
-- 1. صلاحيات القراءة لجميع الأعضاء
-- =====================================

-- Companies
DROP POLICY IF EXISTS companies_select_members ON companies;
CREATE POLICY companies_select_members ON companies FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = id AND cm.user_id = auth.uid()));

-- Chart of Accounts
DROP POLICY IF EXISTS chart_accounts_select_members ON chart_of_accounts;
CREATE POLICY chart_accounts_select_members ON chart_of_accounts FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = chart_of_accounts.company_id AND cm.user_id = auth.uid()));

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

-- Inventory transactions
DROP POLICY IF EXISTS inventory_transactions_select_members ON inventory_transactions;
CREATE POLICY inventory_transactions_select_members ON inventory_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = inventory_transactions.company_id AND cm.user_id = auth.uid()));

-- Purchase Orders
DROP POLICY IF EXISTS purchase_orders_select_members ON purchase_orders;
CREATE POLICY purchase_orders_select_members ON purchase_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = purchase_orders.company_id AND cm.user_id = auth.uid()));

-- Vendor Credits
DROP POLICY IF EXISTS vendor_credits_select_members ON vendor_credits;
CREATE POLICY vendor_credits_select_members ON vendor_credits FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = vendor_credits.company_id AND cm.user_id = auth.uid()));

-- Estimates
DROP POLICY IF EXISTS estimates_select_members ON estimates;
CREATE POLICY estimates_select_members ON estimates FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = estimates.company_id AND cm.user_id = auth.uid()));

-- Sales Orders
DROP POLICY IF EXISTS sales_orders_select_members ON sales_orders;
CREATE POLICY sales_orders_select_members ON sales_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = sales_orders.company_id AND cm.user_id = auth.uid()));

-- Tax codes
DROP POLICY IF EXISTS tax_codes_select_members ON tax_codes;
CREATE POLICY tax_codes_select_members ON tax_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = tax_codes.company_id AND cm.user_id = auth.uid()));

-- Shareholders
DROP POLICY IF EXISTS shareholders_select_members ON shareholders;
CREATE POLICY shareholders_select_members ON shareholders FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = shareholders.company_id AND cm.user_id = auth.uid()));

-- Profit distributions
DROP POLICY IF EXISTS profit_distributions_select_members ON profit_distributions;
CREATE POLICY profit_distributions_select_members ON profit_distributions FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = profit_distributions.company_id AND cm.user_id = auth.uid()));

-- Bank reconciliations
DROP POLICY IF EXISTS bank_reconciliations_select_members ON bank_reconciliations;
CREATE POLICY bank_reconciliations_select_members ON bank_reconciliations FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = bank_reconciliations.company_id AND cm.user_id = auth.uid()));

-- Sales returns
DROP POLICY IF EXISTS sales_returns_select_members ON sales_returns;
CREATE POLICY sales_returns_select_members ON sales_returns FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = sales_returns.company_id AND cm.user_id = auth.uid()));

-- Sales return items
DROP POLICY IF EXISTS sales_return_items_select_members ON sales_return_items;
CREATE POLICY sales_return_items_select_members ON sales_return_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sales_returns sr
    JOIN company_members cm ON cm.company_id = sr.company_id AND cm.user_id = auth.uid()
    WHERE sr.id = sales_return_items.sales_return_id
  ));

-- =====================================
-- 2. صلاحيات الإدراج للأدوار المسموحة
-- owner, admin, manager, accountant, staff
-- =====================================

-- Chart of Accounts - INSERT
DROP POLICY IF EXISTS chart_accounts_insert_members ON chart_of_accounts;
CREATE POLICY chart_accounts_insert_members ON chart_of_accounts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = chart_of_accounts.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Journal entries - INSERT
DROP POLICY IF EXISTS journal_entries_insert_members ON journal_entries;
CREATE POLICY journal_entries_insert_members ON journal_entries FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = journal_entries.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Invoices - INSERT
DROP POLICY IF EXISTS invoices_insert_members ON invoices;
CREATE POLICY invoices_insert_members ON invoices FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = invoices.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Bills - INSERT
DROP POLICY IF EXISTS bills_insert_members ON bills;
CREATE POLICY bills_insert_members ON bills FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = bills.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Products - INSERT
DROP POLICY IF EXISTS products_insert_members ON products;
CREATE POLICY products_insert_members ON products FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = products.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Customers - INSERT
DROP POLICY IF EXISTS customers_insert_members ON customers;
CREATE POLICY customers_insert_members ON customers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = customers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Suppliers - INSERT
DROP POLICY IF EXISTS suppliers_insert_members ON suppliers;
CREATE POLICY suppliers_insert_members ON suppliers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = suppliers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Payments - INSERT
DROP POLICY IF EXISTS payments_insert_members ON payments;
CREATE POLICY payments_insert_members ON payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = payments.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Inventory transactions - INSERT
DROP POLICY IF EXISTS inventory_transactions_insert_members ON inventory_transactions;
CREATE POLICY inventory_transactions_insert_members ON inventory_transactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = inventory_transactions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Purchase Orders - INSERT
DROP POLICY IF EXISTS purchase_orders_insert_members ON purchase_orders;
CREATE POLICY purchase_orders_insert_members ON purchase_orders FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = purchase_orders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Vendor Credits - INSERT
DROP POLICY IF EXISTS vendor_credits_insert_members ON vendor_credits;
CREATE POLICY vendor_credits_insert_members ON vendor_credits FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = vendor_credits.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Estimates - INSERT
DROP POLICY IF EXISTS estimates_insert_members ON estimates;
CREATE POLICY estimates_insert_members ON estimates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = estimates.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Sales Orders - INSERT
DROP POLICY IF EXISTS sales_orders_insert_members ON sales_orders;
CREATE POLICY sales_orders_insert_members ON sales_orders FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = sales_orders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Sales returns - INSERT
DROP POLICY IF EXISTS sales_returns_insert_members ON sales_returns;
CREATE POLICY sales_returns_insert_members ON sales_returns FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = sales_returns.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));


-- =====================================
-- 3. صلاحيات التعديل للأدوار المسموحة
-- =====================================

-- Chart of Accounts - UPDATE
DROP POLICY IF EXISTS chart_accounts_update_members ON chart_of_accounts;
CREATE POLICY chart_accounts_update_members ON chart_of_accounts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = chart_of_accounts.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Journal entries - UPDATE
DROP POLICY IF EXISTS journal_entries_update_members ON journal_entries;
CREATE POLICY journal_entries_update_members ON journal_entries FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = journal_entries.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Invoices - UPDATE
DROP POLICY IF EXISTS invoices_update_members ON invoices;
CREATE POLICY invoices_update_members ON invoices FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = invoices.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Bills - UPDATE
DROP POLICY IF EXISTS bills_update_members ON bills;
CREATE POLICY bills_update_members ON bills FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = bills.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Products - UPDATE
DROP POLICY IF EXISTS products_update_members ON products;
CREATE POLICY products_update_members ON products FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = products.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Customers - UPDATE
DROP POLICY IF EXISTS customers_update_members ON customers;
CREATE POLICY customers_update_members ON customers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = customers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Suppliers - UPDATE
DROP POLICY IF EXISTS suppliers_update_members ON suppliers;
CREATE POLICY suppliers_update_members ON suppliers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = suppliers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Payments - UPDATE
DROP POLICY IF EXISTS payments_update_members ON payments;
CREATE POLICY payments_update_members ON payments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = payments.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

-- Purchase Orders - UPDATE
DROP POLICY IF EXISTS purchase_orders_update_members ON purchase_orders;
CREATE POLICY purchase_orders_update_members ON purchase_orders FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = purchase_orders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Estimates - UPDATE
DROP POLICY IF EXISTS estimates_update_members ON estimates;
CREATE POLICY estimates_update_members ON estimates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = estimates.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Sales Orders - UPDATE
DROP POLICY IF EXISTS sales_orders_update_members ON sales_orders;
CREATE POLICY sales_orders_update_members ON sales_orders FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = sales_orders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

-- Sales returns - UPDATE
DROP POLICY IF EXISTS sales_returns_update_members ON sales_returns;
CREATE POLICY sales_returns_update_members ON sales_returns FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = sales_returns.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));


-- =====================================
-- 4. صلاحيات الحذف للأدوار المسموحة
-- owner, admin, manager فقط
-- =====================================

-- Chart of Accounts - DELETE
DROP POLICY IF EXISTS chart_accounts_delete_members ON chart_of_accounts;
CREATE POLICY chart_accounts_delete_members ON chart_of_accounts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = chart_of_accounts.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

-- Journal entries - DELETE
DROP POLICY IF EXISTS journal_entries_delete_members ON journal_entries;
CREATE POLICY journal_entries_delete_members ON journal_entries FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = journal_entries.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Invoices - DELETE
DROP POLICY IF EXISTS invoices_delete_members ON invoices;
CREATE POLICY invoices_delete_members ON invoices FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = invoices.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Bills - DELETE
DROP POLICY IF EXISTS bills_delete_members ON bills;
CREATE POLICY bills_delete_members ON bills FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = bills.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Products - DELETE
DROP POLICY IF EXISTS products_delete_members ON products;
CREATE POLICY products_delete_members ON products FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = products.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Customers - DELETE
DROP POLICY IF EXISTS customers_delete_members ON customers;
CREATE POLICY customers_delete_members ON customers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = customers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Suppliers - DELETE
DROP POLICY IF EXISTS suppliers_delete_members ON suppliers;
CREATE POLICY suppliers_delete_members ON suppliers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = suppliers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Payments - DELETE
DROP POLICY IF EXISTS payments_delete_members ON payments;
CREATE POLICY payments_delete_members ON payments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = payments.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Purchase Orders - DELETE
DROP POLICY IF EXISTS purchase_orders_delete_members ON purchase_orders;
CREATE POLICY purchase_orders_delete_members ON purchase_orders FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = purchase_orders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Vendor Credits - DELETE
DROP POLICY IF EXISTS vendor_credits_delete_members ON vendor_credits;
CREATE POLICY vendor_credits_delete_members ON vendor_credits FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = vendor_credits.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Estimates - DELETE
DROP POLICY IF EXISTS estimates_delete_members ON estimates;
CREATE POLICY estimates_delete_members ON estimates FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = estimates.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Sales Orders - DELETE
DROP POLICY IF EXISTS sales_orders_delete_members ON sales_orders;
CREATE POLICY sales_orders_delete_members ON sales_orders FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = sales_orders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- Sales returns - DELETE
DROP POLICY IF EXISTS sales_returns_delete_members ON sales_returns;
CREATE POLICY sales_returns_delete_members ON sales_returns FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = sales_returns.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));

-- =====================================
-- 5. صلاحيات الجداول الفرعية (Items)
-- =====================================

-- Invoice items - INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS invoice_items_insert_members ON invoice_items;
CREATE POLICY invoice_items_insert_members ON invoice_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    JOIN company_members cm ON cm.company_id = i.company_id AND cm.user_id = auth.uid()
    WHERE i.id = invoice_items.invoice_id AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS invoice_items_update_members ON invoice_items;
CREATE POLICY invoice_items_update_members ON invoice_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN company_members cm ON cm.company_id = i.company_id AND cm.user_id = auth.uid()
    WHERE i.id = invoice_items.invoice_id AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS invoice_items_delete_members ON invoice_items;
CREATE POLICY invoice_items_delete_members ON invoice_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN company_members cm ON cm.company_id = i.company_id AND cm.user_id = auth.uid()
    WHERE i.id = invoice_items.invoice_id AND cm.role IN ('owner','admin','manager')
  ));


-- Bill items - INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS bill_items_insert_members ON bill_items;
CREATE POLICY bill_items_insert_members ON bill_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM bills b
    JOIN company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
    WHERE b.id = bill_items.bill_id AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS bill_items_update_members ON bill_items;
CREATE POLICY bill_items_update_members ON bill_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM bills b
    JOIN company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
    WHERE b.id = bill_items.bill_id AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS bill_items_delete_members ON bill_items;
CREATE POLICY bill_items_delete_members ON bill_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM bills b
    JOIN company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
    WHERE b.id = bill_items.bill_id AND cm.role IN ('owner','admin','manager')
  ));

-- Journal entry lines - INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS journal_entry_lines_insert_members ON journal_entry_lines;
CREATE POLICY journal_entry_lines_insert_members ON journal_entry_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM journal_entries je
    JOIN company_members cm ON cm.company_id = je.company_id AND cm.user_id = auth.uid()
    WHERE je.id = journal_entry_lines.journal_entry_id AND cm.role IN ('owner','admin','manager','accountant')
  ));

DROP POLICY IF EXISTS journal_entry_lines_update_members ON journal_entry_lines;
CREATE POLICY journal_entry_lines_update_members ON journal_entry_lines FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    JOIN company_members cm ON cm.company_id = je.company_id AND cm.user_id = auth.uid()
    WHERE je.id = journal_entry_lines.journal_entry_id AND cm.role IN ('owner','admin','manager','accountant')
  ));

DROP POLICY IF EXISTS journal_entry_lines_delete_members ON journal_entry_lines;
CREATE POLICY journal_entry_lines_delete_members ON journal_entry_lines FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    JOIN company_members cm ON cm.company_id = je.company_id AND cm.user_id = auth.uid()
    WHERE je.id = journal_entry_lines.journal_entry_id AND cm.role IN ('owner','admin','manager')
  ));

-- Sales return items - INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS sales_return_items_insert_members ON sales_return_items;
CREATE POLICY sales_return_items_insert_members ON sales_return_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sales_returns sr
    JOIN company_members cm ON cm.company_id = sr.company_id AND cm.user_id = auth.uid()
    WHERE sr.id = sales_return_items.sales_return_id AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS sales_return_items_update_members ON sales_return_items;
CREATE POLICY sales_return_items_update_members ON sales_return_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sales_returns sr
    JOIN company_members cm ON cm.company_id = sr.company_id AND cm.user_id = auth.uid()
    WHERE sr.id = sales_return_items.sales_return_id AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS sales_return_items_delete_members ON sales_return_items;
CREATE POLICY sales_return_items_delete_members ON sales_return_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sales_returns sr
    JOIN company_members cm ON cm.company_id = sr.company_id AND cm.user_id = auth.uid()
    WHERE sr.id = sales_return_items.sales_return_id AND cm.role IN ('owner','admin','manager')
  ));

-- =====================================
-- 6. صلاحيات إضافية للجداول الأخرى
-- =====================================

-- Tax codes - INSERT/UPDATE/DELETE للمحاسبين والأعلى
DROP POLICY IF EXISTS tax_codes_insert_members ON tax_codes;
CREATE POLICY tax_codes_insert_members ON tax_codes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = tax_codes.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','accountant')
  ));

DROP POLICY IF EXISTS tax_codes_update_members ON tax_codes;
CREATE POLICY tax_codes_update_members ON tax_codes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = tax_codes.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','accountant')
  ));

DROP POLICY IF EXISTS tax_codes_delete_members ON tax_codes;
CREATE POLICY tax_codes_delete_members ON tax_codes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = tax_codes.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

-- Shareholders - INSERT/UPDATE/DELETE للمالكين والمدراء فقط
DROP POLICY IF EXISTS shareholders_insert_members ON shareholders;
CREATE POLICY shareholders_insert_members ON shareholders FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = shareholders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS shareholders_update_members ON shareholders;
CREATE POLICY shareholders_update_members ON shareholders FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = shareholders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS shareholders_delete_members ON shareholders;
CREATE POLICY shareholders_delete_members ON shareholders FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = shareholders.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner')
  ));

-- Profit distributions - INSERT/UPDATE/DELETE للمالكين والمدراء فقط
DROP POLICY IF EXISTS profit_distributions_insert_members ON profit_distributions;
CREATE POLICY profit_distributions_insert_members ON profit_distributions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = profit_distributions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS profit_distributions_update_members ON profit_distributions;
CREATE POLICY profit_distributions_update_members ON profit_distributions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = profit_distributions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

DROP POLICY IF EXISTS profit_distributions_delete_members ON profit_distributions;
CREATE POLICY profit_distributions_delete_members ON profit_distributions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = profit_distributions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner')
  ));