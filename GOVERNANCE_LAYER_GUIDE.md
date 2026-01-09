# 🏛️ Governance Layer - Complete Guide
# دليل نظام الحوكمة الشامل

**Version:** 1.0.0  
**Date:** 2026-01-09  
**Status:** ✅ Production Ready

---

## 📋 نظرة عامة

نظام **Governance Layer** هو طبقة حاكمة إلزامية فوق جميع الحركات المالية والمخزنية في النظام.

### 🎯 الهدف

**لا نقد يتحرك، ولا مخزون يتحرك، ولا ذمم تتغير إلا من خلال:**

```
Request → Approval → Execution
```

---

## 🏗️ البنية الأساسية

### 1️⃣ جدول الإشعارات (Notifications)

**الغرض:** توجيه الإشعارات تلقائياً حسب السياق التنظيمي

**الحقول الإلزامية:**
- `company_id` - الشركة
- `branch_id` - الفرع (اختياري)
- `cost_center_id` - مركز التكلفة (اختياري)
- `warehouse_id` - المخزن (اختياري)
- `reference_type` - نوع المستند
- `reference_id` - معرف المستند
- `created_by` - من أنشأ
- `assigned_to_role` - الدور المستهدف
- `assigned_to_user` - المستخدم المستهدف (اختياري)

**الحالات:**
- `unread` - غير مقروء
- `read` - مقروء
- `archived` - مؤرشف
- `actioned` - تم التنفيذ

**الأولويات:**
- `low` - منخفضة
- `normal` - عادية
- `high` - عالية
- `urgent` - عاجلة

---

### 2️⃣ جدول الموافقات (Approval Workflows)

**الغرض:** محرك الموافقات الإلزامي لكل الحركات الحساسة

**دورة الحياة:**
```
DRAFT → PENDING_APPROVAL → APPROVED/REJECTED → EXECUTED
```

**الحقول الإلزامية:**
- `company_id` - الشركة
- `workflow_type` - نوع سير العمل
- `resource_type` - نوع المورد
- `resource_id` - معرف المورد
- `requested_by` - من طلب
- `status` - الحالة

**القيود:**
- ✅ المنشئ لا يمكنه الموافقة على طلبه (Separation of Duties)
- ✅ لا يمكن التنفيذ إلا بعد الموافقة
- ✅ لا يمكن التعديل بعد الموافقة

---

### 3️⃣ جدول طلبات الاسترداد النقدي (Refund Requests)

**الغرض:** نظام إلزامي لكل حركة نقدية صادرة (Refunds)

**دورة الحياة:**
```
DRAFT → PENDING_BRANCH_APPROVAL → PENDING_FINAL_APPROVAL → APPROVED → EXECUTED
```

**الموافقات المطلوبة:**
1. **موافقة مدير الفرع** (Branch Manager)
2. **موافقة نهائية** (Owner/CEO)

**القيود:**
- ✅ لا يمكن إنشاء سند صرف بدون Refund Request معتمد
- ✅ المنشئ لا يمكنه الموافقة على طلبه
- ✅ المبلغ المعتمد لا يمكن أن يتجاوز المبلغ المطلوب
- ✅ لا يمكن تعديل أو حذف سند صرف مرتبط بـ Refund Request

---

### 4️⃣ جدول سجل التدقيق (Audit Trail)

**الغرض:** تسجيل كامل لكل العمليات - لا يمكن الحذف أبداً

**ما يتم تسجيله:**
- من قام بالعملية (user_id, user_email, user_role)
- نوع العملية (create, update, delete, approve, reject, execute, void, cancel)
- نوع المورد (resource_type, resource_id)
- القيم القديمة والجديدة (old_values, new_values)
- الحقول المتغيرة (changed_fields)
- معلومات الجلسة (IP, User Agent, Session ID)
- التاريخ والوقت

**القيود:**
- ❌ لا يمكن الحذف أبداً (is_deleted = FALSE)
- ✅ تسجيل تلقائي عبر Triggers

---

## 🔧 الدوال المتاحة

### دوال الإشعارات

#### 1. إنشاء إشعار
```typescript
import { createNotification } from '@/lib/governance-layer'

const notificationId = await createNotification({
  companyId: 'uuid',
  referenceType: 'customer_debit_note',
  referenceId: 'uuid',
  title: 'إشعار مدين جديد',
  message: 'تم إنشاء إشعار مدين بمبلغ 5000',
  createdBy: 'user-uuid',
  branchId: 'branch-uuid',
  assignedToRole: 'manager',
  priority: 'high'
})
```

#### 2. الحصول على الإشعارات
```typescript
import { getUserNotifications } from '@/lib/governance-layer'

const notifications = await getUserNotifications({
  userId: 'user-uuid',
  companyId: 'company-uuid',
  status: 'unread'
})
```

#### 3. تحديد كمقروء
```typescript
import { markNotificationAsRead } from '@/lib/governance-layer'

await markNotificationAsRead('notification-uuid', 'user-uuid')
```

---

### دوال الموافقات

#### 1. إنشاء طلب موافقة
```typescript
import { createApprovalRequest } from '@/lib/governance-layer'

const approvalId = await createApprovalRequest({
  companyId: 'uuid',
  resourceType: 'customer_debit_note',
  resourceId: 'uuid',
  workflowType: 'financial',
  requestedBy: 'user-uuid',
  branchId: 'branch-uuid',
  amount: 5000
})
```

#### 2. الموافقة
```typescript
import { approveRequest } from '@/lib/governance-layer'

const result = await approveRequest(
  'approval-uuid',
  'approver-uuid',
  'موافق - تم التحقق'
)
```

#### 3. الرفض
```typescript
import { rejectRequest } from '@/lib/governance-layer'

const result = await rejectRequest(
  'approval-uuid',
  'rejector-uuid',
  'المبلغ غير صحيح'
)
```

---

### دوال طلبات الاسترداد النقدي

#### 1. إنشاء طلب استرداد
```typescript
import { createRefundRequest } from '@/lib/governance-layer'

const refundId = await createRefundRequest({
  companyId: 'uuid',
  branchId: 'uuid',
  sourceType: 'sales_return',
  sourceId: 'uuid',
  requestedAmount: 5000,
  reason: 'مرتجع بضاعة تالفة',
  createdBy: 'user-uuid',
  customerId: 'customer-uuid'
})
```

#### 2. تقديم للموافقة
```typescript
import { submitRefundForApproval } from '@/lib/governance-layer'

const result = await submitRefundForApproval('refund-uuid', 'user-uuid')
```

#### 3. موافقة مدير الفرع
```typescript
import { approveRefundBranchManager } from '@/lib/governance-layer'

const result = await approveRefundBranchManager(
  'refund-uuid',
  'manager-uuid',
  4500 // المبلغ المعتمد (اختياري)
)
```

#### 4. الموافقة النهائية (Owner)
```typescript
import { approveRefundFinal } from '@/lib/governance-layer'

const result = await approveRefundFinal('refund-uuid', 'owner-uuid')
```

#### 5. الرفض
```typescript
import { rejectRefundRequest } from '@/lib/governance-layer'

const result = await rejectRefundRequest(
  'refund-uuid',
  'rejector-uuid',
  'المبلغ غير مبرر'
)
```

---

## 🔄 سيناريوهات الاستخدام

### السيناريو 1: مرتجع بضاعة مع استرداد نقدي

```typescript
// 1. إنشاء مرتجع المبيعات
const salesReturn = await createSalesReturn({...})

// 2. إنشاء طلب استرداد نقدي
const refundId = await createRefundRequest({
  companyId,
  branchId,
  sourceType: 'sales_return',
  sourceId: salesReturn.id,
  requestedAmount: 5000,
  reason: 'مرتجع بضاعة تالفة',
  createdBy: userId,
  customerId: customerId
})

// 3. تقديم للموافقة
await submitRefundForApproval(refundId, userId)

// 4. مدير الفرع يوافق
await approveRefundBranchManager(refundId, managerId)

// 5. Owner يوافق نهائياً
await approveRefundFinal(refundId, ownerId)

// 6. الآن يمكن إنشاء سند الصرف
const payment = await createPayment({
  type: 'refund',
  amount: 5000,
  customerId: customerId,
  refundRequestId: refundId
})
```

---

### السيناريو 2: إشعار مدين عميل

```typescript
// 1. إنشاء إشعار مدين
const debitNote = await createCustomerDebitNote({
  companyId,
  customerId,
  totalAmount: 1000,
  reason: 'رسوم تأخير',
  createdBy: userId,
  branchId,
  approvalStatus: 'draft'
})

// 2. الإشعار التلقائي يتم إنشاؤه عبر Trigger
// ✅ تم إنشاء إشعار للمدير تلقائياً

// 3. تقديم للموافقة
await submitCustomerDebitNoteForApproval(debitNote.id, userId)

// 4. المدير يوافق
await approveCustomerDebitNote(debitNote.id, managerId)

// 5. تطبيق على فاتورة
await applyDebitNoteToInvoice(debitNote.id, invoiceId, 1000)
```

---

### السيناريو 3: إشعار دائن مورد

```typescript
// 1. إنشاء إشعار دائن
const vendorCredit = await createVendorCredit({
  companyId,
  supplierId,
  totalAmount: 3000,
  reason: 'مرتجع بضاعة',
  createdBy: userId,
  branchId,
  approvalStatus: 'draft'
})

// 2. تقديم للموافقة
await submitVendorCreditForApproval(vendorCredit.id, userId)

// 3. المدير يوافق
await approveVendorCredit(vendorCredit.id, managerId)

// 4. تطبيق على سند صرف
await applyVendorCreditToPayment(vendorCredit.id, paymentId, 3000)
```

---

## 🛡️ Anti-Fraud Guards

### 1. منع سند صرف بدون Refund Request

```sql
-- Trigger: trg_prevent_payment_without_refund
-- يمنع إنشاء سند صرف من نوع 'refund' بدون Refund Request معتمد
```

**النتيجة:**
```
❌ Cannot create refund payment without an approved refund request
```

---

### 2. منع تعديل سند صرف مرتبط

```sql
-- Trigger: trg_prevent_refund_payment_modification
-- يمنع تعديل سند صرف مرتبط بـ Refund Request منفذ
```

**النتيجة:**
```
❌ Cannot modify payment linked to an executed refund request
```

---

### 3. منع حذف سند صرف مرتبط

```sql
-- Trigger: trg_prevent_refund_payment_deletion
-- يمنع حذف سند صرف مرتبط بـ Refund Request
```

**النتيجة:**
```
❌ Cannot delete payment linked to a refund request. Void the refund request first.
```

---

## 📊 التقارير والاستعلامات

### 1. طلبات الاسترداد المعلقة

```typescript
import { getRefundRequests } from '@/lib/governance-layer'

const pendingRefunds = await getRefundRequests({
  companyId,
  status: 'pending_branch_approval'
})
```

---

### 2. طلبات الموافقة المعلقة

```typescript
import { getApprovalWorkflows } from '@/lib/governance-layer'

const pendingApprovals = await getApprovalWorkflows({
  companyId,
  status: 'pending_approval',
  resourceType: 'customer_debit_note'
})
```

---

### 3. سجل التدقيق

```typescript
import { getAuditTrail } from '@/lib/governance-layer'

const auditLog = await getAuditTrail({
  companyId,
  resourceType: 'refund_requests',
  resourceId: 'uuid',
  limit: 50
})
```

---

### 4. عدد الإشعارات غير المقروءة

```typescript
import { getUnreadNotificationCount } from '@/lib/governance-layer'

const count = await getUnreadNotificationCount(userId, companyId)
```

---

## 🔍 التحقق من الصلاحيات

### التحقق قبل إنشاء سند صرف

```typescript
import { canCreateRefundPayment } from '@/lib/governance-layer'

const check = await canCreateRefundPayment({
  customerId: 'uuid',
  amount: 5000
})

if (check.allowed) {
  // يمكن إنشاء سند الصرف
  const payment = await createPayment({
    refundRequestId: check.refundRequestId,
    ...
  })
} else {
  // عرض رسالة الخطأ
  console.error(check.reason)
}
```

---

## 📚 الملفات المهمة

1. **السكريبت:** `scripts/200_governance_layer_complete.sql`
2. **TypeScript Helpers:** `lib/governance-layer.ts`
3. **الدليل:** `GOVERNANCE_LAYER_GUIDE.md` (هذا الملف)
4. **الملخص بالعربية:** `ملخص_نظام_الحوكمة.md`

---

## ✅ الفوائد

1. ✅ **امتثال كامل** للمعايير المحاسبية الدولية (IFRS)
2. ✅ **امتثال SOX** (Sarbanes-Oxley Act)
3. ✅ **منع الاحتيال** عبر فصل المهام والموافقات المزدوجة
4. ✅ **تتبع كامل** لكل عملية عبر Audit Trail
5. ✅ **حماية البيانات** من التلاعب والحذف
6. ✅ **إشعارات تلقائية** موجهة حسب السياق
7. ✅ **قابل للتدقيق** بالكامل
8. ✅ **Enterprise ERP Grade**

---

**آخر تحديث:** 2026-01-09
**الإصدار:** 1.0.0 - Governance Layer Complete

