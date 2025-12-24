# 🔐 دليل تطبيق الامتثال للنمط المحاسبي القياسي
## Accounting Pattern Compliance Implementation Guide

---

## 📋 نظرة عامة

هذا الدليل يشرح كيفية تطبيق إصلاحات الامتثال للنمط المحاسبي القياسي (Zoho Books / Odoo) على نظام ERB_VitaSlims.

---

## 🎯 الأهداف

1. **ضمان أن journal_entries هو المصدر الوحيد للحقيقة المحاسبية**
2. **منع تحديث الأرصدة مباشرة** (يجب حسابها من القيود فقط)
3. **ضمان إنشاء القيود تلقائيًا** عند العمليات المهمة
4. **حماية القيود المرحلة (Posted)** من الحذف أو التعديل
5. **التحقق من توازن القيود** (Debit = Credit)

---

## 📁 الملفات المطلوبة

### 1. تقرير المراجعة
- `ACCOUNTING_PATTERN_COMPLIANCE_AUDIT.md` - تقرير شامل بجميع المشاكل والحلول

### 2. SQL Migration
- `scripts/999_accounting_pattern_compliance_fix.sql` - Migration شامل لإصلاح جميع المشاكل

### 3. Migration السابق (يجب التأكد من تطبيقه)
- `scripts/201_add_status_to_journal_entries.sql` - إضافة status إلى journal_entries

---

## 🚀 خطوات التطبيق

### الخطوة 1: النسخ الاحتياطي

**⚠️ مهم جداً:** قم بعمل نسخة احتياطية كاملة من قاعدة البيانات قبل تطبيق أي Migration.

```bash
# مثال لـ PostgreSQL
pg_dump -U postgres -d your_database > backup_before_compliance_fix.sql
```

---

### الخطوة 2: التحقق من Migration السابق

تأكد من تطبيق Migration `201_add_status_to_journal_entries.sql`:

```sql
-- التحقق من وجود عمود status
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'journal_entries'
  AND column_name = 'status';

-- إذا لم يكن موجودًا، قم بتطبيق Migration 201 أولاً
```

---

### الخطوة 3: تطبيق Migration الرئيسي

قم بتطبيق Migration `999_accounting_pattern_compliance_fix.sql`:

```bash
# من سطر الأوامر
psql -U postgres -d your_database -f scripts/999_accounting_pattern_compliance_fix.sql

# أو من Supabase Dashboard
# انسخ محتوى الملف والصقه في SQL Editor
```

---

### الخطوة 4: التحقق من التطبيق

```sql
-- 1. التحقق من وجود status في journal_entries
SELECT COUNT(*) as total_entries,
       COUNT(CASE WHEN status = 'posted' THEN 1 END) as posted_entries,
       COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_entries
FROM journal_entries;

-- 2. التحقق من وجود Triggers
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%journal%' OR trigger_name LIKE '%payment%'
ORDER BY event_object_table, trigger_name;

-- 3. التحقق من وجود Functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name LIKE '%journal%' OR routine_name LIKE '%balance%' OR routine_name LIKE '%payment%')
ORDER BY routine_name;

-- 4. اختبار Function حساب paid_amount
SELECT 
  id,
  invoice_number,
  total_amount,
  paid_amount as current_paid_amount,
  calculate_invoice_paid_amount(id) as calculated_paid_amount
FROM invoices
WHERE status IN ('paid', 'partially_paid')
LIMIT 10;

-- 5. اختبار Function حساب account_balance
SELECT * FROM calculate_account_balance(
  (SELECT id FROM chart_of_accounts WHERE account_code = '1200' LIMIT 1),
  CURRENT_DATE
);
```

---

### الخطوة 5: تحديث البيانات الحالية

#### 5.1 تحديث paid_amount من القيود

```sql
-- تحديث paid_amount لجميع الفواتير من القيود
UPDATE invoices i
SET paid_amount = calculate_invoice_paid_amount(i.id)
WHERE i.status IN ('paid', 'partially_paid');
```

#### 5.2 تحديث account_balances من القيود

```sql
-- تحديث account_balances لجميع الشركات
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  FOR v_company_id IN SELECT id FROM companies
  LOOP
    PERFORM refresh_account_balances(v_company_id, CURRENT_DATE);
  END LOOP;
END $$;
```

---

## 🔍 الاختبار

### اختبار 1: التحقق من توازن القيود

```sql
-- يجب أن يكون جميع القيود متوازنة
SELECT 
  je.id,
  je.reference_type,
  je.reference_id,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'posted'
GROUP BY je.id, je.reference_type, je.reference_id
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01;
-- يجب أن تكون النتيجة فارغة (0 rows)
```

### اختبار 2: محاولة حذف قيد posted (يجب أن تفشل)

```sql
-- يجب أن يرفض هذا الأمر
DELETE FROM journal_entries 
WHERE id = (SELECT id FROM journal_entries WHERE status = 'posted' LIMIT 1);
-- يجب أن يظهر خطأ: "لا يمكن حذف القيد المرحلة"
```

### اختبار 3: محاولة تعديل قيد posted (يجب أن تفشل)

```sql
-- يجب أن يرفض هذا الأمر
UPDATE journal_entries 
SET description = 'تعديل تجريبي'
WHERE id = (SELECT id FROM journal_entries WHERE status = 'posted' LIMIT 1);
-- يجب أن يظهر خطأ: "لا يمكن تعديل القيد المرحلة"
```

### اختبار 4: إنشاء Payment جديد (يجب أن ينشئ قيد تلقائيًا)

```sql
-- إنشاء payment جديد
INSERT INTO payments (
  company_id,
  customer_id,
  invoice_id,
  payment_date,
  amount,
  payment_method
) VALUES (
  (SELECT id FROM companies LIMIT 1),
  (SELECT id FROM customers LIMIT 1),
  (SELECT id FROM invoices WHERE status = 'sent' LIMIT 1),
  CURRENT_DATE,
  1000,
  'cash'
) RETURNING id;

-- التحقق من إنشاء القيد تلقائيًا
SELECT je.*, jel.*
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type = 'invoice_payment'
  AND je.reference_id = (SELECT invoice_id FROM payments ORDER BY created_at DESC LIMIT 1);
```

---

## 📊 المراقبة والصيانة

### 1. مراقبة القيود غير المتوازنة

قم بتشغيل هذا الاستعلام بانتظام:

```sql
SELECT 
  je.id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'posted'
GROUP BY je.id, je.reference_type, je.reference_id, je.entry_date
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01;
```

### 2. تحديث account_balances بانتظام

```sql
-- يمكن تشغيل هذا يوميًا أو أسبوعيًا
SELECT refresh_account_balances(company_id, CURRENT_DATE)
FROM companies;
```

### 3. مراجعة القيود المرحلة

```sql
-- عدد القيود المرحلة حسب النوع
SELECT 
  reference_type,
  COUNT(*) as count,
  SUM(total_debit) as total_debit,
  SUM(total_credit) as total_credit
FROM (
  SELECT 
    je.reference_type,
    SUM(jel.debit_amount) as total_debit,
    SUM(jel.credit_amount) as total_credit
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.status = 'posted'
  GROUP BY je.id, je.reference_type
) sub
GROUP BY reference_type
ORDER BY count DESC;
```

---

## ⚠️ تحذيرات مهمة

### 1. لا تحذف القيود المرحلة
- القيود المرحلة (posted) محمية من الحذف
- إذا أردت إلغاء قيد، استخدم `status = 'voided'` بدلاً من الحذف

### 2. لا تعدل القيود المرحلة مباشرة
- القيود المرحلة محمية من التعديل
- إذا أردت تصحيح قيد، أنشئ قيد تصحيح (reversal entry)

### 3. لا تحدث paid_amount مباشرة
- استخدم Function `calculate_invoice_paid_amount()` لحساب المبلغ المدفوع
- أو دع Trigger يقوم بذلك تلقائيًا

### 4. لا تحدث account_balances يدويًا
- استخدم Function `refresh_account_balances()` لتحديث الأرصدة
- الأرصدة يجب أن تُحسب من القيود فقط

---

## 🔧 استكشاف الأخطاء

### المشكلة: Trigger لا يعمل

```sql
-- التحقق من وجود Trigger
SELECT * FROM pg_trigger WHERE tgname LIKE '%journal%';

-- إعادة إنشاء Trigger
-- راجع scripts/999_accounting_pattern_compliance_fix.sql
```

### المشكلة: Function لا تعمل

```sql
-- التحقق من وجود Function
SELECT * FROM pg_proc WHERE proname LIKE '%balance%';

-- إعادة إنشاء Function
-- راجع scripts/999_accounting_pattern_compliance_fix.sql
```

### المشكلة: القيود غير متوازنة

```sql
-- البحث عن القيود غير المتوازنة
SELECT 
  je.id,
  je.reference_type,
  je.reference_id,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'posted'
GROUP BY je.id, je.reference_type, je.reference_id
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01;

-- إصلاح القيود غير المتوازنة يدويًا (بحذر!)
```

---

## 📚 مراجع إضافية

- `ACCOUNTING_PATTERN_COMPLIANCE_AUDIT.md` - تقرير المراجعة الشامل
- `scripts/999_accounting_pattern_compliance_fix.sql` - Migration الكامل
- `scripts/accounting_integrity_audit.sql` - استعلامات التدقيق

---

## ✅ قائمة التحقق النهائية

- [ ] نسخة احتياطية من قاعدة البيانات
- [ ] تطبيق Migration 201 (status column)
- [ ] تطبيق Migration 999 (compliance fix)
- [ ] التحقق من Triggers
- [ ] التحقق من Functions
- [ ] تحديث paid_amount من القيود
- [ ] تحديث account_balances من القيود
- [ ] اختبار القيود المتوازنة
- [ ] اختبار حماية القيود posted
- [ ] اختبار إنشاء القيود التلقائي
- [ ] توثيق أي مشاكل أو استثناءات

---

**تم إعداد الدليل بواسطة:** AI Assistant  
**آخر تحديث:** 2025-01-XX  
**الحالة:** جاهز للتطبيق

