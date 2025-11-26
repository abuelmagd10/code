-- =============================================
-- سكربت شامل لإصلاح جميع سياسات RLS
-- يعمل على جميع الجداول الموجودة فعلياً
-- =============================================

-- =====================================
-- 1. تحديث أدوار الأعضاء لتشمل الأدوار الجديدة
-- =====================================

-- تحديث قيود الأدوار في جدول company_members
DO $$
BEGIN
  -- إزالة القيد القديم وإضافة الجديد
  ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_role_check;
  ALTER TABLE company_members ADD CONSTRAINT company_members_role_check 
    CHECK (role IN ('owner','admin','manager','accountant','staff','viewer'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- تحديث قيود الأدوار في جدول company_invitations
DO $$
BEGIN
  ALTER TABLE company_invitations DROP CONSTRAINT IF EXISTS company_invitations_role_check;
  ALTER TABLE company_invitations ADD CONSTRAINT company_invitations_role_check 
    CHECK (role IN ('owner','admin','manager','accountant','staff','viewer'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================
-- 2. دالة مساعدة للتحقق من الصلاحيات
-- =====================================
CREATE OR REPLACE FUNCTION check_user_role(
  p_company_id UUID,
  p_user_id UUID,
  p_required_roles TEXT[]
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = p_company_id
    AND cm.user_id = p_user_id
    AND cm.role = ANY(p_required_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- دالة للتحقق هل المستخدم عضو في الشركة
CREATE OR REPLACE FUNCTION is_company_member(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = p_company_id
    AND cm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id = p_company_id
    AND c.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- دالة للتحقق هل المستخدم مالك أو مدير
CREATE OR REPLACE FUNCTION is_owner_or_admin(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = p_company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- دالة للتحقق من صلاحيات التعديل
CREATE OR REPLACE FUNCTION can_modify_data(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = p_company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin', 'manager', 'accountant', 'staff')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- دالة للتحقق من صلاحيات الحذف
CREATE OR REPLACE FUNCTION can_delete_data(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = p_company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================
-- 3. إصلاح سياسات جدول Companies
-- =====================================
DROP POLICY IF EXISTS companies_select_own ON companies;
DROP POLICY IF EXISTS companies_select_members ON companies;
DROP POLICY IF EXISTS companies_insert_own ON companies;
DROP POLICY IF EXISTS companies_update_own ON companies;
DROP POLICY IF EXISTS companies_update_admin ON companies;
DROP POLICY IF EXISTS companies_delete_own ON companies;

CREATE POLICY companies_select ON companies FOR SELECT
  USING (user_id = auth.uid() OR is_company_member(id));

CREATE POLICY companies_insert ON companies FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY companies_update ON companies FOR UPDATE
  USING (user_id = auth.uid() OR is_owner_or_admin(id));

CREATE POLICY companies_delete ON companies FOR DELETE
  USING (user_id = auth.uid());

-- =====================================
-- 4. سياسات company_members
-- =====================================
DROP POLICY IF EXISTS company_members_select ON company_members;
DROP POLICY IF EXISTS company_members_insert ON company_members;
DROP POLICY IF EXISTS company_members_update ON company_members;
DROP POLICY IF EXISTS company_members_delete ON company_members;
DROP POLICY IF EXISTS company_members_insert_invited ON company_members;

CREATE POLICY company_members_select ON company_members FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY company_members_insert ON company_members FOR INSERT
  WITH CHECK (is_owner_or_admin(company_id) OR
    EXISTS (
      SELECT 1 FROM company_invitations ci
      WHERE ci.company_id = company_members.company_id
      AND ci.email = (auth.jwt() ->> 'email')
      AND ci.expires_at > now()
      AND ci.accepted = false
    ));

CREATE POLICY company_members_update ON company_members FOR UPDATE
  USING (is_owner_or_admin(company_id));

CREATE POLICY company_members_delete ON company_members FOR DELETE
  USING (is_owner_or_admin(company_id));

-- =====================================
-- 5. سياسات الجداول الأساسية (باستخدام الدوال المساعدة)
-- =====================================

-- Chart of Accounts
DROP POLICY IF EXISTS chart_accounts_access ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_insert ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_update ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_delete ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_select_members ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_insert_members ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_update_members ON chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_delete_members ON chart_of_accounts;

CREATE POLICY chart_of_accounts_select ON chart_of_accounts FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY chart_of_accounts_insert ON chart_of_accounts FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY chart_of_accounts_update ON chart_of_accounts FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY chart_of_accounts_delete ON chart_of_accounts FOR DELETE
  USING (is_owner_or_admin(company_id));

-- Customers
DROP POLICY IF EXISTS customers_access ON customers;
DROP POLICY IF EXISTS customers_insert ON customers;
DROP POLICY IF EXISTS customers_update ON customers;
DROP POLICY IF EXISTS customers_delete ON customers;
DROP POLICY IF EXISTS customers_select_members ON customers;
DROP POLICY IF EXISTS customers_insert_members ON customers;
DROP POLICY IF EXISTS customers_update_members ON customers;
DROP POLICY IF EXISTS customers_delete_members ON customers;

CREATE POLICY customers_select ON customers FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY customers_update ON customers FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY customers_delete ON customers FOR DELETE
  USING (can_delete_data(company_id));

-- Suppliers
DROP POLICY IF EXISTS suppliers_access ON suppliers;
DROP POLICY IF EXISTS suppliers_insert ON suppliers;
DROP POLICY IF EXISTS suppliers_update ON suppliers;
DROP POLICY IF EXISTS suppliers_delete ON suppliers;
DROP POLICY IF EXISTS suppliers_select_members ON suppliers;
DROP POLICY IF EXISTS suppliers_insert_members ON suppliers;
DROP POLICY IF EXISTS suppliers_update_members ON suppliers;
DROP POLICY IF EXISTS suppliers_delete_members ON suppliers;

CREATE POLICY suppliers_select ON suppliers FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY suppliers_insert ON suppliers FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY suppliers_update ON suppliers FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY suppliers_delete ON suppliers FOR DELETE
  USING (can_delete_data(company_id));

-- Products
DROP POLICY IF EXISTS products_access ON products;
DROP POLICY IF EXISTS products_insert ON products;
DROP POLICY IF EXISTS products_update ON products;
DROP POLICY IF EXISTS products_delete ON products;
DROP POLICY IF EXISTS products_select_members ON products;
DROP POLICY IF EXISTS products_insert_members ON products;
DROP POLICY IF EXISTS products_update_members ON products;
DROP POLICY IF EXISTS products_delete_members ON products;

CREATE POLICY products_select ON products FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY products_insert ON products FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY products_update ON products FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY products_delete ON products FOR DELETE
  USING (can_delete_data(company_id));

-- Invoices
DROP POLICY IF EXISTS invoices_access ON invoices;
DROP POLICY IF EXISTS invoices_insert ON invoices;
DROP POLICY IF EXISTS invoices_update ON invoices;
DROP POLICY IF EXISTS invoices_delete ON invoices;
DROP POLICY IF EXISTS invoices_select_members ON invoices;
DROP POLICY IF EXISTS invoices_insert_members ON invoices;
DROP POLICY IF EXISTS invoices_update_members ON invoices;
DROP POLICY IF EXISTS invoices_delete_members ON invoices;

CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY invoices_insert ON invoices FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY invoices_update ON invoices FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY invoices_delete ON invoices FOR DELETE
  USING (can_delete_data(company_id));

-- Bills
DROP POLICY IF EXISTS bills_access ON bills;
DROP POLICY IF EXISTS bills_insert ON bills;
DROP POLICY IF EXISTS bills_update ON bills;
DROP POLICY IF EXISTS bills_delete ON bills;
DROP POLICY IF EXISTS bills_select_members ON bills;
DROP POLICY IF EXISTS bills_insert_members ON bills;
DROP POLICY IF EXISTS bills_update_members ON bills;
DROP POLICY IF EXISTS bills_delete_members ON bills;

CREATE POLICY bills_select ON bills FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY bills_insert ON bills FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY bills_update ON bills FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY bills_delete ON bills FOR DELETE
  USING (can_delete_data(company_id));

-- Payments
DROP POLICY IF EXISTS payments_access ON payments;
DROP POLICY IF EXISTS payments_insert ON payments;
DROP POLICY IF EXISTS payments_update ON payments;
DROP POLICY IF EXISTS payments_delete ON payments;
DROP POLICY IF EXISTS payments_select_members ON payments;
DROP POLICY IF EXISTS payments_insert_members ON payments;
DROP POLICY IF EXISTS payments_update_members ON payments;
DROP POLICY IF EXISTS payments_delete_members ON payments;

CREATE POLICY payments_select ON payments FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY payments_update ON payments FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY payments_delete ON payments FOR DELETE
  USING (can_delete_data(company_id));

-- Journal Entries
DROP POLICY IF EXISTS journal_entries_access ON journal_entries;
DROP POLICY IF EXISTS journal_entries_insert ON journal_entries;
DROP POLICY IF EXISTS journal_entries_update ON journal_entries;
DROP POLICY IF EXISTS journal_entries_delete ON journal_entries;
DROP POLICY IF EXISTS journal_entries_select_members ON journal_entries;
DROP POLICY IF EXISTS journal_entries_insert_members ON journal_entries;
DROP POLICY IF EXISTS journal_entries_update_members ON journal_entries;
DROP POLICY IF EXISTS journal_entries_delete_members ON journal_entries;

CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY journal_entries_insert ON journal_entries FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY journal_entries_update ON journal_entries FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY journal_entries_delete ON journal_entries FOR DELETE
  USING (can_delete_data(company_id));

-- Purchase Orders
DROP POLICY IF EXISTS purchase_orders_access ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_insert ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_update ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_delete ON purchase_orders;

CREATE POLICY purchase_orders_select ON purchase_orders FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY purchase_orders_insert ON purchase_orders FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY purchase_orders_update ON purchase_orders FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY purchase_orders_delete ON purchase_orders FOR DELETE
  USING (can_delete_data(company_id));

-- Vendor Credits
DROP POLICY IF EXISTS vendor_credits_access ON vendor_credits;
DROP POLICY IF EXISTS vendor_credits_insert ON vendor_credits;
DROP POLICY IF EXISTS vendor_credits_update ON vendor_credits;
DROP POLICY IF EXISTS vendor_credits_delete ON vendor_credits;

CREATE POLICY vendor_credits_select ON vendor_credits FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY vendor_credits_insert ON vendor_credits FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY vendor_credits_update ON vendor_credits FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY vendor_credits_delete ON vendor_credits FOR DELETE
  USING (can_delete_data(company_id));

-- Inventory Transactions
DROP POLICY IF EXISTS inventory_transactions_access ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_insert ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_update ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_delete ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_select_members ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_insert_members ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_update_members ON inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_delete_members ON inventory_transactions;

CREATE POLICY inventory_transactions_select ON inventory_transactions FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY inventory_transactions_insert ON inventory_transactions FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY inventory_transactions_update ON inventory_transactions FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY inventory_transactions_delete ON inventory_transactions FOR DELETE
  USING (can_delete_data(company_id));

-- =====================================
-- 6. سياسات العناصر الفرعية (Child Tables)
-- =====================================

-- دالة للتحقق من الوصول للعناصر الفرعية عبر الجدول الأب
CREATE OR REPLACE FUNCTION can_access_invoice_items(p_invoice_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM invoices WHERE id = p_invoice_id;
  RETURN is_company_member(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_modify_invoice_items(p_invoice_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM invoices WHERE id = p_invoice_id;
  RETURN can_modify_data(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Invoice Items
DROP POLICY IF EXISTS invoice_items_access ON invoice_items;
DROP POLICY IF EXISTS invoice_items_insert ON invoice_items;
DROP POLICY IF EXISTS invoice_items_update ON invoice_items;
DROP POLICY IF EXISTS invoice_items_delete ON invoice_items;
DROP POLICY IF EXISTS invoice_items_select_members ON invoice_items;
DROP POLICY IF EXISTS invoice_items_insert_members ON invoice_items;
DROP POLICY IF EXISTS invoice_items_update_members ON invoice_items;
DROP POLICY IF EXISTS invoice_items_delete_members ON invoice_items;

CREATE POLICY invoice_items_select ON invoice_items FOR SELECT
  USING (can_access_invoice_items(invoice_id));

CREATE POLICY invoice_items_insert ON invoice_items FOR INSERT
  WITH CHECK (can_modify_invoice_items(invoice_id));

CREATE POLICY invoice_items_update ON invoice_items FOR UPDATE
  USING (can_modify_invoice_items(invoice_id));

CREATE POLICY invoice_items_delete ON invoice_items FOR DELETE
  USING (can_modify_invoice_items(invoice_id));

-- Bill Items
CREATE OR REPLACE FUNCTION can_access_bill_items(p_bill_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM bills WHERE id = p_bill_id;
  RETURN is_company_member(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS bill_items_access ON bill_items;
DROP POLICY IF EXISTS bill_items_insert ON bill_items;
DROP POLICY IF EXISTS bill_items_update ON bill_items;
DROP POLICY IF EXISTS bill_items_delete ON bill_items;
DROP POLICY IF EXISTS bill_items_select_members ON bill_items;
DROP POLICY IF EXISTS bill_items_insert_members ON bill_items;
DROP POLICY IF EXISTS bill_items_update_members ON bill_items;
DROP POLICY IF EXISTS bill_items_delete_members ON bill_items;

CREATE POLICY bill_items_select ON bill_items FOR SELECT
  USING (can_access_bill_items(bill_id));

CREATE POLICY bill_items_insert ON bill_items FOR INSERT
  WITH CHECK (can_access_bill_items(bill_id));

CREATE POLICY bill_items_update ON bill_items FOR UPDATE
  USING (can_access_bill_items(bill_id));

CREATE POLICY bill_items_delete ON bill_items FOR DELETE
  USING (can_access_bill_items(bill_id));

-- Journal Entry Lines
CREATE OR REPLACE FUNCTION can_access_journal_lines(p_journal_entry_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM journal_entries WHERE id = p_journal_entry_id;
  RETURN is_company_member(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS journal_entry_lines_access ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_insert ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_update ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_delete ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_select_members ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_insert_members ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_update_members ON journal_entry_lines;
DROP POLICY IF EXISTS journal_entry_lines_delete_members ON journal_entry_lines;

CREATE POLICY journal_entry_lines_select ON journal_entry_lines FOR SELECT
  USING (can_access_journal_lines(journal_entry_id));

CREATE POLICY journal_entry_lines_insert ON journal_entry_lines FOR INSERT
  WITH CHECK (can_access_journal_lines(journal_entry_id));

CREATE POLICY journal_entry_lines_update ON journal_entry_lines FOR UPDATE
  USING (can_access_journal_lines(journal_entry_id));

CREATE POLICY journal_entry_lines_delete ON journal_entry_lines FOR DELETE
  USING (can_access_journal_lines(journal_entry_id));

-- Purchase Order Items
CREATE OR REPLACE FUNCTION can_access_po_items(p_purchase_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM purchase_orders WHERE id = p_purchase_order_id;
  RETURN is_company_member(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS purchase_order_items_access ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_insert ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_update ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_delete ON purchase_order_items;

CREATE POLICY purchase_order_items_select ON purchase_order_items FOR SELECT
  USING (can_access_po_items(purchase_order_id));

CREATE POLICY purchase_order_items_insert ON purchase_order_items FOR INSERT
  WITH CHECK (can_access_po_items(purchase_order_id));

CREATE POLICY purchase_order_items_update ON purchase_order_items FOR UPDATE
  USING (can_access_po_items(purchase_order_id));

CREATE POLICY purchase_order_items_delete ON purchase_order_items FOR DELETE
  USING (can_access_po_items(purchase_order_id));

-- Vendor Credit Items
CREATE OR REPLACE FUNCTION can_access_vc_items(p_vendor_credit_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM vendor_credits WHERE id = p_vendor_credit_id;
  RETURN is_company_member(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS vendor_credit_items_access ON vendor_credit_items;
DROP POLICY IF EXISTS vendor_credit_items_insert ON vendor_credit_items;
DROP POLICY IF EXISTS vendor_credit_items_update ON vendor_credit_items;
DROP POLICY IF EXISTS vendor_credit_items_delete ON vendor_credit_items;

CREATE POLICY vendor_credit_items_select ON vendor_credit_items FOR SELECT
  USING (can_access_vc_items(vendor_credit_id));

CREATE POLICY vendor_credit_items_insert ON vendor_credit_items FOR INSERT
  WITH CHECK (can_access_vc_items(vendor_credit_id));

CREATE POLICY vendor_credit_items_update ON vendor_credit_items FOR UPDATE
  USING (can_access_vc_items(vendor_credit_id));

CREATE POLICY vendor_credit_items_delete ON vendor_credit_items FOR DELETE
  USING (can_access_vc_items(vendor_credit_id));

-- =====================================
-- 7. سياسات الجداول الإضافية (إذا كانت موجودة)
-- =====================================

-- Vendor Credit Applications
DROP POLICY IF EXISTS vendor_credit_applications_access ON vendor_credit_applications;
DROP POLICY IF EXISTS vendor_credit_applications_insert ON vendor_credit_applications;
DROP POLICY IF EXISTS vendor_credit_applications_update ON vendor_credit_applications;
DROP POLICY IF EXISTS vendor_credit_applications_delete ON vendor_credit_applications;

CREATE POLICY vendor_credit_applications_select ON vendor_credit_applications FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY vendor_credit_applications_insert ON vendor_credit_applications FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY vendor_credit_applications_update ON vendor_credit_applications FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY vendor_credit_applications_delete ON vendor_credit_applications FOR DELETE
  USING (can_delete_data(company_id));

-- Account Balances
DROP POLICY IF EXISTS account_balances_access ON account_balances;
DROP POLICY IF EXISTS account_balances_insert ON account_balances;
DROP POLICY IF EXISTS account_balances_update ON account_balances;

CREATE POLICY account_balances_select ON account_balances FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY account_balances_insert ON account_balances FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY account_balances_update ON account_balances FOR UPDATE
  USING (can_modify_data(company_id));

-- Bank Reconciliations
DROP POLICY IF EXISTS bank_reconciliations_access ON bank_reconciliations;
DROP POLICY IF EXISTS bank_reconciliations_insert ON bank_reconciliations;
DROP POLICY IF EXISTS bank_reconciliations_update ON bank_reconciliations;
DROP POLICY IF EXISTS bank_reconciliations_delete ON bank_reconciliations;

CREATE POLICY bank_reconciliations_select ON bank_reconciliations FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY bank_reconciliations_insert ON bank_reconciliations FOR INSERT
  WITH CHECK (can_modify_data(company_id));

CREATE POLICY bank_reconciliations_update ON bank_reconciliations FOR UPDATE
  USING (can_modify_data(company_id));

CREATE POLICY bank_reconciliations_delete ON bank_reconciliations FOR DELETE
  USING (can_delete_data(company_id));

-- Bank Reconciliation Lines
CREATE OR REPLACE FUNCTION can_access_bank_rec_lines(p_bank_reconciliation_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM bank_reconciliations WHERE id = p_bank_reconciliation_id;
  RETURN is_company_member(v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS bank_reconciliation_lines_access ON bank_reconciliation_lines;
DROP POLICY IF EXISTS bank_reconciliation_lines_insert ON bank_reconciliation_lines;
DROP POLICY IF EXISTS bank_reconciliation_lines_update ON bank_reconciliation_lines;
DROP POLICY IF EXISTS bank_reconciliation_lines_delete ON bank_reconciliation_lines;

CREATE POLICY bank_reconciliation_lines_select ON bank_reconciliation_lines FOR SELECT
  USING (can_access_bank_rec_lines(bank_reconciliation_id));

CREATE POLICY bank_reconciliation_lines_insert ON bank_reconciliation_lines FOR INSERT
  WITH CHECK (can_access_bank_rec_lines(bank_reconciliation_id));

CREATE POLICY bank_reconciliation_lines_update ON bank_reconciliation_lines FOR UPDATE
  USING (can_access_bank_rec_lines(bank_reconciliation_id));

CREATE POLICY bank_reconciliation_lines_delete ON bank_reconciliation_lines FOR DELETE
  USING (can_access_bank_rec_lines(bank_reconciliation_id));

-- =====================================
-- 8. سياسات جداول المساهمين والأرباح (إذا كانت موجودة)
-- =====================================

-- Shareholders
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shareholders' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS shareholders_access ON shareholders;
    DROP POLICY IF EXISTS shareholders_insert ON shareholders;
    DROP POLICY IF EXISTS shareholders_update ON shareholders;
    DROP POLICY IF EXISTS shareholders_delete ON shareholders;

    CREATE POLICY shareholders_select ON shareholders FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY shareholders_insert ON shareholders FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY shareholders_update ON shareholders FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY shareholders_delete ON shareholders FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- Capital Contributions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'capital_contributions' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS capital_contributions_access ON capital_contributions;
    DROP POLICY IF EXISTS capital_contributions_insert ON capital_contributions;
    DROP POLICY IF EXISTS capital_contributions_update ON capital_contributions;
    DROP POLICY IF EXISTS capital_contributions_delete ON capital_contributions;

    CREATE POLICY capital_contributions_select ON capital_contributions FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY capital_contributions_insert ON capital_contributions FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY capital_contributions_update ON capital_contributions FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY capital_contributions_delete ON capital_contributions FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- Profit Distributions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profit_distributions' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS profit_distributions_access ON profit_distributions;
    DROP POLICY IF EXISTS profit_distributions_insert ON profit_distributions;
    DROP POLICY IF EXISTS profit_distributions_update ON profit_distributions;
    DROP POLICY IF EXISTS profit_distributions_delete ON profit_distributions;

    CREATE POLICY profit_distributions_select ON profit_distributions FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY profit_distributions_insert ON profit_distributions FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY profit_distributions_update ON profit_distributions FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY profit_distributions_delete ON profit_distributions FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- =====================================
-- 9. سياسات جداول المبيعات والمرتجعات (إذا كانت موجودة)
-- =====================================

-- Tax Codes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tax_codes' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tax_codes_select ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_insert ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_update ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_delete ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_select_members ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_insert_members ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_update_members ON tax_codes;
    DROP POLICY IF EXISTS tax_codes_delete_members ON tax_codes;

    CREATE POLICY tax_codes_select ON tax_codes FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY tax_codes_insert ON tax_codes FOR INSERT
      WITH CHECK (is_owner_or_admin(company_id));
    CREATE POLICY tax_codes_update ON tax_codes FOR UPDATE
      USING (is_owner_or_admin(company_id));
    CREATE POLICY tax_codes_delete ON tax_codes FOR DELETE
      USING (is_owner_or_admin(company_id));
  END IF;
END $$;

-- Sales Returns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_returns' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS sales_returns_select ON sales_returns;
    DROP POLICY IF EXISTS sales_returns_insert ON sales_returns;
    DROP POLICY IF EXISTS sales_returns_update ON sales_returns;
    DROP POLICY IF EXISTS sales_returns_delete ON sales_returns;

    CREATE POLICY sales_returns_select ON sales_returns FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY sales_returns_insert ON sales_returns FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY sales_returns_update ON sales_returns FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY sales_returns_delete ON sales_returns FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- Customer Credits
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_credits' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS customer_credits_select ON customer_credits;
    DROP POLICY IF EXISTS customer_credits_insert ON customer_credits;
    DROP POLICY IF EXISTS customer_credits_update ON customer_credits;
    DROP POLICY IF EXISTS customer_credits_delete ON customer_credits;

    CREATE POLICY customer_credits_select ON customer_credits FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY customer_credits_insert ON customer_credits FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY customer_credits_update ON customer_credits FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY customer_credits_delete ON customer_credits FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- =====================================
-- 10. سياسات جداول الموارد البشرية (إذا كانت موجودة)
-- =====================================

-- Employees
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees' AND table_schema = 'public') THEN
    ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS employees_select ON employees;
    DROP POLICY IF EXISTS employees_insert ON employees;
    DROP POLICY IF EXISTS employees_update ON employees;
    DROP POLICY IF EXISTS employees_delete ON employees;

    CREATE POLICY employees_select ON employees FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY employees_insert ON employees FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY employees_update ON employees FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY employees_delete ON employees FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- Attendance Records
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance_records' AND table_schema = 'public') THEN
    ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS attendance_records_select ON attendance_records;
    DROP POLICY IF EXISTS attendance_records_insert ON attendance_records;
    DROP POLICY IF EXISTS attendance_records_update ON attendance_records;
    DROP POLICY IF EXISTS attendance_records_delete ON attendance_records;

    CREATE POLICY attendance_records_select ON attendance_records FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY attendance_records_insert ON attendance_records FOR INSERT
      WITH CHECK (can_modify_data(company_id));
    CREATE POLICY attendance_records_update ON attendance_records FOR UPDATE
      USING (can_modify_data(company_id));
    CREATE POLICY attendance_records_delete ON attendance_records FOR DELETE
      USING (can_delete_data(company_id));
  END IF;
END $$;

-- Payroll Runs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_runs' AND table_schema = 'public') THEN
    ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS payroll_runs_select ON payroll_runs;
    DROP POLICY IF EXISTS payroll_runs_insert ON payroll_runs;
    DROP POLICY IF EXISTS payroll_runs_update ON payroll_runs;
    DROP POLICY IF EXISTS payroll_runs_delete ON payroll_runs;

    CREATE POLICY payroll_runs_select ON payroll_runs FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY payroll_runs_insert ON payroll_runs FOR INSERT
      WITH CHECK (is_owner_or_admin(company_id));
    CREATE POLICY payroll_runs_update ON payroll_runs FOR UPDATE
      USING (is_owner_or_admin(company_id));
    CREATE POLICY payroll_runs_delete ON payroll_runs FOR DELETE
      USING (is_owner_or_admin(company_id));
  END IF;
END $$;

-- Payslips
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payslips' AND table_schema = 'public') THEN
    ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS payslips_select ON payslips;
    DROP POLICY IF EXISTS payslips_insert ON payslips;
    DROP POLICY IF EXISTS payslips_update ON payslips;
    DROP POLICY IF EXISTS payslips_delete ON payslips;

    CREATE POLICY payslips_select ON payslips FOR SELECT
      USING (is_company_member(company_id));
    CREATE POLICY payslips_insert ON payslips FOR INSERT
      WITH CHECK (is_owner_or_admin(company_id));
    CREATE POLICY payslips_update ON payslips FOR UPDATE
      USING (is_owner_or_admin(company_id));
    CREATE POLICY payslips_delete ON payslips FOR DELETE
      USING (is_owner_or_admin(company_id));
  END IF;
END $$;

-- =====================================
-- 11. منح الصلاحيات للدوال
-- =====================================
GRANT EXECUTE ON FUNCTION check_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION is_company_member TO authenticated;
GRANT EXECUTE ON FUNCTION is_owner_or_admin TO authenticated;
GRANT EXECUTE ON FUNCTION can_modify_data TO authenticated;
GRANT EXECUTE ON FUNCTION can_delete_data TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_invoice_items TO authenticated;
GRANT EXECUTE ON FUNCTION can_modify_invoice_items TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_bill_items TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_journal_lines TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_po_items TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_vc_items TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_bank_rec_lines TO authenticated;

-- =====================================
-- ✅ تم إنشاء سياسات RLS الشاملة بنجاح
-- =====================================
--
-- الأدوار المدعومة:
-- 1. owner - المالك (صلاحيات كاملة)
-- 2. admin - المدير (صلاحيات كاملة ما عدا حذف الشركة)
-- 3. manager - مدير (قراءة/إضافة/تعديل/حذف محدود)
-- 4. accountant - محاسب (قراءة/إضافة/تعديل)
-- 5. staff - موظف (قراءة/إضافة/تعديل محدود)
-- 6. viewer - عارض (قراءة فقط)
--
-- الجداول المغطاة:
-- - companies, company_members
-- - chart_of_accounts, customers, suppliers, products
-- - invoices, invoice_items, bills, bill_items
-- - payments, journal_entries, journal_entry_lines
-- - purchase_orders, purchase_order_items
-- - vendor_credits, vendor_credit_items, vendor_credit_applications
-- - inventory_transactions, account_balances
-- - bank_reconciliations, bank_reconciliation_lines
-- - shareholders, capital_contributions, profit_distributions
-- - tax_codes, sales_returns, customer_credits
-- - employees, attendance_records, payroll_runs, payslips
-- =============================================

