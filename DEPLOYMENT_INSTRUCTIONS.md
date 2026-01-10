# 🚀 تعليمات تطبيق قاعدة حوكمة الإهلاك

## 📋 المطلوب

لتطبيق قاعدة حوكمة الإهلاك بشكل كامل، يجب تطبيق SQL script على قاعدة البيانات.

## ⚠️ تحذير مهم

**قبل التطبيق، تأكد من:**
- عمل backup كامل لقاعدة البيانات
- أنك على بيئة التطوير أو أن لديك صلاحيات DBA
- أن SQL script لن يؤثر على البيانات الموجودة

## 📝 خطوات التطبيق

### 1. الاتصال بقاعدة البيانات

```bash
# باستخدام psql
psql -h your-supabase-host -U postgres -d postgres

# أو من Supabase Dashboard
# SQL Editor > New Query
```

### 2. تطبيق SQL Script

قم بتشغيل الملف التالي على قاعدة البيانات:

```sql
-- الملف: scripts/042_write_off_governance_validation.sql
```

يمكنك نسخ محتوى الملف وتشغيله مباشرة في SQL Editor.

### 3. التحقق من التطبيق

بعد التطبيق، تحقق من:

```sql
-- التحقق من وجود الدالة
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_available_inventory_quantity';

-- التحقق من وجود Triggers
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE '%write_off%';

-- التحقق من وجود Indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE '%inventory_tx%';
```

## ✅ ما يتم إنشاؤه

1. **دالة `get_available_inventory_quantity`**: لحساب الرصيد المتاح
2. **دالة `approve_write_off` محدثة**: للتحقق من الرصيد قبل الاعتماد
3. **Trigger `trg_validate_write_off_items`**: للتحقق قبل Insert/Update
4. **Trigger `trg_validate_write_off_approval`**: للتحقق عند الاعتماد
5. **Indexes**: لتحسين الأداء

## 🔄 Fallback Mechanism

**حالياً:** الكود يعمل مع fallback mechanism:
- إذا لم تكن RPC function موجودة، يتم الحساب مباشرة من `inventory_transactions`
- التحقق في UI و API يعمل بدون SQL triggers
- **لكن التحقق في Database layer غير موجود**

**بعد تطبيق SQL:**
- ✅ التحقق في 3 طبقات: UI + API + Database
- ✅ منع تام لأي تجاوز
- ✅ أداء أفضل (باستخدام RPC function)

## 🐛 استكشاف الأخطاء

### خطأ 404 عند استدعاء RPC function

```
POST /rest/v1/rpc/get_available_inventory_quantity 404 (Not Found)
```

**الحل:** تطبيق SQL script المذكور أعلاه.

### خطأ في Trigger

```
ERROR: function validate_write_off_items() does not exist
```

**الحل:** تأكد من تطبيق جميع الدوال في SQL script.

### خطأ في Permissions

```
ERROR: permission denied for function get_available_inventory_quantity
```

**الحل:** تأكد من أن المستخدم لديه صلاحيات SECURITY DEFINER أو أن الدالة public.

## 📞 الدعم

إذا واجهت أي مشاكل:
1. تحقق من logs في Supabase Dashboard
2. تحقق من أن جميع الدوال موجودة
3. تأكد من تطبيق SQL script بشكل كامل
