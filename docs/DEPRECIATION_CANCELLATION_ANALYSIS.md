# تحليل إلغاء الإهلاك المعتمد للأصول الثابتة

## 📋 ملخص تنفيذي

هذا التقرير يوضح **الوضع الحالي** في النظام و**ما يجب أن يحدث** عند قيام المالك أو المدير العام بإلغاء الإهلاك بعد اعتماده.

---

## 🔍 الوضع الحالي في النظام

### 1. حالات الإهلاك (Depreciation Schedules Status)

حسب تعريف الجدول `depreciation_schedules`:
```sql
status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'posted', 'cancelled'))
```

**الحالات المتاحة:**
- `pending`: في انتظار الاعتماد
- `approved`: معتمد (من قبل Owner/Admin)
- `posted`: مرحل (تم إنشاء قيد محاسبي)
- `cancelled`: ملغى

### 2. الوظائف الحالية المتاحة

#### ✅ الاعتماد (Approve)
- **الملف:** `app/api/fixed-assets/[id]/depreciation/route.ts`
- **الإجراء:** `action: 'approve'`
- **الصلاحيات:** Owner و Admin فقط
- **النتيجة:** تغيير `status` من `pending` إلى `approved`

#### ✅ الترحيل (Post)
- **الملف:** `app/api/fixed-assets/[id]/depreciation/route.ts`
- **الإجراء:** `action: 'post'`
- **الصلاحيات:** Owner و Admin فقط
- **النتيجة:**
  - إنشاء قيد محاسبي (`journal_entry`)
  - ربط القيد بـ `journal_entry_id` في `depreciation_schedules`
  - تحديث `status` إلى `posted`
  - تحديث `accumulated_depreciation` و `book_value` في `fixed_assets`

#### ❌ **غير موجود:** إلغاء الإهلاك المعتمد
- **لا يوجد API endpoint** لإلغاء الإهلاك المعتمد (`approved`) أو المرحل (`posted`)
- **لا يوجد واجهة مستخدم** لإلغاء الإهلاك المعتمد

### 3. الحماية الحالية

في `app/api/fixed-assets/[id]/route.ts` (حذف الأصل):
```typescript
// منع حذف الأصل إذا كان هناك إهلاك مرحل
if (schedules && schedules.length > 0) {
  return NextResponse.json({ 
    error: 'Cannot delete asset with posted depreciation' 
  }, { status: 400 })
}
```

---

## 🎯 ما يجب أن يحدث عند إلغاء الإهلاك المعتمد

### السيناريو 1: إلغاء إهلاك معتمد (Approved) - لم يتم ترحيله

**الحالة:** `status = 'approved'` و `journal_entry_id IS NULL`

**الإجراءات المطلوبة:**
1. ✅ التحقق من الصلاحيات: Owner أو Admin فقط
2. ✅ تغيير `status` من `approved` إلى `cancelled`
3. ✅ إعادة تعيين `approved_by` و `approved_at` إلى `NULL`
4. ✅ **لا حاجة لحذف قيود** (لم يتم الترحيل بعد)

**الكود المطلوب:**
```typescript
// في app/api/fixed-assets/[id]/depreciation/route.ts
if (action === 'cancel') {
  // التحقق من الصلاحيات
  const { data: memberData } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: companyData } = await supabase
    .from("companies")
    .select("user_id")
    .eq("id", companyId)
    .single()

  const isOwner = companyData?.user_id === user.id
  const userRole = isOwner ? "owner" : (memberData?.role || "viewer")
  const canCancel = userRole === 'owner' || userRole === 'admin'

  if (!canCancel) {
    return NextResponse.json({ 
      error: 'Forbidden',
      error_ar: 'لا يمكن إلغاء الإهلاك. العملية مسموحة فقط للإدارة العليا (Admin/Owner).'
    }, { status: 403 })
  }

  // جلب جداول الإهلاك للتحقق
  const { data: schedules } = await supabase
    .from('depreciation_schedules')
    .select('id, status, journal_entry_id')
    .eq('company_id', companyId)
    .eq('asset_id', id)
    .in('id', schedule_ids)

  // التحقق: لا يمكن إلغاء إهلاك مرحل (يجب إلغاء القيد أولاً)
  const postedSchedules = schedules?.filter(s => s.status === 'posted')
  if (postedSchedules && postedSchedules.length > 0) {
    return NextResponse.json({ 
      error: 'Cannot cancel posted depreciation. Must reverse journal entry first.',
      error_ar: 'لا يمكن إلغاء إهلاك مرحل. يجب إلغاء القيد المحاسبي أولاً.'
    }, { status: 400 })
  }

  // إلغاء الجداول المعتمدة فقط
  const { error } = await supabase
    .from('depreciation_schedules')
    .update({
      status: 'cancelled',
      approved_by: null,
      approved_at: null
    })
    .eq('company_id', companyId)
    .eq('asset_id', id)
    .in('id', schedule_ids)
    .in('status', ['approved']) // فقط المعتمدة

  if (error) throw error

  return NextResponse.json({ success: true })
}
```

---

### السيناريو 2: إلغاء إهلاك مرحل (Posted) - تم إنشاء قيد محاسبي

**الحالة:** `status = 'posted'` و `journal_entry_id IS NOT NULL`

**⚠️ هذا السيناريو معقد ويحتاج معالجة خاصة:**

#### الخيار 1: إلغاء القيد المحاسبي (Reversal Entry) - **موصى به**

**الإجراءات المطلوبة:**
1. ✅ التحقق من الصلاحيات: Owner أو Admin فقط
2. ✅ إنشاء قيد عكسي (Reversal Entry) لإلغاء القيد الأصلي:
   - **من حساب:** `accumulated_depreciation_account` (مدين)
   - **إلى حساب:** `depreciation_expense_account` (دائن)
   - **المبلغ:** نفس مبلغ الإهلاك الأصلي
3. ✅ تحديث `depreciation_schedules`:
   - `status` من `posted` إلى `cancelled`
   - `journal_entry_id` يبقى (للتاريخ)
   - إضافة `reversal_journal_entry_id` (القيد العكسي)
4. ✅ إعادة حساب `accumulated_depreciation` و `book_value` في `fixed_assets`:
   - `accumulated_depreciation = accumulated_depreciation - depreciation_amount`
   - `book_value = book_value + depreciation_amount`
5. ✅ تحديث `status` في `fixed_assets` إذا لزم الأمر

**الكود المطلوب:**
```typescript
if (action === 'cancel_posted') {
  // التحقق من الصلاحيات (نفس الكود أعلاه)
  
  // جلب جداول الإهلاك المرحلة
  const { data: schedules } = await supabase
    .from('depreciation_schedules')
    .select(`
      id, 
      depreciation_amount,
      accumulated_depreciation,
      book_value,
      journal_entry_id,
      fixed_assets!inner(
        id,
        name,
        accumulated_depreciation,
        book_value,
        purchase_cost,
        salvage_value,
        depreciation_expense_account_id,
        accumulated_depreciation_account_id
      )
    `)
    .eq('company_id', companyId)
    .eq('asset_id', id)
    .in('id', schedule_ids)
    .eq('status', 'posted')

  if (!schedules || schedules.length === 0) {
    return NextResponse.json({ 
      error: 'No posted schedules found',
      error_ar: 'لا توجد جداول إهلاك مرحلة'
    }, { status: 400 })
  }

  const asset = schedules[0].fixed_assets

  // إنشاء قيد عكسي لكل جدول إهلاك
  for (const schedule of schedules) {
    // 1. إنشاء قيد عكسي
    const { data: reversalEntry, error: reversalError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        entry_date: new Date().toISOString().split('T')[0],
        description: `إلغاء إهلاك: ${asset.name} - فترة ${schedule.period_number}`,
        reference_type: 'depreciation_reversal',
        reference_id: id
      })
      .select()
      .single()

    if (reversalError) throw reversalError

    // 2. إنشاء سطور القيد العكسي
    // من حساب مجمع الإهلاك (مدين) - لإرجاع الإهلاك
    await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: reversalEntry.id,
        account_id: asset.accumulated_depreciation_account_id,
        description: `إلغاء مجمع إهلاك: ${asset.name}`,
        debit_amount: schedule.depreciation_amount,
        credit_amount: 0
      })

    // إلى حساب مصروف الإهلاك (دائن) - لإرجاع المصروف
    await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: reversalEntry.id,
        account_id: asset.depreciation_expense_account_id,
        description: `إلغاء مصروف إهلاك: ${asset.name}`,
        debit_amount: 0,
        credit_amount: schedule.depreciation_amount
      })

    // 3. تحديث جدول الإهلاك
    await supabase
      .from('depreciation_schedules')
      .update({
        status: 'cancelled',
        reversal_journal_entry_id: reversalEntry.id,
        cancelled_by: user.id,
        cancelled_at: new Date().toISOString()
      })
      .eq('id', schedule.id)
  }

  // 4. إعادة حساب accumulated_depreciation و book_value للأصل
  const totalCancelledDepreciation = schedules.reduce(
    (sum, s) => sum + Number(s.depreciation_amount || 0), 
    0
  )

  const newAccumulatedDepreciation = Math.max(0, 
    Number(asset.accumulated_depreciation || 0) - totalCancelledDepreciation
  )
  const newBookValue = Math.min(
    Number(asset.purchase_cost || 0),
    Number(asset.book_value || 0) + totalCancelledDepreciation
  )

  await supabase
    .from('fixed_assets')
    .update({
      accumulated_depreciation: newAccumulatedDepreciation,
      book_value: newBookValue,
      status: newBookValue <= Number(asset.salvage_value || 0) 
        ? 'fully_depreciated' 
        : 'active',
      updated_at: new Date().toISOString(),
      updated_by: user.id
    })
    .eq('id', id)

  return NextResponse.json({ 
    success: true,
    cancelled_count: schedules.length 
  })
}
```

#### الخيار 2: حذف القيد المحاسبي مباشرة - **غير موصى به**

⚠️ **تحذير:** حذف القيود المحاسبية المرحلة يعتبر **مخالف لمبادئ ERP** لأنه:
- يمحو التاريخ المحاسبي
- يسبب عدم توازن في التقارير المالية
- لا يترك أثر للمراجعة (Audit Trail)

**يجب استخدام القيد العكسي (Reversal Entry) دائماً.**

---

## 📊 مقارنة مع الأنظمة الاحترافية

### Odoo / Zoho / SAP
- ✅ **إلغاء المعتمد (Approved):** تغيير الحالة فقط
- ✅ **إلغاء المرحل (Posted):** إنشاء قيد عكسي (Reversal Entry)
- ✅ **الصلاحيات:** Owner/Admin فقط
- ✅ **التاريخ:** الحفاظ على `journal_entry_id` الأصلي + إضافة `reversal_journal_entry_id`

---

## 🔐 متطلبات الصلاحيات

### للاعتماد (Approve)
- ✅ Owner
- ✅ Admin
- ❌ Manager (حتى لو كان لديه صلاحية في `company_role_permissions`)

### للإلغاء (Cancel)
- ✅ Owner
- ✅ Admin
- ❌ جميع الأدوار الأخرى

**الكود الحالي في `app/fixed-assets/[id]/page.tsx`:**
```typescript
// 🔐 التحقق الإضافي: الاعتماد فقط لـ Owner و Admin
const userRole = context.role || "viewer"
const canApproveWriteOff = approve && (userRole === "owner" || userRole === "admin")
```

**يجب تطبيق نفس المنطق للإلغاء.**

---

## 📝 التوصيات للتنفيذ

### 1. إضافة API Endpoint للإلغاء

**الملف:** `app/api/fixed-assets/[id]/depreciation/route.ts`

**إضافة:**
```typescript
if (action === 'cancel') {
  // إلغاء إهلاك معتمد (approved)
}

if (action === 'cancel_posted') {
  // إلغاء إهلاك مرحل (posted) - مع قيد عكسي
}
```

### 2. إضافة واجهة مستخدم

**الملف:** `app/fixed-assets/[id]/page.tsx`

**إضافة:**
- زر "إلغاء" للجداول المعتمدة (`approved`)
- زر "إلغاء مع قيد عكسي" للجداول المرحلة (`posted`)
- تحذير واضح قبل الإلغاء

### 3. تحديث قاعدة البيانات (اختياري)

**إضافة أعمدة جديدة في `depreciation_schedules`:**
```sql
ALTER TABLE depreciation_schedules
ADD COLUMN IF NOT EXISTS reversal_journal_entry_id UUID REFERENCES journal_entries(id),
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
```

### 4. تحديث التقارير

**التأكد من:**
- التقارير المالية (Balance Sheet, Income Statement) تعكس القيود العكسية
- تقارير الأصول الثابتة تعرض الإهلاك الملغى بوضوح

---

## ⚠️ تحذيرات مهمة

1. **لا تحذف القيود المحاسبية المرحلة مباشرة**
   - استخدم القيد العكسي دائماً
   - احتفظ بـ `journal_entry_id` الأصلي للتاريخ

2. **التحقق من التوازن**
   - بعد الإلغاء، تأكد من توازن الميزانية العمومية
   - تأكد من صحة `accumulated_depreciation` و `book_value`

3. **الصلاحيات**
   - الإلغاء مسموح فقط لـ Owner و Admin
   - لا تسمح للمديرين أو المحاسبين بإلغاء إهلاك مرحل

4. **التاريخ المحاسبي**
   - احتفظ بسجل كامل (Audit Trail)
   - سجل من قام بالإلغاء ومتى

---

## ✅ الخلاصة

### الوضع الحالي:
- ❌ **لا يوجد** API endpoint لإلغاء الإهلاك المعتمد
- ❌ **لا يوجد** واجهة مستخدم للإلغاء
- ✅ يوجد حماية من حذف الأصل مع إهلاك مرحل

### المطلوب:
1. ✅ إضافة API endpoint لإلغاء الإهلاك المعتمد (`approved`)
2. ✅ إضافة API endpoint لإلغاء الإهلاك المرحل (`posted`) مع قيد عكسي
3. ✅ إضافة واجهة مستخدم للإلغاء
4. ✅ تطبيق نفس قواعد الصلاحيات (Owner/Admin فقط)
5. ✅ تحديث التقارير لتعكس القيود العكسية

---

**تاريخ التقرير:** 2026-01-25  
**الحالة:** تحتاج تنفيذ
