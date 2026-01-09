# 🚀 START HERE - Vendor Credits Access Control

## ⚡ البدء السريع

### 1️⃣ تطبيق التحديثات على قاعدة البيانات

```bash
# تشغيل السكريبت الرئيسي
psql -U your_user -d your_database -f scripts/100_vendor_credits_access_control_upgrade.sql
```

**ماذا يفعل هذا السكريبت؟**
- ✅ إضافة حقول التحكم والتدقيق
- ✅ إنشاء دوال الموافقة والتطبيق
- ✅ إضافة Triggers للحماية
- ✅ تحديث البيانات الموجودة

---

### 2️⃣ التحقق من التثبيت

```sql
-- التحقق من الحقول الجديدة
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_credits' 
  AND column_name IN ('created_by', 'approval_status', 'approved_by');

-- التحقق من الدوال
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name LIKE '%vendor_credit%';
```

**النتيجة المتوقعة:**
- 12 حقل جديد
- 4 دوال جديدة
- 2 triggers

---

## 📋 دورة العمل الأساسية

### السيناريو 1: موظف ينشئ إشعار دائن

```typescript
// 1. الموظف ينشئ الإشعار
const { data: vc } = await supabase
  .from('vendor_credits')
  .insert({
    company_id: companyId,
    supplier_id: supplierId,
    credit_number: 'VC-2026-001',
    credit_date: '2026-01-09',
    total_amount: 5000,
    created_by: staffUserId,
    branch_id: branchId,
    cost_center_id: costCenterId,
    approval_status: 'draft', // الحالة الافتراضية
    notes: 'مرتجع بضاعة تالفة'
  })
  .select()
  .single()

// 2. تقديم للموافقة
const { data: result } = await supabase.rpc('submit_vendor_credit_for_approval', {
  p_vendor_credit_id: vc.id,
  p_submitted_by: staffUserId
})

console.log(result) 
// { success: true, message: 'Vendor credit submitted for approval', ... }
```

---

### السيناريو 2: المدير يوافق

```typescript
// المدير يراجع ويوافق
const { data: result } = await supabase.rpc('approve_vendor_credit', {
  p_vendor_credit_id: vcId,
  p_approved_by: managerId,
  p_notes: 'تم التحقق - موافق'
})

// ✅ الآن الإشعار جاهز للتطبيق
```

---

### السيناريو 3: المحاسب يطبق الإشعار (إنشاء سند صرف)

```typescript
// 1. إنشاء سند صرف
const { data: payment } = await supabase
  .from('payments')
  .insert({
    company_id: companyId,
    supplier_id: supplierId,
    amount: 5000,
    payment_type: 'vendor_credit_refund',
    // ... باقي الحقول
  })
  .select()
  .single()

// 2. ربط الإشعار بسند الصرف
const { data: result } = await supabase.rpc('apply_vendor_credit_to_payment', {
  p_vendor_credit_id: vcId,
  p_payment_id: payment.id,
  p_amount_to_apply: 5000,
  p_applied_by: accountantId
})

// ✅ تم التطبيق - الإشعار الآن في حالة 'closed'
```

---

## 🔐 الأدوار والصلاحيات (ملخص سريع)

| الدور | إنشاء | عرض | موافقة | تطبيق | الفلترة |
|------|------|-----|--------|-------|---------|
| **Owner** | ✅ | الكل | ✅ | ✅ | لا توجد |
| **Admin** | ✅ | الكل | ✅ | ✅ | لا توجد |
| **Manager** | ✅ | الفرع | ✅ | ✅ | branch_id |
| **Accountant** | ✅ | الفرع+المركز | ✅ | ✅ | branch_id + cost_center_id |
| **Staff** | ✅ | إشعاراته فقط | ❌ | ❌ | created_by |

---

## 🛡️ القواعد المحاسبية المطبقة

### 1. Separation of Duties (فصل المهام)
```
❌ المنشئ لا يمكنه الموافقة على إشعاره
✅ يجب أن يوافق شخص آخر (manager/admin/owner)
```

### 2. Approval Workflow (سير عمل الموافقات)
```
Draft → Pending Approval → Approved → Applied → Closed
```

### 3. Audit Trail (التتبع الكامل)
```
✅ من أنشأ؟ created_by + created_at
✅ من قدم للموافقة؟ submitted_by + submitted_at
✅ من وافق؟ approved_by + approved_at
✅ من طبق؟ applied_by + applied_at
```

### 4. Data Protection (حماية البيانات)
```
❌ لا يمكن تعديل الإشعار بعد الموافقة
❌ لا يمكن حذف الإشعار بعد التقديم
✅ يمكن التعديل فقط في حالة draft أو rejected
```

---

## 📊 الاستعلامات المفيدة

### عرض الإشعارات في انتظار موافقتي
```sql
SELECT 
  vc.credit_number,
  s.name as supplier_name,
  vc.total_amount,
  vc.submitted_at,
  creator.display_name as created_by_name
FROM vendor_credits vc
JOIN suppliers s ON vc.supplier_id = s.id
LEFT JOIN user_profiles creator ON vc.created_by = creator.user_id
WHERE vc.approval_status = 'pending_approval'
  AND vc.created_by != 'my-user-id' -- لا أستطيع الموافقة على إشعاراتي
ORDER BY vc.submitted_at ASC;
```

### تقرير الموافقات الشهري
```sql
SELECT 
  DATE_TRUNC('month', approved_at) as month,
  COUNT(*) as total_approved,
  SUM(total_amount) as total_amount,
  approver.display_name as approved_by_name
FROM vendor_credits vc
LEFT JOIN user_profiles approver ON vc.approved_by = approver.user_id
WHERE approval_status = 'approved'
  AND approved_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY month, approver.display_name
ORDER BY month DESC;
```

---

## 🔧 استكشاف الأخطاء

### خطأ: "Creator cannot approve their own vendor credit"
**السبب:** محاولة الموافقة على إشعار أنشأته أنت  
**الحل:** اطلب من مدير أو admin الموافقة

### خطأ: "Cannot modify vendor credit after approval"
**السبب:** محاولة تعديل إشعار تمت الموافقة عليه  
**الحل:** إذا كان هناك خطأ، يجب إنشاء إشعار جديد

### خطأ: "Vendor credit must be approved before application"
**السبب:** محاولة تطبيق إشعار لم تتم الموافقة عليه  
**الحل:** قدم الإشعار للموافقة أولاً

---

## 📚 التوثيق الكامل

للمزيد من التفاصيل، راجع:
- 📖 **[VENDOR_CREDITS_ACCESS_CONTROL_GUIDE.md](VENDOR_CREDITS_ACCESS_CONTROL_GUIDE.md)** - الدليل الشامل
- 🗄️ **[scripts/100_vendor_credits_access_control_upgrade.sql](scripts/100_vendor_credits_access_control_upgrade.sql)** - السكريبت الكامل
- 💻 **[lib/vendor-credits-access.ts](lib/vendor-credits-access.ts)** - دوال TypeScript

---

## ✅ قائمة التحقق

- [ ] تشغيل السكريبت على قاعدة البيانات
- [ ] التحقق من إضافة الحقول والدوال
- [ ] اختبار إنشاء إشعار دائن جديد
- [ ] اختبار تقديم للموافقة
- [ ] اختبار الموافقة (من مستخدم مختلف)
- [ ] اختبار التطبيق
- [ ] التحقق من Audit Trail

---

**آخر تحديث:** 2026-01-09  
**الإصدار:** 2.0.0

