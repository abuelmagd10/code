# 🚀 دليل التطبيق السريع - تصحيح الذمم والرصيد
## Quick Start Guide - Balance Fix

---

## ⚡ خطوات التطبيق (5 دقائق)

### 1️⃣ تشغيل سكريبت SQL الرئيسي
```bash
# في Supabase SQL Editor أو psql
psql -U postgres -d your_database -f scripts/400_customer_supplier_balance_from_ledger.sql
```

أو في **Supabase Dashboard**:
1. افتح SQL Editor
2. انسخ محتوى `scripts/400_customer_supplier_balance_from_ledger.sql`
3. اضغط Run

---

### 2️⃣ التحقق من الحسابات المطلوبة
```sql
-- استبدل 'YOUR_COMPANY_ID' بمعرف شركتك
SELECT 
  account_code,
  account_name,
  sub_type,
  is_active
FROM chart_of_accounts
WHERE company_id = 'YOUR_COMPANY_ID'
  AND sub_type IN ('accounts_receivable', 'accounts_payable');
```

**النتيجة المتوقعة:**
```
account_code | account_name          | sub_type              | is_active
-------------|----------------------|----------------------|----------
1200         | Accounts Receivable  | accounts_receivable  | true
2100         | Accounts Payable     | accounts_payable     | true
```

❌ **إذا لم تظهر النتائج:**
```sql
-- إنشاء حساب Accounts Receivable
INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, 
  account_type, sub_type, is_active
) VALUES (
  'YOUR_COMPANY_ID', '1200', 'Accounts Receivable', 
  'asset', 'accounts_receivable', true
);

-- إنشاء حساب Accounts Payable
INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, 
  account_type, sub_type, is_active
) VALUES (
  'YOUR_COMPANY_ID', '2100', 'Accounts Payable', 
  'liability', 'accounts_payable', true
);
```

---

### 3️⃣ اختبار الدوال الجديدة
```sql
-- اختبار الذمم المدينة
SELECT * FROM get_customer_receivables_from_ledger('YOUR_COMPANY_ID')
LIMIT 5;

-- اختبار الذمم الدائنة
SELECT * FROM get_supplier_payables_from_ledger('YOUR_COMPANY_ID')
LIMIT 5;
```

---

### 4️⃣ التحقق من التطابق
```sql
-- هذا الاستعلام يجب أن يعيد 0 صفوف إذا كان كل شيء متطابق
SELECT * FROM verify_receivables_payables_integrity('YOUR_COMPANY_ID');
```

✅ **إذا لم تظهر نتائج:** النظام يعمل بشكل صحيح!  
❌ **إذا ظهرت نتائج:** هناك فروقات تحتاج إلى مراجعة

---

### 5️⃣ تشغيل سكريبت الاختبار الشامل
```bash
psql -U postgres -d your_database -f scripts/401_test_balance_integrity.sql
```

---

## 🔧 إصلاح المشاكل الشائعة

### مشكلة 1: فواتير بدون قيود محاسبية
```sql
-- التحقق من الفواتير بدون قيود
SELECT 
  i.invoice_number,
  i.total_amount,
  i.status
FROM invoices i
WHERE i.company_id = 'YOUR_COMPANY_ID'
  AND i.status NOT IN ('draft', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'invoice'
      AND je.reference_id = i.id
  );

-- إصلاح تلقائي
SELECT fix_accrual_accounting_data('YOUR_COMPANY_ID');
```

---

### مشكلة 2: قيود غير متوازنة
```sql
-- عرض القيود غير المتوازنة
SELECT * FROM check_all_journal_entries_balance('YOUR_COMPANY_ID');
```

---

### مشكلة 3: فروقات في الأرصدة
```sql
-- عرض تفاصيل الفروقات
SELECT 
  check_type,
  entity_name,
  invoice_balance,
  ledger_balance,
  difference,
  status
FROM verify_receivables_payables_integrity('YOUR_COMPANY_ID')
ORDER BY difference DESC;
```

**الحل:**
1. راجع القيود المحاسبية للعميل/المورد
2. تأكد من أن جميع الفواتير لها قيود
3. تأكد من أن جميع الدفعات لها قيود

---

## 📊 التحقق من النتائج

### في صفحة العملاء:
1. افتح `/customers`
2. تحقق من عمود "الذمم" (Receivables)
3. يجب أن تظهر الأرصدة الصحيحة من القيود المحاسبية

### في صفحة الموردين:
1. افتح `/suppliers`
2. تحقق من عمود "ذمم دائنة" (Payables)
3. يجب أن تظهر الأرصدة الصحيحة من القيود المحاسبية

---

## 🎯 معايير النجاح

✅ **النظام يعمل بشكل صحيح إذا:**
- [ ] دالة `verify_receivables_payables_integrity` تعيد 0 صفوف
- [ ] الأرصدة في صفحة العملاء تطابق ميزان المراجعة
- [ ] الأرصدة في صفحة الموردين تطابق ميزان المراجعة
- [ ] لا توجد رسائل خطأ في Console

---

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع `CUSTOMER_SUPPLIER_BALANCE_FIX_GUIDE.md` للتفاصيل الكاملة
2. راجع `ZOHO_BOOKS_COMPLIANCE_REPORT.md` لفهم النمط المحاسبي
3. شغّل `scripts/401_test_balance_integrity.sql` للتشخيص

---

## 🔄 Rollback (التراجع)

إذا أردت التراجع عن التغييرات:

```sql
-- حذف الدوال الجديدة
DROP FUNCTION IF EXISTS get_customer_receivables_from_ledger(UUID, UUID);
DROP FUNCTION IF EXISTS get_supplier_payables_from_ledger(UUID, UUID);
DROP FUNCTION IF EXISTS verify_receivables_payables_integrity(UUID);
```

ثم استعد الكود القديم من Git:
```bash
git checkout HEAD~1 -- app/customers/page.tsx
git checkout HEAD~1 -- app/suppliers/page.tsx
```

---

## ✅ تم الانتهاء!

الآن نظامك متوافق 100% مع **Zoho Books** ويحسب الذمم من القيود المحاسبية بدقة عالية! 🎉

