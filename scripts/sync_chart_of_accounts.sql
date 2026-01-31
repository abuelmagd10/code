-- =====================================
-- Safe Chart of Accounts Synchronization
-- توحيد الشجرة المحاسبية بأمان لجميع الشركات
-- =====================================

-- إنشاء جدول template للشجرة المحاسبية الافتراضية
CREATE TABLE IF NOT EXISTS chart_of_accounts_template (
    account_code TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    account_name_en TEXT,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    sub_type TEXT,
    parent_code TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- إدراج الشجرة المحاسبية الافتراضية في الجدول المرجعي
INSERT INTO chart_of_accounts_template (
    account_code, account_name, account_name_en, account_type, normal_balance, sub_type, parent_code, level
) VALUES
    -- الأصول
    ('1000', 'الأصول', 'Assets', 'asset', 'debit', NULL, NULL, 1),
    ('1100', 'الأصول المتداولة', 'Current Assets', 'asset', 'debit', NULL, '1000', 2),
    ('1110', 'الصندوق', 'Cash on Hand', 'asset', 'debit', 'cash', '1100', 3),
    ('1120', 'البنك', 'Bank Account', 'asset', 'debit', 'bank', '1100', 3),
    ('1130', 'العملاء', 'Accounts Receivable', 'asset', 'debit', 'accounts_receivable', '1100', 3),
    ('1140', 'المخزون', 'Inventory', 'asset', 'debit', 'inventory', '1100', 3),
    ('1150', 'مصروفات مدفوعة مقدماً', 'Prepaid Expenses', 'asset', 'debit', 'prepaid_expense', '1100', 3),
    ('1160', 'ضريبة القيمة المضافة - مدخلات', 'VAT Input', 'asset', 'debit', 'vat_input', '1100', 3),

    -- الأصول الثابتة
    ('1200', 'الأصول الثابتة', 'Fixed Assets', 'asset', 'debit', NULL, '1000', 2),
    ('1210', 'المباني', 'Buildings', 'asset', 'debit', 'fixed_assets', '1200', 3),
    ('1220', 'الأثاث والتجهيزات', 'Furniture & Fixtures', 'asset', 'debit', 'fixed_assets', '1200', 3),
    ('1230', 'المعدات', 'Equipment', 'asset', 'debit', 'fixed_assets', '1200', 3),
    ('1240', 'السيارات', 'Vehicles', 'asset', 'debit', 'fixed_assets', '1200', 3),
    ('1250', 'الأجهزة الإلكترونية', 'IT Equipment', 'asset', 'debit', 'fixed_assets', '1200', 3),
    ('1260', 'الأراضي', 'Land', 'asset', 'debit', 'fixed_assets', '1200', 3),
    ('1270', 'مجمع الإهلاك', 'Accumulated Depreciation', 'asset', 'credit', 'accumulated_depreciation', '1200', 3),

    -- الالتزامات
    ('2000', 'الالتزامات', 'Liabilities', 'liability', 'credit', NULL, NULL, 1),
    ('2100', 'الالتزامات المتداولة', 'Current Liabilities', 'liability', 'credit', NULL, '2000', 2),
    ('2110', 'الموردين', 'Accounts Payable', 'liability', 'credit', 'accounts_payable', '2100', 3),
    ('2120', 'ضريبة القيمة المضافة - مخرجات', 'VAT Output', 'liability', 'credit', 'vat_output', '2100', 3),
    ('2130', 'الرواتب المستحقة', 'Accrued Salaries', 'liability', 'credit', NULL, '2100', 3),
    ('2140', 'إيرادات مقدمة', 'Unearned Revenue', 'liability', 'credit', NULL, '2100', 3),
    ('2155', 'رصيد العملاء الدائن', 'Customer Credit Balance', 'liability', 'credit', 'customer_credit', '2100', 3),
    ('2200', 'الالتزامات طويلة الأجل', 'Long-term Liabilities', 'liability', 'credit', NULL, '2000', 2),
    ('2210', 'القروض طويلة الأجل', 'Long-term Loans', 'liability', 'credit', NULL, '2200', 3),

    -- حقوق الملكية
    ('3000', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, NULL, 1),
    ('3100', 'رأس المال', 'Capital', 'equity', 'credit', 'capital', '3000', 2),
    ('3200', 'الأرباح المحتجزة', 'Retained Earnings', 'equity', 'credit', 'retained_earnings', '3000', 2),
    ('3300', 'أرباح/خسائر السنة', 'Current Year Profit/Loss', 'equity', 'credit', NULL, '3000', 2),

    -- الإيرادات
    ('4000', 'الإيرادات', 'Income', 'income', 'credit', NULL, NULL, 1),
    ('4100', 'إيرادات المبيعات', 'Sales Revenue', 'income', 'credit', 'sales_revenue', '4000', 2),
    ('4200', 'إيرادات الخدمات', 'Service Revenue', 'income', 'credit', NULL, '4000', 2),
    ('4300', 'إيرادات أخرى', 'Other Income', 'income', 'credit', NULL, '4000', 2),
    ('4400', 'أرباح فروق العملة', 'FX Gains', 'income', 'credit', NULL, '4000', 2),

    -- المصروفات
    ('5000', 'المصروفات', 'Expenses', 'expense', 'debit', NULL, NULL, 1),
    ('5100', 'تكلفة البضائع المباعة', 'Cost of Goods Sold', 'expense', 'debit', 'cogs', '5000', 2),
    ('5200', 'المصروفات التشغيلية', 'Operating Expenses', 'expense', 'debit', 'operating_expenses', '5000', 2),
    ('5210', 'الرواتب والأجور', 'Salaries & Wages', 'expense', 'debit', NULL, '5200', 3),
    ('5220', 'الإيجار', 'Rent Expense', 'expense', 'debit', NULL, '5200', 3),
    ('5230', 'الكهرباء والمياه', 'Utilities', 'expense', 'debit', NULL, '5200', 3),
    ('5240', 'الاتصالات والإنترنت', 'Communication', 'expense', 'debit', NULL, '5200', 3),
    ('5250', 'مصاريف الصيانة', 'Maintenance', 'expense', 'debit', NULL, '5200', 3),
    ('5260', 'مصاريف التسويق', 'Marketing', 'expense', 'debit', NULL, '5200', 3),
    ('5270', 'مصاريف إدارية', 'Administrative', 'expense', 'debit', NULL, '5200', 3),
    ('5280', 'مصاريف النقل', 'Transportation', 'expense', 'debit', NULL, '5200', 3),
    ('5290', 'مصروف إهلاك الأصول الثابتة', 'Fixed Assets Depreciation Expense', 'expense', 'debit', 'depreciation_expense', '5200', 3),
    ('5300', 'مصروفات أخرى', 'Other Expenses', 'expense', 'debit', NULL, '5000', 2),
    ('5310', 'خسائر فروق العملة', 'FX Losses', 'expense', 'debit', NULL, '5300', 3),
    ('5320', 'مصاريف البنك', 'Bank Charges', 'expense', 'debit', NULL, '5300', 3)
ON CONFLICT (account_code) DO NOTHING;

-- دالة آمنة لتوحيد الشجرة المحاسبية لشركة واحدة
CREATE OR REPLACE FUNCTION sync_company_chart_of_accounts(p_company_id UUID)
RETURNS JSON AS $$
DECLARE
    v_template_record RECORD;
    v_existing_account RECORD;
    v_parent_id UUID;
    v_new_account_id UUID;
    v_changes_count INTEGER := 0;
    v_accounts_added INTEGER := 0;
    v_accounts_linked INTEGER := 0;
    v_accounts_updated INTEGER := 0;
    v_has_journal_entries BOOLEAN := FALSE;
    v_result JSON;
BEGIN
    -- Loop through template accounts
    FOR v_template_record IN SELECT * FROM chart_of_accounts_template ORDER BY level, account_code LOOP

        -- التحقق من وجود الحساب
        SELECT * INTO v_existing_account
        FROM chart_of_accounts
        WHERE company_id = p_company_id AND account_code = v_template_record.account_code;

        IF v_existing_account IS NULL THEN
            -- الحساب غير موجود - إضافته

            -- البحث عن parent_id إذا كان مطلوباً
            IF v_template_record.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id
                FROM chart_of_accounts
                WHERE company_id = p_company_id AND account_code = v_template_record.parent_code;

                -- إذا لم يوجد parent، نبحث عن أي حساب مناسب
                IF v_parent_id IS NULL THEN
                    SELECT id INTO v_parent_id
                    FROM chart_of_accounts
                    WHERE company_id = p_company_id
                      AND account_type = v_template_record.account_type
                      AND level = v_template_record.level - 1
                      AND account_code LIKE substring(v_template_record.account_code, 1, length(v_template_record.account_code) - 1) || '%'
                    LIMIT 1;
                END IF;
            END IF;

            -- إدراج الحساب الجديد
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, normal_balance,
                sub_type, parent_id, level, is_active
            ) VALUES (
                p_company_id,
                v_template_record.account_code,
                v_template_record.account_name,
                v_template_record.account_type,
                v_template_record.normal_balance,
                v_template_record.sub_type,
                v_parent_id,
                v_template_record.level,
                true
            ) RETURNING id INTO v_new_account_id;

            v_accounts_added := v_accounts_added + 1;
            v_changes_count := v_changes_count + 1;

            -- تسجيل في audit_logs (مع قيم مقبولة)
            INSERT INTO audit_logs (
                company_id, action, target_table, record_id, old_data, new_data, reason
            ) VALUES (
                p_company_id,
                'INSERT',
                'chart_of_accounts',
                v_new_account_id,
                NULL,
                json_build_object(
                    'account_code', v_template_record.account_code,
                    'account_name', v_template_record.account_name,
                    'account_type', v_template_record.account_type
                ),
                'Chart of accounts sync: added missing account from template'
            );

        ELSE
            -- الحساب موجود - التحقق من الربط والتصنيف والاسم

            -- التحقق من وجود قيود محاسبية
            SELECT EXISTS(
                SELECT 1 FROM journal_entry_lines
                WHERE account_id = v_existing_account.id
                LIMIT 1
            ) INTO v_has_journal_entries;

            -- تحديث الاسم إذا لم يكن هناك قيود محاسبية وكان الاسم مختلف
            IF NOT v_has_journal_entries AND v_existing_account.account_name != v_template_record.account_name THEN
                UPDATE chart_of_accounts
                SET account_name = v_template_record.account_name,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_existing_account.id;

                v_accounts_updated := v_accounts_updated + 1;
                v_changes_count := v_changes_count + 1;

                -- تسجيل في audit_logs
                INSERT INTO audit_logs (
                    company_id, action, target_table, record_id, old_data, new_data, reason
                ) VALUES (
                    p_company_id,
                    'UPDATE',
                    'chart_of_accounts',
                    v_existing_account.id,
                    json_build_object('account_name', v_existing_account.account_name),
                    json_build_object('account_name', v_template_record.account_name),
                    'Chart of accounts sync: updated account name (no journal entries)'
                );
            END IF;

            -- البحث عن parent_id الصحيح
            v_parent_id := NULL;
            IF v_template_record.parent_code IS NOT NULL THEN
                SELECT id INTO v_parent_id
                FROM chart_of_accounts
                WHERE company_id = p_company_id AND account_code = v_template_record.parent_code;
            END IF;

            -- تحديث parent_id إذا كان فارغاً أو خاطئاً
            IF (v_existing_account.parent_id IS NULL OR v_existing_account.parent_id != v_parent_id) AND v_parent_id IS NOT NULL THEN
                UPDATE chart_of_accounts
                SET parent_id = v_parent_id,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_existing_account.id;

                v_accounts_linked := v_accounts_linked + 1;
                v_changes_count := v_changes_count + 1;

                -- تسجيل في audit_logs
                INSERT INTO audit_logs (
                    company_id, action, target_table, record_id, old_data, new_data, reason
                ) VALUES (
                    p_company_id,
                    'UPDATE',
                    'chart_of_accounts',
                    v_existing_account.id,
                    json_build_object('parent_id', v_existing_account.parent_id),
                    json_build_object('parent_id', v_parent_id),
                    'Chart of accounts sync: linked to correct parent'
                );
            END IF;

            -- تحديث sub_type إذا كان فارغاً ومطلوب
            IF v_existing_account.sub_type IS NULL AND v_template_record.sub_type IS NOT NULL THEN
                UPDATE chart_of_accounts
                SET sub_type = v_template_record.sub_type,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_existing_account.id;

                v_changes_count := v_changes_count + 1;

                -- تسجيل في audit_logs
                INSERT INTO audit_logs (
                    company_id, action, target_table, record_id, old_data, new_data, reason
                ) VALUES (
                    p_company_id,
                    'UPDATE',
                    'chart_of_accounts',
                    v_existing_account.id,
                    json_build_object('sub_type', v_existing_account.sub_type),
                    json_build_object('sub_type', v_template_record.sub_type),
                    'Chart of accounts sync: updated sub_type'
                );
            END IF;
        END IF;
    END LOOP;

    -- إرجاع تقرير العملية
    v_result := json_build_object(
        'success', true,
        'company_id', p_company_id,
        'total_changes', v_changes_count,
        'accounts_added', v_accounts_added,
        'accounts_linked', v_accounts_linked,
        'accounts_updated', v_accounts_updated,
        'message', format('تم توحيد الشجرة المحاسبية: %s تغيير (%s مضاف، %s مربوط، %s محدث)',
                         v_changes_count, v_accounts_added, v_accounts_linked, v_accounts_updated)
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    -- في حالة الخطأ، نعيد JSON مع تفاصيل الخطأ
    RETURN json_build_object(
        'success', false,
        'company_id', p_company_id,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql;

-- دالة لتوحيد جميع الشركات
CREATE OR REPLACE FUNCTION sync_all_companies_chart_of_accounts()
RETURNS JSON AS $$
DECLARE
    v_company_record RECORD;
    v_result JSON;
    v_results JSON[] := ARRAY[]::JSON[];
    v_total_changes INTEGER := 0;
    v_total_added INTEGER := 0;
    v_total_linked INTEGER := 0;
    v_success_count INTEGER := 0;
    v_error_count INTEGER := 0;
BEGIN
    -- Loop through all companies
    FOR v_company_record IN SELECT id, name FROM companies ORDER BY name LOOP
        RAISE NOTICE 'Syncing chart of accounts for company: %', v_company_record.name;

        -- تنفيذ التوحيد للشركة
        v_result := sync_company_chart_of_accounts(v_company_record.id);

        -- تجميع النتائج
        v_results := array_append(v_results, json_build_object(
            'company_id', v_company_record.id,
            'company_name', v_company_record.name,
            'result', v_result
        ));

        -- تحديث المجاميع
        IF (v_result->>'success')::BOOLEAN = true THEN
            v_success_count := v_success_count + 1;
            v_total_changes := v_total_changes + (v_result->>'total_changes')::INTEGER;
            v_total_added := v_total_added + (v_result->>'accounts_added')::INTEGER;
            v_total_linked := v_total_linked + (v_result->>'accounts_linked')::INTEGER;
        ELSE
            v_error_count := v_error_count + 1;
        END IF;
    END LOOP;

    -- إرجاع التقرير النهائي
    RETURN json_build_object(
        'success', true,
        'total_companies', array_length(v_results, 1),
        'successful_syncs', v_success_count,
        'failed_syncs', v_error_count,
        'total_changes', v_total_changes,
        'total_accounts_added', v_total_added,
        'total_accounts_linked', v_total_linked,
        'company_results', v_results,
        'message', format('تم توحيد %s شركة: %s ناجحة، %s فاشلة، %s تغيير إجمالي',
                         array_length(v_results, 1), v_success_count, v_error_count, v_total_changes)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- تنفيذ التوحيد (تشغيل آمن)
-- =====================================

-- تنفيذ التوحيد لجميع الشركات
-- SELECT sync_all_companies_chart_of_accounts();

-- أو تنفيذ لشركة واحدة للاختبار
-- SELECT sync_company_chart_of_accounts('company-uuid-here');

-- =====================================
-- التحقق من النتائج
-- =====================================

-- عدد الحسابات لكل شركة
-- SELECT company_id, COUNT(*) as account_count
-- FROM chart_of_accounts
-- GROUP BY company_id
-- ORDER BY account_count DESC;

-- الحسابات المضافة حديثاً
-- SELECT company_id, account_code, account_name, created_at
-- FROM chart_of_accounts
-- WHERE created_at > '2024-12-19 00:00:00'
-- ORDER BY company_id, account_code;