# إصلاح مشكلة إنشاء أمر البيع (Sales Order Creation Fix)

## المشكلة

عند محاولة إنشاء أمر بيع جديد، كان يحدث خطأ `P0001` من قاعدة البيانات مع رسالة:
```
Branch/warehouse/cost_center cannot be NULL - governance violation
```

أو:
```
warehouse_id must belong to branch_id - governance violation
```

أو:
```
cost_center_id must belong to branch_id - governance violation
```

## السبب

1. **Trigger الحوكمة**: يوجد trigger `check_sales_orders_branch_scope()` يتحقق من:
   - أن `branch_id`, `warehouse_id`, `cost_center_id` ليست NULL
   - أن المستودع ينتمي للفرع المحدد
   - أن مركز التكلفة ينتمي للفرع المحدد

2. **مشكلة في بناء البيانات**: دالة `buildSalesOrderData` كانت تستخدم `||` مما يعني أن القيم `null` قد تمرر إلى قاعدة البيانات

3. **عدم التحقق مسبقاً**: لم يكن هناك تحقق من صحة البيانات قبل الإدخال في قاعدة البيانات

## الحل

### 1. تحسين معالجة الأخطاء في API (`app/api/sales-orders/route.ts`)

- ✅ إضافة تحقق من أن المستودع ينتمي للفرع قبل الإدخال
- ✅ إضافة تحقق من أن مركز التكلفة ينتمي للفرع قبل الإدخال
- ✅ التأكد من أن جميع الحقول المطلوبة موجودة
- ✅ تحسين رسائل الخطأ لتكون أكثر وضوحاً بالعربية والإنجليزية

### 2. تحسين دالة `enforceBranchDefaults` (`lib/governance-branch-defaults.ts`)

- ✅ دعم بنية `GovernanceContext` من middleware (مع `branchIds[]`)
- ✅ دعم البنية المحلية (مع `branch_id`)
- ✅ استخدام `??` بدلاً من `||` لتجنب مشاكل القيم `null`

### 3. تحسين دالة `buildSalesOrderData`

- ✅ استخدام `??` بدلاً من `||` لضمان عدم تمرير `null` عن طريق الخطأ
- ✅ إضافة `company_id` تلقائياً من السياق

## التغييرات

### `app/api/sales-orders/route.ts`

```typescript
// إضافة تحقق من المستودع ومركز التكلفة قبل الإدخال
if (finalData.branch_id && finalData.warehouse_id) {
  // التحقق من أن المستودع ينتمي للفرع
}

if (finalData.branch_id && finalData.cost_center_id) {
  // التحقق من أن مركز التكلفة ينتمي للفرع
}

// التأكد من أن جميع الحقول المطلوبة موجودة
if (!finalData.branch_id || !finalData.warehouse_id || !finalData.cost_center_id) {
  return error
}
```

### `lib/governance-branch-defaults.ts`

```typescript
// دعم بنية GovernanceContext من middleware
const branchId = 
  governance.branch_id || 
  (governance.branchIds && governance.branchIds.length > 0 ? governance.branchIds[0] : null) ||
  body.branch_id

// استخدام ?? بدلاً من ||
warehouse_id: body.warehouse_id ?? governance.warehouse_id ?? defaults.default_warehouse_id
```

## الاختبار

للتأكد من أن الإصلاح يعمل:

1. إنشاء أمر بيع جديد من الواجهة
2. التأكد من أن جميع الحقول المطلوبة (الفرع، المخزن، مركز التكلفة) محددة
3. التأكد من أن المستودع ومركز التكلفة ينتميان للفرع المحدد

## رسائل الخطأ المحسنة

### قبل الإصلاح:
```
P0001: Branch/warehouse/cost_center cannot be NULL - governance violation
```

### بعد الإصلاح:
```json
{
  "error": "Missing required fields: branch_id, warehouse_id, and cost_center_id are required",
  "error_ar": "الحقول المطلوبة مفقودة: يجب تحديد الفرع والمخزن ومركز التكلفة"
}
```

أو:

```json
{
  "error": "Warehouse does not belong to the selected branch",
  "error_ar": "المخزن المحدد لا ينتمي للفرع المختار"
}
```

## ملاحظات

- يجب التأكد من أن كل فرع له `default_warehouse_id` و `default_cost_center_id` محددين
- يجب التأكد من أن المستودعات ومراكز التكلفة مرتبطة بشكل صحيح بالفروع
- يمكن استخدام migration `20260114_001_sales_order_governance_chain.sql` لضمان ذلك
