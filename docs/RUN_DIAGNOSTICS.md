# 🔍 تشغيل التشخيص الفوري

## 📋 الملف الجاهز للتشغيل

تم إنشاء ملف SQL جاهز للتنفيذ يحتوي على جميع خطوات التشخيص:

**الملف:** `scripts/DIAGNOSE_NOW.sql`

## ⚡ كيفية التشغيل

### في Supabase SQL Editor:

1. افتح Supabase Dashboard
2. اذهب إلى **SQL Editor**
3. افتح ملف `scripts/DIAGNOSE_NOW.sql`
4. انسخ المحتوى والصقه في SQL Editor
5. اضغط **Run** أو **F5**

### في psql:

```bash
psql -h your-host -U your-user -d your-database -f scripts/DIAGNOSE_NOW.sql
```

## 📊 ما سيعرضه الملف:

الملف سيُظهر:

1. **الخطوة 1:** معلومات المنتج (product_id, company_id, SKU, quantity_on_hand)
2. **الخطوة 2:** معلومات Warehouse والربط بـ Branch و Cost Center
3. **الخطوة 3:** ملخص Transactions للمنتج في هذا المخزن
4. **الخطوة 4:** مقارنة cost_center_id بين transactions و branch
5. **الخطوة 5:** تشخيص تفصيلي باستخدام دالة debug_available_inventory_quantity
6. **الخطوة 6:** الرصيد في جميع المخازن لهذا المنتج

## ✅ بعد التشغيل:

1. راجع النتائج في كل خطوة
2. ابحث عن رسائل **❌ ERROR** لتحديد المشكلة
3. استخدم التوصيات المذكورة في النتائج لإصلاح المشكلة

## 🔧 المشاكل الشائعة والحلول:

### ❌ warehouse غير مرتبط بـ branch
```sql
UPDATE warehouses 
SET branch_id = 'BRANCH_ID_HERE'::UUID 
WHERE id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;
```

### ❌ branch ليس له default_cost_center_id
```sql
UPDATE branches 
SET default_cost_center_id = 'COST_CENTER_ID_HERE'::UUID 
WHERE id = 'BRANCH_ID_HERE'::UUID;
```

### ❌ cost_center_id في transactions مختلف
```sql
-- تحديث default_cost_center_id في branch
UPDATE branches 
SET default_cost_center_id = 'COST_CENTER_ID_FROM_TRANSACTIONS'::UUID 
WHERE id = 'BRANCH_ID_HERE'::UUID;
```

## 📝 ملاحظات:

- الملف يستخدم معلومات من رسالة الخطأ:
  - SKU: suk (1001)
  - warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
- الملف يبحث تلقائياً عن المنتج من SKU
- لا تحتاج لتعديل أي شيء في الملف

---

**بعد التشغيل، شارك النتائج لتحديد الحل المناسب!**
