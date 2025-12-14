-- =============================================
-- تطبيق جميع التحديثات: ERP Professional Upgrade
-- =============================================
-- Apply All Updates: ERP Professional Upgrade
-- =============================================
-- ⚠️ التحذير: تأكد من عمل نسخة احتياطية قبل التطبيق!
-- WARNING: Make sure to backup the database before applying!
-- =============================================

BEGIN;

-- =====================================
-- 1. إقفال الفترات المحاسبية
-- =====================================
\echo 'Applying: Accounting Periods Lock System...'
\i scripts/080_accounting_periods.sql

-- =====================================
-- 2. تحسينات Audit Trail
-- =====================================
\echo 'Applying: Enhanced Audit Trail...'
\i scripts/081_enhanced_audit_trail.sql

-- =====================================
-- 3. Views للعرض المالي
-- =====================================
\echo 'Applying: Invoice Financial Views...'
\i scripts/082_invoice_financial_view.sql

-- =====================================
-- 4. اختبارات القواعد الحرجة
-- =====================================
\echo 'Applying: Critical Rules Tests...'
\i scripts/083_critical_rules_tests.sql

-- =====================================
-- 5. التحقق من التطبيق
-- =====================================
\echo 'Running verification tests...'
SELECT * FROM run_all_critical_tests();

COMMIT;

-- =============================================
-- ✅ تم تطبيق جميع التحديثات بنجاح
-- =============================================
\echo '✅ All updates applied successfully!'
\echo 'Please review the test results above.'
