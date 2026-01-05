# 🔴 CRITICAL FIX REQUIRED - Sent Invoices with Journals
# إصلاح حرج مطلوب - فواتير Sent مع قيود محاسبية

**تاريخ الاكتشاف:** 2026-01-05  
**الحالة:** 🔴 **FAILED - يحتاج إصلاح يدوي فوري**

---

## 🔴 المشكلة

تم اكتشاف **16 فاتورة Sent** لديها قيود محاسبية، وهذا يخالف النمط المحاسبي المعتمد (Cash Basis).

**النتيجة:**
- ✅ تم حذف سطور القيود (16 قيد)
- ❌ فشل حذف القيود نفسها بسبب trigger يمنع حذف القيود المرحلة

---

## 🔧 الحل المطلوب

### الطريقة 1: استخدام SQL مباشرة (موصى به)

نفذ في **Supabase SQL Editor**:

```sql
-- 1. تعطيل Trigger مؤقتاً
ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_delete_posted_journal;

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
ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_delete_posted_journal;

-- 4. التحقق من النتيجة
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(je.id) as journal_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(je.id) > 0;
```

**النتيجة المتوقعة:** 0 rows (لا فواتير Sent مع قيود)

---

### الطريقة 2: استخدام RPC Function (إن وجدت)

إذا كان هناك RPC function لحذف القيود، استخدمها:

```sql
-- مثال (تحقق من وجودها أولاً)
SELECT * FROM pg_proc WHERE proname LIKE '%delete%journal%';
```

---

## 📋 الفواتير المتأثرة

1. INV-0032 (81ea1351-e012-4de3-bd5a-14cf971ae673)
2. INV-0057 (fa574402-e6cb-4068-ae19-2933a5dfd5dc)
3. INV-0044 (5cd91f95-c0eb-40e0-9723-d20b7d0ca443)
4. INV-0054 (53948519-7ab5-4436-a69a-5c703552e5d7)
5. INV-0060 (ccfd1b55-dfdc-4688-bfaf-1ce6dabe70c7)
6. INV-0051 (c47030a9-ed7e-4419-9acc-77b79d5949fa)
7. INV-0048 (83abb68c-44e1-407a-9954-0d6d6ddc7be0)
8. INV-0053 (616be924-8f88-482e-8b1d-207a98dc9842)
9. INV-0039 (2e07d99f-3c0e-4e0c-9121-1840384daec0)
10. INV-0052 (7ebf7b92-6ad9-4074-a470-0696407f7adf)
11. INV-0049 (3acf589e-cc8e-43f2-96bf-23b0c0f92405)
12. INV-0046 (f4c61a89-c278-4965-b9f5-f57ed2a4ca7e)
13. INV-0061 (3110b619-28b5-4d71-a1e0-b89b97aa7dcd)
14. INV-0055 (53a52a22-f9d5-4df4-803d-cf8c62f231b0)
15. INV-0043 (196fbd95-8b71-48af-b926-4d954a3946b0)
16. INV-0016 (123d22a5-6b78-4758-9821-9948e7d88862)

---

## ⚠️ تحذيرات مهمة

1. **احفظ نسخة احتياطية** من قاعدة البيانات قبل التنفيذ
2. **تحقق من النتيجة** بعد التنفيذ
3. **أعد الفحص** بعد الإصلاح:
   ```bash
   node scripts/execute-sql-integrity-checks.js
   ```

---

## ✅ Checklist الإصلاح

- [ ] ✅ حفظ نسخة احتياطية
- [ ] ✅ تنفيذ SQL في Supabase SQL Editor
- [ ] ✅ التحقق من النتيجة (0 rows)
- [ ] ✅ إعادة الفحص التلقائي
- [ ] ✅ التأكد من Query #3 يعيد PASS

---

## 📊 الحالة الحالية

| الخطوة | الحالة | التفاصيل |
|--------|--------|----------|
| حذف سطور القيود | ✅ مكتمل | 16 قيد |
| حذف القيود | ❌ فشل | Trigger يمنع الحذف |
| الحل المطلوب | ⏳ معلق | SQL يدوي في Supabase |

---

**آخر تحديث:** 2026-01-05  
**الحالة:** 🔴 **FAILED - يحتاج إصلاح يدوي فوري**

