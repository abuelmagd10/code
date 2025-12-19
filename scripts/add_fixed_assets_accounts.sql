-- إضافة حسابات الأصول الثابتة والإهلاك للشركات الموجودة
-- Add Fixed Assets and Depreciation Accounts for Existing Companies

DO $$
DECLARE
    company_record RECORD;
    parent_asset_id UUID;
    parent_expense_id UUID;
    new_account_id UUID;
BEGIN
    -- Loop through all existing companies
    FOR company_record IN SELECT id, name FROM companies LOOP
        RAISE NOTICE 'Adding fixed assets accounts for company: %', company_record.name;

        -- Get the main Assets account (1000)
        SELECT id INTO parent_asset_id
        FROM chart_of_accounts
        WHERE company_id = company_record.id AND account_code = '1000'
        LIMIT 1;

        -- Get the main Expenses account (5000 or similar)
        SELECT id INTO parent_expense_id
        FROM chart_of_accounts
        WHERE company_id = company_record.id AND account_type = 'expense'
        ORDER BY account_code
        LIMIT 1;

        -- If no expense account found, create one
        IF parent_expense_id IS NULL THEN
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, normal_balance, level
            ) VALUES (
                company_record.id, '5000', 'المصروفات', 'expense', 'debit', 1
            ) RETURNING id INTO parent_expense_id;
        END IF;

        -- Create Fixed Assets section if it doesn't exist
        IF parent_asset_id IS NOT NULL THEN
            -- Fixed Assets parent account
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, normal_balance, parent_id, level
            ) VALUES (
                company_record.id, '1200', 'الأصول الثابتة', 'asset', 'debit', parent_asset_id, 2
            ) ON CONFLICT (company_id, account_code) DO NOTHING;

            -- Individual fixed asset accounts
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, normal_balance, parent_id, level, sub_type
            ) VALUES
                (company_record.id, '1210', 'المباني', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'fixed_assets'),
                (company_record.id, '1220', 'الأثاث والتجهيزات', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'fixed_assets'),
                (company_record.id, '1230', 'المعدات', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'fixed_assets'),
                (company_record.id, '1240', 'السيارات', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'fixed_assets'),
                (company_record.id, '1250', 'الأجهزة الإلكترونية', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'fixed_assets'),
                (company_record.id, '1260', 'الأراضي', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'fixed_assets'),
                (company_record.id, '1270', 'مجمع الإهلاك', 'asset', 'credit', (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '1200'), 3, 'accumulated_depreciation')
            ON CONFLICT (company_id, account_code) DO NOTHING;
        END IF;

        -- Create Operating Expenses section if it doesn't exist
        IF parent_expense_id IS NOT NULL THEN
            -- Operating Expenses parent account
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, normal_balance, parent_id, level, sub_type
            ) VALUES (
                company_record.id, '5200', 'المصروفات التشغيلية', 'expense', 'debit', parent_expense_id, 2, 'operating_expenses'
            ) ON CONFLICT (company_id, account_code) DO NOTHING;

            -- Depreciation Expense account
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, normal_balance, parent_id, level, sub_type
            ) VALUES (
                company_record.id, '5290', 'مصروف إهلاك الأصول الثابتة', 'expense', 'debit',
                (SELECT id FROM chart_of_accounts WHERE company_id = company_record.id AND account_code = '5200'), 3, 'depreciation_expense'
            ) ON CONFLICT (company_id, account_code) DO NOTHING;
        END IF;

        RAISE NOTICE 'Completed adding accounts for company: %', company_record.name;
    END LOOP;

    RAISE NOTICE 'Fixed assets accounts added successfully for all companies';
END $$;