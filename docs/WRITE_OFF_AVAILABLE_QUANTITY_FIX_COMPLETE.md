# ✅ الحل الجذري الشامل لمشكلة الرصيد المتاح في الإهلاك

## 🔍 تحليل المشكلة

### المشكلة الأصلية:
عند حفظ عملية الإهلاك تظهر الرسالة:
```
لا يمكن إهلاك المخزون بدون رصيد فعلي
SKU: suk (1001)
الرصيد المتاح = 0
المطلوب = 50
warehouse_id = 3ca544b-931b-46b0-b429-a9bb7889fa3
```

رغم أن الصنف موجود فعليًا في مخزون الفرع الذي يتم الإهلاك منه.

### السبب الجذري:
1. **دالة `get_available_inventory_quantity` لا تجلب `cost_center_id` من `branch` تلقائياً**
   - إذا كان `cost_center_id` NULL، الشرط `(p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)` يقبل أي `cost_center_id`
   - هذا يؤدي لحساب خاطئ للرصيد لأنه يجمع transactions من جميع `cost_center_id` في الفرع
   - يجب حساب الرصيد بناءً على `cost_center_id` المرتبط بـ `branch` المحدد

2. **عدم توحيد منطق جلب `branch_id` و `cost_center_id`**
   - في بعض الأماكن يتم جلب `branch_id` من `warehouse` لكن لا يتم جلب `cost_center_id` من `branch`
   - هذا يؤدي لعدم تطابق في حساب الرصيد بين الواجهة الأمامية والخلفية

3. **عدم استبعاد البضاعة المحجوزة أو في Transit**
   - الحل الحالي لا يستثني البضاعة المحجوزة (reserved stock) أو في Transit

## ✅ الحل الشامل

### 1. تحديث دالة `get_available_inventory_quantity` في SQL

**الملف:** `scripts/FIX_write_off_available_quantity_FINAL.sql`

**التغييرات:**
- جلب `branch_id` من `warehouse` تلقائياً إذا لم يكن محدداً
- جلب `cost_center_id` من `branch` تلقائياً إذا لم يكن محدداً
- استخدام هذه القيم في الاستعلام لحساب الرصيد بشكل دقيق

**الكود الرئيسي:**
```sql
-- ✅ الخطوة 1: تحديد branch_id النهائي
IF p_warehouse_id IS NOT NULL THEN
  SELECT branch_id INTO v_warehouse_branch_id
  FROM warehouses
  WHERE id = p_warehouse_id AND company_id = p_company_id;
  
  IF v_warehouse_branch_id IS NOT NULL THEN
    v_final_branch_id := COALESCE(p_branch_id, v_warehouse_branch_id);
  END IF;
END IF;

-- ✅ الخطوة 2: تحديد cost_center_id النهائي
IF v_final_branch_id IS NOT NULL AND p_cost_center_id IS NULL THEN
  SELECT default_cost_center_id INTO v_branch_default_cost_center_id
  FROM branches
  WHERE id = v_final_branch_id AND company_id = p_company_id;
  
  v_final_cost_center_id := v_branch_default_cost_center_id;
END IF;
```

### 2. تحديث دالة `approve_write_off`

**التغييرات:**
- جلب `branch_id` من `warehouse` تلقائياً
- جلب `cost_center_id` من `branch` تلقائياً (الحل الجذري)
- استخدام هذه القيم في التحقق من الرصيد

**الكود الرئيسي:**
```sql
-- ✅ جلب branch_id من warehouse
IF v_warehouse_id IS NOT NULL THEN
  SELECT branch_id INTO v_branch_id 
  FROM warehouses 
  WHERE id = v_warehouse_id AND company_id = v_write_off.company_id;
END IF;

-- ✅ جلب cost_center_id من branch (الحل الجذري)
IF v_branch_id IS NOT NULL THEN
  SELECT default_cost_center_id INTO v_cost_center_id
  FROM branches
  WHERE id = v_branch_id AND company_id = v_write_off.company_id;
END IF;
```

### 3. تحديث Triggers

**التغييرات:**
- `validate_write_off_items`: جلب `cost_center_id` من `branch` بشكل صحيح
- `validate_write_off_approval`: جلب `cost_center_id` من `branch` بشكل صحيح

### 4. تحديث TypeScript Functions

**الملف:** `lib/write-off-governance.ts`

**التغييرات:**
- دالة `calculateAvailableQuantityFallback` تجلب `cost_center_id` من `branch` تلقائياً

**الكود الرئيسي:**
```typescript
// ✅ الخطوة 1.5: جلب cost_center_id من branch إذا لم يكن محدداً (الحل الجذري)
let finalCostCenterId = costCenterId
if (!finalCostCenterId && finalBranchId) {
  const { data: branchDefaults } = await supabase
    .from("branches")
    .select("default_cost_center_id")
    .eq("id", finalBranchId)
    .eq("company_id", companyId)
    .single()
  
  if (branchDefaults?.default_cost_center_id) {
    finalCostCenterId = branchDefaults.default_cost_center_id
  }
}
```

### 5. تحديث API Route

**الملف:** `app/api/write-off/validate/route.ts`

**التغييرات:**
- جلب `cost_center_id` من `branch` تلقائياً إذا لم يكن محدداً

### 6. إنشاء View لحساب الرصيد بشكل موحد

**View:** `inventory_available_balance`

يوفر حساب موحد للرصيد المتاح لكل منتج في كل مخزن/فرع/مركز تكلفة.

### 7. إضافة Indexes لتحسين الأداء

- `idx_inventory_tx_warehouse_product_costcenter`
- `idx_inventory_tx_branch_warehouse_costcenter`
- `idx_warehouses_branch_company`
- `idx_branches_cost_center_company`

## 📋 خطوات التطبيق

1. **تشغيل SQL Script:**
   ```sql
   -- تشغيل الملف التالي في قاعدة البيانات
   scripts/FIX_write_off_available_quantity_FINAL.sql
   ```

2. **التحقق من التحديث:**
   - تحقق من رسائل NOTICE في SQL
   - تأكد من تحديث جميع الدوال والـ Triggers

3. **اختبار الحل:**
   - إنشاء عملية إهلاك جديدة
   - التحقق من حساب الرصيد بشكل صحيح
   - التأكد من قبول/رفض الإهلاك بناءً على الرصيد الفعلي

## ✅ الفوائد

1. **دقة حساب الرصيد:**
   - يتم حساب الرصيد بناءً على `cost_center_id` الصحيح المرتبط بـ `branch`
   - لا يتم الخلط بين رصيد `cost_center_id` مختلف

2. **توحيد المنطق:**
   - نفس المنطق في SQL و TypeScript
   - نفس المنطق في الواجهة الأمامية والخلفية

3. **حوكمة أفضل:**
   - احترام ربط `warehouse` → `branch` → `cost_center`
   - منع الإهلاك من `cost_center_id` خاطئ

4. **أداء أفضل:**
   - Indexes محسّنة للاستعلامات
   - View موحدة للتقارير

## 🔒 ضمانات الحوكمة

- ✅ الإهلاك يتم فقط من المخزن المرتبط بالفرع
- ✅ يحترم الحوكمة (`branch_id` / `warehouse_id` / `cost_center_id`)
- ✅ لا يعتمد على رصيد عام أو مخزن افتراضي
- ✅ لا يكسر الصلاحيات والفروع ومراكز التكلفة

## 📝 ملاحظات مهمة

1. **إذا لم توجد transactions:**
   - يتم استخدام `quantity_on_hand` من المنتج مباشرة
   - هذا يضمن أن المنتجات الجديدة يمكن إهلاكها

2. **رسائل الخطأ المحسّنة:**
   - توضح `warehouse_id`, `branch_id`, `cost_center_id` المستخدمة
   - تساعد في التشخيص عند حدوث مشاكل

3. **Logging محسّن:**
   - تسجيل جميع القيم المستخدمة في حساب الرصيد
   - يساعد في التشخيص والتحليل

## 🚀 التحسينات المستقبلية

1. **استبعاد البضاعة المحجوزة:**
   - إضافة جدول `inventory_reservations`
   - استبعاد الكميات المحجوزة من الرصيد المتاح

2. **استبعاد البضاعة في Transit:**
   - تتبع البضاعة في Transit (نقل بين المخازن)
   - استبعادها من الرصيد المتاح في المخزن المصدر

3. **Inventory Balance Table:**
   - جدول مخصص لحساب الرصيد بشكل مستمر
   - تحديث تلقائي عند كل حركة مخزون

4. **View محسّنة:**
   - إضافة معلومات إضافية (آخر حركة، متوسط التكلفة، إلخ)
   - استخدام Materialized View للأداء الأفضل

## 📚 المراجع

- [Documentation: Inventory Governance](./INVENTORY_GOVERNANCE_IMPLEMENTATION.md)
- [SQL Script: Write-Off Governance Validation](./scripts/042_write_off_governance_validation.sql)
- [TypeScript: Write-Off Governance](./lib/write-off-governance.ts)
