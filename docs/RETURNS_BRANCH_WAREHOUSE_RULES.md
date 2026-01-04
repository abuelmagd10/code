# 📘 قواعد المرتجعات - ربط الفروع والمخازن

## 🎯 الهدف

ضمان أن جميع عمليات المرتجعات (بيع وشراء) تُنفذ على نفس الفرع والمخزن المرتبط بالمستند الأصلي، مع الحفاظ على سلامة البيانات المحاسبية والمخزنية.

---

## 📋 القواعد الإلزامية

### 1️⃣ **مرتجعات البيع (Sales Returns)**

#### القاعدة الأساسية:
> **يجب أن يُنفذ المرتجع على نفس `branch_id` و `warehouse_id` الموجود في الفاتورة الأصلية**

#### التطبيق:
```typescript
// ✅ الكود الصحيح
const { data: invoice } = await supabase
  .from("invoices")
  .select("branch_id, warehouse_id, cost_center_id")
  .eq("id", invoiceId)
  .single()

// إنشاء حركة المخزون
await supabase.from("inventory_transactions").insert({
  transaction_type: "sale_return",
  branch_id: invoice.branch_id,        // ✅ نفس الفرع
  warehouse_id: invoice.warehouse_id,  // ✅ نفس المخزن
  cost_center_id: invoice.cost_center_id
})
```

#### الحالات الخاصة:
- ✅ **فاتورة مرسلة (sent):** مرتجع مباشر بدون قيد محاسبي
- ✅ **فاتورة مدفوعة (paid):** مرتجع + قيد محاسبي عكسي + رصيد دائن للعميل
- ✅ **فاتورة مدفوعة جزئياً (partially_paid):** نفس المعاملة

---

### 2️⃣ **مرتجعات الشراء (Purchase Returns)**

#### القاعدة الأساسية:
> **يجب أن يُنفذ المرتجع على نفس `branch_id` و `warehouse_id` الموجود في فاتورة الشراء الأصلية**

#### التطبيق:
```typescript
// ✅ الكود الصحيح
const { data: bill } = await supabase
  .from("bills")
  .select("branch_id, warehouse_id, cost_center_id")
  .eq("id", billId)
  .single()

// إنشاء حركة المخزون
await supabase.from("inventory_transactions").insert({
  transaction_type: "purchase_return",
  quantity_change: -returnQty,         // ⚠️ سالب (خروج من المخزون)
  branch_id: bill.branch_id,           // ✅ نفس الفرع
  warehouse_id: bill.warehouse_id,     // ✅ نفس المخزن
  cost_center_id: bill.cost_center_id
})
```

#### التحقق من الرصيد:
```typescript
// 🔍 التحقق من كفاية الرصيد قبل المرتجع
const stockValidation = await validatePurchaseReturnStock(
  supabase,
  items,
  bill.warehouse_id,
  companyId
)

if (!stockValidation.success) {
  throw new Error(formatStockShortageMessage(stockValidation.shortages))
}
```

#### الحالات الخاصة:
- ✅ **فاتورة مستلمة (received):** مرتجع مباشر بدون قيد محاسبي
- ✅ **فاتورة مدفوعة (paid):** مرتجع + قيد محاسبي عكسي + رصيد مدين للمورد
- ✅ **فاتورة مدفوعة جزئياً (partially_paid):** نفس المعاملة

---

## 🔒 آليات الحماية

### 1. **منع تغيير الفرع/المخزن**
```typescript
// ❌ لا يُسمح بتغيير الفرع أو المخزن
const userSelectedBranch = "branch_123"
const userSelectedWarehouse = "warehouse_456"

// ✅ يجب استخدام القيم من المستند الأصلي فقط
const branch_id = originalDocument.branch_id
const warehouse_id = originalDocument.warehouse_id
```

### 2. **التحقق من الرصيد (مرتجعات الشراء فقط)**
```typescript
// قبل إنشاء مرتجع شراء
for (const item of returnItems) {
  const availableStock = await getProductStockInWarehouse(
    supabase,
    item.product_id,
    warehouse_id,
    companyId
  )
  
  if (availableStock < item.quantity) {
    throw new Error(`رصيد غير كافٍ: ${item.product_name}`)
  }
}
```

### 3. **ربط القيود المحاسبية**
```typescript
// القيد المحاسبي يجب أن يحمل نفس البيانات
await supabase.from("journal_entries").insert({
  reference_type: "sales_return", // أو "purchase_return"
  reference_id: originalDocumentId,
  branch_id: originalDocument.branch_id,
  warehouse_id: originalDocument.warehouse_id,
  cost_center_id: originalDocument.cost_center_id
})
```

---

## 📊 جدول المقارنة

| العنصر | مرتجعات البيع | مرتجعات الشراء |
|--------|---------------|-----------------|
| **الربط بالفرع** | ✅ إلزامي من الفاتورة | ✅ إلزامي من فاتورة الشراء |
| **الربط بالمخزن** | ✅ إلزامي من الفاتورة | ✅ إلزامي من فاتورة الشراء |
| **التحقق من الرصيد** | ⚠️ غير مطلوب (إضافة للمخزون) | ✅ إلزامي (خصم من المخزون) |
| **القيد المحاسبي** | ✅ للفواتير المدفوعة فقط | ✅ للفواتير المدفوعة فقط |
| **رصيد العميل/المورد** | ✅ رصيد دائن للعميل | ✅ رصيد مدين للمورد |

---

## ⚠️ الأخطاء الشائعة

### ❌ خطأ 1: استخدام فرع/مخزن المستخدم بدلاً من المستند الأصلي
```typescript
// ❌ خطأ
const branch_id = userContext.branch_id
const warehouse_id = userContext.warehouse_id

// ✅ صحيح
const branch_id = originalDocument.branch_id
const warehouse_id = originalDocument.warehouse_id
```

### ❌ خطأ 2: عدم التحقق من الرصيد في مرتجعات الشراء
```typescript
// ❌ خطأ - إنشاء مرتجع بدون تحقق
await createPurchaseReturn(items)

// ✅ صحيح
const validation = await validatePurchaseReturnStock(items, warehouse_id)
if (!validation.success) throw new Error(...)
await createPurchaseReturn(items)
```

### ❌ خطأ 3: إنشاء قيد محاسبي لفاتورة غير مدفوعة
```typescript
// ❌ خطأ
if (invoice.status === 'sent') {
  await createJournalEntry() // لا يجب إنشاء قيد
}

// ✅ صحيح
if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
  await createJournalEntry()
}
```

---

## 🧪 حالات الاختبار

### Test Case 1: مرتجع بيع لفاتورة مدفوعة
```typescript
// Given
const invoice = { 
  id: "inv_1", 
  status: "paid",
  branch_id: "branch_A",
  warehouse_id: "warehouse_1"
}

// When
const result = await createSalesReturn(invoice.id, items)

// Then
expect(result.inventory_transaction.branch_id).toBe("branch_A")
expect(result.inventory_transaction.warehouse_id).toBe("warehouse_1")
expect(result.journal_entry).toBeDefined()
expect(result.customer_credit).toBeGreaterThan(0)
```

### Test Case 2: مرتجع شراء بدون رصيد كافٍ
```typescript
// Given
const bill = { 
  id: "bill_1",
  warehouse_id: "warehouse_1"
}
const items = [{ product_id: "prod_1", quantity: 100 }]
const availableStock = 50

// When & Then
await expect(
  createPurchaseReturn(bill.id, items)
).rejects.toThrow("رصيد المخزن غير كافٍ")
```

---

## 📝 الخلاصة

✅ **القواعد الذهبية:**
1. المرتجع يتبع الفرع والمخزن الأصلي دائماً
2. التحقق من الرصيد إلزامي لمرتجعات الشراء
3. القيود المحاسبية للفواتير المدفوعة فقط
4. حركات المخزون تحمل نفس البيانات التنظيمية

⚠️ **تحذيرات:**
- لا تسمح للمستخدم بتغيير الفرع/المخزن في المرتجعات
- تحقق من الرصيد قبل مرتجعات الشراء
- لا تنشئ قيود محاسبية لفواتير غير مدفوعة

