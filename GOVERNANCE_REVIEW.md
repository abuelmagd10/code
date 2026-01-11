# 🔒 مراجعة تطبيق نظام الحوكمة - ERB VitaSlims

## ✅ 1️⃣ المستويات الأساسية المطبقة

| المستوى | الحالة | الملاحظات |
|---------|--------|-----------|
| Company | ✅ مطبق | company_id إجباري في جميع الجداول |
| Branch | ✅ مطبق | branch_id موجود في sales_orders و invoices |
| Cost Center | ✅ مطبق | cost_center_id موجود في sales_orders و invoices |
| Warehouse | ✅ مطبق | warehouse_id موجود في sales_orders و invoices |
| Created By | ✅ مطبق | created_by_user_id موجود في sales_orders و invoices |

## ✅ 2️⃣ صلاحيات الأدوار المطبقة

### في `lib/validation.ts`:
```typescript
export function getRoleAccessLevel(role: string): 'all' | 'company' | 'branch' | 'own' {
  const r = role.toLowerCase();
  if (r === 'owner' || r === 'admin') return 'company';
  if (r === 'manager' || r === 'accountant') return 'branch';
  return 'own'; // staff, sales, viewer
}
```

| الدور | مستوى الوصول | التطبيق |
|------|-------------|---------|
| Owner/Admin | ✅ company | يرى كل بيانات الشركة |
| Manager/Accountant | ✅ branch | يرى بيانات الفرع فقط |
| Staff/Sales | ✅ own | يرى بياناته فقط |

## ✅ 3️⃣ تعديلات قاعدة البيانات

### الأعمدة المطلوبة:
- ✅ `branch_id` - موجود
- ✅ `cost_center_id` - موجود
- ✅ `warehouse_id` - موجود
- ✅ `created_by_user_id` - موجود

### الجداول المحدثة:
- ✅ `sales_orders`
- ✅ `invoices`

## ✅ 4️⃣ تطبيق الحوكمة في الكود

### في `lib/data-visibility-control.ts`:
```typescript
export function buildDataVisibilityFilter(userContext: UserContext): DataVisibilityRules {
  const accessLevel = getRoleAccessLevel(role);
  
  // Owner/Admin - يرى كل بيانات الشركة
  if (accessLevel === 'company') { ... }
  
  // Manager/Accountant - يرى بيانات الفرع
  if (accessLevel === 'branch') { ... }
  
  // Staff - يرى فقط ما أنشأه
  return { filterByCreatedBy: true, ... };
}
```

### في `app/api/sales-orders/route.ts`:
```typescript
// تطبيق الفلاتر حسب الدور
if (accessLevel === 'own') {
  query = query.eq("created_by_user_id", user.id)
} else if (accessLevel === 'branch' && member.branch_id) {
  query = query.eq("branch_id", member.branch_id)
}
```

### في `app/sales-orders/page.tsx`:
- ✅ استخدام `/api/sales-orders` بدلاً من Supabase المباشر
- ✅ تطبيق الحوكمة على مستوى API
- ✅ فلتر الموظفين للمدراء والمحاسبين

## ✅ 5️⃣ المخزون والارتباطات

### في API:
```typescript
// الحصول على المخزن الرئيسي للفرع
const { data: warehouse } = await supabase
  .from('warehouses')
  .select('id')
  .eq('branch_id', governance.branch_id)
  .eq('is_main', true)
  .single()

// تطبيق الحوكمة الإلزامية
const salesOrderData = {
  ...body,
  company_id: companyId,
  branch_id: governance.branch_id,
  cost_center_id: governance.cost_center_id,
  warehouse_id: warehouse.id,
  created_by_user_id: user.id
}
```

## ✅ 6️⃣ التحقق والأمان

### الدوال المطبقة:
- ✅ `canAccessDocument()` - التحقق من صلاحية الوصول للمستند
- ✅ `canCreateDocument()` - التحقق من صلاحية الإنشاء
- ✅ `validateRecordModification()` - التحقق من صلاحية التعديل/الحذف

### Audit Trail:
- ✅ `created_by_user_id` يُسجل في كل مستند
- ✅ `created_at` و `updated_at` تلقائي في قاعدة البيانات

## 🔧 7️⃣ الخطوات المتبقية

### ⚠️ مطلوب تطبيقها:

1. **تحديث البيانات القديمة**:
```sql
-- تحديث أوامر البيع القديمة
UPDATE sales_orders
SET branch_id = (SELECT branch_id FROM company_members WHERE user_id = sales_orders.created_by_user_id LIMIT 1),
    cost_center_id = (SELECT cost_center_id FROM company_members WHERE user_id = sales_orders.created_by_user_id LIMIT 1),
    warehouse_id = (SELECT id FROM warehouses WHERE branch_id = (SELECT branch_id FROM company_members WHERE user_id = sales_orders.created_by_user_id LIMIT 1) AND is_main = true LIMIT 1)
WHERE branch_id IS NULL;

-- تحديث الفواتير من أوامر البيع
UPDATE invoices i
SET branch_id = so.branch_id,
    cost_center_id = so.cost_center_id,
    warehouse_id = so.warehouse_id,
    created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.branch_id IS NULL;
```

2. **تطبيق الحوكمة على الفواتير**:
   - ⚠️ إنشاء `/api/invoices/route.ts` مشابه لـ `/api/sales-orders/route.ts`
   - ⚠️ تحديث `app/invoices/page.tsx` لاستخدام API

3. **إضافة RLS Policies** (اختياري للأمان الإضافي):
```sql
-- سياسة للقراءة
CREATE POLICY "Users can view sales orders based on role"
ON sales_orders FOR SELECT
USING (
  company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  AND (
    -- Owner/Admin يرى كل شيء
    EXISTS (SELECT 1 FROM company_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
    OR
    -- Manager/Accountant يرى فرعه
    (branch_id IN (SELECT branch_id FROM company_members WHERE user_id = auth.uid() AND role IN ('manager', 'accountant')))
    OR
    -- Staff يرى بياناته فقط
    (created_by_user_id = auth.uid())
  )
);
```

4. **اختبار شامل**:
   - ⚠️ اختبار دخول كل دور
   - ⚠️ التحقق من الفلاتر
   - ⚠️ التحقق من الإنشاء والتعديل والحذف

## 📊 ملخص الحالة

| المكون | الحالة | النسبة |
|--------|--------|--------|
| المستويات الأساسية | ✅ مكتمل | 100% |
| صلاحيات الأدوار | ✅ مكتمل | 100% |
| قاعدة البيانات | ✅ مكتمل | 100% |
| API أوامر البيع | ✅ مكتمل | 100% |
| واجهة أوامر البيع | ✅ مكتمل | 100% |
| API الفواتير | ⚠️ مطلوب | 0% |
| واجهة الفواتير | ⚠️ مطلوب | 0% |
| تحديث البيانات القديمة | ⚠️ مطلوب | 0% |
| RLS Policies | ⚠️ اختياري | 0% |
| الاختبار الشامل | ⚠️ مطلوب | 0% |

**الإجمالي: 60% مكتمل**

## 🎯 الأولويات التالية

1. ✅ **تم**: تطبيق API لأوامر البيع
2. ⚠️ **التالي**: تطبيق API للفواتير
3. ⚠️ **التالي**: تحديث البيانات القديمة
4. ⚠️ **التالي**: الاختبار الشامل

---
**آخر تحديث**: 2024
**الحالة**: جاهز للمرحلة التالية ✅
