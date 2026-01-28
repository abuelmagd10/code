# 🔒 دليل تطبيق الحوكمة الدائمة

## 🎯 الهدف

تطبيق طبقة حماية دائمة تمنع انتهاكات الحوكمة مستقبلاً على مستوى:
1. قاعدة البيانات (Constraints + Triggers + RLS)
2. التطبيق (Middleware + Validation)
3. API (Enforcement على كل endpoint)

---

## 📋 خطوات التطبيق

### المرحلة 1: قاعدة البيانات (5 دقائق)

```sql
-- في Supabase SQL Editor
-- شغل الملف: sql/enforce-governance-constraints.sql
```

**ما يتم تطبيقه:**
- ✅ قيود NOT NULL على جميع حقول الحوكمة
- ✅ Triggers للتحقق من صحة البيانات
- ✅ Row Level Security (RLS) لعزل الشركات
- ✅ فهارس للأداء

**النتيجة:**
- ❌ لا يمكن إدخال NULL في حقول الحوكمة
- ❌ لا يمكن ربط فرع بشركة خاطئة
- ❌ لا يمكن رؤية بيانات شركات أخرى

---

### المرحلة 2: Middleware (10 دقائق)

#### 1. استخدام Governance Middleware

```typescript
// في أي API route
import { enforceGovernance, applyGovernanceFilters } from '@/lib/governance-middleware'

export async function GET(request: NextRequest) {
  // إلزامي: تطبيق الحوكمة أولاً
  const governance = await enforceGovernance()
  
  // إلزامي: تطبيق الفلاتر على الاستعلام
  let query = supabase.from('sales_orders').select('*')
  query = applyGovernanceFilters(query, governance)
  
  const { data } = await query
  return NextResponse.json({ data })
}
```

#### 2. للإدخال والتحديث

```typescript
import { validateGovernanceData, addGovernanceData } from '@/lib/governance-middleware'

export async function POST(request: NextRequest) {
  const governance = await enforceGovernance()
  const body = await request.json()
  
  // إضافة بيانات الحوكمة تلقائياً
  const data = addGovernanceData(body, governance)
  
  // التحقق من الصحة
  validateGovernanceData(data, governance)
  
  // الإدخال
  const { data: result } = await supabase
    .from('sales_orders')
    .insert(data)
  
  return NextResponse.json({ data: result })
}
```

---

### المرحلة 3: تحديث APIs الموجودة (30 دقيقة)

#### الملفات التي تحتاج تحديث:

```
app/api/
├── sales-orders/
│   └── route.ts          ✅ تطبيق enforceGovernance
├── invoices/
│   └── route.ts          ✅ تطبيق enforceGovernance
├── inventory/
│   └── route.ts          ✅ تطبيق enforceGovernance
├── customers/
│   └── route.ts          ✅ تطبيق enforceGovernance
└── suppliers/
    └── route.ts          ✅ تطبيق enforceGovernance
```

#### قالب التحديث:

```typescript
// قبل
export async function GET() {
  const { data } = await supabase
    .from('sales_orders')
    .select('*')
  return NextResponse.json({ data })
}

// بعد
export async function GET() {
  const governance = await enforceGovernance()
  
  let query = supabase.from('sales_orders').select('*')
  query = applyGovernanceFilters(query, governance)
  
  const { data } = await query
  return NextResponse.json({ data })
}
```

---

### المرحلة 4: إزالة أنماط OR IS NULL (15 دقيقة)

#### ابحث عن هذه الأنماط وأزلها:

```typescript
// ❌ ممنوع
.or('branch_id.is.null')
.or(`branch_id.is.null,branch_id.eq.${branchId}`)

// ✅ صحيح
.in('branch_id', governance.branchIds)
```

#### الملفات المحتملة:

```bash
# ابحث في المشروع
grep -r "OR.*IS NULL" .
grep -r "or('.*is.null" .
grep -r "branch_id.is.null" .
```

---

### المرحلة 5: تحديث Components (20 دقيقة)

#### في صفحات React:

```typescript
// قبل
const loadOrders = async () => {
  const { data } = await supabase
    .from('sales_orders')
    .select('*')
  setOrders(data)
}

// بعد
const loadOrders = async () => {
  // الحوكمة تطبق تلقائياً عبر RLS
  // لكن يفضل استخدام API endpoint
  const response = await fetch('/api/sales-orders')
  const { data } = await response.json()
  setOrders(data)
}
```

---

## ✅ قائمة التحقق

### قاعدة البيانات
- [ ] تطبيق NOT NULL constraints
- [ ] تطبيق Triggers
- [ ] تفعيل RLS
- [ ] إنشاء الفهارس

### Middleware
- [ ] إنشاء governance-middleware.ts
- [ ] اختبار enforceGovernance()
- [ ] اختبار applyGovernanceFilters()
- [ ] اختبار validateGovernanceData()

### APIs
- [ ] تحديث /api/sales-orders
- [ ] تحديث /api/invoices
- [ ] تحديث /api/inventory
- [ ] تحديث /api/customers
- [ ] تحديث /api/suppliers

### تنظيف الكود
- [ ] إزالة جميع OR IS NULL
- [ ] إزالة الفلاتر المعقدة القديمة
- [ ] تحديث Components للاستخدام APIs

### اختبار
- [ ] اختبار إدخال بيانات بدون حوكمة (يجب أن يفشل)
- [ ] اختبار رؤية بيانات شركات أخرى (يجب أن يفشل)
- [ ] اختبار الأدوار المختلفة (staff, manager, admin)

---

## 🧪 اختبارات التحقق

### 1. اختبار NOT NULL

```sql
-- يجب أن يفشل
INSERT INTO sales_orders (company_id, branch_id, warehouse_id, cost_center_id)
VALUES ('valid-uuid', NULL, 'valid-uuid', 'valid-uuid');
-- Expected: ERROR: null value in column "branch_id"
```

### 2. اختبار Trigger

```sql
-- يجب أن يفشل (فرع لا ينتمي للشركة)
INSERT INTO sales_orders (company_id, branch_id, warehouse_id, cost_center_id)
VALUES ('company-1', 'branch-from-company-2', 'warehouse-1', 'cost-center-1');
-- Expected: ERROR: Branch does not belong to company
```

### 3. اختبار RLS

```typescript
// يجب أن يرجع فقط بيانات الشركة الحالية
const { data } = await supabase
  .from('sales_orders')
  .select('*')

// التحقق: جميع السجلات لها نفس company_id
```

### 4. اختبار Middleware

```typescript
// يجب أن يرمي خطأ
const governance = await enforceGovernance()
validateGovernanceData({
  company_id: governance.companyId,
  branch_id: 'invalid-branch-id',
  warehouse_id: governance.warehouseIds[0],
  cost_center_id: governance.costCenterIds[0]
}, governance)
// Expected: Error: Governance Violation: Invalid branch_id
```

---

## 🚨 أخطاء شائعة

### 1. نسيان تطبيق enforceGovernance

```typescript
// ❌ خطأ
export async function GET() {
  const { data } = await supabase.from('sales_orders').select('*')
  return NextResponse.json({ data })
}

// ✅ صحيح
export async function GET() {
  const governance = await enforceGovernance()
  let query = supabase.from('sales_orders').select('*')
  query = applyGovernanceFilters(query, governance)
  const { data } = await query
  return NextResponse.json({ data })
}
```

### 2. استخدام OR IS NULL

```typescript
// ❌ خطأ
.or('branch_id.is.null')

// ✅ صحيح
.in('branch_id', governance.branchIds)
```

### 3. عدم التحقق من البيانات قبل الإدخال

```typescript
// ❌ خطأ
await supabase.from('sales_orders').insert(body)

// ✅ صحيح
const data = addGovernanceData(body, governance)
validateGovernanceData(data, governance)
await supabase.from('sales_orders').insert(data)
```

---

## 🔐 القواعد الإلزامية غير القابلة للتجاوز (Mandatory & Non-bypassable Rules)

### 📌 قاعدة إعادة دورة اعتماد فواتير المشتريات

> **الحالة**: ✅ مُفعّلة على مستوى Database Trigger
> **التاريخ**: 2026-01-28
> **الملف**: `scripts/MANDATORY_ERP_GOVERNANCE_FIXES.sql`

#### 🔒 القاعدة الحاكمة

```
أي تعديل أو إلغاء على فاتورة مشتريات في أي مرحلة اعتماد
(غير draft وغير مغلقة محاسبيًا)
يُجبر النظام على إعادة دورة الاعتماد بالكامل من البداية.
```

#### 📋 الحالات المشمولة

| الحالة الأصلية | التعديل | النتيجة |
|---------------|---------|---------|
| `pending_approval` | أي تعديل مؤثر | ✅ إعادة دورة الاعتماد |
| `approved` | أي تعديل مؤثر | ✅ إعادة دورة الاعتماد |
| `received` | أي تعديل مؤثر | ✅ إعادة دورة الاعتماد |
| `draft` + `receipt_status=rejected` | أي تعديل مؤثر | ✅ إعادة دورة الاعتماد |
| `paid` / `partially_paid` / `cancelled` / `voided` / `fully_returned` | أي تعديل | ❌ لا تتأثر (مغلقة محاسبياً) |

#### 🛡️ الحقول المراقبة (Content Changed Detection)

```sql
supplier_id, bill_date, due_date, subtotal, tax_amount, total_amount,
discount_type, discount_value, discount_position, tax_inclusive,
shipping, shipping_tax_rate, adjustment, branch_id, warehouse_id, cost_center_id
```

#### ⚡ السلوك الإجباري عند التعديل

عند أي تعديل مؤثر على فاتورة في دورة اعتماد:

1. **إعادة الحالة**:
   - `status` → `pending_approval`
   - `approval_status` → `pending_approval`

2. **تصفير حقول الاعتماد**:
   - `approved_by` → `NULL`
   - `approved_at` → `NULL`

3. **تصفير حقول الاستلام**:
   - `receipt_status` → `NULL`
   - `receipt_rejection_reason` → `NULL`

4. **إرسال إشعارات**:
   - إشعار للـ `owner`
   - إشعار للـ `general_manager`

#### 🗑️ قاعدة الإلغاء (Void)

عند تحويل أي فاتورة إلى `voided`:
- يتم مسح جميع آثار الاعتماد والاستلام تلقائياً
- لا يمكن بقاء أي حالة اعتماد نشطة

#### 🔐 لماذا Database Trigger؟

| نقطة الدخول | الحماية |
|-------------|---------|
| UI (صفحة التعديل) | ✅ محمي |
| API مباشر | ✅ محمي |
| Script خارجي | ✅ محمي |
| Supabase Dashboard | ✅ محمي |
| أي مصدر آخر | ✅ محمي |

**النتيجة**: مستحيل تجاوز القاعدة من أي مدخل.

#### 🧪 اختبارات التحقق

```sql
-- اختبار 1: تعديل فاتورة approved
UPDATE bills SET total_amount = 100 WHERE status = 'approved';
-- النتيجة المتوقعة: status = 'pending_approval', approved_by = NULL

-- اختبار 2: Void فاتورة
UPDATE bills SET status = 'voided' WHERE id = 'xxx';
-- النتيجة المتوقعة: approval_status = NULL, receipt_status = NULL

-- اختبار 3: فاتورة مغلقة (paid) لا تتأثر
UPDATE bills SET total_amount = 100 WHERE status = 'paid';
-- النتيجة المتوقعة: status يبقى 'paid'
```

---

## 📊 مقاييس النجاح

بعد التطبيق الكامل:

- ✅ 0 استعلامات بدون enforceGovernance
- ✅ 0 أنماط OR IS NULL في الكود
- ✅ 100% APIs محمية بـ middleware
- ✅ جميع الاختبارات تمر بنجاح
- ✅ لا يمكن إدخال بيانات بدون حوكمة

---

## 📞 الدعم

إذا واجهت مشاكل:
1. راجع GOVERNANCE_RULES.md
2. تحقق من تطبيق RLS بشكل صحيح
3. تأكد من وجود بيانات المستخدم (company_id, role)

---

**الوقت المتوقع للتطبيق الكامل**: 1-2 ساعة  
**الأولوية**: P0 (حرج)  
**الحالة**: جاهز للتطبيق
