# 🔍 تقرير تدقيق حوكمة البيانات ونموذج البيانات - نظام ERP VitaSlims

## 📋 ملخص تنفيذي

تم إجراء تدقيق شامل لنظام ERP VitaSlims لفهم كيفية عمل النظام حاليًا على مستوى الكود وقاعدة البيانات. النظام يطبق نموذج حوكمة متقدم يعتمد على التسلسل الهرمي: **Company → Branch → Cost Center → Warehouse**.

## 🏗️ بنية البيانات الأساسية

### 1️⃣ الكيانات الرئيسية (Core Entities)

| الكيان | الجدول | company_id | branch_id | cost_center_id | warehouse_id | created_by |
|--------|---------|------------|-----------|----------------|--------------|------------|
| **Customers** | `customers` | ✅ إلزامي | ✅ موجود | ✅ موجود | ❌ غير موجود | ✅ `created_by_user_id` |
| **Vendors** | `suppliers` | ✅ إلزامي | ❌ غير موجود | ❌ غير موجود | ❌ غير موجود | ✅ `created_by_user_id` |
| **Sales Orders** | `sales_orders` | ✅ إلزامي | ✅ موجود | ✅ موجود | ✅ موجود | ✅ `created_by_user_id` |
| **Purchase Orders** | `purchase_orders` | ✅ إلزامي | ✅ موجود | ✅ موجود | ✅ موجود | ✅ `created_by_user_id` |
| **Invoices** | `invoices` | ✅ إلزامي | ✅ موجود | ✅ موجود | ✅ موجود | ✅ `created_by_user_id` |
| **Bills** | `bills` | ✅ إلزامي | ✅ موجود | ✅ موجود | ✅ موجود | ✅ `created_by_user_id` |
| **Inventory** | `inventory_transactions` | ✅ إلزامي | ✅ موجود | ✅ موجود | ✅ موجود | ❌ غير موجود |
| **Warehouses** | `warehouses` | ✅ إلزامي | ✅ موجود | ✅ موجود | ❌ N/A | ❌ غير موجود |

### 2️⃣ الهيكل التنظيمي

```
Company (companies)
├── Branch (branches) - مرتبط بـ company_id
│   ├── Cost Center (cost_centers) - مرتبط بـ branch_id
│   └── Warehouse (warehouses) - مرتبط بـ branch_id + cost_center_id
└── Users (company_members) - مرتبط بـ company_id + branch_id + cost_center_id + warehouse_id
```

## 🔐 نظام التحكم في الوصول (Access Control)

### أ) مصفوفة الأدوار والصلاحيات

| الدور | مستوى الوصول | company_id | branch_id | cost_center_id | warehouse_id | created_by |
|-------|---------------|------------|-----------|----------------|--------------|------------|
| **Owner** | الكل | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Admin** | الشركة | ✅ | ❌ | ❌ | ❌ | ❌ |
| **General Manager** | الشركة | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Manager** | الفرع | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Accountant** | الفرع | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Supervisor** | مركز التكلفة | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Staff/Employee** | المنشأ بواسطته | ✅ | ✅ | ✅ | ✅ | ✅ |

### ب) تطبيق قواعد الرؤية

#### 📍 في ملف `lib/data-visibility-control.ts`:
```typescript
export function buildDataVisibilityFilter(userContext: UserContext): DataVisibilityRules {
  // Owner/Admin: يرون كل شيء
  if (roleLower === "owner" || roleLower === "admin") {
    return { companyId, filterByBranch: false, filterByCreatedBy: false }
  }
  
  // Manager/Accountant: يرون كل شيء في نطاقهم
  if (roleLower === "manager" || roleLower === "accountant") {
    return { 
      companyId, 
      filterByBranch: !!branch_id,
      filterByCreatedBy: false // يرى كل الموظفين داخل نطاقه
    }
  }
  
  // Staff: فقط ما أنشأه
  return {
    companyId,
    filterByBranch: !!branch_id,
    filterByCreatedBy: true,
    createdByUserId: user_id
  }
}
```

## 📊 تحليل الاستعلامات والفلترة

### 1️⃣ نمط الاستعلام الموحد

#### في ملفات API (مثل `/api/invoices/route.ts`):
```typescript
// 1. التحقق من المصادقة
const { data: { user } } = await supabase.auth.getUser()

// 2. جلب الشركة النشطة
const companyId = await getActiveCompanyId(supabase)

// 3. تطبيق نظام التحكم في الرؤية
let query = supabase.from("invoices").eq("company_id", companyId)
query = await applyDataVisibilityFilter(supabase, query, "invoices", user.id, companyId)
```

### 2️⃣ استخدام الحقول في الاستعلامات

| الحقل | الاستخدام الفعلي | ملاحظات |
|-------|------------------|----------|
| `company_id` | ✅ مستخدم في جميع الاستعلامات | إلزامي دائماً |
| `branch_id` | ✅ مستخدم مع `OR branch_id IS NULL` | يدعم البيانات القديمة |
| `cost_center_id` | ✅ مستخدم مع `OR cost_center_id IS NULL` | يدعم البيانات القديمة |
| `warehouse_id` | ✅ مستخدم في جداول المخزون فقط | حسب نوع الجدول |
| `created_by_user_id` | ✅ مستخدم للموظفين فقط | فلترة حسب المنشئ |

## 🔗 العلاقات بين الكيانات

### أ) Sales Order → Invoice
```typescript
// في sales-orders/page.tsx
const convertToInvoice = async (so: SalesOrder) => {
  const invPayload = {
    customer_id: so.customer_id,
    sales_order_id: so.id, // ربط الفاتورة بأمر البيع
    branch_id: userContext?.branch_id,
    cost_center_id: userContext?.cost_center_id,
    warehouse_id: userContext?.warehouse_id,
  }
}
```

### ب) Purchase Order → Bill
- نفس النمط مع `purchase_order_id`
- الربط محفوظ في قاعدة البيانات
- العلاقة **enforced** على مستوى التطبيق

### ج) Invoice/Bill → Inventory Transactions
```typescript
// في sales-returns.ts
const invTx = toReturn.map((r) => ({
  company_id: returnCompanyId,
  product_id: r.product_id,
  transaction_type: "sale_return",
  reference_id: returnInvoiceId, // ربط بالفاتورة
  branch_id: null, // TODO: Get from invoice
  warehouse_id: null, // TODO: Get from invoice
}))
```

## ⚠️ خروقات الحوكمة المكتشفة

### 1️⃣ استعلامات بدون company_id
❌ **لم يتم العثور على استعلامات تفتقر لـ company_id** - النظام محمي جيداً

### 2️⃣ استعلامات بدون branch_id
⚠️ **في بعض الحالات القديمة:**
```sql
-- يستخدم OR branch_id IS NULL لدعم البيانات القديمة
WHERE company_id = ? AND (branch_id = ? OR branch_id IS NULL)
```

### 3️⃣ حركات المخزون غير مربوطة بمخزن
⚠️ **في inventory_transactions:**
```typescript
// TODO: Get from invoice - مطلوب إصلاح
branch_id: null,
warehouse_id: null,
```

### 4️⃣ فواتير بدون مركز تكلفة
⚠️ **في بعض الفواتير القديمة:**
- `cost_center_id` قد يكون `NULL`
- يتم التعامل معه بـ `OR cost_center_id IS NULL`

## 🔧 نقاط القوة في النظام

### ✅ 1. نظام Data Visibility موحد
```typescript
// lib/data-visibility-control.ts
export function applyDataVisibilityFilter(query, rules, tableName) {
  // تطبيق موحد لجميع الجداول
  if (rules.companyId) query = query.eq("company_id", rules.companyId)
  if (rules.filterByBranch) query = query.or(`branch_id.eq.${rules.branchId},branch_id.is.null`)
  return query
}
```

### ✅ 2. نظام صلاحيات متقدم
```typescript
// lib/authz.ts
export async function canAction(supabase, resource, action): Promise<boolean> {
  // تحقق من الصلاحيات على مستوى الدور والمورد
}
```

### ✅ 3. دعم المستخدمين المدعوين
```typescript
// lib/company.ts
export async function getActiveCompanyId(supabase) {
  // يدعم المستخدمين المدعوين عبر company_members
}
```

### ✅ 4. فلترة حسب الموظف المنشئ
```typescript
// في invoices/page.tsx
const accessFilter = getAccessFilter(role, user.id, branchId, costCenterId)
if (accessFilter.filterByCreatedBy) {
  query = query.eq("created_by_user_id", accessFilter.createdByUserId)
}
```

## 📈 توصيات للتحسين

### 🔴 عالية الأولوية

1. **إصلاح warehouse_id في inventory_transactions**
   ```sql
   UPDATE inventory_transactions 
   SET warehouse_id = (SELECT warehouse_id FROM invoices WHERE id = reference_id)
   WHERE warehouse_id IS NULL AND reference_id IS NOT NULL
   ```

2. **إضافة branch_id للموردين**
   ```sql
   ALTER TABLE suppliers ADD COLUMN branch_id UUID REFERENCES branches(id)
   ```

3. **ربط حركات المخزون بالمخزن الصحيح**
   - تحديث triggers لتعيين warehouse_id تلقائياً

### 🟡 متوسطة الأولوية

1. **تحسين فلترة المخزون**
   - إضافة warehouse_id لجميع عمليات المخزون

2. **تطبيق cost_center_id بشكل صارم**
   - منع إنشاء مستندات بدون cost_center_id

### 🟢 منخفضة الأولوية

1. **تحسين الأداء**
   - إضافة indexes مركبة للفلترة
   - تحسين استعلامات RLS

## 🎯 الخلاصة

النظام يطبق **نموذج حوكمة متقدم وشامل** مع:

- ✅ **حماية قوية على مستوى company_id**
- ✅ **نظام أدوار متدرج ومرن**
- ✅ **فلترة ذكية تدعم البيانات القديمة**
- ✅ **عزل كامل بين الشركات**
- ⚠️ **بعض النقاط تحتاج تحسين في warehouse_id**

النظام **جاهز لإضافة Features جديدة** مع ضرورة اتباع نفس أنماط الحوكمة المطبقة.

---

**تاريخ التقرير:** ${new Date().toISOString().split('T')[0]}  
**المراجع:** تحليل شامل للكود المصدري وقاعدة البيانات  
**الحالة:** ✅ النظام محمي جيداً مع نقاط تحسين محددة