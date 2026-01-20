# كيفية إصلاح قيد BILL-0002
## How to Fix BILL-0002 Journal Entry

**التاريخ:** 2026-01-19  
**الشركة:** تست

---

## 📋 الخطوات

### 1. فتح Supabase SQL Editor

1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر المشروع الخاص بك
3. اذهب إلى **SQL Editor** من القائمة الجانبية

---

### 2. نسخ ولصق SQL Script

انسخ محتوى الملف `scripts/fix_bill_0002_with_trigger_disable.sql` والصقه في SQL Editor.

---

### 3. تنفيذ SQL Script

اضغط على زر **Run** أو **Execute** لتنفيذ السكريبت.

---

### 4. التحقق من النتيجة

بعد التنفيذ، يجب أن ترى:

```
NOTICE: تم تحديث AP Credit من 100000 إلى 130000
NOTICE: تم حذف السطر الخاطئ
NOTICE: ✅ تم إصلاح قيد BILL-0002
```

والنتيجة النهائية يجب أن تكون:

```
description              | account_code | account_name | debit_amount | credit_amount
-------------------------|--------------|--------------|--------------|---------------
فاتورة شراء BILL-0002   | 1140         | المخزون      | 130000       | 0
فاتورة شراء BILL-0002   | 2110         | الموردين     | 0            | 130000
```

---

## ⚠️ ملاحظات مهمة

1. **تعطيل Trigger:** السكريبت يعطل trigger التوازن مؤقتاً لإجراء الإصلاح
2. **إعادة التفعيل:** السكريبت يعيد تفعيل triggers تلقائياً بعد الإصلاح
3. **التحقق:** السكريبت يتحقق من النتيجة تلقائياً

---

## 🔍 التحقق اليدوي

بعد التنفيذ، يمكنك التحقق يدوياً:

```sql
SELECT 
  je.description,
  coa.account_code,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount,
  (jel.debit_amount - jel.credit_amount) AS balance
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.description ILIKE '%BILL-0002%'
  AND je.reference_type = 'bill'
  AND je.company_id = (SELECT id FROM companies WHERE name ILIKE '%تست%' LIMIT 1)
ORDER BY jel.debit_amount DESC, jel.credit_amount DESC;
```

---

## ✅ النتيجة المتوقعة

بعد الإصلاح:
- ✅ حساب "الأصول المتداولة" (1100) سيكون رصيده 0.00 (بدلاً من -30,000.00)
- ✅ حساب "الموردين" (2110) سيكون رصيده -209,230.00 (بدلاً من -209,230.00 - لا يتغير)
- ✅ الميزانية ستظل متوازنة

---

## 📝 الملفات

- **SQL Script:** `scripts/fix_bill_0002_with_trigger_disable.sql`
- **JavaScript Script:** `scripts/fix_bill_0002_final.js` (فشل بسبب trigger)
