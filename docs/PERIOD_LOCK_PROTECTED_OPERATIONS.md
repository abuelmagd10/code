# العمليات المحمية بـ Period Lock
## Period Lock Protected Operations

**التاريخ:** 2026-01-19  
**الحالة:** ✅ **مكتمل**

---

## ✅ قائمة العمليات المحمية

### 1. قيود اليومية اليدوية
- **الملف:** `app/journal-entries/new/page.tsx`
- **الوظيفة:** `handleSubmit`
- **التحقق:** قبل إنشاء `journal_entry`
- **التاريخ المستخدم:** `formData.entry_date`

---

### 2. تغيير حالة الفاتورة (Invoice Status)
- **الملف:** `app/invoices/[id]/page.tsx`
- **الوظيفة:** `handleChangeStatus`
- **التحقق:** قبل تغيير الحالة إلى `sent`, `paid`, `partially_paid`
- **التاريخ المستخدم:** `invoice.invoice_date`

---

### 3. سندات القبض والصرف
- **الملف:** `app/banking/[id]/page.tsx`
- **الوظيفة:** `recordEntry`
- **التحقق:** قبل إنشاء قيد `bank_deposit` أو `cash_withdrawal`
- **التاريخ المستخدم:** `cfg.date`

---

### 4. مرتجعات الشراء
- **الملف:** `app/purchase-returns/new/page.tsx`
- **الوظيفة:** `saveReturn`
- **التحقق:** قبل إنشاء قيد `purchase_return`
- **التاريخ المستخدم:** `form.return_date`

---

### 5. المدفوعات
- **الملف:** `app/payments/page.tsx`
- **الوظائف:**
  - `saveCustomerPayment` - قبل إنشاء قيد `customer_payment`
  - `saveSupplierPayment` - قبل إنشاء قيد `supplier_payment`
  - `applyPaymentToBillWithOverrides` - قبل إنشاء قيد `bill_payment`
- **التاريخ المستخدم:** `payment.date` أو `payment.payment_date`

---

### 6. إنشاء Journal Entries العامة
- **الملف:** `lib/accrual-accounting-engine.ts`
- **الوظيفة:** `saveJournalEntry`
- **التحقق:** قبل إنشاء أي قيد
- **التاريخ المستخدم:** `journalEntry.entry_date`

---

### 7. فواتير الإيرادات
- **الملف:** `lib/accrual-accounting-engine.ts`
- **الوظيفة:** `createInvoiceRevenueJournal`
- **التحقق:** قبل إنشاء قيد الفاتورة
- **التاريخ المستخدم:** `invoice.invoice_date`

---

## 📝 الكود المستخدم للحماية

```typescript
// ✅ ERP-Grade: Period Lock Check
try {
  const { assertPeriodNotLocked } = await import("@/lib/accounting-period-lock")
  const { createClient } = await import("@supabase/supabase-js")
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  await assertPeriodNotLocked(serviceSupabase, {
    companyId: companyId,
    date: transactionDate,
  })
} catch (lockError: any) {
  // رفض العملية مع رسالة خطأ واضحة
  throw new Error(lockError.message || "Accounting period is locked")
}
```

---

## 🚫 ما يُمنع بعد إقفال الفترة

- ❌ إنشاء Journal Entry جديد
- ❌ تعديل Journal Entry موجود
- ❌ تسجيل Invoice كـ Sent
- ❌ تسجيل Invoice كـ Paid
- ❌ تسجيل Payment
- ❌ تسجيل COGS
- ❌ تسجيل Write-Off
- ❌ تسجيل Purchase Return
- ❌ تسجيل Sales Return
- ❌ تسجيل Vendor Credit
- ❌ تسجيل Customer Credit

---

## ✅ النتيجة

**أي محاولة تسجيل قيد داخل فترة مقفلة = رفض العملية بخطأ محاسبي صريح**

---

**تاريخ التحديث:** 2026-01-19
