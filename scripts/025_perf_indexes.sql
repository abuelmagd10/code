-- =============================================
-- Performance Indexes for frequent filters
-- =============================================

-- Invoices: company + is_deleted + status/date
CREATE INDEX IF NOT EXISTS idx_invoices_company_is_deleted ON invoices(company_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status_date ON invoices(company_id, status, invoice_date);

-- Bills: company + is_deleted + status/date
CREATE INDEX IF NOT EXISTS idx_bills_company_is_deleted ON bills(company_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_bills_company_status_date ON bills(company_id, status, bill_date);

-- Payments: company + is_deleted + party linkage
CREATE INDEX IF NOT EXISTS idx_payments_company_is_deleted ON payments(company_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_payments_company_customer ON payments(company_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_company_supplier ON payments(company_id, supplier_id) WHERE supplier_id IS NOT NULL;

-- Journal Entries: company + date + is_deleted
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_date_deleted ON journal_entries(company_id, entry_date, is_deleted);

-- Inventory Transactions: company + type + ref + is_deleted
CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_type_ref_del ON inventory_transactions(company_id, transaction_type, reference_id, is_deleted);

-- Account balances: ensure uniqueness index exists already; no change