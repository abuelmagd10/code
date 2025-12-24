# 🔐 دليل Audit وقيود التسوية المحاسبية
## Accounting Data Audit and Adjustment Guide

**تاريخ:** 2025-01-XX  
**الهدف:** تصحيح بيانات الشركات القديمة بطريقة محاسبية صحيحة وآمنة

---

## 📋 نظرة عامة

هذا النظام يسمح بـ:
1. **Audit شامل** لكل شركة لتحديد جميع الفروقات
2. **اقتراح قيود التسوية** المناسبة
3. **إنشاء قيود التسوية** الفعلية (Adjustment Entries)

**القواعد الصارمة:**
- ✅ يُمنع تعديل أو حذف أي بيانات تاريخية
- ✅ يُمنع UPDATE / DELETE على invoices أو journal_entries القديمة
- ✅ التصحيح يتم فقط عبر قيود محاسبية جديدة (Adjustment Entries)
- ✅ جميع القيود الجديدة تكون posted
- ✅ لا تأثير رجعي (No Retroactive Modification)

---

## 🔍 المرحلة 1: Audit الشامل

### 1.1 تشغيل Audit لكل شركة

```sql
-- Audit شامل لشركة معينة
SELECT * FROM audit_company_accounting_data(
  'company_id_here',  -- UUID الشركة
  '2025-01-01'        -- تاريخ Audit
);
```

### 1.2 أنواع الفروقات المكتشفة

| النوع | الوصف |
|-------|-------|
| `invoice_without_journal` | فواتير بدون قيود محاسبية |
| `invoice_paid_amount_mismatch` | فروقات بين `paid_amount` والقيود |
| `bill_without_journal` | فواتير شراء بدون قيود |
| `bill_paid_amount_mismatch` | فروقات في مدفوعات فواتير الشراء |
| `account_balance_mismatch` | فروقات بين `account_balances` والقيود |

### 1.3 مثال على نتائج Audit

```sql
-- مثال: Audit لشركة معينة
SELECT 
  audit_category,
  item_reference,
  expected_value,
  actual_value,
  difference,
  description
FROM audit_company_accounting_data('company_id', CURRENT_DATE)
ORDER BY audit_category, difference DESC;
```

**النتيجة المتوقعة:**
```
audit_category                  | item_reference | expected_value | actual_value | difference
--------------------------------|----------------|----------------|--------------|------------
invoice_without_journal         | INV-001        | 1000.00        | 0.00         | 1000.00
invoice_paid_amount_mismatch    | INV-002        | 500.00         | 300.00       | 200.00
account_balance_mismatch        | 1200 - AR      | 5000.00        | 4500.00      | 500.00
```

---

## 💡 المرحلة 2: اقتراح قيود التسوية

### 2.1 عرض قيود التسوية المقترحة

```sql
-- عرض جميع قيود التسوية المقترحة
SELECT * FROM suggest_adjustment_entries(
  'company_id_here',  -- UUID الشركة
  '2025-01-01'        -- تاريخ التسوية
);
```

### 2.2 أنواع قيود التسوية

| النوع | الوصف |
|-------|-------|
| `invoice_missing_journal` | قيد AR للفاتورة المفقودة |
| `invoice_missing_journal_revenue` | قيد Revenue للفاتورة المفقودة |
| `invoice_paid_adjustment` | تسوية مدفوعات الفاتورة |
| `invoice_paid_adjustment_ar` | تسوية AR للفاتورة |
| `account_balance_adjustment` | تسوية رصيد الحساب |

### 2.3 مثال على قيود التسوية المقترحة

```sql
-- مثال: عرض قيود التسوية
SELECT 
  adjustment_type,
  account_code,
  account_name,
  debit_amount,
  credit_amount,
  description
FROM suggest_adjustment_entries('company_id', CURRENT_DATE)
WHERE debit_amount > 0.01 OR credit_amount > 0.01
ORDER BY adjustment_type, debit_amount DESC, credit_amount DESC;
```

**النتيجة المتوقعة:**
```
adjustment_type              | account_code | account_name    | debit_amount | credit_amount
-----------------------------|--------------|-----------------|--------------|--------------
invoice_missing_journal      | 1200         | الذمم المدينة   | 1000.00      | 0.00
invoice_missing_journal_revenue | 4100      | إيرادات المبيعات | 0.00        | 850.00
invoice_paid_adjustment      | 1000         | الصندوق         | 200.00       | 0.00
invoice_paid_adjustment_ar   | 1200         | الذمم المدينة   | 0.00         | 200.00
```

---

## ✅ المرحلة 3: إنشاء قيود التسوية

### 3.1 إنشاء قيود التسوية الفعلية

```sql
-- إنشاء قيود التسوية
SELECT * FROM create_adjustment_entries(
  'company_id_here',           -- UUID الشركة
  '2025-01-01',                -- تاريخ التسوية
  'تسوية محاسبية 2025'         -- وصف التسوية
);
```

### 3.2 ما يحدث عند الإنشاء

1. **إنشاء قيود جديدة** في `journal_entries`:
   - `reference_type = 'adjustment'`
   - `entry_date = تاريخ التسوية`
   - `description = وصف التسوية`

2. **إنشاء سطور القيود** في `journal_entry_lines`:
   - حسب اقتراحات `suggest_adjustment_entries()`
   - مع ضمان التوازن (Debit = Credit)

3. **إضافة سطر توازن** إذا لزم الأمر:
   - استخدام حساب تسوية (Adjustment Account)
   - لضمان توازن القيد

### 3.3 مثال على النتيجة

```sql
-- مثال: إنشاء قيود التسوية
SELECT 
  journal_entry_id,
  adjustment_type,
  total_debit,
  total_credit,
  lines_count
FROM create_adjustment_entries('company_id', CURRENT_DATE, 'تسوية 2025');
```

**النتيجة المتوقعة:**
```
journal_entry_id                    | adjustment_type              | total_debit | total_credit | lines_count
------------------------------------|------------------------------|-------------|--------------|------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | invoice_missing_journal     | 1000.00     | 1000.00      | 2
b2c3d4e5-f6a7-8901-bcde-f12345678901 | invoice_paid_adjustment     | 200.00      | 200.00       | 2
```

---

## 📊 سيناريو كامل: من Audit إلى التسوية

### الخطوة 1: Audit

```sql
-- 1. Audit شامل
SELECT 
  audit_category,
  COUNT(*) as issues_count,
  SUM(ABS(difference)) as total_difference
FROM audit_company_accounting_data('company_id', CURRENT_DATE)
GROUP BY audit_category
ORDER BY total_difference DESC;
```

### الخطوة 2: مراجعة الاقتراحات

```sql
-- 2. مراجعة قيود التسوية المقترحة
SELECT 
  adjustment_type,
  COUNT(*) as entries_count,
  SUM(debit_amount) as total_debit,
  SUM(credit_amount) as total_credit,
  ABS(SUM(debit_amount) - SUM(credit_amount)) as imbalance
FROM suggest_adjustment_entries('company_id', CURRENT_DATE)
WHERE debit_amount > 0.01 OR credit_amount > 0.01
GROUP BY adjustment_type
HAVING ABS(SUM(debit_amount) - SUM(credit_amount)) > 0.01;
```

### الخطوة 3: إنشاء قيود التسوية

```sql
-- 3. إنشاء قيود التسوية
SELECT * FROM create_adjustment_entries(
  'company_id',
  CURRENT_DATE,
  'تسوية محاسبية - ' || TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
);
```

### الخطوة 4: التحقق من النتيجة

```sql
-- 4. التحقق من أن القيود تم إنشاؤها
SELECT 
  je.id,
  je.entry_date,
  je.description,
  COUNT(jel.id) as lines_count,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as imbalance
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.company_id = 'company_id'
  AND je.reference_type = 'adjustment'
  AND je.entry_date = CURRENT_DATE
GROUP BY je.id, je.entry_date, je.description
ORDER BY je.entry_date DESC;
```

---

## ⚠️ تحذيرات مهمة

### 1. قبل إنشاء قيود التسوية

- ✅ **مراجعة نتائج Audit** بعناية
- ✅ **مراجعة قيود التسوية المقترحة** قبل الإنشاء
- ✅ **التأكد من وجود حساب تسوية** (Adjustment Account)
- ✅ **نسخة احتياطية** من قاعدة البيانات

### 2. حساب التسوية (Adjustment Account)

يجب أن يكون موجوداً في `chart_of_accounts`:
- اسم الحساب يحتوي على: `adjustment` أو `تسوية` أو `تصحيح`
- أو حساب مصروفات عام (Expense Account)

**إنشاء حساب تسوية:**
```sql
INSERT INTO chart_of_accounts (
  company_id,
  account_code,
  account_name,
  account_type,
  sub_type
) VALUES (
  'company_id',
  '9999',
  'تسويات محاسبية',
  'expense',
  'adjustment'
);
```

### 3. بعد إنشاء قيود التسوية

- ✅ **التحقق من توازن القيود** (Debit = Credit)
- ✅ **التحقق من الأرصدة النهائية**
- ✅ **مراجعة التقارير المالية**

---

## 📈 مثال عملي كامل

### السيناريو:
شركة لديها:
- 5 فواتير بدون قيود محاسبية
- 3 فواتير بفروقات في `paid_amount`
- 2 حساب بأرصدة غير متطابقة

### الخطوات:

```sql
-- 1. Audit
SELECT * FROM audit_company_accounting_data('company_id', '2025-01-15');

-- 2. مراجعة الاقتراحات
SELECT * FROM suggest_adjustment_entries('company_id', '2025-01-15');

-- 3. إنشاء قيود التسوية
SELECT * FROM create_adjustment_entries(
  'company_id',
  '2025-01-15',
  'تسوية محاسبية - 2025-01-15'
);

-- 4. التحقق
SELECT 
  COUNT(*) as total_adjustment_entries,
  SUM(total_debit) as total_debit,
  SUM(total_credit) as total_credit
FROM (
  SELECT 
    je.id,
    SUM(jel.debit_amount) as total_debit,
    SUM(jel.credit_amount) as total_credit
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.company_id = 'company_id'
    AND je.reference_type = 'adjustment'
    AND je.entry_date = '2025-01-15'
  GROUP BY je.id
) sub;
```

---

## 🔒 الضمانات الأمنية

### ✅ ما يتم فعله:
- ✅ إنشاء قيود جديدة فقط (INSERT)
- ✅ جميع القيود بتاريخ واحد واضح
- ✅ جميع القيود `posted`
- ✅ ضمان التوازن (Debit = Credit)

### ❌ ما لا يتم فعله:
- ❌ لا UPDATE على البيانات القديمة
- ❌ لا DELETE على البيانات القديمة
- ❌ لا تعديل على `invoices` أو `bills`
- ❌ لا تعديل على `journal_entries` القديمة
- ❌ لا تأثير رجعي على التاريخ المحاسبي

---

## 📝 ملاحظات نهائية

1. **تاريخ التسوية:**
   - يُفضل استخدام تاريخ واضح (مثل: آخر يوم في الشهر)
   - جميع قيود التسوية بنفس التاريخ

2. **وصف التسوية:**
   - وصف واضح يوضح سبب التسوية
   - مثال: "تسوية محاسبية - 2025-01-31"

3. **المراجعة:**
   - مراجعة جميع قيود التسوية قبل الموافقة
   - التحقق من التوازن والأرصدة النهائية

---

**تم إعداد الدليل بواسطة:** AI Assistant  
**الحالة:** جاهز للاستخدام  
**الملف:** `scripts/002_accounting_data_audit_and_adjustment.sql`

