-- =============================================
-- Advance Applications: linking customer/supplier advances to AR/AP documents
-- =============================================

CREATE TABLE IF NOT EXISTS advance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id uuid NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NULL REFERENCES invoices(id) ON DELETE SET NULL,
  bill_id uuid NULL REFERENCES bills(id) ON DELETE SET NULL,
  amount_applied numeric(12,2) NOT NULL CHECK (amount_applied > 0),
  applied_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adv_apps_company ON advance_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_adv_apps_customer ON advance_applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_adv_apps_supplier ON advance_applications(supplier_id);
CREATE INDEX IF NOT EXISTS idx_adv_apps_invoice ON advance_applications(invoice_id);
CREATE INDEX IF NOT EXISTS idx_adv_apps_bill ON advance_applications(bill_id);

-- RLS enable and basic policies (owner by company)
ALTER TABLE advance_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adv_apps_select ON advance_applications;
DROP POLICY IF EXISTS adv_apps_insert ON advance_applications;
DROP POLICY IF EXISTS adv_apps_update ON advance_applications;
DROP POLICY IF EXISTS adv_apps_delete ON advance_applications;

CREATE POLICY adv_apps_select ON advance_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = advance_applications.company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY adv_apps_insert ON advance_applications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = advance_applications.company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY adv_apps_update ON advance_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = advance_applications.company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY adv_apps_delete ON advance_applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = advance_applications.company_id AND c.user_id = auth.uid()
    )
  );

