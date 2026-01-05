# 🔍 SQL INTEGRITY CHECKS - Quick Reference
# مرجع سريع لفحوصات SQL

**تاريخ الإنشاء:** 2026-01-05

---

## 📋 الاستعلامات المطلوبة (بالترتيب)

### ✅ Query #10: الملخص السريع (تم تنفيذه)
```sql
-- النتيجة:
-- Journal Entries: 297 (296 posted, 1 draft)
-- Invoices: 60 (43 posted, 0 draft)
-- Bills: 12 (8 posted, 0 draft)
-- Inventory Transactions: 186 (136 sale, 31 purchase)
```

### ⏳ Query #1: توازن القيود المحاسبية
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 15  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🔴 حرجة

```sql
-- القيود غير المتوازنة (Debit ≠ Credit)
SELECT 
  je.id,
  je.reference_type,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit,
  ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as difference
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'posted'
GROUP BY je.id, je.reference_type
HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01;
```

### ⏳ Query #2: القيود الفارغة
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 35  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🔴 حرجة

```sql
SELECT je.id, je.reference_type, je.entry_date
FROM journal_entries je
WHERE je.status = 'posted'
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel 
    WHERE jel.journal_entry_id = je.id
  );
```

### ⏳ Query #3: فواتير Sent بدون قيود
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 48  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🔴 حرجة

```sql
SELECT i.id, i.invoice_number, i.status, COUNT(je.id) as journal_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(je.id) > 0;
```

### ⏳ Query #4: فواتير Paid بدون قيود
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 63  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🔴 حرجة

```sql
SELECT i.id, i.invoice_number, i.status, i.paid_amount
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id
WHERE i.status IN ('paid', 'partially_paid')
  AND i.paid_amount > 0
GROUP BY i.id, i.invoice_number, i.status, i.paid_amount
HAVING COUNT(je.id) FILTER (WHERE je.reference_type = 'invoice') = 0;
```

### ⏳ Query #5: فواتير Draft بدون حركات مخزون
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 82  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🟡 متوسطة

```sql
SELECT i.id, i.invoice_number, i.status, COUNT(it.id) as inventory_count
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id
WHERE i.status = 'draft'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(it.id) > 0;
```

### ⏳ Query #6: فواتير Sent مع حركات مخزون
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 97  
**النتيجة المتوقعة:** 0 rows (جميع Sent لها حركات)  
**الأهمية:** 🟡 متوسطة

```sql
SELECT i.id, i.invoice_number, i.status, COUNT(it.id) as inventory_count
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id AND it.transaction_type = 'sale'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(it.id) = 0;
```

### ⏳ Query #7: Bills Received بدون قيود
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 112  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🔴 حرجة

```sql
SELECT b.id, b.bill_number, b.status, COUNT(je.id) as journal_count
FROM bills b
LEFT JOIN journal_entries je ON je.reference_id = b.id AND je.reference_type = 'bill'
WHERE b.status = 'received'
GROUP BY b.id, b.bill_number, b.status
HAVING COUNT(je.id) > 0;
```

### ⏳ Query #8: Bills Paid بدون قيود
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 127  
**النتيجة المتوقعة:** 0 rows  
**الأهمية:** 🔴 حرجة

```sql
SELECT b.id, b.bill_number, b.status, b.paid_amount
FROM bills b
LEFT JOIN journal_entries je ON je.reference_id = b.id
WHERE b.status IN ('paid', 'partially_paid')
  AND b.paid_amount > 0
GROUP BY b.id, b.bill_number, b.status, b.paid_amount
HAVING COUNT(je.id) FILTER (WHERE je.reference_type = 'bill') = 0;
```

### ⏳ Query #9: RLS Policies
**الملف:** `scripts/sql-integrity-checks.sql` - السطر 142  
**النتيجة المتوقعة:** يجب أن يكون لكل جدول RLS Policy  
**الأهمية:** 🔴 حرجة

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'bills', 'products', 'customers', 'suppliers', 'journal_entries')
ORDER BY tablename, policyname;
```

---

## 📊 جدول التقدم

| # | الاستعلام | الحالة | النتيجة | الملاحظات |
|---|-----------|--------|---------|-----------|
| 10 | الملخص السريع | ✅ | 297 JE, 60 Inv, 12 Bills | تم |
| 1 | توازن القيود | ⏳ | | |
| 2 | القيود الفارغة | ⏳ | | |
| 3 | Sent بدون قيود | ⏳ | | |
| 4 | Paid بدون قيود | ⏳ | | |
| 5 | Draft بدون مخزون | ⏳ | | |
| 6 | Sent مع مخزون | ⏳ | | |
| 7 | Bills Received | ⏳ | | |
| 8 | Bills Paid | ⏳ | | |
| 9 | RLS Policies | ⏳ | | |

---

## ⚠️ فحص إضافي: القيد Draft الوحيد

**الملف:** `scripts/check-draft-journal-entry.sql`

```sql
-- نفذ هذا الاستعلام للتحقق من القيد Draft الوحيد
SELECT 
  je.id,
  je.reference_type,
  je.entry_date,
  je.description,
  COUNT(jel.id) as lines_count
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'draft'
GROUP BY je.id, je.reference_type, je.entry_date, je.description;
```

---

## ✅ Checklist النهائي

- [ ] ✅ Query #10: الملخص السريع (تم)
- [ ] ⏳ Query #1: توازن القيود
- [ ] ⏳ Query #2: القيود الفارغة
- [ ] ⏳ Query #3: Sent بدون قيود
- [ ] ⏳ Query #4: Paid بدون قيود
- [ ] ⏳ Query #5: Draft بدون مخزون
- [ ] ⏳ Query #6: Sent مع مخزون
- [ ] ⏳ Query #7: Bills Received
- [ ] ⏳ Query #8: Bills Paid
- [ ] ⏳ Query #9: RLS Policies
- [ ] ⏳ فحص القيد Draft الوحيد

---

**آخر تحديث:** 2026-01-05

