# 🔧 تعليمات الإصلاح - فواتير Sent مع قيود
# Fix Instructions - Sent Invoices with Journals

**تاريخ:** 2026-01-05  
**الحالة:** 🔴 **FAILED - يحتاج إصلاح فوري**

---

## 📋 المشكلة

تم اكتشاف **16 فاتورة Sent** لديها قيود محاسبية، وهذا يخالف النمط المحاسبي (Cash Basis).

---

## 🔧 الحل

### الخطوة 1: افتح Supabase SQL Editor

1. اذهب إلى Supabase Dashboard
2. افتح SQL Editor
3. انسخ محتوى `scripts/fix-sent-invoices-direct.sql`

### الخطوة 2: نفذ السكربت الكامل

انسخ والصق هذا السكربت في SQL Editor:

```sql
-- 1. تعطيل Trigger مؤقتاً
ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;

-- 2. حذف القيود
DELETE FROM journal_entries
WHERE id IN (
  SELECT je.id
  FROM journal_entries je
  INNER JOIN invoices i ON i.id = je.reference_id
  WHERE je.reference_type = 'invoice'
    AND i.status = 'sent'
);

-- 3. إعادة تفعيل Trigger
ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
```

### الخطوة 3: التحقق من النتيجة

نفذ هذا الاستعلام:

```sql
SELECT 
  i.invoice_number,
  i.status,
  COUNT(je.id) as journal_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.invoice_number, i.status
HAVING COUNT(je.id) > 0;
```

**النتيجة المتوقعة:** 0 rows

### الخطوة 4: إعادة الفحص

بعد التنفيذ، نفذ:

```bash
node scripts/execute-sql-integrity-checks.js
```

**النتيجة المتوقعة:** Query #3 يجب أن يعيد PASS

---

## ⚠️ ملاحظات مهمة

1. **احفظ نسخة احتياطية** قبل التنفيذ (إن أمكن)
2. **تحقق من النتيجة** بعد التنفيذ
3. **أعد الفحص** للتأكد من الإصلاح
4. **الـ trigger:** `trg_prevent_posted_journal_modification` - يجب تعطيله مؤقتاً

---

## 📁 الملفات المرجعية

- `scripts/fix-sent-invoices-direct.sql` - السكربت الكامل (موصى به)
- `scripts/fix-sent-invoices-simple.sql` - نسخة مع التحقق
- `CRITICAL_FIX_REQUIRED.md` - تفاصيل المشكلة

---

**آخر تحديث:** 2026-01-05
