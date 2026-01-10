# 📊 تحليل أنماط الكود والعلاقات في نظام ERP VitaSlims

## 🏗️ **البنية المعمارية للنظام**

### 1. **نمط Multi-Tenant Architecture**
```
Company (الشركة)
├── Branches (الفروع)
│   ├── Cost Centers (مراكز التكلفة)
│   └── Warehouses (المخازن)
├── Users/Members (المستخدمين)
│   ├── Roles (الأدوار)
│   └── Permissions (الصلاحيات)
└── Business Documents (المستندات التجارية)
    ├── Sales Orders → Invoices
    ├── Purchase Orders → Bills
    ├── Returns & Credits
    └── Inventory Transactions
```

### 2. **نمط Data Visibility & Access Control**
```typescript
// من lib/data-visibility-control.ts
interface DataVisibilityRules {
  companyId: string           // إلزامي للجميع
  filterByBranch: boolean     // للمدراء والمحاسبين
  filterByCostCenter: boolean // للمشرفين
  filterByWarehouse: boolean  // لمدراء المخازن
  filterByCreatedBy: boolean  // للموظفين العاديين
  canSeeAllInScope: boolean   // للأدوار الإدارية
}
```

---

## 🔐 **مصفوفة الصلاحيات والرؤية**

### الأدوار وصلاحياتها:

| الدور | النطاق | ما يراه | القيود |
|-------|--------|---------|--------|
| **Owner/Admin** | الشركة كاملة | كل شيء | لا توجد قيود |
| **General Manager** | الشركة كاملة | كل شيء | لا توجد قيود |
| **Manager** | الفرع + مركز التكلفة | كل شيء في نطاقه | `branch_id` + `cost_center_id` |
| **Accountant** | الفرع + مركز التكلفة | كل شيء في نطاقه | `branch_id` + `cost_center_id` |
| **Staff** | ما أنشأه فقط | فقط مستنداته | `created_by_user_id` + النطاق |

### تطبيق الصلاحيات في الكود:
```typescript
// من app/invoices/page.tsx
const visibilityRules = buildDataVisibilityFilter(context)
let invoicesQuery = supabase
  .from("invoices")
  .select("*, customers(name, phone)")
  .eq("company_id", visibilityRules.companyId)

// تطبيق قواعد الرؤية الموحدة
invoicesQuery = applyDataVisibilityFilter(invoicesQuery, visibilityRules, "invoices")
```

---

## 📋 **أنماط المستندات والعلاقات**

### 1. **دورة المبيعات (Sales Cycle)**
```
Customer → Sales Order → Invoice → Payment → Receipt
    ↓           ↓           ↓         ↓         ↓
 CRM Data   Inventory   Accounting  Banking   Reports
```

### 2. **دورة المشتريات (Purchase Cycle)**
```
Supplier → Purchase Order → Bill → Payment → Vendor Credit
    ↓            ↓           ↓        ↓           ↓
Vendor Mgmt   Inventory   Accounting Banking   Reports
```

### 3. **إدارة المخزون (Inventory Management)**
```
Product → Warehouse → Inventory Transaction → FIFO/LIFO → Valuation
   ↓         ↓              ↓                    ↓           ↓
Catalog   Location      Stock Movement      Cost Calc   Reports
```

### 4. **النمط المحاسبي (Accounting Pattern)**
```typescript
// من الكود: النمط المحاسبي الصارم
// كل مستند تجاري يولد قيود محاسبية تلقائياً
Sales Invoice → Journal Entry:
  Dr. Accounts Receivable (AR)
  Cr. Sales Revenue
  Cr. VAT Payable (if applicable)

Purchase Bill → Journal Entry:
  Dr. Expense/Asset Account
  Dr. VAT Recoverable (if applicable)
  Cr. Accounts Payable (AP)
```

---

## 🔗 **أنماط الارتباطات والعلاقات**

### 1. **ارتباط الأوامر بالفواتير**
```typescript
// من app/sales-orders/page.tsx
// نسبة الربط: 100% (61/61 أمر مرتبط بفاتورة)
sales_orders.invoice_id → invoices.id
```

### 2. **ارتباط المستندات بالمستخدمين**
```typescript
// نمط تتبع المنشئ
interface Document {
  created_by_user_id: string  // من أنشأ المستند
  company_id: string          // الشركة
  branch_id?: string          // الفرع
  cost_center_id?: string     // مركز التكلفة
  warehouse_id?: string       // المخزن
}
```

### 3. **ارتباط العملاء بالموظفين**
```typescript
// من تحليل البيانات: منشئ العميل = منشئ أوامر البيع
// العلاقة: Customer.created_by_user_id → SalesOrder.created_by_user_id
const employeeId = invoiceToEmployeeMap[inv.id] // ربط الفاتورة بالموظف
```

---

## 🎯 **أنماط الفلترة والبحث**

### 1. **فلترة متعددة المستويات**
```typescript
// من app/invoices/page.tsx
const filteredInvoices = useMemo(() => {
  return invoices.filter((inv) => {
    // فلتر الموظف (حسب الموظف المنشئ)
    if (canViewAllInvoices && filterEmployeeId !== "all") {
      const employeeId = invoiceToEmployeeMap[inv.id]
      if (employeeId !== filterEmployeeId) return false
    }
    
    // فلتر الحالة - Multi-select
    if (filterStatuses.length > 0) {
      if (!filterStatuses.includes(inv.status)) return false
    }
    
    // فلتر العميل
    if (filterCustomers.length > 0) {
      if (!filterCustomers.includes(inv.customer_id)) return false
    }
    
    // فلتر المنتجات
    if (filterProducts.length > 0) {
      const invoiceProductIds = invoiceItems
        .filter(item => item.invoice_id === inv.id)
        .map(item => item.product_id)
      const hasSelectedProduct = filterProducts.some(productId => 
        invoiceProductIds.includes(productId))
      if (!hasSelectedProduct) return false
    }
    
    return true
  })
}, [invoices, filterStatuses, filterCustomers, filterProducts, ...])
```

### 2. **بحث ذكي متعدد الحقول**
```typescript
// البحث في: رقم الفاتورة + اسم العميل + رقم الهاتف
if (searchQuery.trim()) {
  const q = searchQuery.trim().toLowerCase()
  const customerName = String(inv.customers?.name || "").toLowerCase()
  const customerPhone = String(inv.customers?.phone || "").toLowerCase()
  const invoiceNumber = inv.invoice_number ? String(inv.invoice_number).toLowerCase() : ""
  if (!customerName.includes(q) && !customerPhone.includes(q) && !invoiceNumber.includes(q)) 
    return false
}
```

---

## 💰 **أنماط العملات والحسابات**

### 1. **دعم العملات المتعددة**
```typescript
// من app/invoices/page.tsx
const currencySymbols: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
}

// استخدام المبلغ المحول أو الأصلي
const getDisplayAmount = (invoice: Invoice, field: 'total' | 'paid' = 'total'): number => {
  if (invoice.display_currency === appCurrency && invoice.display_total != null) {
    return invoice.display_total
  }
  return invoice.total_amount
}
```

### 2. **حساب المدفوعات الفعلية**
```typescript
// تجميع المدفوعات من جدول payments
const paidByInvoice: Record<string, number> = useMemo(() => {
  const agg: Record<string, number> = {}
  payments.forEach((p) => {
    const key = p.invoice_id || ""
    if (key) {
      agg[key] = (agg[key] || 0) + (p.amount || 0)
    }
  })
  return agg
}, [payments])
```

---

## 📊 **أنماط التقارير والإحصائيات**

### 1. **إحصائيات ديناميكية مع الفلترة**
```typescript
// من app/invoices/page.tsx
const stats = useMemo(() => {
  const total = filteredInvoices.length
  const draft = filteredInvoices.filter(i => i.status === 'draft').length
  const sent = filteredInvoices.filter(i => i.status === 'sent').length
  const paid = filteredInvoices.filter(i => i.status === 'paid').length
  
  // استخدام getDisplayAmount للحصول على القيم الصحيحة حسب العملة
  const totalAmount = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0)
  const totalPaid = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'paid'), 0)
  const totalRemaining = totalAmount - totalPaid
  
  return { total, draft, sent, paid, totalAmount, totalPaid, totalRemaining }
}, [filteredInvoices, appCurrency, paidByInvoice])
```

### 2. **تقارير مالية في الجداول**
```typescript
// Footer للجداول مع إجماليات
footer: {
  render: () => {
    const totalInvoices = filteredInvoices.length
    const totalAmount = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0)
    const totalPaid = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'paid'), 0)
    const totalDue = totalAmount - totalPaid
    
    return (
      <tr>
        <td colSpan={tableColumns.length - 1}>
          الإجماليات ({totalInvoices} فاتورة)
        </td>
        <td>
          <div>الإجمالي: {totalAmount.toFixed(2)}</div>
          <div>المدفوع: {totalPaid.toFixed(2)}</div>
          <div>المستحق: {totalDue.toFixed(2)}</div>
        </td>
      </tr>
    )
  }
}
```

---

## 🔄 **أنماط المرتجعات والتعديلات**

### 1. **نظام المرتجعات المتقدم**
```typescript
// من app/invoices/page.tsx - معالجة المرتجعات
const openSalesReturn = async (inv: Invoice, mode: "partial" | "full") => {
  // جلب البنود المتاحة للإرجاع
  const availableQty = Math.max(0, originalQty - returnedQty)
  
  // تحديد الكمية للمرتجع الكامل أو الجزئي
  qtyToReturn: mode === "full" ? availableQty : 0
  
  // دعم البضائع التالفة (رصيد فقط بدون إرجاع للمخزون)
  qtyCreditOnly?: number
}
```

### 2. **تتبع حالات المرتجعات**
```typescript
// حالات متقدمة للمرتجعات
const returnStatus = newTotal === 0 ? "full" : "partial"
let newStatus: string = invRow.status
if (newTotal === 0) newStatus = "fully_returned"
else if (returnStatus === "partial") newStatus = "partially_returned"
```

---

## 🎨 **أنماط واجهة المستخدم**

### 1. **مكونات موحدة قابلة لإعادة الاستخدام**
```typescript
// DataTable موحد لجميع الجداول
<DataTable
  columns={tableColumns}
  data={paginatedInvoices}
  keyField="id"
  lang={appLang}
  minWidth="min-w-[700px]"
  footer={{ render: () => totalFooter }}
/>

// PageHeaderList موحد لجميع الصفحات
<PageHeaderList
  title={appLang === 'en' ? 'Sales Invoices' : 'الفواتير'}
  description={appLang === 'en' ? 'Manage invoices' : 'إدارة فواتيرك'}
  icon={FileText}
  createHref={permWrite ? "/invoices/new" : undefined}
  lang={appLang}
/>
```

### 2. **فلترة تفاعلية متقدمة**
```typescript
// FilterContainer مع عداد الفلاتر النشطة
<FilterContainer
  title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
  activeCount={activeFilterCount}
  onClear={clearFilters}
  defaultOpen={false}
>
  {/* MultiSelect للفلترة المتعددة */}
  <MultiSelect
    options={statusOptions}
    selected={filterStatuses}
    onChange={(val) => startTransition(() => setFilterStatuses(val))}
    placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
  />
</FilterContainer>
```

---

## 🚀 **أنماط تحسين الأداء**

### 1. **استخدام useTransition للفلترة**
```typescript
// تحسين الأداء مع useTransition
const [isPending, startTransition] = useTransition()

// تطبيق الفلاتر بدون blocking UI
onChange={(e) => {
  const val = e.target.value
  startTransition(() => setSearchQuery(val))
}}
```

### 2. **Memoization للحسابات المعقدة**
```typescript
// useMemo للإحصائيات والفلترة
const filteredInvoices = useMemo(() => {
  return invoices.filter((inv) => {
    // منطق الفلترة المعقد
  })
}, [invoices, filterStatuses, filterCustomers, ...dependencies])

const stats = useMemo(() => {
  // حسابات الإحصائيات
}, [filteredInvoices, appCurrency, paidByInvoice])
```

---

## 🔒 **أنماط الأمان والحماية**

### 1. **RLS Policies على مستوى قاعدة البيانات**
```sql
-- من scripts/data_visibility_rls_policies.sql
CREATE POLICY "invoices_visibility_policy" ON invoices
FOR ALL TO authenticated
USING (
  CASE 
    WHEN auth.uid() IS NULL THEN false
    ELSE (
      SELECT 
        CASE 
          WHEN filter->>'filter_type' = 'company_wide' THEN 
            company_id = (filter->>'company_id')::uuid
          WHEN filter->>'filter_type' = 'created_by' THEN 
            company_id = (filter->>'company_id')::uuid AND
            created_by_user_id = (filter->>'created_by_user_id')::uuid
          ELSE false
        END
      FROM get_user_visibility_filter(auth.uid(), company_id, 'invoices') AS filter
    )
  END
);
```

### 2. **التحقق من الصلاحيات في التطبيق**
```typescript
// التحقق من صلاحيات العمليات
const [permView, setPermView] = useState<boolean>(true)
const [permWrite, setPermWrite] = useState<boolean>(true)
const [permEdit, setPermEdit] = useState<boolean>(true)
const [permDelete, setPermDelete] = useState<boolean>(true)

useEffect(() => {
  (async () => {
    setPermView(await canAction(supabase, "invoices", "read"))
    setPermWrite(await canAction(supabase, "invoices", "write"))
    setPermEdit(await canAction(supabase, "invoices", "update"))
    setPermDelete(await canAction(supabase, "invoices", "delete"))
  })()
}, [supabase])
```

---

## 📱 **أنماط الاستجابة والتكيف**

### 1. **تصميم متجاوب للهاتف المحمول**
```typescript
// Grid متكيف حسب حجم الشاشة
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">

// إخفاء أعمدة حسب حجم الشاشة
{
  key: 'products',
  hidden: 'lg',  // يختفي على الشاشات الكبيرة
  width: 'max-w-[200px]'
}
```

### 2. **دعم اللغات المتعددة**
```typescript
// نظام اللغات الديناميكي
const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

// تبديل النصوص حسب اللغة
title={appLang === 'en' ? 'Sales Invoices' : 'الفواتير'}
description={appLang === 'en' ? 'Manage invoices' : 'إدارة فواتيرك'}

// تبديل اتجاه النص
<div className={`${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
```

---

## 🎯 **الخلاصة: أنماط النظام المتقدمة**

### ✅ **نقاط القوة:**
1. **نظام صلاحيات متدرج ومرن** - يدعم 5 مستويات من الأدوار
2. **فصل كامل للبيانات** - كل شركة معزولة تماماً
3. **تتبع شامل للعمليات** - كل مستند مرتبط بمنشئه
4. **نظام مرتجعات متقدم** - يدعم المرتجعات الجزئية والكاملة
5. **دعم العملات المتعددة** - مع تحويل تلقائي
6. **واجهة مستخدم متجاوبة** - تعمل على جميع الأجهزة
7. **أمان متعدد المستويات** - RLS + Application Level Security

### 🔧 **التحسينات المطبقة:**
1. **نظام Data Visibility موحد** - قواعد رؤية متسقة
2. **APIs موحدة** - نفس النمط لجميع المستندات  
3. **مكونات قابلة لإعادة الاستخدام** - DataTable, PageHeader, FilterContainer
4. **تحسين الأداء** - useTransition, useMemo, Pagination
5. **تجربة مستخدم محسنة** - فلترة تفاعلية، بحث ذكي، إحصائيات ديناميكية

هذا النظام يمثل **ERP متقدم** بمعايير عالمية للحوكمة والأمان والأداء.