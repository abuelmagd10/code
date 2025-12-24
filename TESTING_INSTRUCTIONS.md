# 🧪 تعليمات الاختبار: Audit واقتراحات قيود التسوية

## ⚠️ مهم: هذا للاختبار فقط - لا تعديلات على البيانات

---

## 📋 الخطوات المطلوبة

### الخطوة 1: تطبيق Migration الأساسي

قبل الاختبار، تأكد من تطبيق Migration الأساسي:

```bash
# تطبيق Migration الأساسي (Functions فقط)
psql -U postgres -d your_database -f scripts/002_accounting_data_audit_and_adjustment.sql
```

---

### الخطوة 2: الحصول على Company ID

```sql
-- عرض قائمة الشركات المتاحة
SELECT 
  id as company_id,
  name as company_name,
  created_at
FROM companies
ORDER BY created_at DESC
LIMIT 10;
```

**انسخ `company_id` من النتيجة**

---

### الخطوة 3: تنفيذ Audit (قراءة فقط)

```sql
-- استبدل 'YOUR_COMPANY_ID' بـ UUID الشركة الفعلية
SELECT * 
FROM audit_company_accounting_data(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
)
ORDER BY audit_category, ABS(difference) DESC;
```

**احفظ النتائج للمراجعة**

---

### الخطوة 4: ملخص Audit

```sql
SELECT 
  audit_category,
  COUNT(*) as issues_count,
  SUM(ABS(difference)) as total_difference,
  MIN(difference) as min_difference,
  MAX(difference) as max_difference
FROM audit_company_accounting_data(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
)
GROUP BY audit_category
ORDER BY total_difference DESC;
```

---

### الخطوة 5: اقتراحات قيود التسوية (قراءة فقط)

```sql
-- استبدل 'YOUR_COMPANY_ID' بـ UUID الشركة الفعلية
SELECT * 
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
)
WHERE debit_amount > 0.01 OR credit_amount > 0.01
ORDER BY adjustment_type, debit_amount DESC, credit_amount DESC;
```

**احفظ النتائج للمراجعة**

---

### الخطوة 6: ملخص اقتراحات قيود التسوية

```sql
SELECT 
  adjustment_type,
  COUNT(*) as entries_count,
  SUM(debit_amount) as total_debit,
  SUM(credit_amount) as total_credit,
  ABS(SUM(debit_amount) - SUM(credit_amount)) as imbalance
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
)
WHERE debit_amount > 0.01 OR credit_amount > 0.01
GROUP BY adjustment_type
ORDER BY total_debit DESC, total_credit DESC;
```

---

### الخطوة 7: التحقق من التوازن

```sql
SELECT 
  'Total Debit' as item,
  SUM(debit_amount) as amount
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
)
WHERE debit_amount > 0.01

UNION ALL

SELECT 
  'Total Credit' as item,
  SUM(credit_amount) as amount
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
)
WHERE credit_amount > 0.01

UNION ALL

SELECT 
  'Difference' as item,
  ABS(SUM(debit_amount) - SUM(credit_amount)) as amount
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل هنا
  CURRENT_DATE
);
```

**يجب أن يكون Difference = 0 أو قريب جداً من 0**

---

## ✅ التأكيدات المطلوبة

بعد تنفيذ جميع الاختبارات، تأكد من:

- [ ] ✅ Audit تم تنفيذه بنجاح
- [ ] ✅ اقتراحات قيود التسوية تم عرضها
- [ ] ✅ لا قيود فعلية تم إنشاؤها
- [ ] ✅ لا UPDATE/DELETE تم تنفيذه
- [ ] ✅ جميع النتائج محفوظة للمراجعة

---

## 📝 ملاحظات مهمة

1. **هذه الاختبارات للقراءة فقط** - لا تعدل أي بيانات
2. **احفظ جميع النتائج** للمراجعة قبل إنشاء قيود التسوية الفعلية
3. **راجع النتائج بعناية** قبل المتابعة
4. **لا تنفذ `create_adjustment_entries()`** حتى الآن

---

## 🚀 بعد الانتهاء من الاختبارات

1. راجع جميع النتائج
2. تأكد من فهم جميع الفروقات
3. قرر ما إذا كنت تريد إنشاء قيود التسوية الفعلية
4. إذا قررت المتابعة، استخدم `create_adjustment_entries()` في وقت لاحق

---

**تم إعداد التعليمات بواسطة:** AI Assistant  
**الحالة:** جاهز للاختبار

