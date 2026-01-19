# 🛑 تصحيحات محاسبية حرجة - Purchase Return + Vendor Credit

## ❌ الأخطاء الحالية في النظام

### 1️⃣ تعديل الفاتورة المدفوعة (خطأ محاسبي حرج)

**الوضع الحالي:**
```typescript
// ❌ خطأ: تعديل الفاتورة المدفوعة
await supabase.from("bills").update({
  total_amount: newTotal,        // ❌ تعديل الإجمالي
  paid_amount: newPaid,          // ❌ تعديل المدفوع
  status: newStatus,             // ❌ تعديل الحالة
  returned_amount: newReturnedAmount,
  return_status: newReturnStatus
}).eq("id", bill.id)
```

**المشكلة:**
- الفاتورة المدفوعة هي وثيقة تاريخية مغلقة (audit-locked)
- لا يجوز تعديلها في أي نظام ERP احترافي (Zoho, Odoo, QuickBooks)
- يخرب Audit Trail ويجعل التدقيق مستحيلاً

**✅ السلوك الصحيح ERP-grade:**

```typescript
// ✅ صحيح: الفاتورة المدفوعة تبقى كما هي
// لا يتم تعديل:
// - total_amount
// - paid_amount  
// - status

// فقط تسجيل المرتجع في returned_amount (للمرجعية فقط)
await supabase.from("bills").update({
  returned_amount: newReturnedAmount,  // ✅ فقط للمرجعية
  return_status: newReturnStatus        // ✅ فقط للمرجعية
}).eq("id", bill.id)

// ✅ إنشاء Vendor Credit مستقل
const vendorCredit = await createVendorCreditForReturn({
  totalAmount: returnAmount,  // 300
  status: 'open',
  applied_amount: 0
})
```

**مثال:**
```
Invoice #1 (Paid):
  total = 1000  ✅ لا يتغير
  paid  = 1000  ✅ لا يتغير
  status = paid ✅ لا يتغير
  returned_amount = 300  ✅ فقط للمرجعية

Vendor Credit:
  amount = 300
  status = open
  applied_amount = 0
```

---

### 2️⃣ القيد المحاسبي غير صحيح

**الوضع الحالي:**
```typescript
// ❌ خطأ: قيد واحد لجميع الحالات
// مدين: AP (تقليل الدين)
// دائن: Inventory
```

**المشكلة:**
- لا يميز بين رد النقد وعدم رد النقد
- يخلط بين Vendor Credit والاسترداد النقدي

**✅ القيد الصحيح حسب الحالة:**

#### الحالة A: لم يتم رد النقد (Vendor Credit فقط)

```typescript
// ✅ القيد الصحيح: Vendor Credit (AP Contra)
// مدين: Vendor Credit Liability (AP Contra)  300
// دائن: Inventory                             300

// لا يتم لمس:
// - النقد
// - الفاتورة الأصلية
// - AP للفاتورة الأصلية
```

**القيد:**
```
Dr. Vendor Credit Liability (AP Contra)  300
    Cr. Inventory                        300
```

#### الحالة B: تم رد النقد فعلياً

```typescript
// ✅ القيد الصحيح: استرداد نقدي مباشر
// مدين: Cash / Bank                   300
// دائن: Inventory                     300

// لا يتم إنشاء Vendor Credit
// (أو يُنشأ ثم يُغلق فوراً)
```

**القيد:**
```
Dr. Cash / Bank    300
    Cr. Inventory   300
```

---

### 3️⃣ عكس FIFO غير مكتمل

**الوضع الحالي:**
- يتم خصم المخزون فقط
- لا يتم عكس FIFO lots المستهلكة
- لا يتم عكس COGS transactions

**✅ السلوك الصحيح:**

```typescript
// 1. عكس استهلاك FIFO lots
await reverseFIFOConsumption(supabase, 'bill', billId)

// 2. عكس COGS transactions
const originalCOGS = await getCOGSByBill(supabase, billId)
for (const cogsTx of originalCOGS) {
  const returnRatio = returnQuantity / originalQuantity
  const returnQty = cogsTx.quantity * returnRatio
  
  await reverseCOGSTransaction(
    supabase,
    cogsTx.id,
    purchaseReturnId,
    returnQty,
    cogsTx.unit_cost  // ✅ نفس التكلفة الأصلية
  )
}

// 3. إرجاع الدفعات إلى FIFO lots
// (يتم تلقائياً في reverseFIFOConsumption)
```

**مثال:**
```
الفاتورة الأصلية:
  Product A: 100 units @ 10 EGP = 1000 EGP
  FIFO Lot #1: 100 units consumed

المرتجع:
  Product A: 30 units returned
  
✅ يجب:
  1. عكس استهلاك 30 units من FIFO Lot #1
  2. إرجاع 30 units @ 10 EGP إلى FIFO Lot #1
  3. عكس COGS transaction: -300 EGP
  4. القيد: Dr. Vendor Credit 300, Cr. Inventory 300
```

---

## ✅ الحل الصحيح ERP-grade

### 1️⃣ منطق المرتجع للفاتورة المدفوعة

```typescript
async function processPurchaseReturnForPaidBill(
  bill: Bill,
  returnItems: ReturnItem[],
  returnMethod: 'credit' | 'cash' | 'bank'
) {
  const returnAmount = calculateReturnTotal(returnItems)
  const isPaid = bill.status === 'paid' || bill.status === 'partially_paid'
  
  if (!isPaid) {
    // للفواتير غير المدفوعة: يمكن تعديل الفاتورة
    await updateBillForReturn(bill.id, returnAmount)
    return
  }
  
  // ✅ للفواتير المدفوعة: لا تعديل الفاتورة
  // فقط تسجيل المرتجع للمرجعية
  await supabase.from("bills").update({
    returned_amount: (bill.returned_amount || 0) + returnAmount,
    return_status: 'partial' // أو 'full' حسب الحالة
  }).eq("id", bill.id)
  
  // ✅ 1. عكس FIFO
  await reverseFIFOConsumption(supabase, 'bill', bill.id)
  
  // ✅ 2. عكس COGS
  await reverseCOGSForReturn(supabase, bill.id, returnItems)
  
  // ✅ 3. القيد المحاسبي حسب طريقة المرتجع
  if (returnMethod === 'credit') {
    // الحالة A: Vendor Credit فقط
    await createVendorCreditJournalEntry(
      returnAmount,
      returnItems  // للتكلفة من FIFO
    )
    
    // إنشاء Vendor Credit
    await createVendorCreditForReturn({
      billId: bill.id,
      totalAmount: returnAmount,
      status: 'open'
    })
  } else {
    // الحالة B: رد نقدي
    await createCashRefundJournalEntry(
      returnAmount,
      returnItems,
      returnMethod === 'cash' ? cashAccount : bankAccount
    )
    
    // لا يتم إنشاء Vendor Credit
  }
  
  // ✅ 4. تحديث المخزون (يتم تلقائياً من inventory_transactions)
}
```

### 2️⃣ القيد المحاسبي الصحيح

#### الحالة A: Vendor Credit (Credit Return)

```typescript
// ✅ القيد الصحيح
const inventoryCost = calculateInventoryCostFromFIFO(returnItems)

// قيد واحد فقط:
// Dr. Vendor Credit Liability (AP Contra)  [returnAmount]
// Cr. Inventory                              [inventoryCost]

await supabase.from("journal_entry_lines").insert([
  {
    journal_entry_id: entry.id,
    account_id: vendorCreditLiabilityAccount,  // AP Contra
    debit_amount: returnAmount,
    credit_amount: 0,
    description: 'Vendor Credit - Purchase Return'
  },
  {
    journal_entry_id: entry.id,
    account_id: inventoryAccount,
    debit_amount: 0,
    credit_amount: inventoryCost,  // من FIFO، ليس من السعر
    description: 'Inventory Returned to Supplier'
  }
])
```

#### الحالة B: Cash Refund

```typescript
// ✅ القيد الصحيح
const inventoryCost = calculateInventoryCostFromFIFO(returnItems)

// قيد واحد فقط:
// Dr. Cash / Bank        [returnAmount]
// Cr. Inventory          [inventoryCost]

await supabase.from("journal_entry_lines").insert([
  {
    journal_entry_id: entry.id,
    account_id: cashOrBankAccount,
    debit_amount: returnAmount,
    credit_amount: 0,
    description: 'Cash Refund Received'
  },
  {
    journal_entry_id: entry.id,
    account_id: inventoryAccount,
    debit_amount: 0,
    credit_amount: inventoryCost,  // من FIFO
    description: 'Inventory Returned to Supplier'
  }
])
```

### 3️⃣ عكس FIFO بشكل صحيح

```typescript
async function reverseFIFOForPurchaseReturn(
  supabase: SupabaseClient,
  billId: string,
  returnItems: ReturnItem[]
) {
  // 1. الحصول على استهلاكات FIFO الأصلية
  const { data: consumptions } = await supabase
    .from('fifo_lot_consumptions')
    .select('*, fifo_cost_lots(*)')
    .eq('reference_type', 'bill')
    .eq('reference_id', billId)
  
  // 2. عكس كل استهلاك بنسبة المرتجع
  for (const returnItem of returnItems) {
    const itemConsumptions = consumptions?.filter(
      c => c.product_id === returnItem.product_id
    ) || []
    
    // حساب نسبة المرتجع
    const originalQty = getOriginalQuantity(billId, returnItem.product_id)
    const returnRatio = returnItem.quantity / originalQty
    
    // عكس كل استهلاك
    for (const consumption of itemConsumptions) {
      const returnQty = consumption.quantity_consumed * returnRatio
      
      // إرجاع الكمية للدفعة
      await supabase
        .from('fifo_cost_lots')
        .update({
          remaining_quantity: 
            consumption.fifo_cost_lots.remaining_quantity + returnQty
        })
        .eq('id', consumption.lot_id)
      
      // حذف أو تحديث سجل الاستهلاك
      if (returnQty >= consumption.quantity_consumed) {
        // حذف كامل
        await supabase
          .from('fifo_lot_consumptions')
          .delete()
          .eq('id', consumption.id)
      } else {
        // تحديث الجزئي
        await supabase
          .from('fifo_lot_consumptions')
          .update({
            quantity_consumed: consumption.quantity_consumed - returnQty
          })
          .eq('id', consumption.id)
      }
    }
  }
  
  // 3. عكس COGS transactions
  await reverseCOGSTransactionsForReturn(
    supabase,
    billId,
    returnItems
  )
}
```

---

## 📊 مثال عملي شامل (صحيح)

### السيناريو:

1. **فاتورة مشتريات #1:**
   ```
   Bill #1:
     total = 1000 EGP
     paid  = 1000 EGP
     status = paid
     
   Product A: 100 units @ 10 EGP
   FIFO Lot #1: 100 units consumed @ 10 EGP
   ```

2. **مرتجع جزئي (Credit):**
   ```
   Return: 30 units of Product A
   Method: Credit (Vendor Credit)
   ```

3. **✅ ما يجب أن يحدث:**

   **أ) الفاتورة الأصلية:**
   ```
   Bill #1:
     total = 1000 EGP  ✅ لا يتغير
     paid  = 1000 EGP  ✅ لا يتغير
     status = paid     ✅ لا يتغير
     returned_amount = 300 EGP  ✅ فقط للمرجعية
   ```

   **ب) Vendor Credit:**
   ```
   Vendor Credit:
     amount = 300 EGP
     status = open
     applied_amount = 0
   ```

   **ج) FIFO:**
   ```
   FIFO Lot #1:
     original_quantity = 100
     remaining_quantity = 0 → 30  ✅ إرجاع 30 units
     unit_cost = 10 EGP
   ```

   **د) القيد المحاسبي:**
   ```
   Dr. Vendor Credit Liability (AP Contra)  300
       Cr. Inventory                        300
   ```

4. **فاتورة جديدة #2:**
   ```
   Bill #2:
     total = 500 EGP
     paid  = 0 EGP
     status = sent
   ```

5. **دفع الفاتورة #2 مع تطبيق Vendor Credit:**
   ```
   Vendor Credit Applied: 300 EGP
   Cash Payment: 200 EGP
   
   Bill #2:
     paid = 500 EGP
     status = paid
     
   Vendor Credit:
     applied_amount = 300 EGP
     status = applied
   ```

---

## 🎯 الخلاصة النهائية

### ✅ ما يجب أن يحدث:

1. **لا تعديل على الفاتورة المدفوعة**
   - `total_amount` لا يتغير
   - `paid_amount` لا يتغير
   - `status` لا يتغير
   - فقط `returned_amount` للمرجعية

2. **Vendor Credit مستقل**
   - يُنشأ تلقائياً عند مرتجع فاتورة مدفوعة (Credit)
   - لا يُنشأ عند رد نقدي
   - يبقى مفتوحاً حتى يُطبق

3. **القيد المحاسبي الصحيح**
   - Credit Return: Dr. Vendor Credit, Cr. Inventory
   - Cash Refund: Dr. Cash, Cr. Inventory
   - التكلفة من FIFO، ليس من السعر

4. **عكس FIFO بشكل صحيح**
   - إرجاع الدفعات المستهلكة
   - عكس COGS transactions
   - استخدام نفس التكلفة الأصلية

5. **التطبيق اليدوي فقط**
   - Vendor Credit يُطبق يدوياً على فواتير لاحقة
   - لا يوجد ربط تلقائي

---

## 📝 الملفات التي تحتاج تعديل

1. `app/bills/[id]/page.tsx` - `processPurchaseReturn()`
2. `app/bills/page.tsx` - `submitPurchaseReturn()`
3. `app/purchase-returns/new/page.tsx` - `saveReturn()`
4. `lib/purchase-returns-vendor-credits.ts` - منطق إنشاء Vendor Credit
5. إنشاء دالة جديدة: `lib/purchase-return-fifo-reversal.ts`

---

**تاريخ الإنشاء:** 2026-01-15  
**الأولوية:** 🔴 حرجة - يجب التصحيح فوراً  
**التوافق:** Zoho Books, Odoo, QuickBooks
