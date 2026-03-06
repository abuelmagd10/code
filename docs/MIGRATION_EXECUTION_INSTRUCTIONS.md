# 📋 تعليمات تنفيذ Migration: إضافة Customer Snapshot

## 🎯 الهدف
إضافة حقول Snapshot لحفظ نسخة من بيانات العميل في الفواتير.

---

## 📝 خطوات التنفيذ

### 1️⃣ فتح Supabase SQL Editor

1. افتح [Supabase Dashboard](https://app.supabase.com)
2. اختر المشروع الخاص بك
3. اذهب إلى **SQL Editor** من القائمة الجانبية

### 2️⃣ نسخ محتوى Migration Script

افتح الملف:
```
scripts/XXX_add_customer_snapshot_to_invoices.sql
```

انسخ **جميع** محتويات الملف.

### 3️⃣ تنفيذ Migration

1. في Supabase SQL Editor، الصق المحتوى
2. اضغط **Run** أو `Ctrl+Enter`
3. انتظر اكتمال التنفيذ

### 4️⃣ التحقق من النتائج

بعد التنفيذ، يجب أن ترى رسائل مثل:
```
✅ إجمالي الفواتير: X
✅ الفواتير التي تحتوي على Snapshot: Y
✅ النسبة: Z%
```

---

## ✅ التحقق اليدوي

بعد التنفيذ، يمكنك التحقق يدوياً:

```sql
-- التحقق من وجود الحقول
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invoices' 
  AND column_name LIKE 'customer_%_snapshot'
ORDER BY column_name;

-- التحقق من عدد الفواتير التي تحتوي على Snapshot
SELECT 
  COUNT(*) as total_invoices,
  COUNT(customer_name_snapshot) as with_snapshot,
  ROUND(COUNT(customer_name_snapshot)::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as percentage
FROM invoices;
```

---

## ⚠️ ملاحظات مهمة

1. **Backup:**
   - يُنصح بعمل backup قبل التنفيذ (خاصة في Production)

2. **الوقت المتوقع:**
   - إضافة الحقول: سريع (ثواني)
   - Backfill للفواتير الموجودة: يعتمد على عدد الفواتير
   - قد يستغرق دقائق إذا كان لديك آلاف الفواتير

3. **التوافق:**
   - ✅ آمن للفواتير الموجودة
   - ✅ لا يؤثر على البيانات الحالية
   - ✅ يعمل مع جميع الحالات (draft, sent, paid, etc.)

---

## 🔍 في حالة حدوث خطأ

### خطأ: "permission denied"
- تأكد من أنك تستخدم حساب Admin
- أو استخدم Service Role Key

### خطأ: "column already exists"
- هذا يعني أن الحقول موجودة بالفعل
- يمكنك تخطي الجزء الأول من Migration

### خطأ: "session_replication_role"
- تأكد من أن PostgreSQL version >= 9.1
- Supabase يدعم هذه الميزة

---

## 📞 الدعم

إذا واجهت أي مشاكل، تحقق من:
1. رسائل الخطأ في SQL Editor
2. Logs في Supabase Dashboard
3. تأكد من أن جميع الحقول تم إضافتها بنجاح

---

**تاريخ الإنشاء:** 2024  
**الحالة:** ✅ جاهز للتنفيذ
