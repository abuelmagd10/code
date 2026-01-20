# 🔔 دليل إضافة الإشعارات في المشروع

## 📋 الأماكن التي يجب إضافة إشعارات فيها

### ✅ **تم إضافتها بالفعل:**
1. ✅ نقل المخزون (`app/inventory-transfers/[id]/page.tsx`) - `notifyStockTransferRequest`
2. ✅ إشعار دائن مورد (`app/vendor-credits/new/page.tsx`) - `notifyVendorCreditCreated` (عبر trigger)
3. ✅ إشعار مدين عميل (`app/customer-debit-notes/new/page.tsx`) - `notifyCustomerDebitNoteCreated` (عبر trigger)
4. ✅ طلب استرداد نقدي - `notifyRefundRequestCreated`

### ❌ **يجب إضافتها:**

#### 1. **إنشاء فاتورة مبيعات** (`app/invoices/new/page.tsx`)
```typescript
// بعد إنشاء الفاتورة بنجاح (بعد السطر 899)
import { createNotification } from '@/lib/governance-layer'

await createNotification({
  companyId: companyId,
  referenceType: 'invoice',
  referenceId: invoiceData.id,
  title: appLang === 'en' ? 'New Sales Invoice' : 'فاتورة مبيعات جديدة',
  message: appLang === 'en' 
    ? `Invoice ${invoiceNumber} has been created` 
    : `تم إنشاء فاتورة ${invoiceNumber}`,
  createdBy: user.id,
  branchId: branchId || undefined,
  costCenterId: costCenterId || undefined,
  assignedToRole: 'accountant',
  priority: 'normal',
  eventKey: `invoice:${invoiceData.id}:created`,
  severity: 'info',
  category: 'sales'
})
```

#### 2. **إنشاء فاتورة مشتريات** (`app/bills/new/page.tsx`)
```typescript
// بعد إنشاء الفاتورة بنجاح (بعد السطر 622)
import { createNotification } from '@/lib/governance-layer'

await createNotification({
  companyId: companyId,
  referenceType: 'bill',
  referenceId: bill.id,
  title: appLang === 'en' ? 'New Purchase Bill' : 'فاتورة مشتريات جديدة',
  message: appLang === 'en' 
    ? `Bill ${billNumber} has been created and requires approval` 
    : `تم إنشاء فاتورة ${billNumber} وتحتاج إلى موافقة`,
  createdBy: user.id,
  branchId: branchId || undefined,
  costCenterId: costCenterId || undefined,
  assignedToRole: 'manager',
  priority: 'high',
  eventKey: `bill:${bill.id}:created`,
  severity: 'warning',
  category: 'approvals'
})

// إشعار للمحاسب أيضاً
await createNotification({
  companyId: companyId,
  referenceType: 'bill',
  referenceId: bill.id,
  title: appLang === 'en' ? 'New Purchase Bill' : 'فاتورة مشتريات جديدة',
  message: appLang === 'en' 
    ? `Bill ${billNumber} has been created` 
    : `تم إنشاء فاتورة ${billNumber}`,
  createdBy: user.id,
  branchId: branchId || undefined,
  costCenterId: costCenterId || undefined,
  assignedToRole: 'accountant',
  priority: 'normal',
  eventKey: `bill:${bill.id}:created:accountant`,
  severity: 'info',
  category: 'finance'
})
```

#### 3. **إنشاء طلب شراء** (`app/purchase-orders/new/page.tsx`)
```typescript
// بعد إنشاء طلب الشراء بنجاح
import { createNotification } from '@/lib/governance-layer'

await createNotification({
  companyId: companyId,
  referenceType: 'purchase_order',
  referenceId: poData.id,
  title: appLang === 'en' ? 'New Purchase Order' : 'طلب شراء جديد',
  message: appLang === 'en' 
    ? `Purchase Order ${poNumber} has been created` 
    : `تم إنشاء طلب شراء ${poNumber}`,
  createdBy: user.id,
  branchId: branchId || undefined,
  costCenterId: costCenterId || undefined,
  assignedToRole: 'manager',
  priority: 'normal',
  eventKey: `purchase_order:${poData.id}:created`,
  severity: 'info',
  category: 'approvals'
})
```

#### 4. **إنشاء طلب مبيعات** (`app/sales-orders/new/page.tsx`)
```typescript
// بعد إنشاء طلب المبيعات بنجاح
import { createNotification } from '@/lib/governance-layer'

await createNotification({
  companyId: companyId,
  referenceType: 'sales_order',
  referenceId: soData.id,
  title: appLang === 'en' ? 'New Sales Order' : 'طلب مبيعات جديد',
  message: appLang === 'en' 
    ? `Sales Order ${soNumber} has been created` 
    : `تم إنشاء طلب مبيعات ${soNumber}`,
  createdBy: user.id,
  branchId: branchId || undefined,
  costCenterId: costCenterId || undefined,
  assignedToRole: 'manager',
  priority: 'normal',
  eventKey: `sales_order:${soData.id}:created`,
  severity: 'info',
  category: 'sales'
})
```

#### 5. **إنشاء نقل مخزون** (`app/inventory-transfers/new/page.tsx`)
```typescript
// بعد إنشاء طلب النقل بنجاح (بعد السطر 335)
import { notifyStockTransferRequest } from '@/lib/notification-helpers'

await notifyStockTransferRequest({
  companyId: companyId,
  transferId: transfer.id,
  sourceBranchId: srcWarehouse?.branch_id || undefined,
  destinationBranchId: destWarehouse?.branch_id || undefined,
  destinationWarehouseId: destinationWarehouseId || undefined,
  createdBy: user.id,
  appLang: appLang
})
```

---

## 📝 ملاحظات مهمة

1. **event_key**: يجب أن يكون فريدًا لكل حدث
   - صيغة: `{reference_type}:{reference_id}:{action}`
   - مثال: `invoice:INV-001:created`

2. **severity**: 
   - `info` - إشعارات عادية
   - `warning` - تحتاج انتباه
   - `error` - مشكلة
   - `critical` - حرج

3. **category**:
   - `finance` - مالية
   - `inventory` - مخزون
   - `sales` - مبيعات
   - `approvals` - موافقات
   - `system` - نظام

4. **assignedToRole**: 
   - `manager` - للمدير
   - `accountant` - للمحاسب
   - `owner` - للمالك
   - `store_manager` - لمسؤول المخزن

---

## ✅ قائمة التحقق

- [ ] إضافة إشعار عند إنشاء فاتورة مبيعات
- [ ] إضافة إشعار عند إنشاء فاتورة مشتريات
- [ ] إضافة إشعار عند إنشاء طلب شراء
- [ ] إضافة إشعار عند إنشاء طلب مبيعات
- [ ] إضافة إشعار عند إنشاء نقل مخزون
- [ ] التحقق من أن جميع الإشعارات تستخدم `event_key`
- [ ] التحقق من أن `severity` و `category` صحيحة
