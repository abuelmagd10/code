# 🔧 دليل حل مشاكل الإصلاح التلقائي
# Troubleshooting Guide for Auto-Fix

**تاريخ الإنشاء:** 2025-01-XX

---

## 📊 الوضع الحالي

✅ **النجاحات:**
- المدفوعات: تم إصلاحها بالكامل (55 → 0)

❌ **المشاكل المتبقية:**
- الفواتير: 18 فاتورة لم يتم إصلاحها
- فواتير الشراء: 3 فواتير لم يتم إصلاحها

✅ **التحقق:**
- جميع الحسابات موجودة (AR, AP, Revenue, Expense, Cash, Bank)

---

## 🔍 خطوات التشخيص

### الخطوة 1: تنفيذ السكربت التشخيصي

```sql
-- في Supabase SQL Editor
-- تنفيذ: scripts/DIAGNOSE_FIX_FAILURES.sql
```

هذا سيعطيك:
- تفاصيل الفواتير بدون قيود
- تفاصيل فواتير الشراء بدون قيود
- ملخص الحسابات المطلوبة
- اختبار Function `find_company_accounts`

### الخطوة 2: تنفيذ سكربت الاختبار

```sql
-- في Supabase SQL Editor
-- تنفيذ: scripts/TEST_FIX_FUNCTIONS.sql
```

هذا سيقوم بـ:
- اختبار Function `find_company_accounts`
- جلب أول فاتورة للاختبار
- محاولة إنشاء قيد يدوياً لفاتورة واحدة
- عرض تفاصيل الأخطاء إن وجدت

### الخطوة 3: مراجعة النتائج

ابحث عن:
- ❌ رسائل خطأ في NOTICE/WARNING
- ❌ بيانات غير صحيحة (NULL, 0, إلخ)
- ❌ مشاكل في Functions

---

## 🐛 المشاكل الشائعة والحلول

### المشكلة 1: "حساب AR غير موجود"

**السبب:** Function `find_company_accounts` لا تجد حساب AR

**الحل:**
1. التحقق من وجود حساب AR:
```sql
SELECT * FROM chart_of_accounts 
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
AND sub_type = 'accounts_receivable'
AND is_active = true;
```

2. إذا لم يكن موجوداً، أنشئه:
```sql
INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, account_type, sub_type, is_active
) VALUES (
  '9c92a597-8c88-42a7-ad02-bd4a25b755ee',
  '1200',
  'الذمم المدينة',
  'asset',
  'accounts_receivable',
  true
);
```

### المشكلة 2: "حساب Revenue غير موجود"

**السبب:** Function `find_company_accounts` لا تجد حساب Revenue

**الحل:**
1. التحقق من وجود حساب Revenue:
```sql
SELECT * FROM chart_of_accounts 
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
AND account_type = 'income'
AND is_active = true;
```

2. إذا لم يكن موجوداً، أنشئه:
```sql
INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, account_type, is_active
) VALUES (
  '9c92a597-8c88-42a7-ad02-bd4a25b755ee',
  '4100',
  'إيرادات المبيعات',
  'income',
  true
);
```

### المشكلة 3: "المبلغ الإجمالي غير صحيح"

**السبب:** `total_amount` هو NULL أو <= 0

**الحل:**
1. فحص الفواتير:
```sql
SELECT id, invoice_number, total_amount, subtotal, tax_amount, shipping
FROM invoices
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
AND (total_amount IS NULL OR total_amount <= 0)
AND status IN ('sent', 'paid', 'partially_paid');
```

2. إصلاح البيانات:
```sql
UPDATE invoices
SET total_amount = COALESCE(subtotal, 0) + COALESCE(tax_amount, 0) + COALESCE(shipping, 0) - COALESCE(discount_value, 0)
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
AND (total_amount IS NULL OR total_amount <= 0)
AND status IN ('sent', 'paid', 'partially_paid');
```

### المشكلة 4: "تاريخ الفاتورة NULL"

**السبب:** `invoice_date` هو NULL

**الحل:**
1. فحص الفواتير:
```sql
SELECT id, invoice_number, invoice_date, created_at
FROM invoices
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
AND invoice_date IS NULL
AND status IN ('sent', 'paid', 'partially_paid');
```

2. إصلاح البيانات:
```sql
UPDATE invoices
SET invoice_date = DATE(created_at)
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
AND invoice_date IS NULL
AND status IN ('sent', 'paid', 'partially_paid');
```

### المشكلة 5: "فاتورة الشراء لم يتم الدفع بعد"

**السبب:** `paid_amount = 0` أو NULL

**ملاحظة:** هذا ليس خطأ! فواتير الشراء تحتاج قيد AP/Expense فقط عند الدفع الأول.

**الحل:**
- لا حاجة لإصلاح - هذا سلوك طبيعي
- الفواتير التي لم يتم الدفع عليها لا تحتاج قيود محاسبية بعد

### المشكلة 6: "القيد غير متوازن"

**السبب:** مجموع المدين ≠ مجموع الدائن

**الحل:**
1. فحص القيد:
```sql
SELECT 
  je.id,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.id = '<entry_id>'
GROUP BY je.id;
```

2. إذا كان غير متوازن، راجع Function `create_invoice_ar_revenue_entry`

---

## 🧪 اختبار يدوي

### اختبار إنشاء قيد لفاتورة واحدة

```sql
DO $$
DECLARE
  v_invoice_id UUID := '<invoice_id>'; -- استبدل بمعرف فاتورة حقيقية
  v_entry_id UUID;
BEGIN
  v_entry_id := create_invoice_ar_revenue_entry(
    v_invoice_id,
    '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID,
    CURRENT_DATE,
    'اختبار يدوي'
  );
  
  RAISE NOTICE '✅ تم إنشاء القيد: %', v_entry_id;
END $$;
```

---

## 📝 سجل الأخطاء

إذا واجهت أخطاء، سجلها هنا:

1. **نوع الخطأ:** (مثال: "حساب AR غير موجود")
2. **الرسالة الكاملة:** (من SQLERRM)
3. **الفاتورة/فاتورة الشراء:** (invoice_number أو bill_number)
4. **الشركة:** (company_id)

---

## ✅ التحقق النهائي

بعد الإصلاحات:

1. **إعادة تنفيذ الإصلاح:**
```sql
scripts/AUTO_FIX_MISSING_JOURNAL_ENTRIES.sql
```

2. **التحقق من النتائج:**
```sql
SELECT 
  (SELECT COUNT(*) FROM invoices i
   WHERE i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
  ) as remaining_invoices,
  (SELECT COUNT(*) FROM bills b
   WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
  ) as remaining_bills;
```

3. **إعادة المراجعة الشاملة:**
```bash
npm run audit:comprehensive
```

---

## 🎯 النتيجة المتوقعة

بعد حل جميع المشاكل:

```json
{
  "remaining_invoices_without_entries": 0,
  "remaining_bills_without_entries": 0,
  "remaining_payments_without_entries": 0
}
```

---

**آخر تحديث:** 2025-01-XX

