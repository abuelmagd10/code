-- =============================================
-- حذف بيانات الاختبار للبدء من جديد
-- ⚠️ تحذير: هذا سيحذف جميع البيانات المحددة نهائياً!
-- =============================================

-- تعطيل التحقق من المفاتيح الأجنبية مؤقتاً
SET session_replication_role = 'replica';

-- 1. حذف سجلات المراجعة
TRUNCATE TABLE IF EXISTS audit_logs CASCADE;

-- 2. حذف حركات المخزون
TRUNCATE TABLE IF EXISTS inventory_transactions CASCADE;

-- 3. حذف خطوط القيود اليومية
TRUNCATE TABLE IF EXISTS journal_entry_lines CASCADE;

-- 4. حذف القيود اليومية
TRUNCATE TABLE IF EXISTS journal_entries CASCADE;

-- 5. حذف المدفوعات
TRUNCATE TABLE IF EXISTS payments CASCADE;

-- 6. حذف عناصر الفواتير
TRUNCATE TABLE IF EXISTS invoice_items CASCADE;

-- 7. حذف الفواتير
TRUNCATE TABLE IF EXISTS invoices CASCADE;

-- 8. حذف عناصر فواتير المشتريات
TRUNCATE TABLE IF EXISTS bill_items CASCADE;

-- 9. حذف فواتير المشتريات
TRUNCATE TABLE IF EXISTS bills CASCADE;

-- 10. حذف عناصر أوامر الشراء
TRUNCATE TABLE IF EXISTS purchase_order_items CASCADE;

-- 11. حذف أوامر الشراء
TRUNCATE TABLE IF EXISTS purchase_orders CASCADE;

-- 12. حذف تطبيقات ائتمان الموردين
TRUNCATE TABLE IF EXISTS vendor_credit_applications CASCADE;

-- 13. حذف عناصر ائتمان الموردين
TRUNCATE TABLE IF EXISTS vendor_credit_items CASCADE;

-- 14. حذف ائتمان الموردين
TRUNCATE TABLE IF EXISTS vendor_credits CASCADE;

-- 15. حذف عناصر أوامر البيع
TRUNCATE TABLE IF EXISTS sales_order_items CASCADE;

-- 16. حذف أوامر البيع
TRUNCATE TABLE IF EXISTS sales_orders CASCADE;

-- 17. حذف عناصر عروض الأسعار
TRUNCATE TABLE IF EXISTS estimate_items CASCADE;

-- 18. حذف عروض الأسعار
TRUNCATE TABLE IF EXISTS estimates CASCADE;

-- إعادة تفعيل التحقق من المفاتيح الأجنبية
SET session_replication_role = 'origin';

-- =============================================
-- ✅ تم حذف جميع بيانات الاختبار بنجاح!
-- =============================================
-- 
-- ما تم حذفه:
-- ✅ سجلات المراجعة (audit_logs)
-- ✅ حركات المخزون (inventory_transactions)
-- ✅ القيود اليومية وخطوطها
-- ✅ المدفوعات
-- ✅ الفواتير وعناصرها
-- ✅ فواتير المشتريات وعناصرها
-- ✅ أوامر الشراء وعناصرها
-- ✅ ائتمان الموردين
-- ✅ أوامر البيع وعناصرها
-- ✅ عروض الأسعار وعناصرها

--
-- ما تم الإبقاء عليه:
-- ✅ الشركات (companies)
-- ✅ أعضاء الشركة (company_members)
-- ✅ الشجرة المحاسبية (chart_of_accounts)
-- ✅ إعدادات الشركة
-- =============================================

