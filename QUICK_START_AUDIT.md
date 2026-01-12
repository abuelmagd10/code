# ⚡ Quick Start - دليل التنفيذ السريع

## 🎯 الهدف
التحقق الفوري من التزام النظام بالقواعد المحاسبية والحوكمة.

---

## 🚀 التنفيذ في 5 دقائق

### 1️⃣ تشغيل السكريبت (دقيقة واحدة)
```powershell
.\run-compliance-audit.ps1
```

### 2️⃣ تنفيذ الاستعلامات الحرجة (3 دقائق)

افتح **Supabase Dashboard** > **SQL Editor** ونفذ:

#### ✅ Query 1: فواتير Draft بحركات مخزون
```sql
SELECT COUNT(*) as violations
FROM invoices i
INNER JOIN inventory_transactions it ON it.reference_id = i.id::text
WHERE i.status = 'draft';
```
**المتوقع**: 0

#### ✅ Query 2: فواتير Sent بقيود محاسبية
```sql
SELECT COUNT(*) as violations
FROM invoices i
INNER JOIN journal_entries je ON je.reference_id = i.id::text
WHERE i.status = 'sent' AND je.reference_type = 'invoice';
```
**المتوقع**: 0

#### ✅ Query 3: قيود بدون دفعات
```sql
SELECT COUNT(*) as violations
FROM journal_entries je
INNER JOIN invoices i ON i.id::text = je.reference_id
WHERE je.reference_type = 'invoice'
  AND i.status = 'sent'
  AND COALESCE(i.paid_amount, 0) = 0;
```
**المتوقع**: 0

#### ✅ Query 4: فواتير بدون حوكمة
```sql
SELECT COUNT(*) as violations
FROM invoices
WHERE company_id IS NULL
   OR branch_id IS NULL
   OR warehouse_id IS NULL
   OR created_by_user_id IS NULL;
```
**المتوقع**: 0

#### ✅ Query 5: ازدواج المخزون
```sql
SELECT COUNT(*) as violations
FROM (
  SELECT so.id
  FROM sales_orders so
  INNER JOIN invoices i ON i.sales_order_id = so.id
  WHERE so.status != 'draft' AND i.status != 'draft'
    AND EXISTS (SELECT 1 FROM inventory_transactions WHERE reference_id = so.id::text)
    AND EXISTS (SELECT 1 FROM inventory_transactions WHERE reference_id = i.id::text)
) sub;
```
**المتوقع**: 0

### 3️⃣ تقييم النتائج (دقيقة واحدة)

| الاستعلام | النتيجة | الحالة |
|-----------|---------|--------|
| Query 1 | _____ | ⬜ Pass / ⬜ Fail |
| Query 2 | _____ | ⬜ Pass / ⬜ Fail |
| Query 3 | _____ | ⬜ Pass / ⬜ Fail |
| Query 4 | _____ | ⬜ Pass / ⬜ Fail |
| Query 5 | _____ | ⬜ Pass / ⬜ Fail |

---

## 🚨 إذا كانت أي نتيجة > 0

### الإجراء الفوري:
1. 🔴 **لا تنشر النظام في الإنتاج**
2. 📋 افتح `ERP_COMPLIANCE_AUDIT.md` للتفاصيل
3. 🔧 ابدأ بإصلاح الانتهاكات الحرجة
4. ✅ أعد التدقيق بعد الإصلاح

---

## ✅ إذا كانت جميع النتائج = 0

### الخطوات التالية:
1. ✅ املأ `COMPLIANCE_CHECKLIST.md`
2. ✅ نفذ الاختبارات الشاملة (E2E)
3. ✅ وثق النتائج النهائية
4. ✅ احصل على موافقة المراجع

---

## 📊 الحالة السريعة

```
🔴 انتهاكات حرجة: _____
🟡 انتهاكات عالية: _____
🟢 انتهاكات متوسطة: _____

الحالة العامة: ⬜ ملتزم / ⬜ يحتاج إصلاح / ⬜ حرج
```

---

## 📞 المساعدة السريعة

- **التفاصيل الكاملة**: `ERP_COMPLIANCE_AUDIT.md`
- **قائمة التحقق**: `COMPLIANCE_CHECKLIST.md`
- **الاستعلامات الكاملة**: `compliance-audit-queries.sql`
- **دليل الاستخدام**: `README_COMPLIANCE.md`

---

**⏱️ الوقت المتوقع**: 5 دقائق  
**🎯 الهدف**: تحديد الانتهاكات الحرجة فوراً  
**⚠️ تحذير**: أي نتيجة > 0 تعني Bug خطير يجب إصلاحه فوراً
