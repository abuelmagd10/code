# 🔍 خطوات تشخيص مشكلة الإهلاك خطوة بخطوة

## المعلومات المتوفرة من رسالة الخطأ:
- **SKU**: suk (1001)
- **warehouse_id**: `3c9a544b-931b-46b0-b429-a89bb7889fa3`
- **الرصيد المتاح**: 0
- **المطلوب**: 50

## الخطوات:

### الخطوة 1: البحث عن المنتج من SKU

قم بتشغيل هذا الاستعلام في Supabase SQL Editor:

```sql
SELECT 
  id as product_id,
  name as product_name,
  sku,
  quantity_on_hand,
  company_id
FROM products
WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
   OR (name LIKE '%suk%' OR name LIKE '%1001%')
ORDER BY created_at DESC
LIMIT 5;
```

**احفظ:**
- `product_id` من النتيجة
- `company_id` من النتيجة

---

### الخطوة 2: فحص معلومات Warehouse والربط

```sql
SELECT 
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  b.id as branch_id,
  b.name as branch_name,
  b.default_cost_center_id,
  cc.id as cost_center_id,
  cc.name as cost_center_name
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = b.default_cost_center_id
WHERE w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;
```

**تحقق من:**
- ✅ هل `branch_id` موجود؟ إذا كان NULL، هذه هي المشكلة!
- ✅ هل `default_cost_center_id` موجود؟ إذا كان NULL، هذه هي المشكلة!

---

### الخطوة 3: فحص Transactions للمنتج في هذا المخزن

استبدل `PRODUCT_ID_HERE` و `COMPANY_ID_HERE` بالقيم من الخطوة 1:

```sql
SELECT 
  it.id,
  it.transaction_type,
  it.quantity_change,
  it.warehouse_id,
  it.branch_id,
  it.cost_center_id,
  it.is_deleted,
  it.created_at
FROM inventory_transactions it
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = 'COMPANY_ID_HERE'::UUID
  AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
ORDER BY it.created_at DESC;
```

**تحقق من:**
- هل توجد transactions؟
- ما هو `cost_center_id` المستخدم في transactions؟

---

### الخطوة 4: ملخص Transactions حسب cost_center_id

```sql
SELECT 
  it.cost_center_id,
  cc.name as cost_center_name,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
LEFT JOIN cost_centers cc ON cc.id = it.cost_center_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = 'COMPANY_ID_HERE'::UUID
  AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, cc.name
ORDER BY total_quantity DESC;
```

**تحقق من:**
- ما هو `cost_center_id` المستخدم في transactions؟
- هل يطابق `default_cost_center_id` من branch؟

---

### الخطوة 5: استخدام دالة التشخيص

```sql
SELECT * FROM debug_available_inventory_quantity(
  'COMPANY_ID_HERE'::UUID,
  NULL::UUID,
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,
  NULL::UUID,
  'PRODUCT_ID_HERE'::UUID
);
```

**راجع النتائج:**
- `Warehouse Lookup`: هل warehouse مرتبط بـ branch؟
- `Branch Lookup`: هل branch له default_cost_center_id؟
- `Transaction Count`: كم عدد transactions المطابقة؟
- `Calculated Balance`: ما هو الرصيد المحسوب؟

---

### الخطوة 6: مقارنة cost_center_id

```sql
SELECT 
  it.cost_center_id as transaction_cost_center_id,
  cc1.name as transaction_cost_center_name,
  b.default_cost_center_id as branch_default_cost_center_id,
  cc2.name as branch_default_cost_center_name,
  CASE 
    WHEN it.cost_center_id != b.default_cost_center_id THEN '❌ MISMATCH'
    ELSE '✅ MATCH'
  END as match_status,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc1 ON cc1.id = it.cost_center_id
LEFT JOIN cost_centers cc2 ON cc2.id = b.default_cost_center_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = 'COMPANY_ID_HERE'::UUID
  AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, cc1.name, b.default_cost_center_id, cc2.name
ORDER BY total_quantity DESC;
```

---

## الحلول المحتملة:

### الحل 1: warehouse غير مرتبط بـ branch

```sql
-- تحديث warehouse لربطه بـ branch
UPDATE warehouses 
SET branch_id = 'BRANCH_ID_HERE'::UUID 
WHERE id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;
```

### الحل 2: branch ليس له default_cost_center_id

```sql
-- تحديث branch لإضافة default_cost_center_id
UPDATE branches 
SET default_cost_center_id = 'COST_CENTER_ID_HERE'::UUID 
WHERE id = 'BRANCH_ID_HERE'::UUID;
```

### الحل 3: cost_center_id في transactions مختلف عن default_cost_center_id

**الخيار أ:** تحديث default_cost_center_id في branch ليطابق transactions:
```sql
UPDATE branches 
SET default_cost_center_id = 'COST_CENTER_ID_FROM_TRANSACTIONS'::UUID 
WHERE id = 'BRANCH_ID_HERE'::UUID;
```

**الخيار ب:** تحديث transactions لتستخدم default_cost_center_id:
```sql
UPDATE inventory_transactions it
SET cost_center_id = b.default_cost_center_id
FROM warehouses w
JOIN branches b ON b.id = w.branch_id
WHERE it.warehouse_id = w.id
  AND it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = 'COMPANY_ID_HERE'::UUID
  AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND it.cost_center_id != b.default_cost_center_id;
```

---

## بعد تطبيق الحل:

1. شغّل دالة التشخيص مرة أخرى للتحقق
2. جرب عملية الإهلاك مرة أخرى
3. تحقق من console logs في المتصفح لمزيد من التفاصيل
