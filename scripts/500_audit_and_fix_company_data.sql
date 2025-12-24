-- ============================================================================
-- سكريبت مراجعة وتصحيح بيانات الشركات
-- Company Data Audit and Fix Script
-- ============================================================================
-- الغرض: مراجعة جميع بيانات الشركات والتحقق من صحة البيانات المحاسبية
-- Purpose: Audit all company data and verify accounting data integrity
-- ============================================================================

-- ============================================================================
-- الجزء 1: عرض جميع الشركات
-- Part 1: Display All Companies
-- ============================================================================

SELECT 
    '========================================' as separator,
    'الشركات المسجلة في النظام' as title,
    'Registered Companies' as title_en,
    '========================================' as separator2;

SELECT 
    id,
    name,
    created_at,
    is_active,
    (SELECT COUNT(*) FROM customers WHERE company_id = companies.id) as total_customers,
    (SELECT COUNT(*) FROM suppliers WHERE company_id = companies.id) as total_suppliers,
    (SELECT COUNT(*) FROM invoices WHERE company_id = companies.id) as total_invoices,
    (SELECT COUNT(*) FROM bills WHERE company_id = companies.id) as total_bills
FROM companies
ORDER BY created_at DESC;

-- ============================================================================
-- الجزء 2: التحقق من وجود حسابات AR/AP لكل شركة
-- Part 2: Check AR/AP Accounts for Each Company
-- ============================================================================

SELECT 
    '========================================' as separator,
    'التحقق من حسابات AR/AP' as title,
    'AR/AP Accounts Check' as title_en,
    '========================================' as separator2;

SELECT 
    c.id as company_id,
    c.name as company_name,
    CASE 
        WHEN ar.id IS NOT NULL THEN '✅ موجود'
        ELSE '❌ غير موجود'
    END as ar_account_status,
    ar.account_name as ar_account_name,
    ar.account_code as ar_account_code,
    CASE 
        WHEN ap.id IS NOT NULL THEN '✅ موجود'
        ELSE '❌ غير موجود'
    END as ap_account_status,
    ap.account_name as ap_account_name,
    ap.account_code as ap_account_code
FROM companies c
LEFT JOIN (
    SELECT id, company_id, account_name, account_code
    FROM chart_of_accounts
    WHERE sub_type = 'accounts_receivable' AND is_active = true
) ar ON ar.company_id = c.id
LEFT JOIN (
    SELECT id, company_id, account_name, account_code
    FROM chart_of_accounts
    WHERE sub_type = 'accounts_payable' AND is_active = true
) ap ON ap.company_id = c.id
ORDER BY c.name;

-- ============================================================================
-- الجزء 3: التحقق من الفواتير بدون قيود محاسبية
-- Part 3: Check Invoices Without Journal Entries
-- ============================================================================

SELECT 
    '========================================' as separator,
    'الفواتير بدون قيود محاسبية' as title,
    'Invoices Without Journal Entries' as title_en,
    '========================================' as separator2;

SELECT 
    c.name as company_name,
    i.invoice_number,
    i.invoice_date,
    i.status,
    i.total_amount,
    i.currency_code,
    CASE 
        WHEN je.id IS NOT NULL THEN '✅ يوجد قيد'
        ELSE '❌ لا يوجد قيد'
    END as journal_entry_status
FROM invoices i
JOIN companies c ON c.id = i.company_id
LEFT JOIN journal_entries je ON je.reference_id = i.id 
    AND je.reference_type = 'invoice' 
    AND je.is_deleted = false
WHERE i.status NOT IN ('draft', 'cancelled')
ORDER BY c.name, i.invoice_date DESC;

-- ============================================================================
-- الجزء 4: التحقق من الفواتير بدون قيود محاسبية (ملخص)
-- Part 4: Invoices Without Journal Entries (Summary)
-- ============================================================================

SELECT 
    '========================================' as separator,
    'ملخص الفواتير بدون قيود' as title,
    'Summary: Invoices Without Journal Entries' as title_en,
    '========================================' as separator2;

SELECT 
    c.name as company_name,
    COUNT(i.id) as total_invoices,
    COUNT(je.id) as invoices_with_journal_entries,
    COUNT(i.id) - COUNT(je.id) as invoices_without_journal_entries,
    ROUND(
        CASE 
            WHEN COUNT(i.id) > 0 THEN (COUNT(je.id)::numeric / COUNT(i.id)::numeric * 100)
            ELSE 0
        END, 2
    ) as percentage_with_entries
FROM companies c
LEFT JOIN invoices i ON i.company_id = c.id AND i.status NOT IN ('draft', 'cancelled')
LEFT JOIN journal_entries je ON je.reference_id = i.id 
    AND je.reference_type = 'invoice' 
    AND je.is_deleted = false
GROUP BY c.id, c.name
ORDER BY c.name;

-- ============================================================================
-- الجزء 5: حساب الذمم المدينة (الطريقة القديمة vs الجديدة)
-- Part 5: Calculate Receivables (Old Method vs New Method)
-- ============================================================================

SELECT
    '========================================' as separator,
    'مقارنة الذمم المدينة (القديمة vs الجديدة)' as title,
    'Receivables Comparison (Old vs New)' as title_en,
    '========================================' as separator2;

WITH old_method AS (
    -- الطريقة القديمة: من الفواتير مباشرة
    SELECT
        c.id as company_id,
        c.name as company_name,
        cust.id as customer_id,
        cust.name as customer_name,
        COALESCE(SUM(
            CASE
                WHEN i.status IN ('sent', 'partially_paid', 'overdue')
                THEN i.total_amount - COALESCE(i.paid_amount, 0)
                ELSE 0
            END
        ), 0) as receivable_old_method
    FROM companies c
    LEFT JOIN customers cust ON cust.company_id = c.id
    LEFT JOIN invoices i ON i.customer_id = cust.id AND i.company_id = c.id
    GROUP BY c.id, c.name, cust.id, cust.name
),
new_method AS (
    -- الطريقة الجديدة: من القيود المحاسبية
    SELECT
        c.id as company_id,
        c.name as company_name,
        cust.id as customer_id,
        cust.name as customer_name,
        COALESCE(SUM(
            CASE
                WHEN jel.account_id = ar.id
                THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
                ELSE 0
            END
        ), 0) as receivable_new_method
    FROM companies c
    LEFT JOIN customers cust ON cust.company_id = c.id
    LEFT JOIN invoices i ON i.customer_id = cust.id
        AND i.company_id = c.id
        AND i.status NOT IN ('draft', 'cancelled')
    LEFT JOIN journal_entries je ON je.reference_id = i.id
        AND je.reference_type = 'invoice'
        AND je.is_deleted = false
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    LEFT JOIN chart_of_accounts ar ON ar.company_id = c.id
        AND ar.sub_type = 'accounts_receivable'
        AND ar.is_active = true
    GROUP BY c.id, c.name, cust.id, cust.name
)
SELECT
    om.company_name,
    om.customer_name,
    ROUND(om.receivable_old_method, 2) as old_method_balance,
    ROUND(nm.receivable_new_method, 2) as new_method_balance,
    ROUND(om.receivable_old_method - nm.receivable_new_method, 2) as difference,
    CASE
        WHEN ABS(om.receivable_old_method - nm.receivable_new_method) < 0.01 THEN '✅ متطابق'
        WHEN nm.receivable_new_method = 0 AND om.receivable_old_method > 0 THEN '⚠️ لا يوجد قيود'
        ELSE '❌ غير متطابق'
    END as status
FROM old_method om
LEFT JOIN new_method nm ON nm.company_id = om.company_id AND nm.customer_id = om.customer_id
WHERE om.customer_id IS NOT NULL
ORDER BY om.company_name, om.customer_name;

-- ============================================================================
-- الجزء 6: حساب الذمم الدائنة (الطريقة القديمة vs الجديدة)
-- Part 6: Calculate Payables (Old Method vs New Method)
-- ============================================================================

SELECT
    '========================================' as separator,
    'مقارنة الذمم الدائنة (القديمة vs الجديدة)' as title,
    'Payables Comparison (Old vs New)' as title_en,
    '========================================' as separator2;

WITH old_method AS (
    -- الطريقة القديمة: من الفواتير مباشرة
    SELECT
        c.id as company_id,
        c.name as company_name,
        sup.id as supplier_id,
        sup.name as supplier_name,
        COALESCE(SUM(
            CASE
                WHEN b.status IN ('open', 'partially_paid', 'overdue')
                THEN b.total_amount - COALESCE(b.paid_amount, 0)
                ELSE 0
            END
        ), 0) as payable_old_method
    FROM companies c
    LEFT JOIN suppliers sup ON sup.company_id = c.id
    LEFT JOIN bills b ON b.supplier_id = sup.id AND b.company_id = c.id
    GROUP BY c.id, c.name, sup.id, sup.name
),
new_method AS (
    -- الطريقة الجديدة: من القيود المحاسبية
    SELECT
        c.id as company_id,
        c.name as company_name,
        sup.id as supplier_id,
        sup.name as supplier_name,
        COALESCE(SUM(
            CASE
                WHEN jel.account_id = ap.id
                THEN COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
                ELSE 0
            END
        ), 0) as payable_new_method
    FROM companies c
    LEFT JOIN suppliers sup ON sup.company_id = c.id
    LEFT JOIN bills b ON b.supplier_id = sup.id
        AND b.company_id = c.id
        AND b.status NOT IN ('draft', 'cancelled')
    LEFT JOIN journal_entries je ON je.reference_id = b.id
        AND je.reference_type = 'bill'
        AND je.is_deleted = false
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    LEFT JOIN chart_of_accounts ap ON ap.company_id = c.id
        AND ap.sub_type = 'accounts_payable'
        AND ap.is_active = true
    GROUP BY c.id, c.name, sup.id, sup.name
)
SELECT
    om.company_name,
    om.supplier_name,
    ROUND(om.payable_old_method, 2) as old_method_balance,
    ROUND(nm.payable_new_method, 2) as new_method_balance,
    ROUND(om.payable_old_method - nm.payable_new_method, 2) as difference,
    CASE
        WHEN ABS(om.payable_old_method - nm.payable_new_method) < 0.01 THEN '✅ متطابق'
        WHEN nm.payable_new_method = 0 AND om.payable_old_method > 0 THEN '⚠️ لا يوجد قيود'
        ELSE '❌ غير متطابق'
    END as status
FROM old_method om
LEFT JOIN new_method nm ON nm.company_id = om.company_id AND nm.supplier_id = om.supplier_id
WHERE om.supplier_id IS NOT NULL
ORDER BY om.company_name, om.supplier_name;

-- ============================================================================
-- الجزء 7: ملخص عام لكل شركة
-- Part 7: General Summary for Each Company
-- ============================================================================

SELECT
    '========================================' as separator,
    'ملخص عام لكل شركة' as title,
    'General Summary per Company' as title_en,
    '========================================' as separator2;

SELECT
    c.name as company_name,
    COUNT(DISTINCT cust.id) as total_customers,
    COUNT(DISTINCT sup.id) as total_suppliers,
    COUNT(DISTINCT i.id) as total_invoices,
    COUNT(DISTINCT b.id) as total_bills,
    COUNT(DISTINCT CASE WHEN i.status NOT IN ('draft', 'cancelled') THEN i.id END) as active_invoices,
    COUNT(DISTINCT CASE WHEN b.status NOT IN ('draft', 'cancelled') THEN b.id END) as active_bills,
    COUNT(DISTINCT je_inv.id) as invoices_with_journal_entries,
    COUNT(DISTINCT je_bill.id) as bills_with_journal_entries,
    CASE WHEN ar.id IS NOT NULL THEN '✅' ELSE '❌' END as has_ar_account,
    CASE WHEN ap.id IS NOT NULL THEN '✅' ELSE '❌' END as has_ap_account
FROM companies c
LEFT JOIN customers cust ON cust.company_id = c.id
LEFT JOIN suppliers sup ON sup.company_id = c.id
LEFT JOIN invoices i ON i.company_id = c.id
LEFT JOIN bills b ON b.company_id = c.id
LEFT JOIN journal_entries je_inv ON je_inv.reference_id = i.id
    AND je_inv.reference_type = 'invoice'
    AND je_inv.is_deleted = false
LEFT JOIN journal_entries je_bill ON je_bill.reference_id = b.id
    AND je_bill.reference_type = 'bill'
    AND je_bill.is_deleted = false
LEFT JOIN chart_of_accounts ar ON ar.company_id = c.id
    AND ar.sub_type = 'accounts_receivable'
    AND ar.is_active = true
LEFT JOIN chart_of_accounts ap ON ap.company_id = c.id
    AND ap.sub_type = 'accounts_payable'
    AND ap.is_active = true
GROUP BY c.id, c.name, ar.id, ap.id
ORDER BY c.name;

