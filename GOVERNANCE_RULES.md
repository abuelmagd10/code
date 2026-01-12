# 🔐 قواعد الحوكمة والالتزام - ERB VitaSlims

## 📋 نظرة عامة

هذا المستند يحدد القواعد الإلزامية للحوكمة والالتزام المحاسبي في نظام ERB VitaSlims.

**⚠️ تحذير حرج**: أي انتهاك لهذه القواعد يعتبر Bug خطير (P0) ويجب إصلاحه فوراً.

---

## 🧩 1️⃣ الحوكمة (Governance)

### 📊 الحقول الإلزامية لكل جدول

كل سجل في الجداول التالية **يجب** أن يحتوي على حقول الحوكمة:

| الجدول | الحقول الإلزامية |
|--------|------------------|
| `sales_orders` | `company_id`, `branch_id`, `cost_center_id`, `warehouse_id`, `created_by` |
| `invoices` | `company_id`, `branch_id`, `cost_center_id`, `warehouse_id`, `created_by` |
| `inventory_transactions` | `company_id`, `branch_id`, `cost_center_id`, `warehouse_id`, `created_by` |
| `suppliers` | `company_id`, `branch_id`, `cost_center_id`, `created_by` |
| `customers` | `company_id`, `branch_id`, `cost_center_id`, `created_by` |

### ❌ ممنوع منعاً باتاً

```sql
-- ❌ ممنوع وجود قيم NULL في حقول الحوكمة
branch_id IS NULL
warehouse_id IS NULL
cost_center_id IS NULL
```

**استثناء وحيد**: الكيانات التعريفية فقط (`companies`, `branches`)

### ✅ استعلام التحقق

```sql
-- التحقق من عدم وجود سجلات بدون حوكمة
SELECT 'sales_orders' as table_name, COUNT(*) as violations
FROM sales_orders 
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*)
FROM invoices 
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL
UNION ALL
SELECT 'inventory_transactions', COUNT(*)
FROM inventory_transactions 
WHERE branch_id IS NULL OR warehouse_id IS NULL OR cost_center_id IS NULL;

-- النتيجة المتوقعة: 0 rows لكل جدول
```

---

## 🔐 2️⃣ صلاحيات الرؤية (Data Visibility)

### 📌 قاعدة الاستعلام الإلزامية

**كل استعلام** يجب أن يحتوي على:

```sql
WHERE company_id = current_company
  AND branch_id IN (allowed_branches)
  AND warehouse_id IN (allowed_warehouses)
  AND cost_center_id IN (allowed_cost_centers)
```

### 👥 صلاحيات حسب الدور

| الدور | نطاق الرؤية | الشرط |
|------|-------------|-------|
| **Staff** | سجلاته فقط | `created_by = current_user_id` |
| **Accountant** | الفرع + المخازن التابعة | `branch_id = user_branch AND warehouse_id IN (branch_warehouses)` |
| **Manager** | كل الفرع | `branch_id = user_branch` |
| **Admin / GM** | كل الشركة | `company_id = user_company` |

### ❌ ممنوع منعاً باتاً

```sql
-- ❌ لا تستخدم OR مع NULL في أي API
OR branch_id IS NULL
OR warehouse_id IS NULL

-- ❌ لا تتجاوز فلاتر الحوكمة
SELECT * FROM sales_orders  -- بدون WHERE
```

### ✅ مثال صحيح

```typescript
// ✅ استعلام صحيح مع فلاتر الحوكمة
const { data, error } = await supabase
  .from('sales_orders')
  .select('*')
  .eq('company_id', userCompanyId)
  .in('branch_id', allowedBranches)
  .in('warehouse_id', allowedWarehouses)
  .in('cost_center_id', allowedCostCenters);
```

---

## 🧾 3️⃣ دورة حياة الفاتورة (Accounting Compliance)

### 📊 جدول الحالات والأحداث

| الحالة | حركة مخزون | قيد محاسبي | دفعة | ملاحظات |
|--------|------------|-----------|------|---------|
| **Draft** | ❌ | ❌ | ❌ | مسودة فقط |
| **Sent** | ✅ | ❌ | ✅ | تم إرسال الفاتورة + خصم المخزون |
| **Partially Paid** | ❌ | ✅ | ✅ | دفعة جزئية + قيد محاسبي |
| **Paid** | ❌ | ✅ | ❌ | مدفوعة بالكامل |
| **Returned** | ✅ (عكسي) | ✅ (عكسي) | Credit Note | مرتجع |

### 🔒 قواعد الفاتورة المدفوعة

أي فاتورة بحالة `Paid`:

- ❌ **لا يمكن تعديلها**
- ❌ **لا يمكن حذفها**
- ✅ **فقط يمكن عمل Return**

### ✅ استعلامات التحقق

```sql
-- 1. فواتير Draft بحركات مخزون (يجب = 0)
SELECT i.id, i.invoice_number, i.status
FROM invoices i
INNER JOIN inventory_transactions it ON it.invoice_id = i.id
WHERE i.status = 'draft';

-- 2. فواتير Sent بدون حركات مخزون (يجب = 0)
SELECT i.id, i.invoice_number, i.status
FROM invoices i
LEFT JOIN inventory_transactions it ON it.invoice_id = i.id
WHERE i.status = 'sent' AND it.id IS NULL;

-- 3. فواتير Paid بدون قيود محاسبية (يجب = 0)
SELECT i.id, i.invoice_number, i.status
FROM invoices i
LEFT JOIN accounting_entries ae ON ae.invoice_id = i.id
WHERE i.status = 'paid' AND ae.id IS NULL;

-- 4. قيود محاسبية بدون دفعات (يجب = 0)
SELECT ae.id, ae.entry_number
FROM accounting_entries ae
LEFT JOIN payments p ON p.accounting_entry_id = ae.id
WHERE ae.invoice_id IS NOT NULL AND p.id IS NULL;
```

---

## 📦 4️⃣ المخزون (Inventory)

### 📋 الحقول الإلزامية لحركة المخزون

أي حركة مخزون **يجب** أن تحتوي على:

```typescript
interface InventoryTransaction {
  warehouse_id: string;      // ✅ إلزامي
  branch_id: string;         // ✅ إلزامي
  cost_center_id: string;    // ✅ إلزامي
  source_type: 'invoice' | 'transfer' | 'adjustment';  // ✅ إلزامي
  source_id: string;         // ✅ إلزامي
  created_by: string;        // ✅ إلزامي
}
```

### ❌ ممنوع منعاً باتاً

```sql
-- ❌ حركة بدون فاتورة أو أمر
INSERT INTO inventory_transactions (product_id, quantity)
VALUES ('prod-123', 10);  -- بدون source_type و source_id

-- ❌ حركة بدون مستودع
INSERT INTO inventory_transactions (product_id, quantity, warehouse_id)
VALUES ('prod-123', 10, NULL);
```

### ✅ استعلام التحقق

```sql
-- حركات مخزون بدون مستودع (يجب = 0)
SELECT * FROM inventory_transactions
WHERE warehouse_id IS NULL;

-- حركات مخزون بدون مصدر (يجب = 0)
SELECT * FROM inventory_transactions
WHERE source_type IS NULL OR source_id IS NULL;

-- حركات مخزون بدون حوكمة (يجب = 0)
SELECT * FROM inventory_transactions
WHERE branch_id IS NULL 
   OR cost_center_id IS NULL 
   OR created_by IS NULL;
```

---

## 🔄 5️⃣ الربط بين أوامر البيع والفواتير

### 📊 سلسلة الأحداث الإلزامية

```
Sales Order → Invoice → Inventory Transaction → Accounting Entry
```

### 🔗 العلاقات المطلوبة

```sql
-- 1. ربط أمر البيع بالفاتورة
sales_orders.id → invoices.sales_order_id

-- 2. ربط الفاتورة بحركة المخزون
invoices.id → inventory_transactions.source_id (WHERE source_type = 'invoice')

-- 3. ربط الفاتورة بالقيد المحاسبي
invoices.id → accounting_entries.invoice_id
```

### 📌 قاعدة الأحداث

أي فاتورة يجب أن يكون لها:

1. **Stock Event** (عند Sent)
2. **Accounting Event** (عند Paid)

### ✅ استعلامات التحقق

```sql
-- فواتير بدون أوامر بيع (تحذير فقط)
SELECT i.id, i.invoice_number
FROM invoices i
WHERE i.sales_order_id IS NULL;

-- فواتير Sent بدون حركات مخزون (يجب = 0)
SELECT i.id, i.invoice_number
FROM invoices i
LEFT JOIN inventory_transactions it 
  ON it.source_id = i.id AND it.source_type = 'invoice'
WHERE i.status IN ('sent', 'paid') AND it.id IS NULL;

-- فواتير Paid بدون قيود محاسبية (يجب = 0)
SELECT i.id, i.invoice_number
FROM invoices i
LEFT JOIN accounting_entries ae ON ae.invoice_id = i.id
WHERE i.status = 'paid' AND ae.id IS NULL;
```

---

## 🔔 6️⃣ الإشعارات والاعتمادات

### 📋 العمليات التي تتطلب إشعارات

أي عملية من هذه **يجب** أن تولد إشعار:

| العملية | نوع الإشعار | المستلم |
|---------|-------------|---------|
| تحويل مخازن | `transfer_request` | مدير المستودع المستهدف |
| إهلاك | `depreciation_alert` | المحاسب + المدير |
| مرتجع | `return_request` | مدير المبيعات + المحاسب |
| اعتماد فاتورة | `invoice_approval` | المدير المالي |
| تغيير موظف | `staff_change` | HR + المدير المباشر |

### 🔗 بيانات الإشعار الإلزامية

```typescript
interface Notification {
  user_id: string;           // ✅ المستخدم المستهدف
  role_id?: string;          // ✅ أو الدور
  branch_id: string;         // ✅ الفرع
  warehouse_id?: string;     // ✅ المستودع (إن وجد)
  type: string;              // ✅ نوع الإشعار
  source_type: string;       // ✅ نوع المصدر
  source_id: string;         // ✅ معرف المصدر
  message: string;           // ✅ الرسالة
  is_read: boolean;          // ✅ حالة القراءة
}
```

### ✅ استعلام التحقق

```sql
-- عمليات بدون إشعارات (تحذير)
SELECT 'transfers' as operation, COUNT(*) as missing_notifications
FROM inventory_transactions it
LEFT JOIN notifications n ON n.source_id = it.id AND n.source_type = 'transfer'
WHERE it.source_type = 'transfer' AND n.id IS NULL
UNION ALL
SELECT 'returns', COUNT(*)
FROM invoices i
LEFT JOIN notifications n ON n.source_id = i.id AND n.source_type = 'return'
WHERE i.status = 'returned' AND n.id IS NULL;
```

---

## 🧪 7️⃣ اختبارات التدقيق الشاملة

### 🔍 الاستعلامات الحرجة (يجب أن ترجع 0 rows)

```sql
-- ============================================
-- 1. فواتير Paid بدون قيود محاسبية
-- ============================================
SELECT i.id, i.invoice_number, i.status, i.total_amount
FROM invoices i
LEFT JOIN accounting_entries ae ON ae.invoice_id = i.id
WHERE i.status = 'paid' AND ae.id IS NULL;
-- المتوقع: 0 rows ✅

-- ============================================
-- 2. حركات مخزون بدون مستودع
-- ============================================
SELECT it.id, it.product_id, it.quantity, it.transaction_date
FROM inventory_transactions it
WHERE it.warehouse_id IS NULL;
-- المتوقع: 0 rows ✅

-- ============================================
-- 3. بيانات بدون فرع (أوامر البيع)
-- ============================================
SELECT so.id, so.order_number, so.customer_id
FROM sales_orders so
WHERE so.branch_id IS NULL;
-- المتوقع: 0 rows ✅

-- ============================================
-- 4. فواتير بدون سياق حوكمة كامل
-- ============================================
SELECT i.id, i.invoice_number,
       CASE 
         WHEN i.company_id IS NULL THEN 'company_id'
         WHEN i.branch_id IS NULL THEN 'branch_id'
         WHEN i.warehouse_id IS NULL THEN 'warehouse_id'
         WHEN i.cost_center_id IS NULL THEN 'cost_center_id'
         WHEN i.created_by IS NULL THEN 'created_by'
       END as missing_field
FROM invoices i
WHERE i.company_id IS NULL 
   OR i.branch_id IS NULL 
   OR i.warehouse_id IS NULL 
   OR i.cost_center_id IS NULL 
   OR i.created_by IS NULL;
-- المتوقع: 0 rows ✅

-- ============================================
-- 5. ازدواج المخزون (نفس المنتج، نفس المستودع، نفس الوقت)
-- ============================================
SELECT it1.product_id, it1.warehouse_id, it1.transaction_date, COUNT(*) as duplicates
FROM inventory_transactions it1
INNER JOIN inventory_transactions it2 
  ON it1.product_id = it2.product_id 
  AND it1.warehouse_id = it2.warehouse_id
  AND it1.transaction_date = it2.transaction_date
  AND it1.id != it2.id
GROUP BY it1.product_id, it1.warehouse_id, it1.transaction_date
HAVING COUNT(*) > 1;
-- المتوقع: 0 rows ✅

-- ============================================
-- 6. فواتير Draft بحركات مخزون
-- ============================================
SELECT i.id, i.invoice_number, i.status, COUNT(it.id) as stock_movements
FROM invoices i
INNER JOIN inventory_transactions it ON it.source_id = i.id
WHERE i.status = 'draft'
GROUP BY i.id, i.invoice_number, i.status;
-- المتوقع: 0 rows ✅

-- ============================================
-- 7. قيود محاسبية غير متوازنة
-- ============================================
SELECT ae.id, ae.entry_number, 
       SUM(CASE WHEN aed.type = 'debit' THEN aed.amount ELSE 0 END) as total_debit,
       SUM(CASE WHEN aed.type = 'credit' THEN aed.amount ELSE 0 END) as total_credit
FROM accounting_entries ae
INNER JOIN accounting_entry_details aed ON aed.entry_id = ae.id
GROUP BY ae.id, ae.entry_number
HAVING SUM(CASE WHEN aed.type = 'debit' THEN aed.amount ELSE 0 END) 
    != SUM(CASE WHEN aed.type = 'credit' THEN aed.amount ELSE 0 END);
-- المتوقع: 0 rows ✅
```

---

## 📊 ملخص القواعد الحرجة

### ✅ يجب (MUST)

1. ✅ كل سجل يحتوي على `company_id`, `branch_id`, `cost_center_id`, `created_by`
2. ✅ كل استعلام يحتوي على فلاتر الحوكمة الكاملة
3. ✅ كل فاتورة Paid لها قيد محاسبي
4. ✅ كل فاتورة Sent لها حركة مخزون
5. ✅ كل حركة مخزون لها مستودع ومصدر
6. ✅ كل قيد محاسبي متوازن (Debit = Credit)
7. ✅ كل عملية حرجة تولد إشعار

### ❌ ممنوع (MUST NOT)

1. ❌ `branch_id IS NULL` في أي جدول عملياتي
2. ❌ `warehouse_id IS NULL` في حركات المخزون
3. ❌ `OR branch_id IS NULL` في أي استعلام
4. ❌ تعديل أو حذف فاتورة Paid
5. ❌ حركة مخزون بدون مصدر
6. ❌ قيد محاسبي غير متوازن
7. ❌ تجاوز فلاتر الحوكمة

---

## 🚨 إجراءات الطوارئ

### عند اكتشاف انتهاك

1. **توقف فوراً** عن أي عملية
2. **سجل الانتهاك** في `COMPLIANCE_VIOLATIONS.log`
3. **أبلغ المراجع** فوراً
4. **لا تنشر** الكود حتى الإصلاح
5. **اختبر الإصلاح** بجميع استعلامات التدقيق

### سكريبت الفحص السريع

```bash
# تشغيل جميع اختبارات التدقيق
.\run-compliance-audit.ps1

# النتيجة المتوقعة: All checks passed ✅
```

---

## 📝 سجل التغييرات

| التاريخ | الإصدار | التغيير |
|---------|---------|---------|
| 2024-01-15 | 1.0.0 | إنشاء المستند الأولي |

---

**حالة المستند**: ✅ نشط ومعتمد  
**المراجع**: فريق الحوكمة  
**آخر مراجعة**: 2024-01-15
