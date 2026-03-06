# 📋 تقرير: نمط تسجيل العملاء وعرضهم في نظام ERP

## 🎯 الهدف
توثيق النمط الحالي لتسجيل العملاء من قبل الموظفين وعرضهم لمنشئها دون إمكانية التعديل.

---

## 1️⃣ نمط تسجيل عميل من قبل موظف في فرع

### أ. في Backend API (`app/api/customers/route.ts` - POST)

#### الخطوات:

1. **تطبيق الحوكمة الإلزامية:**
```typescript
const governance = await enforceGovernance()
```
- يجلب `company_id`, `branch_id`, `cost_center_id`, `warehouse_id` من `company_members`
- يحدد الدور (`role`) للمستخدم

2. **إضافة بيانات الحوكمة تلقائياً:**
```typescript
const dataWithGovernance = addGovernanceData(body, governance)
```
- **للموظفين العاديين (staff/employee):**
  - يتم فرض `branch_id` من `company_members.branch_id`
  - يتم فرض `cost_center_id` من `company_members.cost_center_id`
  - يتم فرض `warehouse_id` من `company_members.warehouse_id`
  - **لا يمكن للموظف تجاوز هذه القيم**

- **للأدوار العليا (owner/admin/general_manager):**
  - يمكنهم اختيار `branch_id`, `cost_center_id`, `warehouse_id`
  - يتم التحقق من أن القيم المختارة ضمن النطاق المسموح

3. **تسجيل منشئ العميل:**
```typescript
if (user) dataWithGovernance.created_by_user_id = user.id
```
- يتم تعيين `created_by_user_id` تلقائياً من المستخدم الحالي
- هذا الحقل **مهم جداً** للفلترة والصلاحيات

4. **التحقق من تكرار رقم الهاتف:**
- يتم التحقق من عدم تكرار رقم الهاتف داخل نفس الشركة
- يتم تطبيع رقم الهاتف قبل المقارنة

5. **إدخال البيانات:**
```typescript
const { data: newCustomer, error: insertError } = await supabase
  .from("customers")
  .insert(dataWithGovernance)
  .select()
  .single()
```

### ب. في Frontend (`components/customers/customer-form-dialog.tsx`)

#### عند إضافة عميل جديد:

1. **الموظف لا يرسل `branch_id`:**
```typescript
const response = await fetch('/api/customers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...dataToSave,
    company_id: activeCompanyId
    // 🏢 branch_id يتم تعيينه تلقائياً من governance-middleware
  })
})
```

2. **الحقول المعبأة تلقائياً:**
- الموظف العادي: **لا يرى** حقول `branch_id`, `cost_center_id`, `warehouse_id` في النموذج
- هذه القيم تُفرض من الخادم بناءً على بيانات المستخدم في `company_members`

3. **التحقق من الصلاحيات:**
```typescript
const [permWrite, setPermWrite] = useState(false)
// ...
const write = await canAction(supabase, "customers", "write")
setPermWrite(write)
```

---

## 2️⃣ نمط عرض العملاء لمنشئها

### أ. في Frontend (`app/customers/page.tsx`)

#### منطق الفلترة:

1. **تحديد نوع الفلترة:**
```typescript
const accessFilter = getAccessFilter(
  currentUserRole,
  currentUserId || '',
  userContext?.branch_id || null,
  userContext?.cost_center_id || null,
  filterEmployeeId !== 'all' ? filterEmployeeId : undefined
)
```

2. **الموظف العادي (staff/employee):**
```typescript
if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
  // موظف عادي: يرى فقط العملاء الذين أنشأهم
  const { data: ownCust } = await supabase
    .from("customers")
    .select(customerSelectQuery)
    .eq("company_id", activeCompanyId)
    .eq("created_by_user_id", accessFilter.createdByUserId)
  allCustomers = ownCust || []
  
  // جلب العملاء المشتركين (permission_sharing)
  // ...
}
```

3. **مدير الفرع (manager/accountant):**
```typescript
else if (accessFilter.filterByBranch && accessFilter.branchId) {
  // مدير: يرى عملاء الفرع
  const { data: branchCust } = await supabase
    .from("customers")
    .select(customerSelectQuery)
    .eq("company_id", activeCompanyId)
    .eq("branch_id", accessFilter.branchId)
  allCustomers = branchCust || []
}
```

4. **المالك/المدير العام (owner/admin):**
```typescript
else {
  // owner/admin: جميع العملاء
  const { data: allCust } = await supabase
    .from("customers")
    .select(customerSelectQuery)
    .eq("company_id", activeCompanyId)
  allCustomers = allCust || []
}
```

### ب. عرض رسالة توضيحية:

```typescript
{(currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee') && (
  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
    {appLang === 'en' ? '👨‍💼 Showing customers you created only' : '👨‍💼 تعرض العملاء الذين أنشأتهم فقط'}
  </p>
)}
```

---

## 3️⃣ منع التعديل للعملاء

### أ. في Backend API (`app/api/customers/update/route.ts`)

#### التحقق من الصلاحيات:

1. **التحقق من الفواتير النشطة:**
```typescript
if (!isAddressOnlyUpdate) {
  const blockingInvoices = invoices.filter((inv: any) =>
    BLOCKING_INVOICE_STATUSES.includes((inv.status || "").toLowerCase())
  )
  
  if (blockingInvoices.length > 0) {
    // منع التعديل الكامل، السماح بتعديل العنوان فقط
    return NextResponse.json({
      success: false,
      can_edit: false,
      reason: "blocking_invoices",
      address_only_allowed: true
    }, { status: 400 })
  }
}
```

2. **التحقق من صلاحية التعديل:**
```typescript
const isOwnerOrAdmin = ["owner", "admin"].includes(member.role || "")
const isCreator = customer.created_by_user_id === user.id

if (!isOwnerOrAdmin && !isCreator && !hasRolePermission) {
  return NextResponse.json({
    success: false,
    error: "No permission to update this customer",
    error_ar: "ليس لديك صلاحية تعديل هذا العميل. يمكنك فقط تعديل العملاء الذين قمت بإنشائهم أو تعديل العنوان فقط."
  }, { status: 403 })
}
```

3. **حماية حقول الحوكمة:**
```typescript
const PROTECTED_GOVERNANCE_FIELDS = ['branch_id', 'cost_center_id', 'warehouse_id']
const GOVERNANCE_ADMIN_ROLES = ['owner', 'admin', 'general_manager', ...]

if (governanceFieldsInRequest.length > 0 && !isGovernanceAdmin) {
  return NextResponse.json({
    success: false,
    error: "Cannot modify governance fields",
    error_ar: "🔐 لا يمكن تغيير حقول الحوكمة. فقط المالك أو المدير العام يمكنه تغيير تعيين الفرع."
  }, { status: 403 })
}
```

### ب. في Frontend (`components/customers/customer-form-dialog.tsx`)

#### منع التعديل في الواجهة:

1. **التحقق من الفواتير النشطة:**
```typescript
useEffect(() => {
  const checkActiveInvoices = async () => {
    if (!open || !editingCustomer) return
    
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("company_id", activeCompanyId)
      .eq("customer_id", editingCustomer.id)
      .in("status", ["sent", "partially_paid", "paid"])
    
    if (invoices && invoices.length > 0) {
      setHasActiveInvoices(true)
      setActiveInvoicesCount(invoices.length)
    }
  }
  checkActiveInvoices()
}, [open, editingCustomer, supabase])
```

2. **تعطيل الحقول:**
```typescript
<Input
  id="name"
  value={formData.name}
  disabled={!!editingCustomer && hasActiveInvoices}
  className={editingCustomer && hasActiveInvoices ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
/>
```

3. **عرض تحذير:**
```typescript
{editingCustomer && hasActiveInvoices && (
  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3">
    <p className="font-semibold text-yellow-800 dark:text-yellow-200">
      {appLang === 'en'
        ? `This customer has ${activeInvoicesCount} active invoice(s)`
        : `هذا العميل لديه ${activeInvoicesCount} فاتورة نشطة`}
    </p>
    <p className="text-yellow-700 dark:text-yellow-300 mt-1">
      {appLang === 'en'
        ? 'Only address fields can be edited. Other fields are locked.'
        : 'يمكن تعديل حقول العنوان فقط. الحقول الأخرى مقفلة.'}
    </p>
  </div>
)}
```

4. **إرسال حقول العنوان فقط:**
```typescript
const dataForUpdate = hasActiveInvoices
  ? {
      address: formData.address,
      governorate: formData.governorate,
      city: formData.city,
      country: formData.country,
      detailed_address: formData.detailed_address,
    }
  : dataToSave
```

### ج. في صفحة العملاء (`app/customers/page.tsx`)

#### التحقق قبل الحذف:

```typescript
const handleDelete = async (id: string) => {
  // 🔐 ERP Access Control - التحقق من صلاحية حذف هذا العميل بالذات
  const customer = customers.find(c => c.id === id)
  if (customer && currentUserId) {
    const modResult = validateRecordModification(
      currentUserRole,
      currentUserId,
      customer.created_by_user_id || null,
      userContext?.branch_id || null,
      customer.branch_id || null,
      'delete',
      appLang
    )
    if (!modResult.isValid) {
      toast({
        title: modResult.error?.title || (appLang === 'en' ? 'Access Denied' : 'تم رفض الوصول'),
        description: modResult.error?.description || '',
        variant: 'destructive'
      })
      return
    }
  }
  // ...
}
```

---

## 4️⃣ ملخص النمط الحالي

### ✅ ما يعمل بشكل صحيح:

1. **تسجيل العملاء:**
   - ✅ الموظف العادي: يتم فرض `branch_id`, `cost_center_id`, `warehouse_id` تلقائياً
   - ✅ يتم تسجيل `created_by_user_id` تلقائياً
   - ✅ لا يمكن للموظف تجاوز القيم المفرضة

2. **عرض العملاء:**
   - ✅ الموظف العادي: يرى فقط العملاء الذين أنشأهم (`created_by_user_id`)
   - ✅ مدير الفرع: يرى عملاء الفرع
   - ✅ المالك/المدير: يرى جميع العملاء

3. **منع التعديل:**
   - ✅ إذا كان هناك فواتير نشطة: منع التعديل الكامل، السماح بتعديل العنوان فقط
   - ✅ الموظف العادي: يمكنه تعديل العملاء الذين أنشأهم فقط
   - ✅ حماية حقول الحوكمة: لا يمكن تغييرها إلا من قبل الأدوار العليا

### ⚠️ ملاحظات:

1. **في Frontend (`app/customers/page.tsx`):**
   - ✅ يتم التحقق من `created_by_user_id` قبل الحذف
   - ⚠️ **لا يوجد تحقق صريح من `created_by_user_id` قبل التعديل في الواجهة** (يتم التحقق في API فقط)

2. **في Backend (`app/api/customers/update/route.ts`):**
   - ✅ يتم التحقق من `isCreator` قبل التعديل الكامل
   - ✅ يتم التحقق من الفواتير النشطة
   - ✅ يتم حماية حقول الحوكمة

---

## 5️⃣ التوصيات

### أ. تحسينات مقترحة:

1. **إضافة تحقق في Frontend قبل فتح نافذة التعديل:**
```typescript
const handleEdit = (customer: Customer) => {
  // التحقق من الصلاحيات قبل فتح النافذة
  if (currentUserId && customer.created_by_user_id !== currentUserId) {
    const modResult = validateRecordModification(
      currentUserRole,
      currentUserId,
      customer.created_by_user_id || null,
      userContext?.branch_id || null,
      customer.branch_id || null,
      'update',
      appLang
    )
    if (!modResult.isValid) {
      toast({
        title: modResult.error?.title || (appLang === 'en' ? 'Access Denied' : 'تم رفض الوصول'),
        description: modResult.error?.description || '',
        variant: 'destructive'
      })
      return
    }
  }
  setEditingId(customer.id)
  setIsDialogOpen(true)
}
```

2. **إضافة مؤشر بصري للعملاء غير القابلة للتعديل:**
```typescript
// في جدول العملاء
<Button
  variant="ghost"
  size="icon"
  className={`h-8 w-8 ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
  onClick={() => handleEdit(row)}
  disabled={!canEdit}
  title={!canEdit ? (appLang === 'en' ? 'Cannot edit - not your customer' : 'لا يمكن التعديل - ليس عميلك') : ''}
>
  <Edit2 className="w-4 h-4" />
</Button>
```

3. **تحسين رسائل الخطأ:**
   - إضافة رسائل أوضح عند محاولة تعديل عميل لم ينشئه المستخدم
   - إضافة رسائل توضيحية في الواجهة عن سبب تعطيل الحقول

---

## 6️⃣ الملفات الرئيسية

### Backend:
- `app/api/customers/route.ts` - إنشاء وجلب العملاء
- `app/api/customers/update/route.ts` - تحديث العملاء
- `lib/governance-middleware.ts` - تطبيق الحوكمة

### Frontend:
- `app/customers/page.tsx` - صفحة عرض العملاء
- `components/customers/customer-form-dialog.tsx` - نموذج إضافة/تعديل العميل
- `lib/validation.ts` - دوال التحقق من الصلاحيات

---

## 7️⃣ الخلاصة

النمط الحالي **يعمل بشكل صحيح** في معظم الجوانب:

✅ **تسجيل العملاء:** يتم فرض الحوكمة تلقائياً  
✅ **عرض العملاء:** يتم الفلترة بناءً على `created_by_user_id`  
✅ **منع التعديل:** يتم التحقق من الصلاحيات في Backend  

⚠️ **تحسينات مقترحة:** إضافة تحقق في Frontend قبل فتح نافذة التعديل لتحسين تجربة المستخدم.

---

**تاريخ الإنشاء:** 2024  
**آخر تحديث:** 2024
