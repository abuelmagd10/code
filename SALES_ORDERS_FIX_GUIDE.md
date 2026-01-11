# 🔧 حل مشكلة عدم ظهور أوامر البيع للمستخدمين

## 📋 تشخيص المشكلة

المشكلة الرئيسية: **نظام الحوكمة (ERP Governance) صارم جداً** ويطبق فلاتر معقدة تمنع ظهور أوامر البيع للمستخدمين.

### الأسباب المحتملة:
1. **بيانات ناقصة**: أوامر البيع بدون `branch_id` أو `cost_center_id` أو `warehouse_id`
2. **مستخدمون بدون سياق حوكمة**: المستخدمون لا يملكون `branch_id` في جدول `company_members`
3. **فلاتر صارمة**: نظام الحوكمة يطبق فلاتر معقدة جداً

## 🚀 الحلول السريعة

### الحل الأول: الإصلاح السريع (مؤقت)
```bash
# تطبيق إصلاح مؤقت لتبسيط نظام الحوكمة
node apply-quick-fix.js

# إعادة تشغيل الخادم
npm run dev
```

### الحل الثاني: إصلاح البيانات
```bash
# تشغيل سكريپت إصلاح البيانات
node fix-sales-orders-visibility.js
```

### الحل الثالث: إصلاح قاعدة البيانات مباشرة
```sql
-- تشغيل في Supabase SQL Editor
\i fix-sales-orders-visibility.sql
```

## 🔍 التحقق من المشكلة

### 1. فحص سياق المستخدم
```sql
SELECT 
    cm.user_id,
    cm.role,
    cm.branch_id,
    cm.cost_center_id,
    cm.warehouse_id,
    up.display_name
FROM company_members cm
LEFT JOIN user_profiles up ON cm.user_id = up.user_id
WHERE cm.company_id = 'YOUR_COMPANY_ID';
```

### 2. فحص أوامر البيع
```sql
SELECT 
    so.id,
    so.so_number,
    so.branch_id,
    so.cost_center_id,
    so.warehouse_id,
    so.created_by_user_id
FROM sales_orders so
WHERE so.company_id = 'YOUR_COMPANY_ID'
ORDER BY so.created_at DESC
LIMIT 10;
```

### 3. فحص الفروع والمخازن
```sql
-- فحص الفروع
SELECT * FROM branches WHERE company_id = 'YOUR_COMPANY_ID';

-- فحص مراكز التكلفة
SELECT * FROM cost_centers WHERE company_id = 'YOUR_COMPANY_ID';

-- فحص المخازن
SELECT * FROM warehouses WHERE company_id = 'YOUR_COMPANY_ID';
```

## 🛠 الإصلاح الكامل

### الخطوة 1: إنشاء البنية الأساسية
```sql
-- إنشاء فرع افتراضي
INSERT INTO branches (company_id, name, address, is_active)
VALUES ('YOUR_COMPANY_ID', 'الفرع الرئيسي', 'العنوان الرئيسي', true);

-- إنشاء مركز تكلفة افتراضي
INSERT INTO cost_centers (company_id, branch_id, name, description, is_active)
SELECT 
    'YOUR_COMPANY_ID',
    b.id,
    'مركز التكلفة الرئيسي',
    'مركز التكلفة الافتراضي',
    true
FROM branches b
WHERE b.company_id = 'YOUR_COMPANY_ID'
LIMIT 1;

-- إنشاء مخزن افتراضي
INSERT INTO warehouses (company_id, branch_id, name, location, is_main, is_active)
SELECT 
    'YOUR_COMPANY_ID',
    b.id,
    'المخزن الرئيسي',
    'الموقع الافتراضي',
    true,
    true
FROM branches b
WHERE b.company_id = 'YOUR_COMPANY_ID'
LIMIT 1;
```

### الخطوة 2: تحديث البيانات القديمة
```sql
-- تحديث أعضاء الشركة
UPDATE company_members 
SET 
    branch_id = (SELECT id FROM branches WHERE company_id = company_members.company_id LIMIT 1),
    cost_center_id = (SELECT id FROM cost_centers WHERE company_id = company_members.company_id LIMIT 1),
    warehouse_id = (SELECT id FROM warehouses WHERE company_id = company_members.company_id AND is_main = true LIMIT 1)
WHERE company_id = 'YOUR_COMPANY_ID'
  AND (branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL);

-- تحديث أوامر البيع
UPDATE sales_orders 
SET 
    branch_id = (SELECT id FROM branches WHERE company_id = sales_orders.company_id LIMIT 1),
    cost_center_id = (SELECT id FROM cost_centers WHERE company_id = sales_orders.company_id LIMIT 1),
    warehouse_id = (SELECT id FROM warehouses WHERE company_id = sales_orders.company_id AND is_main = true LIMIT 1)
WHERE company_id = 'YOUR_COMPANY_ID'
  AND (branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL);
```

### الخطوة 3: استعادة نظام الحوكمة الكامل
```bash
# استعادة ملف الحوكمة الأصلي
cp lib/data-visibility-control-backup.ts lib/data-visibility-control.ts

# إعادة تشغيل الخادم
npm run dev
```

## 🎯 التحقق من النجاح

### 1. تسجيل الدخول مرة أخرى
### 2. الانتقال إلى صفحة أوامر البيع
### 3. التحقق من ظهور الأوامر
### 4. إنشاء أمر بيع جديد للاختبار

## ⚠️ ملاحظات مهمة

1. **الإصلاح السريع مؤقت**: يجب تطبيق الإصلاح الكامل لاحقاً
2. **النسخ الاحتياطية**: تم إنشاء نسخة احتياطية من ملف الحوكمة
3. **اختبار شامل**: تأكد من اختبار جميع الوظائف بعد الإصلاح
4. **المراقبة**: راقب الأداء والأخطاء بعد التطبيق

## 🆘 في حالة المشاكل

### إذا لم تظهر الأوامر بعد الإصلاح:
1. تحقق من دور المستخدم في `company_members`
2. تحقق من وجود `company_id` صحيح
3. تحقق من صلاحيات قاعدة البيانات
4. راجع سجلات الأخطاء في المتصفح

### إذا ظهرت أخطاء:
1. استعد النسخة الاحتياطية
2. أعد تشغيل الخادم
3. تحقق من صحة البيانات في قاعدة البيانات

## 📞 الدعم

إذا استمرت المشكلة، يرجى:
1. تصدير سجلات الأخطاء
2. تصدير نموذج من البيانات
3. التواصل مع فريق الدعم الفني