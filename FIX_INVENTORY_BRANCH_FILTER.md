# 🔧 إصلاح فلترة المخزون حسب الفرع للمحاسب

## المشكلة
المحاسب ما زال يرى إجمالي المخزون في الشركة بدلاً من مخزون فرعه فقط.

## الأسباب المحتملة

### 1. السجلات القديمة بدون `branch_id`
السجلات القديمة في `inventory_transactions` قد لا تحتوي على `branch_id` أو `warehouse_id` لأنها تم إنشاؤها قبل تفعيل الـ triggers.

### 2. خطأ React #418 (Hydration Error)
قد يمنع هذا الخطأ التحميل الصحيح للبيانات.

## الحلول المطبقة

### ✅ 1. تحسين فلترة المخزون
- تم إضافة فلترة حسب `branch_id` و `warehouse_id` في 3 أماكن:
  - `app/inventory/page.tsx`
  - `components/DashboardInventoryStats.tsx`
  - `app/api/dashboard-stats/route.ts`

### ✅ 2. استخدام المخازن في الفرع
- يتم جلب جميع المخازن في فرع المستخدم
- الفلترة تتم على `branch_id` أو `warehouse_id` في فرع المستخدم

### ✅ 3. Script SQL لإصلاح السجلات القديمة
تم إنشاء `scripts/fix_missing_branch_ids_inventory.sql` لإصلاح السجلات القديمة.

## الخطوات المطلوبة

### الخطوة 1: تشغيل Script SQL لإصلاح السجلات القديمة

1. افتح Supabase SQL Editor
2. قم بنسخ محتوى `scripts/fix_missing_branch_ids_inventory.sql`
3. قم بتشغيله

هذا السكريبت سيقوم بـ:
- تحديث حركات المخزون المرتبطة بالفواتير (sales) من `invoices`
- تحديث حركات المخزون المرتبطة بالفواتير المشتراة (purchases) من `bills`
- تحديث السجلات المتبقية باستخدام الفرع الرئيسي والمخزن الرئيسي كقيمة افتراضية

### الخطوة 2: التحقق من النتائج

بعد تشغيل السكريبت، تحقق من النتائج:
```sql
SELECT 
  COUNT(*) as total_records,
  COUNT(branch_id) as records_with_branch,
  COUNT(warehouse_id) as records_with_warehouse,
  COUNT(*) - COUNT(branch_id) as missing_branch,
  COUNT(*) - COUNT(warehouse_id) as missing_warehouse
FROM inventory_transactions;
```

يجب أن تكون `missing_branch` و `missing_warehouse` = 0

### الخطوة 3: اختبار النظام

1. سجل الدخول بحساب محاسب
2. تأكد من أن المحاسب لديه `branch_id` محدد في `company_members`
3. افتح صفحة المخزون
4. تحقق من أن المخزون المعروض هو فقط لفرع المحاسب

## إذا استمرت المشكلة

### 1. التحقق من أن المحاسب لديه `branch_id`

```sql
SELECT 
  cm.user_id,
  cm.role,
  cm.branch_id,
  b.name as branch_name
FROM company_members cm
LEFT JOIN branches b ON b.id = cm.branch_id
WHERE cm.role = 'accountant';
```

### 2. التحقق من أن السجلات تحتوي على `branch_id`

```sql
SELECT 
  COUNT(*) as total,
  COUNT(branch_id) as with_branch,
  COUNT(*) - COUNT(branch_id) as without_branch
FROM inventory_transactions
WHERE company_id = 'YOUR_COMPANY_ID';
```

### 3. التحقق من الـ Trigger

```sql
SELECT 
  tgname as trigger_name,
  tgtype::text as trigger_type
FROM pg_trigger
WHERE tgname = 'trg_inherit_branch_warehouse_inventory';
```

يجب أن يكون الـ trigger موجوداً.

### 4. اختبار الـ Trigger

```sql
-- إنشاء سجل تجريبي
INSERT INTO inventory_transactions (
  company_id,
  product_id,
  transaction_type,
  quantity_change,
  reference_id
) VALUES (
  'YOUR_COMPANY_ID',
  'YOUR_PRODUCT_ID',
  'sale',
  1,
  'YOUR_INVOICE_ID'
);

-- التحقق من أن branch_id تم تعيينه
SELECT branch_id, warehouse_id 
FROM inventory_transactions 
ORDER BY created_at DESC 
LIMIT 1;
```

## ملاحظات مهمة

1. **السجلات القديمة:** يجب تشغيل script SQL لإصلاح السجلات القديمة قبل أن تعمل الفلترة بشكل صحيح.

2. **Trigger:** تأكد من أن الـ trigger `trg_inherit_branch_warehouse_inventory` موجود ويعمل بشكل صحيح.

3. **الفرع الرئيسي:** إذا كانت الفاتورة/الفاتورة المشتراة لا تحتوي على `branch_id`، سيتم استخدام الفرع الرئيسي كقيمة افتراضية.

4. **خطأ React #418:** هذا الخطأ قد يكون مرتبطاً بمشكلة hydration. تأكد من إعادة تحميل الصفحة بعد تطبيق التغييرات.

## الملفات المعدلة

1. `app/inventory/page.tsx` - فلترة حسب الفرع والمخزن
2. `components/DashboardInventoryStats.tsx` - فلترة حسب الفرع والمخزن
3. `app/api/dashboard-stats/route.ts` - فلترة حسب الفرع والمخزن
4. `scripts/fix_missing_branch_ids_inventory.sql` - script لإصلاح السجلات القديمة

## Commit Details

- `338d7e5` - fix: تصحيح صيغة .or() في فلترة المخزون للمحاسب
- `23c07e9` - fix: تصحيح صيغة .or() في فلترة المخزون وإضافة script لإصلاح السجلات القديمة
