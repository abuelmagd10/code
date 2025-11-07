-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  tax_id TEXT,
  currency TEXT DEFAULT 'USD',
  fiscal_year_start INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create chart of accounts (الشجرة المحاسبية)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL, -- Asset, Liability, Equity, Income, Expense
  description TEXT,
  opening_balance DECIMAL(15, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, account_code)
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  tax_id TEXT,
  credit_limit DECIMAL(15, 2) DEFAULT 0,
  payment_terms TEXT DEFAULT 'Net 30',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  tax_id TEXT,
  payment_terms TEXT DEFAULT 'Net 30',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit_price DECIMAL(15, 2) NOT NULL,
  cost_price DECIMAL(15, 2),
  unit TEXT DEFAULT 'piece',
  quantity_on_hand INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, sku)
);

-- Create inventory transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  transaction_type TEXT NOT NULL, -- purchase, sale, adjustment
  quantity_change INTEGER NOT NULL,
  reference_id UUID, -- links to invoice or purchase order
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create invoices table (sales invoices)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  -- Advanced fields for Zoho-like functionality
  discount_type TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent','amount')),
  discount_value DECIMAL(15, 2) DEFAULT 0,
  discount_position TEXT DEFAULT 'before_tax' CHECK (discount_position IN ('before_tax','after_tax')),
  tax_inclusive BOOLEAN DEFAULT FALSE,
  shipping DECIMAL(15, 2) DEFAULT 0,
  shipping_tax_rate DECIMAL(5, 2) DEFAULT 0,
  adjustment DECIMAL(15, 2) DEFAULT 0,
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, partially_paid, paid, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, invoice_number)
);

-- Create invoice items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create bills table (purchase bills)
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  bill_number TEXT NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE,
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  discount_type TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent','amount')),
  discount_value DECIMAL(15, 2) DEFAULT 0,
  discount_position TEXT DEFAULT 'before_tax' CHECK (discount_position IN ('before_tax','after_tax')),
  tax_inclusive BOOLEAN DEFAULT FALSE,
  shipping DECIMAL(15, 2) DEFAULT 0,
  shipping_tax_rate DECIMAL(5, 2) DEFAULT 0,
  adjustment DECIMAL(15, 2) DEFAULT 0,
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, partially_paid, paid, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, bill_number)
);

-- Create bill items table
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create vendor credits table (إشعار دائن للمورد)
CREATE TABLE IF NOT EXISTS vendor_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  credit_number TEXT NOT NULL,
  credit_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  discount_type TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent','amount')),
  discount_value DECIMAL(15, 2) DEFAULT 0,
  discount_position TEXT DEFAULT 'before_tax' CHECK (discount_position IN ('before_tax','after_tax')),
  tax_inclusive BOOLEAN DEFAULT FALSE,
  shipping DECIMAL(15, 2) DEFAULT 0,
  shipping_tax_rate DECIMAL(5, 2) DEFAULT 0,
  adjustment DECIMAL(15, 2) DEFAULT 0,
  applied_amount DECIMAL(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'open', -- open, partially_applied, applied, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, credit_number)
);

-- Create vendor credit items table
CREATE TABLE IF NOT EXISTS vendor_credit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_credit_id UUID NOT NULL REFERENCES vendor_credits(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  account_id UUID REFERENCES chart_of_accounts(id),
  line_total DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create vendor credit applications table (ربط الإشعار بفاتورة مورد)
CREATE TABLE IF NOT EXISTS vendor_credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_credit_id UUID NOT NULL REFERENCES vendor_credits(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_applied DECIMAL(15, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create purchase orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  po_number TEXT NOT NULL,
  po_date DATE NOT NULL,
  due_date DATE,
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  received_amount DECIMAL(15, 2) DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, received_partial, received, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, po_number)
);

-- Create purchase order items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create journal entries table (قيود اليومية)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL, -- invoice, purchase_order, manual_entry
  reference_id UUID,
  entry_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create journal entry lines table
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit_amount DECIMAL(15, 2) DEFAULT 0,
  credit_amount DECIMAL(15, 2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID,
  supplier_id UUID,
  bill_id UUID,
  invoice_id UUID,
  purchase_order_id UUID,
  payment_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  payment_method TEXT, -- cash, check, bank_transfer, credit_card
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create account balances table (for faster reporting)
CREATE TABLE IF NOT EXISTS account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  balance_date DATE NOT NULL,
  debit_balance DECIMAL(15, 2) DEFAULT 0,
  credit_balance DECIMAL(15, 2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, account_id, balance_date)
);

-- Enable Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_credit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_credit_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX idx_companies_user_id ON companies(user_id);
CREATE INDEX idx_chart_accounts_company ON chart_of_accounts(company_id);
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_bills_company ON bills(company_id);
CREATE INDEX idx_bills_supplier ON bills(supplier_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_vendor_credits_company ON vendor_credits(company_id);
CREATE INDEX idx_vendor_credits_supplier ON vendor_credits(supplier_id);
CREATE INDEX idx_vendor_credit_applications_company ON vendor_credit_applications(company_id);
CREATE INDEX idx_vendor_credit_applications_vendor_credit ON vendor_credit_applications(vendor_credit_id);
CREATE INDEX idx_vendor_credit_applications_bill ON vendor_credit_applications(bill_id);
CREATE INDEX idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_journal_entries_company ON journal_entries(company_id);
CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX idx_payments_company ON payments(company_id);

-- =============================================
-- Bank Reconciliation Tables
-- =============================================
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  statement_date DATE NOT NULL,
  statement_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  cleared_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
  difference DECIMAL(15, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bank_reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
  journal_entry_line_id UUID NOT NULL REFERENCES journal_entry_lines(id) ON DELETE RESTRICT,
  cleared BOOLEAN NOT NULL DEFAULT TRUE,
  cleared_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for reconciliation tables
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_lines ENABLE ROW LEVEL SECURITY;

-- Indexes for reconciliation tables
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_company ON bank_reconciliations(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_account ON bank_reconciliations(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_date ON bank_reconciliations(statement_date);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_lines_rec ON bank_reconciliation_lines(bank_reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_lines_line ON bank_reconciliation_lines(journal_entry_line_id);
