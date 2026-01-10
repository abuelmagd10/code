# 📋 تحليل تفصيلي لكل كيان - نظام ERP VitaSlims

## 🏢 1. العملاء (Customers)

### البنية الحالية
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  branch_id UUID,                     -- ✅ موجود
  cost_center_id UUID,                -- ✅ موجود  
  created_by_user_id UUID,            -- ✅ موجود
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  -- ... باقي الحقول
)
```

### كيفية الارتباط بالحوكمة
- **company_id**: ✅ إلزامي في جميع الاستعلامات
- **branch_id**: ✅ مستخدم للفلترة حسب الفرع
- **cost_center_id**: ✅ مستخدم للفلترة حسب مركز التكلفة
- **warehouse_id**: ❌ غير موجود (العملاء لا يرتبطون بمخزن محدد)
- **created_by**: ✅ مستخدم لفلترة الموظفين

### التحكم في الرؤية
```typescript
// في customers API
const accessFilter = getAccessFilter(role, user.id, branchId, costCenterId);

if (accessFilter.filterByCreatedBy) {
  // موظف: يرى فقط العملاء الذين أنشأهم
  query = query.eq("created_by_user_id", accessFilter.createdByUserId);
} else if (accessFilter.filterByBranch) {
  // مدير فرع: يرى عملاء الفرع
  query = query.eq("branch_id", accessFilter.branchId);
} else {
  // owner/admin: جميع العملاء
}
```

### ✅ نقاط القوة
- فلترة محكمة حسب الدور
- دعم المشاركة بين الموظفين
- ربط واضح بالهيكل التنظيمي

### ⚠️ نقاط التحسين
- إضافة validation للتأكد من أن cost_center يتبع branch
- تحسين indexes للبحث السريع

---

## 🏭 2. الموردين (Vendors/Suppliers)

### البنية الحالية
```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  created_by_user_id UUID,            -- ✅ موجود
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  -- ❌ لا يوجد branch_id
  -- ❌ لا يوجد cost_center_id
  -- ❌ لا يوجد warehouse_id
)
```

### كيفية الارتباط بالحوكمة
- **company_id**: ✅ إلزامي في جميع الاستعلامات
- **branch_id**: ❌ غير موجود
- **cost_center_id**: ❌ غير موجود
- **warehouse_id**: ❌ غير موجود
- **created_by**: ✅ مستخدم لفلترة الموظفين

### التحكم في الرؤية
```typescript
// في suppliers API - فلترة محدودة
if (accessFilter.filterByCreatedBy) {
  query = query.eq("created_by_user_id", accessFilter.createdByUserId);
}
// لا توجد فلترة حسب الفرع أو مركز التكلفة
```

### ⚠️ خرق الحوكمة
- **الموردين غير مربوطين بالفروع**: يمكن لأي موظف رؤية جميع الموردين
- **لا يوجد تحكم على مستوى الفرع**: مدير الفرع يرى موردين من فروع أخرى

### 🔧 التوصية
```sql
-- إضافة branch_id للموردين
ALTER TABLE suppliers ADD COLUMN branch_id UUID REFERENCES branches(id);
ALTER TABLE suppliers ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id);

-- تحديث البيانات الموجودة
UPDATE suppliers SET branch_id = (
  SELECT branch_id FROM company_members 
  WHERE user_id = suppliers.created_by_user_id 
  LIMIT 1
);
```

---

## 📋 3. أوامر البيع (Sales Orders)

### البنية الحالية
```sql
CREATE TABLE sales_orders (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  branch_id UUID,                     -- ✅ موجود
  cost_center_id UUID,                -- ✅ موجود
  warehouse_id UUID,                  -- ✅ موجود
  created_by_user_id UUID,            -- ✅ موجود
  customer_id UUID NOT NULL,
  invoice_id UUID,                    -- ربط بالفاتورة
  -- ... باقي الحقول
)
```

### كيفية الارتباط بالحوكمة
- **company_id**: ✅ إلزامي في جميع الاستعلامات
- **branch_id**: ✅ مستخدم مع `OR branch_id IS NULL`
- **cost_center_id**: ✅ مستخدم مع `OR cost_center_id IS NULL`
- **warehouse_id**: ✅ مستخدم في فلترة المخزون
- **created_by**: ✅ مستخدم لفلترة الموظفين

### العلاقات
```typescript
// Sales Order → Invoice
const convertToInvoice = async (so: SalesOrder) => {
  const invPayload = {
    sales_order_id: so.id,              // ✅ ربط قوي
    branch_id: userContext?.branch_id,   // ✅ وراثة الفرع
    cost_center_id: userContext?.cost_center_id, // ✅ وراثة مركز التكلفة
    warehouse_id: userContext?.warehouse_id,     // ✅ وراثة المخزن
  }
}
```

### ✅ نقاط القوة
- ربط كامل بالهيكل التنظيمي
- وراثة صحيحة للحوكمة عند التحويل لفاتورة
- فلترة محكمة حسب الدور والنطاق

---

## 📋 4. أوامر الشراء (Purchase Orders)

### البنية الحالية
```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  branch_id UUID,                     -- ✅ موجود
  cost_center_id UUID,                -- ✅ موجود
  warehouse_id UUID,                  -- ✅ موجود
  created_by_user_id UUID,            -- ✅ موجود
  supplier_id UUID NOT NULL,
  -- ... باقي الحقول
)
```

### صلاحيات متعددة الأدوار
```typescript
const PURCHASE_ORDER_ROLE_PERMISSIONS = {
  staff: {
    canCreateDraft: true,
    canSend: false,        // لا يمكن الإرسال
    canReceive: true,      // فقط طلباته
    canViewPrice: false,   // لا يرى الأسعار
  },
  supervisor: {
    canSend: true,         // يمكن الإرسال
    canViewPrice: true,    // يرى الأسعار
  }
}
```

### ✅ نقاط القوة
- نظام صلاحيات متدرج ومتقدم
- حماية الأسعار من الموظفين العاديين
- workflow واضح للاعتماد والإرسال

---

## 🧾 5. الفواتير (Invoices)

### البنية الحالية
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  branch_id UUID,                     -- ✅ موجود
  cost_center_id UUID,                -- ✅ موجود
  warehouse_id UUID,                  -- ✅ موجود
  created_by_user_id UUID,            -- ✅ موجود
  customer_id UUID NOT NULL,
  sales_order_id UUID,                -- ربط بأمر البيع
  status TEXT DEFAULT 'draft',
  -- ... باقي الحقول
)
```

### دورة الحياة والحوكمة
```typescript
const INVOICE_LIFECYCLE_RULES = {
  draft: { inventory: false, accounting: false, returns: false },
  sent: { inventory: true, accounting: false, returns: true },
  paid: { inventory: true, accounting: true, returns: true },
}
```

### التحكم في المرتجعات
```typescript
// فقط الفواتير المنفذة يمكن إرجاعها
export const canReturnInvoice = (status: string): boolean => {
  return EXECUTABLE_STATUSES.includes(status); // sent, paid, partially_paid
}
```

### ✅ نقاط القوة
- نظام دورة حياة محكم
- ربط قوي بأوامر البيع
- حماية من العمليات غير المسموحة

---

## 📦 6. المخزون (Inventory)

### البنية الحالية
```sql
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  branch_id UUID,                     -- ✅ موجود
  cost_center_id UUID,                -- ✅ موجود
  warehouse_id UUID,                  -- ✅ موجود
  product_id UUID NOT NULL,
  reference_id UUID,                  -- ربط بالمستند المصدر
  transaction_type TEXT NOT NULL,     -- sale, purchase, return, etc.
  quantity_change INTEGER NOT NULL,
  -- ❌ لا يوجد created_by_user_id
)
```

### ⚠️ خرق الحوكمة المكتشف
```typescript
// في sales-returns.ts
const invTx = toReturn.map((r) => ({
  company_id: returnCompanyId,
  product_id: r.product_id,
  transaction_type: "sale_return",
  reference_id: returnInvoiceId,
  branch_id: null,        // ❌ TODO: Get from invoice
  warehouse_id: null,     // ❌ TODO: Get from invoice
}))
```

### 🔧 الإصلاح المطلوب
```typescript
// الحل الصحيح
const { data: invoice } = await supabase
  .from("invoices")
  .select("branch_id, cost_center_id, warehouse_id")
  .eq("id", returnInvoiceId)
  .single();

const invTx = toReturn.map((r) => ({
  company_id: returnCompanyId,
  product_id: r.product_id,
  transaction_type: "sale_return",
  reference_id: returnInvoiceId,
  branch_id: invoice.branch_id,      // ✅ من الفاتورة
  warehouse_id: invoice.warehouse_id, // ✅ من الفاتورة
}))
```

---

## 🏪 7. المخازن (Warehouses)

### البنية الحالية
```sql
CREATE TABLE warehouses (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,           -- ✅ إلزامي
  branch_id UUID,                     -- ✅ موجود
  cost_center_id UUID,                -- ✅ موجود
  name VARCHAR(255) NOT NULL,
  is_main BOOLEAN DEFAULT FALSE,
  -- ❌ لا يوجد created_by_user_id
)
```

### التحكم في الوصول
```typescript
const INVENTORY_ROLE_PERMISSIONS = {
  staff: {
    canView: true,
    canViewAllWarehouses: false,  // فقط مخزنه
  },
  manager: {
    canViewAllWarehouses: true,   // كل مخازن الفرع
  }
}
```

### ✅ نقاط القوة
- ربط واضح بالهيكل التنظيمي
- فلترة حسب الدور والنطاق
- مخزن رئيسي لكل فرع

---

## 📊 ملخص الحوكمة لكل كيان

| الكيان | company_id | branch_id | cost_center_id | warehouse_id | created_by | التقييم |
|--------|------------|-----------|----------------|--------------|------------|----------|
| **Customers** | ✅ | ✅ | ✅ | ❌ | ✅ | 🟢 ممتاز |
| **Suppliers** | ✅ | ❌ | ❌ | ❌ | ✅ | 🟡 يحتاج تحسين |
| **Sales Orders** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 ممتاز |
| **Purchase Orders** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 ممتاز |
| **Invoices** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 ممتاز |
| **Bills** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 ممتاز |
| **Inventory** | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | 🟡 يحتاج إصلاح |
| **Warehouses** | ✅ | ✅ | ✅ | ❌ | ❌ | 🟢 جيد |

## 🎯 خطة العمل للإصلاحات

### 🔴 عاجل (خلال أسبوع)
1. إصلاح warehouse_id في inventory_transactions
2. إضافة branch_id للموردين

### 🟡 مهم (خلال شهر)
1. إضافة created_by_user_id للمخزون
2. تحسين فلترة الموردين

### 🟢 تحسينات (خلال 3 أشهر)
1. إضافة constraints للتحقق من صحة العلاقات
2. تحسين الأداء بـ indexes مركبة

---

**الخلاصة**: النظام يطبق حوكمة قوية مع نقاط محددة تحتاج إصلاح سريع.