-- ==============================================================================
-- Add 2150 (Dividends Payable) to default chart of accounts and existing companies
-- ==============================================================================

-- 1. Update the seed_default_chart_of_accounts function to include 2150
CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(p_company_id uuid, p_lang text DEFAULT 'ar'::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_existing INTEGER;
  v_ids JSONB := '{}'::JSONB;
  v_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_existing FROM chart_of_accounts WHERE company_id = p_company_id;
  IF v_existing > 0 THEN RETURN 0; END IF;

  -- ASSETS (1000)
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
  VALUES (p_company_id, '1000', CASE WHEN p_lang='en' THEN 'Assets' ELSE 'الأصول' END, 'asset', 'debit', 1)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('1000', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
  VALUES (p_company_id, '1100', CASE WHEN p_lang='en' THEN 'Current Assets' ELSE 'الأصول المتداولة' END, 'asset', 'debit', 2, (v_ids->>'1000')::UUID)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('1100', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type) VALUES
  (p_company_id, '1110', CASE WHEN p_lang='en' THEN 'Cash on Hand' ELSE 'الصندوق' END, 'asset', 'debit', 3, (v_ids->>'1100')::UUID, 'cash'),
  (p_company_id, '1120', CASE WHEN p_lang='en' THEN 'Bank Account' ELSE 'البنك' END, 'asset', 'debit', 3, (v_ids->>'1100')::UUID, 'bank'),
  (p_company_id, '1130', CASE WHEN p_lang='en' THEN 'Accounts Receivable' ELSE 'العملاء' END, 'asset', 'debit', 3, (v_ids->>'1100')::UUID, 'accounts_receivable'),
  (p_company_id, '1140', CASE WHEN p_lang='en' THEN 'Inventory' ELSE 'المخزون' END, 'asset', 'debit', 3, (v_ids->>'1100')::UUID, 'inventory'),
  (p_company_id, '1150', CASE WHEN p_lang='en' THEN 'Prepaid Expenses' ELSE 'مصروفات مدفوعة مقدماً' END, 'asset', 'debit', 3, (v_ids->>'1100')::UUID, 'prepaid_expense');
  v_count := v_count + 5;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
  VALUES (p_company_id, '1200', CASE WHEN p_lang='en' THEN 'Fixed Assets' ELSE 'الأصول الثابتة' END, 'asset', 'debit', 2, (v_ids->>'1000')::UUID)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('1200', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type) VALUES
  (p_company_id, '1210', CASE WHEN p_lang='en' THEN 'Buildings' ELSE 'المباني' END, 'asset', 'debit', 3, (v_ids->>'1200')::UUID, 'fixed_assets'),
  (p_company_id, '1220', CASE WHEN p_lang='en' THEN 'Equipment' ELSE 'المعدات' END, 'asset', 'debit', 3, (v_ids->>'1200')::UUID, 'fixed_assets'),
  (p_company_id, '1230', CASE WHEN p_lang='en' THEN 'Vehicles' ELSE 'السيارات' END, 'asset', 'debit', 3, (v_ids->>'1200')::UUID, 'fixed_assets'),
  (p_company_id, '1250', CASE WHEN p_lang='en' THEN 'Accumulated Depreciation' ELSE 'مجمع الإهلاك' END, 'asset', 'credit', 3, (v_ids->>'1200')::UUID, 'fixed_assets');
  v_count := v_count + 4;

  -- LIABILITIES (2000)
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
  VALUES (p_company_id, '2000', CASE WHEN p_lang='en' THEN 'Liabilities' ELSE 'الالتزامات' END, 'liability', 'credit', 1)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('2000', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
  VALUES (p_company_id, '2100', CASE WHEN p_lang='en' THEN 'Current Liabilities' ELSE 'الالتزامات المتداولة' END, 'liability', 'credit', 2, (v_ids->>'2000')::UUID)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('2100', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type) VALUES
  (p_company_id, '2110', CASE WHEN p_lang='en' THEN 'Accounts Payable' ELSE 'الموردين' END, 'liability', 'credit', 3, (v_ids->>'2100')::UUID, 'accounts_payable'),
  (p_company_id, '2120', CASE WHEN p_lang='en' THEN 'VAT Output' ELSE 'ضريبة القيمة المضافة - مخرجات' END, 'liability', 'credit', 3, (v_ids->>'2100')::UUID, 'vat_output'),
  (p_company_id, '2130', CASE WHEN p_lang='en' THEN 'Accrued Salaries' ELSE 'الرواتب المستحقة' END, 'liability', 'credit', 3, (v_ids->>'2100')::UUID, NULL),
  (p_company_id, '2150', CASE WHEN p_lang='en' THEN 'Dividends Payable' ELSE 'الأرباح الموزعة المستحقة' END, 'liability', 'credit', 3, (v_ids->>'2100')::UUID, 'dividends_payable'); -- NEW ACCOUNT INSERTED HERE
  v_count := v_count + 4;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
  VALUES (p_company_id, '2200', CASE WHEN p_lang='en' THEN 'Long-term Liabilities' ELSE 'الالتزامات طويلة الأجل' END, 'liability', 'credit', 2, (v_ids->>'2000')::UUID)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('2200', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
  VALUES (p_company_id, '2210', CASE WHEN p_lang='en' THEN 'Long-term Loans' ELSE 'القروض طويلة الأجل' END, 'liability', 'credit', 3, (v_ids->>'2200')::UUID);
  v_count := v_count + 1;

  -- EQUITY (3000)
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
  VALUES (p_company_id, '3000', CASE WHEN p_lang='en' THEN 'Equity' ELSE 'حقوق الملكية' END, 'equity', 'credit', 1)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('3000', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type) VALUES
  (p_company_id, '3100', CASE WHEN p_lang='en' THEN 'Capital' ELSE 'رأس المال' END, 'equity', 'credit', 2, (v_ids->>'3000')::UUID, 'capital'),
  (p_company_id, '3200', CASE WHEN p_lang='en' THEN 'Retained Earnings' ELSE 'الأرباح المحتجزة' END, 'equity', 'credit', 2, (v_ids->>'3000')::UUID, 'retained_earnings'),
  (p_company_id, '3300', CASE WHEN p_lang='en' THEN 'Current Year Profit/Loss' ELSE 'أرباح/خسائر السنة' END, 'equity', 'credit', 2, (v_ids->>'3000')::UUID, NULL);
  v_count := v_count + 3;

  -- INCOME (4000)
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
  VALUES (p_company_id, '4000', CASE WHEN p_lang='en' THEN 'Income' ELSE 'الإيرادات' END, 'income', 'credit', 1)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('4000', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type) VALUES
  (p_company_id, '4100', CASE WHEN p_lang='en' THEN 'Sales Revenue' ELSE 'إيرادات المبيعات' END, 'income', 'credit', 2, (v_ids->>'4000')::UUID, 'sales_revenue'),
  (p_company_id, '4200', CASE WHEN p_lang='en' THEN 'Service Revenue' ELSE 'إيرادات الخدمات' END, 'income', 'credit', 2, (v_ids->>'4000')::UUID, NULL),
  (p_company_id, '4300', CASE WHEN p_lang='en' THEN 'Other Income' ELSE 'إيرادات أخرى' END, 'income', 'credit', 2, (v_ids->>'4000')::UUID, NULL);
  v_count := v_count + 3;

  -- EXPENSES (5000)
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level)
  VALUES (p_company_id, '5000', CASE WHEN p_lang='en' THEN 'Expenses' ELSE 'المصروفات' END, 'expense', 'debit', 1)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('5000', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type)
  VALUES (p_company_id, '5100', CASE WHEN p_lang='en' THEN 'Cost of Goods Sold' ELSE 'تكلفة البضائع المباعة' END, 'expense', 'debit', 2, (v_ids->>'5000')::UUID, 'cogs');
  v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type)
  VALUES (p_company_id, '5200', CASE WHEN p_lang='en' THEN 'Operating Expenses' ELSE 'المصروفات التشغيلية' END, 'expense', 'debit', 2, (v_ids->>'5000')::UUID, 'operating_expenses')
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('5200', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id) VALUES
  (p_company_id, '5210', CASE WHEN p_lang='en' THEN 'Salaries & Wages' ELSE 'الرواتب والأجور' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5220', CASE WHEN p_lang='en' THEN 'Rent Expense' ELSE 'الإيجار' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5230', CASE WHEN p_lang='en' THEN 'Utilities' ELSE 'الكهرباء والمياه' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5240', CASE WHEN p_lang='en' THEN 'Communication' ELSE 'الاتصالات والإنترنت' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5250', CASE WHEN p_lang='en' THEN 'Maintenance' ELSE 'مصاريف الصيانة' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5260', CASE WHEN p_lang='en' THEN 'Marketing' ELSE 'مصاريف التسويق' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5270', CASE WHEN p_lang='en' THEN 'Administrative' ELSE 'مصاريف إدارية' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5280', CASE WHEN p_lang='en' THEN 'Transportation' ELSE 'مصاريف النقل' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID),
  (p_company_id, '5290', CASE WHEN p_lang='en' THEN 'Depreciation' ELSE 'الإهلاك' END, 'expense', 'debit', 3, (v_ids->>'5200')::UUID);
  v_count := v_count + 9;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id)
  VALUES (p_company_id, '5300', CASE WHEN p_lang='en' THEN 'Other Expenses' ELSE 'مصروفات أخرى' END, 'expense', 'debit', 2, (v_ids->>'5000')::UUID)
  RETURNING id INTO v_id; v_ids := v_ids || jsonb_build_object('5300', v_id); v_count := v_count + 1;

  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, level, parent_id) VALUES
  (p_company_id, '5310', CASE WHEN p_lang='en' THEN 'FX Losses' ELSE 'خسائر فروق العملة' END, 'expense', 'debit', 3, (v_ids->>'5300')::UUID),
  (p_company_id, '5320', CASE WHEN p_lang='en' THEN 'Bank Charges' ELSE 'مصاريف البنك' END, 'expense', 'debit', 3, (v_ids->>'5300')::UUID);
  v_count := v_count + 2;

  RETURN v_count;
END;
$function$;

-- 2. Insert 2150 into existing companies missing it (e.g. Test company)
DO $$
DECLARE
    r RECORD;
    v_parent_id UUID;
BEGIN
    FOR r IN SELECT id FROM companies LOOP
        -- Check if 2150 exists in this company
        IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = r.id AND account_code = '2150') THEN
            
            -- Find the parent account 2100 (Current Liabilities)
            SELECT id INTO v_parent_id 
            FROM chart_of_accounts 
            WHERE company_id = r.id AND account_code = '2100';
            
            IF v_parent_id IS NOT NULL THEN
                INSERT INTO chart_of_accounts (
                    company_id, account_code, account_name, account_type, normal_balance, level, parent_id, sub_type
                ) VALUES (
                    r.id, '2150', 'الأرباح الموزعة المستحقة', 'liability', 'credit', 3, v_parent_id, 'dividends_payable'
                );
            END IF;
            
        END IF;
    END LOOP;
END $$;
