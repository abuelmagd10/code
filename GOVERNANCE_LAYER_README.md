# 🏛️ Governance Layer - Quick Start
# نظام الحوكمة - دليل البدء السريع

**Version:** 1.0.0  
**Status:** ✅ Production Ready

---

## 🚀 التثبيت السريع

### 1. تشغيل السكريبت

```bash
# الاتصال بقاعدة البيانات
psql -U postgres -d your_database_name

# تشغيل السكريبت
\i scripts/200_governance_layer_complete.sql
```

**أو باستخدام Supabase:**

```bash
# رفع السكريبت عبر Supabase Dashboard
# SQL Editor → New Query → نسخ محتوى الملف → Run
```

---

## 📦 ما سيتم تثبيته

### الجداول (4)
1. ✅ `notifications` - نظام الإشعارات
2. ✅ `approval_workflows` - محرك الموافقات
3. ✅ `refund_requests` - طلبات الاسترداد النقدي
4. ✅ `audit_trail` - سجل التدقيق

### الدوال (11+)
1. ✅ `create_notification()`
2. ✅ `get_user_notifications()`
3. ✅ `mark_notification_as_read()`
4. ✅ `create_approval_request()`
5. ✅ `approve_request()`
6. ✅ `reject_request()`
7. ✅ `create_refund_request()`
8. ✅ `submit_refund_for_approval()`
9. ✅ `approve_refund_branch_manager()`
10. ✅ `approve_refund_final()`
11. ✅ `reject_refund_request()`

### Triggers (10+)
1. ✅ منع سند صرف بدون Refund Request
2. ✅ منع تعديل سند صرف مرتبط
3. ✅ منع حذف سند صرف مرتبط
4. ✅ إشعارات تلقائية للإشعارات المدينة
5. ✅ إشعارات تلقائية للإشعارات الدائنة
6. ✅ سجل تدقيق تلقائي لكل الجداول الحساسة

---

## 🔧 الاستخدام الأساسي

### 1. إنشاء طلب استرداد نقدي

```typescript
import { createRefundRequest } from '@/lib/governance-layer'

const refundId = await createRefundRequest({
  companyId: 'your-company-uuid',
  branchId: 'your-branch-uuid',
  sourceType: 'sales_return',
  sourceId: 'sales-return-uuid',
  requestedAmount: 5000,
  reason: 'مرتجع بضاعة تالفة',
  createdBy: 'user-uuid',
  customerId: 'customer-uuid'
})
```

### 2. تقديم للموافقة

```typescript
import { submitRefundForApproval } from '@/lib/governance-layer'

await submitRefundForApproval(refundId, userId)
```

### 3. موافقة مدير الفرع

```typescript
import { approveRefundBranchManager } from '@/lib/governance-layer'

await approveRefundBranchManager(refundId, managerId)
```

### 4. الموافقة النهائية

```typescript
import { approveRefundFinal } from '@/lib/governance-layer'

await approveRefundFinal(refundId, ownerId)
```

### 5. إنشاء سند الصرف

```typescript
// الآن يمكن إنشاء سند الصرف
const payment = await createPayment({
  type: 'refund',
  amount: 5000,
  customerId: customerId,
  refundRequestId: refundId
})
```

---

## 📊 التحقق من التثبيت

بعد تشغيل السكريبت، ستظهر رسائل التحقق:

```
✅ All governance tables created successfully
✅ All governance functions created successfully
✅ Found X triggers

🎉 GOVERNANCE LAYER INSTALLATION COMPLETE
```

---

## 🔍 اختبار النظام

### 1. اختبار الإشعارات

```sql
-- إنشاء إشعار تجريبي
SELECT create_notification(
  p_company_id := 'your-company-uuid',
  p_reference_type := 'test',
  p_reference_id := gen_random_uuid(),
  p_title := 'اختبار الإشعارات',
  p_message := 'هذا إشعار تجريبي',
  p_created_by := 'your-user-uuid',
  p_priority := 'normal'
);

-- الحصول على الإشعارات
SELECT * FROM get_user_notifications(
  p_user_id := 'your-user-uuid',
  p_company_id := 'your-company-uuid'
);
```

### 2. اختبار طلب الاسترداد

```sql
-- إنشاء طلب استرداد تجريبي
SELECT create_refund_request(
  p_company_id := 'your-company-uuid',
  p_branch_id := 'your-branch-uuid',
  p_source_type := 'test',
  p_source_id := gen_random_uuid(),
  p_requested_amount := 1000,
  p_reason := 'اختبار النظام',
  p_created_by := 'your-user-uuid'
);
```

---

## 📚 الوثائق الكاملة

- **الدليل الشامل:** `GOVERNANCE_LAYER_GUIDE.md`
- **الملخص العربي:** `ملخص_نظام_الحوكمة.md`
- **TypeScript Helpers:** `lib/governance-layer.ts`

---

## ⚠️ متطلبات النظام

### قاعدة البيانات
- PostgreSQL 12+
- أو Supabase

### الجداول المطلوبة (يجب أن تكون موجودة)
- ✅ `companies`
- ✅ `branches`
- ✅ `cost_centers`
- ✅ `warehouses`
- ✅ `customers`
- ✅ `suppliers`
- ✅ `invoices`
- ✅ `bills`
- ✅ `payments`
- ✅ `customer_debit_notes`
- ✅ `vendor_credits`

---

## 🔒 الأمان

### الصلاحيات المطلوبة
```sql
-- يجب أن يكون لديك صلاحيات:
CREATE TABLE
CREATE FUNCTION
CREATE TRIGGER
CREATE INDEX
```

### RLS (Row Level Security)
```sql
-- تفعيل RLS على الجداول الحساسة
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
```

---

## 🐛 استكشاف الأخطاء

### خطأ: "relation does not exist"
```
السبب: جدول مطلوب غير موجود
الحل: تأكد من تشغيل السكريبتات السابقة أولاً
```

### خطأ: "permission denied"
```
السبب: صلاحيات غير كافية
الحل: استخدم مستخدم له صلاحيات CREATE
```

### خطأ: "Cannot create refund payment without an approved refund request"
```
السبب: محاولة إنشاء سند صرف بدون طلب معتمد
الحل: ✅ هذا هو السلوك الصحيح! يجب إنشاء Refund Request أولاً
```

---

## 📞 الدعم

للمساعدة أو الاستفسارات:
- راجع `GOVERNANCE_LAYER_GUIDE.md` للتفاصيل الكاملة
- راجع `ملخص_نظام_الحوكمة.md` للملخص بالعربية

---

**✅ النظام جاهز للاستخدام!**

**آخر تحديث:** 2026-01-09  
**الإصدار:** 1.0.0
