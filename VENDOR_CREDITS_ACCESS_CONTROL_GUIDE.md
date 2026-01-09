# 🔐 Vendor Credits - Access Control & Approval Workflow Guide

## 📋 نظرة عامة

تم تحديث نظام **Vendor Credits** ليتوافق مع معايير **Customer Debit Notes** من حيث:
- ✅ **Separation of Duties** - فصل المهام
- ✅ **Approval Workflow** - سير عمل الموافقات
- ✅ **Access Control** - التحكم في الوصول حسب الدور
- ✅ **Audit Trail** - تتبع كامل للعمليات
- ✅ **IFRS Compliance** - الامتثال للمعايير المحاسبية الدولية

---

## 🔄 دورة حياة Vendor Credit

```
1. Draft (مسودة)
   ↓ [submit_vendor_credit_for_approval]
2. Pending Approval (في انتظار الموافقة)
   ↓ [approve_vendor_credit] أو [reject_vendor_credit]
3. Approved (موافق عليه) أو Rejected (مرفوض)
   ↓ [apply_vendor_credit_to_payment]
4. Applied (مطبق) → Closed (مغلق)
```

---

## 👥 الأدوار والصلاحيات

### 1️⃣ Owner (المالك)
- ✅ إنشاء إشعارات دائن
- ✅ عرض جميع الإشعارات
- ✅ تعديل وحذف الإشعارات (في حالة draft/rejected)
- ✅ الموافقة على الإشعارات
- ✅ تطبيق الإشعارات (إنشاء سند صرف)
- 🔍 **الفلترة:** لا توجد قيود

### 2️⃣ Admin (المدير)
- ✅ إنشاء إشعارات دائن
- ✅ عرض جميع الإشعارات
- ✅ تعديل الإشعارات (في حالة draft/rejected)
- ✅ الموافقة على الإشعارات
- ✅ تطبيق الإشعارات
- 🔍 **الفلترة:** لا توجد قيود

### 3️⃣ Manager (مدير الفرع)
- ✅ إنشاء إشعارات دائن
- ✅ عرض إشعارات الفرع
- ✅ تعديل إشعارات الفرع (في حالة draft/rejected)
- ✅ الموافقة على إشعارات الفرع
- ✅ تطبيق إشعارات الفرع
- 🔍 **الفلترة:** حسب `branch_id`

### 4️⃣ Accountant (محاسب)
- ✅ إنشاء إشعارات دائن
- ✅ عرض إشعارات الفرع ومركز التكلفة
- ✅ تعديل الإشعارات (في حالة draft/rejected)
- ✅ الموافقة على الإشعارات
- ✅ تطبيق الإشعارات
- 🔍 **الفلترة:** حسب `branch_id` و `cost_center_id`

### 5️⃣ Staff (موظف)
- ✅ إنشاء إشعارات دائن
- ✅ عرض الإشعارات التي أنشأها فقط
- ✅ تعديل إشعاراته (في حالة draft/rejected)
- ❌ لا يمكنه الموافقة
- ❌ لا يمكنه التطبيق
- 🔍 **الفلترة:** حسب `created_by` و `branch_id` و `cost_center_id`

---

## 🗄️ الحقول الجديدة في جدول `vendor_credits`

| الحقل | النوع | الوصف |
|------|------|-------|
| `created_by` | UUID | المستخدم الذي أنشأ الإشعار (إلزامي) |
| `approval_status` | VARCHAR(20) | حالة الموافقة: draft, pending_approval, approved, rejected |
| `submitted_by` | UUID | المستخدم الذي قدم الطلب للموافقة |
| `submitted_at` | TIMESTAMPTZ | تاريخ تقديم الطلب |
| `approved_by` | UUID | المستخدم الذي وافق |
| `approved_at` | TIMESTAMPTZ | تاريخ الموافقة |
| `rejected_by` | UUID | المستخدم الذي رفض |
| `rejected_at` | TIMESTAMPTZ | تاريخ الرفض |
| `rejection_reason` | TEXT | سبب الرفض |
| `applied_by` | UUID | المستخدم الذي طبق الإشعار |
| `applied_at` | TIMESTAMPTZ | تاريخ التطبيق |
| `application_payment_id` | UUID | معرف سند الصرف المرتبط |
| `branch_id` | UUID | الفرع |
| `cost_center_id` | UUID | مركز التكلفة |

---

## 🔧 الدوال المتاحة

### 1. تقديم للموافقة
```sql
SELECT * FROM submit_vendor_credit_for_approval(
  p_vendor_credit_id := 'uuid-here',
  p_submitted_by := 'user-uuid'
);
```

**الشروط:**
- الحالة الحالية = `draft`
- المستخدم لديه صلاحية الإنشاء

**النتيجة:**
- تغيير الحالة إلى `pending_approval`
- تسجيل `submitted_by` و `submitted_at`

---

### 2. الموافقة
```sql
SELECT * FROM approve_vendor_credit(
  p_vendor_credit_id := 'uuid-here',
  p_approved_by := 'user-uuid',
  p_notes := 'ملاحظات اختيارية'
);
```

**الشروط:**
- الحالة الحالية = `pending_approval` أو `draft`
- المستخدم لديه صلاحية الموافقة
- 🔒 **Separation of Duties:** `created_by ≠ approved_by`

**النتيجة:**
- تغيير الحالة إلى `approved`
- تسجيل `approved_by` و `approved_at`
- تغيير `status` إلى `open`

---

### 3. الرفض
```sql
SELECT * FROM reject_vendor_credit(
  p_vendor_credit_id := 'uuid-here',
  p_rejected_by := 'user-uuid',
  p_rejection_reason := 'سبب الرفض (إلزامي)'
);
```

**الشروط:**
- الحالة الحالية = `pending_approval`
- سبب الرفض إلزامي

**النتيجة:**
- تغيير الحالة إلى `rejected`
- تسجيل `rejected_by`, `rejected_at`, `rejection_reason`

---

### 4. التطبيق (إنشاء سند صرف)
```sql
SELECT * FROM apply_vendor_credit_to_payment(
  p_vendor_credit_id := 'uuid-here',
  p_payment_id := 'payment-uuid',
  p_amount_to_apply := 1000.00,
  p_applied_by := 'user-uuid'
);
```

**الشروط:**
- الحالة = `approved`
- المبلغ المطلوب ≤ المبلغ المتبقي
- المستخدم لديه صلاحية التطبيق

**النتيجة:**
- تحديث `applied_amount`
- تسجيل `applied_by`, `applied_at`, `application_payment_id`
- تغيير `status` إلى `applied` أو `closed`

---

## 🛡️ الحماية والقيود

### 1. منع التعديل بعد الموافقة
```sql
-- Trigger: trg_prevent_vendor_credit_modification
```
- لا يمكن تعديل الإشعار بعد الموافقة
- يُسمح فقط بتحديث حقول الموافقة والتطبيق

### 2. منع الحذف بعد التقديم
```sql
-- Trigger: trg_prevent_vendor_credit_deletion
```
- يمكن الحذف فقط في حالة `draft` أو `rejected`

### 3. Separation of Duties
- المنشئ لا يمكنه الموافقة على إشعاره
- يتم التحقق في دالة `approve_vendor_credit`

---

## 📊 أمثلة الاستخدام

### مثال 1: إنشاء وتقديم إشعار دائن
```typescript
// 1. إنشاء الإشعار
const { data: vc } = await supabase
  .from('vendor_credits')
  .insert({
    company_id: companyId,
    supplier_id: supplierId,
    credit_number: 'VC-2026-001',
    total_amount: 5000,
    created_by: userId,
    branch_id: branchId,
    approval_status: 'draft'
  })
  .select()
  .single()

// 2. تقديم للموافقة
const { data } = await supabase.rpc('submit_vendor_credit_for_approval', {
  p_vendor_credit_id: vc.id,
  p_submitted_by: userId
})
```

### مثال 2: الموافقة من قبل المدير
```typescript
const { data } = await supabase.rpc('approve_vendor_credit', {
  p_vendor_credit_id: vcId,
  p_approved_by: managerId,
  p_notes: 'موافق - تم التحقق من المستندات'
})
```

---

## 🔍 الاستعلامات المفيدة

### عرض الإشعارات في انتظار الموافقة
```sql
SELECT 
  vc.credit_number,
  s.name as supplier_name,
  vc.total_amount,
  vc.submitted_at,
  up.display_name as submitted_by_name
FROM vendor_credits vc
JOIN suppliers s ON vc.supplier_id = s.id
LEFT JOIN user_profiles up ON vc.submitted_by = up.user_id
WHERE vc.approval_status = 'pending_approval'
ORDER BY vc.submitted_at DESC;
```

### تتبع الموافقات
```sql
SELECT 
  vc.credit_number,
  vc.approval_status,
  creator.display_name as created_by_name,
  approver.display_name as approved_by_name,
  vc.approved_at
FROM vendor_credits vc
LEFT JOIN user_profiles creator ON vc.created_by = creator.user_id
LEFT JOIN user_profiles approver ON vc.approved_by = approver.user_id
WHERE vc.approval_status = 'approved'
ORDER BY vc.approved_at DESC;
```

---

## 📚 الملفات ذات الصلة

1. **SQL Script:** `scripts/100_vendor_credits_access_control_upgrade.sql`
2. **Access Helper:** `lib/vendor-credits-access.ts`
3. **UI Page:** `app/vendor-credits/page.tsx`
4. **New Page:** `app/vendor-credits/new/page.tsx`

---

**آخر تحديث:** 2026-01-09  
**الإصدار:** 2.0.0 - Access Control & Approval Workflow

