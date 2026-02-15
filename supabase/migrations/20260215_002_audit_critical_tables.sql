-- =============================================
-- AUDIT LOG - Critical Tables Triggers
-- Date: 2026-02-15
-- Description: Add audit triggers to critical tables
-- =============================================

BEGIN;

-- =============================================
-- 1. Sales Orders (أوامر البيع)
-- =============================================
DROP TRIGGER IF EXISTS audit_sales_orders ON sales_orders;
CREATE TRIGGER audit_sales_orders
  AFTER INSERT OR UPDATE OR DELETE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =============================================
-- 2. Purchase Returns (مردودات المشتريات)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_returns' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_purchase_returns ON purchase_returns;
    CREATE TRIGGER audit_purchase_returns
      AFTER INSERT OR UPDATE OR DELETE ON purchase_returns
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- =============================================
-- 3. Customer Debit Notes (إشعارات مدين العملاء)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_debit_notes' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_customer_debit_notes ON customer_debit_notes;
    CREATE TRIGGER audit_customer_debit_notes
      AFTER INSERT OR UPDATE OR DELETE ON customer_debit_notes
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- =============================================
-- 4. Inventory Write-offs (إهلاك المخزون)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_write_offs' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_inventory_write_offs ON inventory_write_offs;
    CREATE TRIGGER audit_inventory_write_offs
      AFTER INSERT OR UPDATE OR DELETE ON inventory_write_offs
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- =============================================
-- 5. Company Members (أعضاء الفريق)
-- =============================================
DROP TRIGGER IF EXISTS audit_company_members ON company_members;
CREATE TRIGGER audit_company_members
  AFTER INSERT OR UPDATE OR DELETE ON company_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =============================================
-- 6. Company Role Permissions (صلاحيات الأدوار)
-- =============================================
DROP TRIGGER IF EXISTS audit_company_role_permissions ON company_role_permissions;
CREATE TRIGGER audit_company_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON company_role_permissions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =============================================
-- 7. Fixed Assets (الأصول الثابتة)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fixed_assets' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_fixed_assets ON fixed_assets;
    CREATE TRIGGER audit_fixed_assets
      AFTER INSERT OR UPDATE OR DELETE ON fixed_assets
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- =============================================
-- 8. Asset Transactions (حركات الأصول)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asset_transactions' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_asset_transactions ON asset_transactions;
    CREATE TRIGGER audit_asset_transactions
      AFTER INSERT OR UPDATE OR DELETE ON asset_transactions
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- =============================================
-- 9. Accounting Periods (الفترات المحاسبية)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounting_periods' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_accounting_periods ON accounting_periods;
    CREATE TRIGGER audit_accounting_periods
      AFTER INSERT OR UPDATE OR DELETE ON accounting_periods
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

-- =============================================
-- 10. Payroll Runs (كشوف الرواتب)
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_runs' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS audit_payroll_runs ON payroll_runs;
    CREATE TRIGGER audit_payroll_runs
      AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
  END IF;
END $$;

COMMIT;

-- =============================================
-- ✅ تم إضافة Triggers للجداول الحرجة بنجاح
-- =============================================
-- الجداول المضافة:
-- 1. ✅ sales_orders
-- 2. ✅ purchase_returns (conditional)
-- 3. ✅ customer_debit_notes (conditional)
-- 4. ✅ inventory_write_offs (conditional)
-- 5. ✅ company_members
-- 6. ✅ company_role_permissions
-- 7. ✅ fixed_assets (conditional)
-- 8. ✅ asset_transactions (conditional)
-- 9. ✅ accounting_periods (conditional)
-- 10. ✅ payroll_runs (conditional)
-- =============================================
