-- =============================================
-- سياسات RLS للجداول الأساسية الموجودة
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

-- Tax codes
DROP POLICY IF EXISTS tax_codes_select_members ON tax_codes;
CREATE POLICY tax_codes_select_members ON tax_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = tax_codes.company_id AND cm.user_id = auth.uid()));

-- =====================================
-- 2. صلاحيات الإضافة
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

-- Tax codes - INSERT
DROP POLICY IF EXISTS tax_codes_insert_members ON tax_codes;
CREATE POLICY tax_codes_insert_members ON tax_codes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = tax_codes.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','accountant')
  ));

-- =====================================
-- 3. صلاحيات التعديل
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

-- Tax codes - UPDATE
DROP POLICY IF EXISTS tax_codes_update_members ON tax_codes;
CREATE POLICY tax_codes_update_members ON tax_codes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = tax_codes.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','accountant')
  ));

-- =====================================
-- 4. صلاحيات الحذف
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

-- Tax codes - DELETE
DROP POLICY IF EXISTS tax_codes_delete_members ON tax_codes;
CREATE POLICY tax_codes_delete_members ON tax_codes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = tax_codes.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin')
  ));

-- =====================================
-- 5. صلاحيات العناصر الفرعية
-- =====================================

-- Invoice items
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

-- Bill items
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

-- Journal entry lines
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

-- Inventory transactions
DROP POLICY IF EXISTS inventory_transactions_insert_members ON inventory_transactions;
CREATE POLICY inventory_transactions_insert_members ON inventory_transactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = inventory_transactions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant','staff')
  ));

DROP POLICY IF EXISTS inventory_transactions_update_members ON inventory_transactions;
CREATE POLICY inventory_transactions_update_members ON inventory_transactions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = inventory_transactions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager','accountant')
  ));

DROP POLICY IF EXISTS inventory_transactions_delete_members ON inventory_transactions;
CREATE POLICY inventory_transactions_delete_members ON inventory_transactions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = inventory_transactions.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner','admin','manager')
  ));
