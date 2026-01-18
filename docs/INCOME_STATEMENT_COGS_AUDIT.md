# 📋 مراجعة Income Statement API - COGS Source of Truth

## 🔍 تحليل مصادر COGS Journal Entries

### 1️⃣ **app/api/income-statement/route.ts**
**الحالة**: ✅ **مقبول** (لا يحسب COGS مباشرة)
- يستخدم `journal_entry_lines` فقط
- لا يحسب COGS من `products.cost_price`
- يعتمد على القيود المحاسبية الموجودة فقط

---

### 2️⃣ **lib/accrual-accounting-engine.ts - `createCOGSJournalOnDelivery`**
**الحالة**: ⚠️ **يحتاج إصلاح**
- **المشكلة**: يستخدم `products.cost_price` كـ fallback (السطر 303-305)
- **المطلوب**: يجب الاعتماد على `cogs_transactions` فقط

```typescript
// ⚠️ كود حالي غير مقبول:
if (fifoConsumptions && fifoConsumptions.length > 0) {
  totalCOGS += fifoCOGS  // ✅ جيد
} else {
  totalCOGS += quantity * costPrice  // ❌ ممنوع
}
```

---

### 3️⃣ **scripts/011_auto_cogs_trigger.sql**
**الحالة**: ⚠️ **يحتاج مراجعة**
- يستخدم `consume_fifo_lots()` - ✅ جيد
- لكن **لا يتحقق من وجود `cogs_transactions`**
- يجب التأكد من أن `cogs_transactions` يُنشأ قبل journal entry

---

### 4️⃣ **app/invoices/[id]/page.tsx**
**الحالة**: ⏸️ **قيد التحقق**
- يجب التأكد من كيفية إنشاء COGS journal entries
- يجب التحقق من عدم استخدام `products.cost_price`

---

## 🚨 المشاكل المحتملة:

### ❌ **Bug محاسبي 1**: `createCOGSJournalOnDelivery` يستخدم `cost_price`
- **الموقع**: `lib/accrual-accounting-engine.ts:303-305`
- **المشكلة**: Fallback على `products.cost_price`
- **الإصلاح المطلوب**: إزالة Fallback أو استخدام `cogs_transactions` فقط

### ⚠️ **تحذير 1**: Database Trigger لا يتحقق من `cogs_transactions`
- **الموقع**: `scripts/011_auto_cogs_trigger.sql`
- **المشكلة**: قد يُنشئ journal entry بدون `cogs_transactions`
- **المطلوب**: إضافة تحقق من `cogs_transactions` قبل إنشاء journal entry

---

## ✅ المعيار المطلوب:

### قبل إنشاء Journal Entry:
1. ✅ التحقق من وجود `cogs_transactions` للفاتورة
2. ✅ استخدام `SUM(total_cost)` من `cogs_transactions`
3. ❌ **ممنوع** استخدام `products.cost_price`

### Journal Entry Structure:
- `reference_type = 'invoice_cogs'`
- `reference_id = invoice_id`
- يجب أن يكون مرتبط بـ `cogs_transactions`

---

## 🔧 الإصلاحات المطلوبة:

1. **تحديث `lib/accrual-accounting-engine.ts`**:
   - إزالة Fallback على `products.cost_price`
   - الاعتماد على `cogs_transactions` فقط

2. **تحديث Database Trigger** (إن كان مستخدماً):
   - التحقق من `cogs_transactions` قبل إنشاء journal entry

3. **التحقق من `app/invoices/[id]/page.tsx`**:
   - التأكد من عدم استخدام `cost_price` في إنشاء COGS
