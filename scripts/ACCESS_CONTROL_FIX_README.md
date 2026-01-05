# إصلاح مشكلة التحكم بالوصول للموردين والعملاء

## المشكلة
عند محاولة جلب الموردين أو العملاء، يظهر خطأ 400 Bad Request:
```
GET .../rest/v1/suppliers?...&created_by_user_id=eq.xxx&branch_id=eq.xxx 400 (Bad Request)
```

السبب: جداول `suppliers` و `customers` لا تحتوي على حقول التحكم بالوصول المطلوبة.

## الحل

### الطريقة 1: عبر Supabase Dashboard (موصى بها)

1. افتح Supabase Dashboard
2. اذهب إلى **SQL Editor**
3. انسخ محتوى الملف `scripts/132_combined_access_control.sql`
4. الصق المحتوى في SQL Editor
5. اضغط **Run**

### الطريقة 2: عبر Supabase CLI

```bash
supabase db push --file scripts/132_combined_access_control.sql
```

### الطريقة 3: عبر Migration

```bash
# إنشاء migration جديد
supabase migration new add_access_control_fields

# نسخ محتوى scripts/132_combined_access_control.sql إلى ملف migration الجديد

# تطبيق migration
supabase db push
```

## التغييرات المطبقة

### جدول suppliers
- ✅ `created_by_user_id` - المستخدم الذي أنشأ المورد
- ✅ `branch_id` - الفرع المرتبط
- ✅ `cost_center_id` - مركز التكلفة المرتبط
- ✅ `warehouse_id` - المستودع المرتبط

### جدول customers
- ✅ `created_by_user_id` - المستخدم الذي أنشأ العميل
- ✅ `branch_id` - الفرع المرتبط
- ✅ `cost_center_id` - مركز التكلفة المرتبط
- ✅ `warehouse_id` - المستودع المرتبط

### Indexes
- ✅ Indexes على جميع الحقول الجديدة لتحسين الأداء

## التحقق من التطبيق

بعد تطبيق التغييرات، تحقق من أن الحقول موجودة:

```sql
-- التحقق من suppliers
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'suppliers' 
AND column_name IN ('created_by_user_id', 'branch_id', 'cost_center_id', 'warehouse_id');

-- التحقق من customers
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customers' 
AND column_name IN ('created_by_user_id', 'branch_id', 'cost_center_id', 'warehouse_id');
```

## ملاحظات

- الحقول الجديدة nullable (يمكن أن تكون NULL)
- الموردين/العملاء الحاليين سيكون لديهم NULL في هذه الحقول
- يمكن تعيين قيم افتراضية للموردين/العملاء الحاليين إذا لزم الأمر

## تعيين قيم افتراضية (اختياري)

إذا كنت تريد تعيين جميع الموردين/العملاء الحاليين لمالك الشركة:

```sql
-- تعيين المنشئ للموردين الحاليين
UPDATE suppliers s
SET created_by_user_id = c.user_id
FROM companies c
WHERE s.company_id = c.id
AND s.created_by_user_id IS NULL;

-- تعيين المنشئ للعملاء الحاليين
UPDATE customers cu
SET created_by_user_id = co.user_id
FROM companies co
WHERE cu.company_id = co.id
AND cu.created_by_user_id IS NULL;
```

