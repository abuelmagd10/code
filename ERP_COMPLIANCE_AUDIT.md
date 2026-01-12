# 🔒 ERP Compliance Audit - مراجعة الالتزام الشاملة

## 📋 نظرة عامة

هذا المستند يحتوي على مراجعة شاملة وإلزامية لنظام الـERP بالكامل للتأكد من التطبيق الفعلي يطابق النموذج المحاسبي ونظام الحوكمة المعتمد رسميًا.

**تاريخ المراجعة**: 2024-01-XX  
**الحالة**: 🔴 قيد المراجعة  
**المراجع**: Amazon Q Developer

---

## 🎯 القواعد المحاسبية الإلزامية

### النموذج المحاسبي المعتمد:

| الحالة | المخزون | القيود المحاسبية | المدفوعات | المرتجعات |
|--------|---------|-------------------|-----------|-----------|
| **Draft** | ❌ | ❌ | ❌ | ❌ |
| **Sent** | ✅ (خصم فقط) | ❌ | ✅ | ✅ (مخزون فقط) |
| **Partially Paid** | ✅ | ✅ (على المدفوع) | ✅ | ✅ (مخزون + قيد) |
| **Paid** | ✅ | ✅ (كامل) | ✅ | ✅ (مخزون + قيد) |
| **Cancelled** | ❌ | ❌ | ❌ | ❌ |

**القاعدة الذهبية**: لا قيد محاسبي بدون دفع فعلي.

---

## 1️⃣ الطبقة المحاسبية (Accounting Layer)

### ✅ الملفات المطلوب مراجعتها:

- [ ] `lib/accrual-accounting-engine.ts`
- [ ] `app/api/invoices/route.ts`
- [ ] `app/invoices/[id]/page.tsx`
- [ ] `app/payments/page.tsx`
- [ ] `lib/sales-returns.ts`

### 🔍 نقاط التحقق الإلزامية:

#### 1.1 Draft Invoices
```typescript
// ✅ يجب التأكد من:
if (invoice.status === 'draft') {
  // ❌ لا مخزون
  // ❌ لا قيود محاسبية
  // ❌ لا مدفوعات
}
```

**الملفات المشتبه بها**:
- ❌ `app/invoices/new/page.tsx` - قد ينشئ حركات مخزون للمسودات
- ❌ `lib/accrual-accounting-engine.ts` - قد ينشئ قيود للمسودات

#### 1.2 Sent Invoices
```typescript
// ✅ يجب التأكد من:
if (invoice.status === 'sent') {
  // ✅ خصم مخزون فقط
  // ❌ لا قيود محاسبية (AR/Revenue)
  // ✅ يمكن استلام دفعات
}
```

**الملفات المشتبه بها**:
- ⚠️ `app/invoices/[id]/page.tsx` - دالة `handleChangeStatus('sent')`
- ⚠️ `lib/accrual-accounting-engine.ts` - دالة `createInvoiceAccountingEntry`

#### 1.3 Paid/Partially Paid Invoices
```typescript
// ✅ يجب التأكد من:
if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
  // ✅ قيد محاسبي فقط على المبلغ المدفوع
  // ❌ لا حركة مخزون جديدة
}
```

**الملفات المشتبه بها**:
- ⚠️ `app/payments/page.tsx` - دالة `handlePaymentSubmit`
- ⚠️ `lib/accrual-accounting-engine.ts` - دالة `createPaymentEntry`

#### 1.4 Returns
```typescript
// ✅ يجب التأكد من:
if (returnType === 'sales_return') {
  if (invoice.status === 'sent') {
    // ✅ مخزون فقط (Stock In)
    // ❌ لا قيود محاسبية
  } else if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
    // ✅ مخزون (Stock In)
    // ✅ قيد عكسي
    // ✅ رصيد دائن للعميل (إن لزم)
  }
}
```

**الملفات المشتبه بها**:
- 🔴 `lib/sales-returns.ts` - دالة `processSalesReturn`
- 🔴 `app/invoices/[id]/page.tsx` - دالة `submitSalesReturn`

---

## 2️⃣ طبقة المخزون (Inventory Layer)

### ✅ الملفات المطلوب مراجعتها:

- [ ] `app/api/invoices/route.ts`
- [ ] `app/invoices/[id]/page.tsx`
- [ ] `lib/sales-returns.ts`
- [ ] Database Triggers: `trg_apply_inventory_insert`

### 🔍 نقاط التحقق الإلزامية:

#### 2.1 حركات المخزون للفواتير
```sql
-- ✅ يجب التأكد من:
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(it.id) as inventory_transactions
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id
WHERE i.status = 'draft'
GROUP BY i.id
HAVING COUNT(it.id) > 0;

-- النتيجة المتوقعة: 0 rows (لا توجد حركات مخزون للمسودات)
```

#### 2.2 عدم الازدواج مع أوامر البيع
```sql
-- ✅ يجب التأكد من عدم وجود ازدواج:
SELECT 
  so.id as sales_order_id,
  so.order_number,
  i.id as invoice_id,
  i.invoice_number,
  COUNT(DISTINCT it.id) as so_inventory_count,
  COUNT(DISTINCT it2.id) as inv_inventory_count
FROM sales_orders so
INNER JOIN invoices i ON i.sales_order_id = so.id
LEFT JOIN inventory_transactions it ON it.reference_id = so.id
LEFT JOIN inventory_transactions it2 ON it2.reference_id = i.id
WHERE so.status != 'draft' AND i.status != 'draft'
GROUP BY so.id, i.id
HAVING COUNT(DISTINCT it.id) > 0 AND COUNT(DISTINCT it2.id) > 0;

-- النتيجة المتوقعة: 0 rows (لا ازدواج)
```

---

## 3️⃣ طبقة الربط بين المستندات (Document Integrity)

### ✅ الملفات المطلوب مراجعتها:

- [ ] `app/api/invoices/route.ts`
- [ ] `app/api/sales-orders/route.ts`
- [ ] `lib/data-visibility-control.ts`

### 🔍 نقاط التحقق الإلزامية:

#### 3.1 سياق الحوكمة الإلزامي
```sql
-- ✅ يجب التأكد من عدم وجود فواتير بدون سياق:
SELECT 
  'invoices' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE company_id IS NULL) as missing_company,
  COUNT(*) FILTER (WHERE branch_id IS NULL) as missing_branch,
  COUNT(*) FILTER (WHERE warehouse_id IS NULL) as missing_warehouse,
  COUNT(*) FILTER (WHERE created_by_user_id IS NULL) as missing_creator
FROM invoices
UNION ALL
SELECT 
  'sales_orders',
  COUNT(*),
  COUNT(*) FILTER (WHERE company_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE warehouse_id IS NULL),
  COUNT(*) FILTER (WHERE created_by_user_id IS NULL)
FROM sales_orders;

-- النتيجة المتوقعة: جميع missing_* = 0
```

#### 3.2 ربط الفواتير بأوامر البيع
```sql
-- ✅ يجب التأكد من:
SELECT 
  COUNT(*) as invoices_without_sales_order
FROM invoices
WHERE sales_order_id IS NULL
  AND status != 'draft'
  AND status != 'cancelled';

-- النتيجة المتوقعة: 0 (كل فاتورة مرتبطة بأمر بيع)
```

---

## 4️⃣ طبقة الحوكمة والصلاحيات (Governance & Roles)

### ✅ الملفات المطلوب مراجعتها:

- [ ] `app/api/invoices/route.ts`
- [ ] `app/api/sales-orders/route.ts`
- [ ] `lib/data-visibility-control.ts`
- [ ] `lib/validation.ts`

### 🔍 نقاط التحقق الإلزامية:

#### 4.1 فلاتر الرؤية حسب الدور
```typescript
// ✅ يجب التأكد من:
const accessLevel = getRoleAccessLevel(role);

if (accessLevel === 'own') {
  // الموظف: فقط ما أنشأه
  query = query.eq('created_by_user_id', userId);
  // ❌ لا يوجد: .or('branch_id.is.null')
}

if (accessLevel === 'branch') {
  // المحاسب/المدير: كل الفرع
  query = query.eq('branch_id', userBranchId);
  // ❌ لا يوجد: .or('branch_id.is.null')
}

if (accessLevel === 'company') {
  // المدير العام: كل الشركة
  query = query.eq('company_id', companyId);
  // ❌ لا يوجد: .or('company_id.is.null')
}
```

**الملفات المشتبه بها**:
- 🔴 `app/api/invoices/route.ts` - قد يحتوي على `.or('branch_id.is.null')`
- 🔴 `app/api/sales-orders/route.ts` - قد يحتوي على تجاوز للحوكمة

#### 4.2 منع التجاوز عبر API
```typescript
// ❌ يجب عدم وجود:
.or('branch_id.is.null')
.or('created_by_user_id.is.null')
.is('branch_id', null)

// ✅ يجب وجود:
.eq('branch_id', userBranchId)
.eq('created_by_user_id', userId)
```

---

## 5️⃣ طبقة الحماية المحاسبية (Accounting Locks)

### ✅ الملفات المطلوب مراجعتها:

- [ ] `app/invoices/[id]/edit/page.tsx`
- [ ] `app/invoices/[id]/page.tsx`
- [ ] `lib/validation/invoice-validation.ts`

### 🔍 نقاط التحقق الإلزامية:

#### 5.1 منع التعديل للفواتير المحمية
```typescript
// ✅ يجب التأكد من:
if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
  // ❌ لا يمكن التعديل
  // ❌ لا يمكن الحذف
  throw new Error('Cannot modify paid invoices');
}

// التحقق من وجود دفعات
const { data: payments } = await supabase
  .from('payments')
  .select('id')
  .eq('invoice_id', invoiceId)
  .limit(1);

if (payments && payments.length > 0) {
  // ❌ لا يمكن التعديل أو الحذف
  throw new Error('Cannot modify invoice with payments');
}
```

**الملفات المشتبه بها**:
- ⚠️ `app/invoices/[id]/edit/page.tsx` - قد يسمح بالتعديل
- ⚠️ `app/invoices/page.tsx` - دالة `handleDelete`

---

## 6️⃣ اختبار الالتزام (Mandatory Audit)

### 📊 SQL Audit Queries

#### Query 1: فواتير Draft بحركات مخزون
```sql
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(it.id) as inventory_count
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id
WHERE i.status = 'draft'
GROUP BY i.id
HAVING COUNT(it.id) > 0;
```
**النتيجة المتوقعة**: 0 rows ✅

#### Query 2: فواتير Sent بقيود محاسبية
```sql
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(je.id) as journal_entries_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.id
HAVING COUNT(je.id) > 0;
```
**النتيجة المتوقعة**: 0 rows ✅

#### Query 3: فواتير بدون سياق حوكمة
```sql
SELECT 
  id,
  invoice_number,
  status,
  company_id,
  branch_id,
  warehouse_id,
  created_by_user_id
FROM invoices
WHERE company_id IS NULL
   OR branch_id IS NULL
   OR warehouse_id IS NULL
   OR created_by_user_id IS NULL;
```
**النتيجة المتوقعة**: 0 rows ✅

#### Query 4: ازدواج المخزون (أمر بيع + فاتورة)
```sql
SELECT 
  so.order_number,
  i.invoice_number,
  COUNT(DISTINCT it1.id) as so_inventory,
  COUNT(DISTINCT it2.id) as inv_inventory
FROM sales_orders so
INNER JOIN invoices i ON i.sales_order_id = so.id
LEFT JOIN inventory_transactions it1 ON it1.reference_id = so.id
LEFT JOIN inventory_transactions it2 ON it2.reference_id = i.id
WHERE so.status != 'draft' AND i.status != 'draft'
GROUP BY so.id, i.id
HAVING COUNT(DISTINCT it1.id) > 0 AND COUNT(DISTINCT it2.id) > 0;
```
**النتيجة المتوقعة**: 0 rows ✅

#### Query 5: قيود محاسبية بدون دفعات
```sql
SELECT 
  je.id,
  je.reference_type,
  je.reference_id,
  i.invoice_number,
  i.status,
  i.paid_amount
FROM journal_entries je
INNER JOIN invoices i ON i.id = je.reference_id
WHERE je.reference_type = 'invoice'
  AND i.status = 'sent'
  AND i.paid_amount = 0;
```
**النتيجة المتوقعة**: 0 rows ✅

---

## 🚨 الانتهاكات الحرجة (Critical Violations)

### 🔴 انتهاكات من الدرجة الأولى (P0)
- [ ] فواتير Draft بحركات مخزون
- [ ] فواتير Sent بقيود محاسبية
- [ ] قيود محاسبية بدون دفعات فعلية
- [ ] فواتير بدون سياق حوكمة

### 🟠 انتهاكات من الدرجة الثانية (P1)
- [ ] ازدواج المخزون بين أمر البيع والفاتورة
- [ ] تجاوز الحوكمة عبر API
- [ ] تعديل فواتير محمية

### 🟡 انتهاكات من الدرجة الثالثة (P2)
- [ ] فواتير بدون ربط بأمر بيع
- [ ] حركات مخزون بدون سياق

---

## 📝 خطة الإصلاح

### المرحلة 1: التدقيق الفوري (24 ساعة)
1. تنفيذ جميع SQL Audit Queries
2. توثيق جميع الانتهاكات
3. تصنيف الانتهاكات حسب الأولوية

### المرحلة 2: الإصلاح الطارئ (48 ساعة)
1. إصلاح انتهاكات P0
2. إنشاء Database Constraints
3. تحديث API Endpoints

### المرحلة 3: التحقق النهائي (72 ساعة)
1. إعادة تنفيذ Audit Queries
2. اختبار شامل للنظام
3. توثيق الالتزام

---

## ✅ معايير النجاح

النظام يعتبر **ملتزم بالكامل** إذا:

1. ✅ جميع SQL Audit Queries تعيد 0 rows
2. ✅ لا توجد طريقة لتجاوز الحوكمة عبر API
3. ✅ لا يمكن إنشاء قيد محاسبي بدون دفع فعلي
4. ✅ لا يمكن تعديل أو حذف فواتير محمية
5. ✅ جميع المستندات مرتبطة بسياق حوكمة كامل

---

## 📞 جهات الاتصال

**المراجع الرئيسي**: Amazon Q Developer  
**تاريخ المراجعة**: 2024-01-XX  
**الحالة**: 🔴 قيد المراجعة

---

**ملاحظة مهمة**: هذا المستند يمثل معيار الالتزام الإلزامي. أي انحراف عن هذه القواعد يعتبر **Bug خطير (Critical Financial Violation)** ويجب إصلاحه فورًا.
