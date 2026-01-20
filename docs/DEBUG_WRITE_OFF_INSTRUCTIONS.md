# 🔍 تعليمات تشخيص مشكلة الرصيد المتاح في الإهلاك

## المشكلة
الرسالة: "لا يمكن إهلاك المخزون بدون رصيد فعلي" رغم وجود المنتج في المخزن

## خطوات التشخيص

### 1. تشغيل دالة التشخيص في SQL

قم بتشغيل الدالة التالية في Supabase SQL Editor بعد استبدال القيم:

```sql
SELECT * FROM debug_available_inventory_quantity(
  'COMPANY_ID'::UUID,          -- استبدل بـ company_id الفعلي
  NULL::UUID,                  -- أو branch_id إذا كان معروفاً
  'WAREHOUSE_ID'::UUID,        -- استبدل بـ warehouse_id من رسالة الخطأ
  NULL::UUID,                  -- أو cost_center_id إذا كان معروفاً
  'PRODUCT_ID'::UUID           -- استبدل بـ product_id للمنتج
);
```

### 2. فحص النتائج

الدالة ستعرض:
- **Input Parameters**: المعاملات المدخلة
- **Warehouse Lookup**: branch_id المرتبط بـ warehouse
- **Branch Lookup**: default_cost_center_id المرتبط بـ branch
- **Final Values**: القيم النهائية المستخدمة في الحساب
- **Transaction Count**: عدد الـ transactions المطابقة
- **Calculated Balance**: الرصيد المحسوب
- **Product Info**: quantity_on_hand من جدول products
- **Sample Transactions**: عينة من آخر 10 transactions للمنتج
- **Final Result**: النتيجة النهائية

### 3. التحقق من المشاكل المحتملة

#### أ) هل warehouse_id مرتبط بـ branch_id؟
```sql
SELECT id, name, branch_id 
FROM warehouses 
WHERE id = 'WAREHOUSE_ID'::UUID;
```

إذا كان `branch_id` NULL، هذه هي المشكلة!

#### ب) هل branch له default_cost_center_id؟
```sql
SELECT id, name, default_cost_center_id 
FROM branches 
WHERE id = 'BRANCH_ID'::UUID;
```

إذا كان `default_cost_center_id` NULL، هذه هي المشكلة!

#### ج) هل توجد transactions للمنتج في هذا المخزن؟
```sql
SELECT 
  COUNT(*) as transaction_count,
  SUM(quantity_change) as total_quantity,
  warehouse_id,
  branch_id,
  cost_center_id
FROM inventory_transactions
WHERE company_id = 'COMPANY_ID'::UUID
  AND product_id = 'PRODUCT_ID'::UUID
  AND warehouse_id = 'WAREHOUSE_ID'::UUID
  AND (is_deleted IS NULL OR is_deleted = false)
GROUP BY warehouse_id, branch_id, cost_center_id;
```

#### د) ما هو cost_center_id المستخدم في transactions الموجودة؟
```sql
SELECT DISTINCT 
  warehouse_id,
  branch_id,
  cost_center_id,
  SUM(quantity_change) OVER (PARTITION BY warehouse_id, branch_id, cost_center_id) as balance
FROM inventory_transactions
WHERE company_id = 'COMPANY_ID'::UUID
  AND product_id = 'PRODUCT_ID'::UUID
  AND warehouse_id = 'WAREHOUSE_ID'::UUID
  AND (is_deleted IS NULL OR is_deleted = false)
ORDER BY warehouse_id, branch_id, cost_center_id;
```

### 4. المشاكل الشائعة والحلول

#### المشكلة 1: transactions موجودة لكن cost_center_id مختلف
**السبب**: الـ transactions سُجّلت بـ cost_center_id مختلف عن default_cost_center_id في branch

**الحل**: 
- تحديث transactions لتستخدم cost_center_id الصحيح، أو
- تحديث default_cost_center_id في branch ليطابق transactions الموجودة

#### المشكلة 2: warehouse_id غير مرتبط بـ branch_id
**السبب**: المخزن غير مرتبط بفرع

**الحل**: تحديث warehouse ليربطه بـ branch:
```sql
UPDATE warehouses 
SET branch_id = 'BRANCH_ID'::UUID 
WHERE id = 'WAREHOUSE_ID'::UUID;
```

#### المشكلة 3: branch ليس له default_cost_center_id
**السبب**: الفرع غير مُكوَّن بمركز تكلفة افتراضي

**الحل**: تحديث branch لإضافة default_cost_center_id:
```sql
UPDATE branches 
SET default_cost_center_id = 'COST_CENTER_ID'::UUID 
WHERE id = 'BRANCH_ID'::UUID;
```

#### المشكلة 4: transactions موجودة لكن في branch أو warehouse مختلف
**السبب**: المنتج موجود في مخزن/فرع آخر

**الحل**: التحقق من المخزن الصحيح الذي يحتوي على المنتج

### 5. تسجيل المعلومات للإبلاغ

عند الإبلاغ عن المشكلة، أرسل:

1. **نتيجة دالة debug_available_inventory_quantity**
2. **company_id, warehouse_id, product_id, branch_id**
3. **نتيجة استعلام transactions** (من الخطوة 3-ج)
4. **نتيجة استعلام warehouses** (من الخطوة 3-أ)
5. **نتيجة استعلام branches** (من الخطوة 3-ب)

## مثال على التشخيص

```sql
-- مثال: تشخيص منتج معين
SELECT * FROM debug_available_inventory_quantity(
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,  -- company_id
  NULL::UUID,                                     -- branch_id (سيتم جلبه من warehouse)
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,  -- warehouse_id من رسالة الخطأ
  NULL::UUID,                                     -- cost_center_id (سيتم جلبه من branch)
  'PRODUCT_ID_HERE'::UUID                         -- product_id للمنتج
);
```

## ملاحظات

- تأكد من استخدام UUIDs صحيحة
- تحقق من console logs في المتصفح لمزيد من التفاصيل
- راجع رسائل الخطأ في console.log للتحقق من القيم المستخدمة
