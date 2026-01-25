# 🔐 نظام الأمان والتحديث الفوري (Security Realtime System)

## 📋 نظرة عامة

هذا النظام يضمن التحديث الفوري للصلاحيات والأدوار والفروع بدون أي Refresh للصفحة. هذا جزء أساسي من جودة نظام ERP احترافي ولا يمكن الاستغناء عنه.

**⚠️ تحذير مهم:** أي تعديل على هذا النظام يجب أن يتم بعناية فائقة ومراجعة شاملة لجميع الطبقات المتأثرة.

---

## 1️⃣ مصدر الحقيقة الوحيد (Single Source of Truth)

### الجدول الرسمي: `company_members`

**هذا هو الجدول الوحيد الذي يحتوي على:**
- `role` - الدور الحالي للمستخدم
- `branch_id` - الفرع الحالي للمستخدم
- `warehouse_id` - المخزن الحالي للمستخدم
- `cost_center_id` - مركز التكلفة الحالي للمستخدم

### ✅ القواعد الإلزامية:

1. **قراءة الدور والفرع:**
   ```typescript
   // ✅ صحيح - قراءة مباشرة من company_members
   const { data: member } = await supabase
     .from("company_members")
     .select("role, branch_id, warehouse_id, cost_center_id")
     .eq("company_id", companyId)
     .eq("user_id", userId)
     .maybeSingle()
   ```

2. **تحديث الدور والفرع:**
   ```typescript
   // ✅ صحيح - تحديث مباشر في company_members
   await supabase
     .from("company_members")
     .update({ role: newRole, branch_id: newBranchId })
     .eq("id", memberId)
   ```

3. **❌ ممنوع تماماً:**
   - تخزين الدور أو الفرع في state محلي فقط بدون مزامنة مع الداتابيس
   - استخدام joins أو relations للحصول على الدور/الفرع
   - قراءة من جداول أخرى غير `company_members` للحصول على الدور/الفرع الأساسي

### 📍 الملفات المسؤولة:

- `lib/access-context.tsx` - `fetchAccessProfile()` - السطر 152
- `lib/permissions-context.tsx` - `loadPermissions()` - السطر 240
- `lib/branch-access-control.ts` - `getUserBranchData()` - السطر 85

---

## 2️⃣ آلية Realtime الرسمية

### الجداول المشتركة في Realtime:

#### 1. `company_members` (حرج - أساسي)
- **الغرض:** تغييرات الدور والفرع الأساسي
- **الأحداث:** UPDATE
- **التأثير:** BLIND REFRESH - إعادة تحميل كامل للسياق الأمني

#### 2. `user_branch_access` (حرج - للفروع المتعددة)
- **الغرض:** تغييرات الفروع المسموحة للمستخدم
- **الأحداث:** INSERT, UPDATE, DELETE
- **التأثير:** BLIND REFRESH - إعادة تحميل كامل للسياق الأمني

#### 3. `company_role_permissions` (مهم)
- **الغرض:** تغييرات الصلاحيات المرتبطة بالأدوار
- **الأحداث:** INSERT, UPDATE, DELETE
- **التأثير:** إعادة تحميل الصلاحيات

#### 4. `branches` (مهم)
- **الغرض:** تغييرات بيانات الفروع
- **الأحداث:** UPDATE
- **التأثير:** تحديث بيانات الفروع في UI

#### 5. `warehouses` (مهم)
- **الغرض:** تغييرات بيانات المخازن
- **الأحداث:** UPDATE
- **التأثير:** تحديث بيانات المخازن في UI

### 🔐 قناة Governance Realtime:

```typescript
channelName: `governance_realtime_channel:${companyId}:${userId}`
```

**الفلترة:**
- `company_members`: `company_id=eq.${companyId}` (بدون `user_id` filter)
- `user_branch_access`: `company_id=eq.${companyId}` (بدون `user_id` filter)

**⚠️ مهم جداً:** الفلترة على مستوى Supabase تكون بسيطة (`company_id` فقط)، والفلترة التفصيلية (`user_id`) تتم في `handleGovernanceEvent` على مستوى Client.

### 📍 الملفات المسؤولة:

- `lib/realtime-manager.ts` - `subscribeToGovernance()` - السطر 697
- `hooks/use-governance-realtime.ts` - `useGovernanceRealtime()` - السطر 57
- `scripts/111_enable_governance_realtime.sql` - تفعيل Realtime على الجداول

---

## 3️⃣ قاعدة إلزامية عند أي تغيير أمني

### التسلسل الإلزامي (بدون استثناء):

عند تغيير:
- الدور (`role`)
- الفرع (`branch_id`)
- المالك أو المدير العام

يجب أن يحدث بالترتيب التالي:

```
1. تحديث الداتابيس
   ↓
2. إطلاق Realtime event (تلقائي من Supabase)
   ↓
3. استدعاء refreshUserSecurityContext()
   ↓
4. إعادة تهيئة PageGuard
   ↓
5. إعادة فحص الصلاحيات فورًا
   ↓
6. إعادة توجيه المستخدم لأول صفحة مسموحة
```

### ✅ مثال على التطبيق الصحيح:

```typescript
// 1. تحديث الداتابيس
const { error } = await supabase
  .from("company_members")
  .update({ role: newRole, branch_id: newBranchId })
  .eq("id", memberId)

if (error) throw error

// 2. Realtime event سيتم إطلاقه تلقائياً من Supabase
// 3-6. سيتم تنفيذها تلقائياً في:
//    - handleGovernanceEvent() في realtime-manager.ts
//    - useGovernanceRealtime() في hooks/use-governance-realtime.ts
//    - refreshUserSecurityContext() في access-context.tsx
//    - RealtimeRouteGuard في components/realtime-route-guard.tsx
```

### 📍 الملفات المسؤولة:

- `lib/access-context.tsx` - `refreshUserSecurityContext()` - السطر 323
- `lib/realtime-manager.ts` - `handleGovernanceEvent()` - السطر 1000
- `hooks/use-governance-realtime.ts` - Event handlers - السطر 89
- `components/realtime-route-guard.tsx` - Route protection

---

## 4️⃣ منع كسر النموذج مرة أخرى

### ✅ قواعد إلزامية للتعديلات المستقبلية:

#### عند تعديل طريقة اختيار الأدوار أو الفروع:

1. **مراجعة شاملة:**
   - ✅ التأكد من أن التعديل متوافق مع `company_members` table structure
   - ✅ التأكد من أن Realtime subscriptions ما زالت تعمل
   - ✅ التأكد من أن `refreshUserSecurityContext()` ما زال يقرأ من الجدول الصحيح
   - ✅ التأكد من أن PageGuard ما زال يعمل بشكل صحيح

2. **اختبار إلزامي:**
   - ✅ اختبار تغيير الدور من Owner/Admin
   - ✅ اختبار تغيير الفرع من Owner/Admin
   - ✅ التحقق من التحديث الفوري بدون Refresh
   - ✅ التحقق من إعادة التوجيه لأول صفحة مسموحة

3. **التوثيق:**
   - ✅ تحديث هذا الملف (`SECURITY_REALTIME_SYSTEM.md`)
   - ✅ تحديث comments في الكود
   - ✅ إضافة migration scripts إذا لزم الأمر

#### عند تعديل طبقة الأمان:

**⚠️ تحذير:** أي تعديل في:
- `lib/access-context.tsx`
- `lib/realtime-manager.ts`
- `hooks/use-governance-realtime.ts`
- `components/realtime-route-guard.tsx`

يجب مراجعته مع جميع الطبقات الأخرى.

---

## 5️⃣ الدوال المسؤولة عن التحديث الأمني

### 1. `refreshUserSecurityContext()`

**الموقع:** `lib/access-context.tsx` - السطر 323

**الغرض:** إعادة تحميل كامل للسياق الأمني من الداتابيس

**الاستدعاء:**
- تلقائياً عند استقبال Realtime event من `company_members` أو `user_branch_access`
- يدوياً عند تغيير الشركة النشطة

**ما يفعله:**
1. استدعاء `fetchAccessProfile()` لجلب البيانات من `company_members`
2. تحديث `AccessContext` state
3. إطلاق events: `permissions_updated`, `access_profile_updated`, `user_context_changed`
4. إعادة تهيئة Realtime subscriptions

### 2. `fetchAccessProfile()`

**الموقع:** `lib/access-context.tsx` - السطر 152

**الغرض:** جلب Access Profile من `company_members` (Single Source of Truth)

**ما يفعله:**
1. Query مباشر من `company_members` بدون joins
2. جلب `role`, `branch_id`, `warehouse_id`, `cost_center_id`
3. حساب `allowed_pages` و `allowed_actions` حسب الدور
4. جلب `allowed_branches` من `user_branch_access` (إذا لزم الأمر)

### 3. `handleGovernanceEvent()`

**الموقع:** `lib/realtime-manager.ts` - السطر 1000

**الغرض:** معالجة Realtime events من جداول الحوكمة

**ما يفعله:**
1. التحقق من `affectsCurrentUser`
2. إطلاق event إلى جميع `governanceHandlers`
3. Logging للأحداث

### 4. `useGovernanceRealtime()`

**الموقع:** `hooks/use-governance-realtime.ts` - السطر 57

**الغرض:** Hook لربط Realtime events مع React components

**ما يفعله:**
1. تسجيل event handler مع `RealtimeManager`
2. استدعاء `onPermissionsChanged()`, `onRoleChanged()`, `onBranchOrWarehouseChanged()` عند الحاجة
3. استدعاء `refreshUserSecurityContext()` عند تغيير `company_members` أو `user_branch_access`

---

## 6️⃣ الأحداث المستخدمة في Realtime

### Custom Events (Browser Events):

#### 1. `permissions_updated`
- **الإطلاق:** `lib/access-context.tsx` - `refreshUserSecurityContext()`
- **الاستماع:** `components/sidebar.tsx`, `components/realtime-route-guard.tsx`
- **الغرض:** تحديث UI عند تغيير الصلاحيات

#### 2. `access_profile_updated`
- **الإطلاق:** `lib/access-context.tsx` - `refreshUserSecurityContext()`
- **الاستماع:** `components/sidebar.tsx`, `components/realtime-route-guard.tsx`
- **الغرض:** تحديث UI عند تغيير Access Profile

#### 3. `user_context_changed`
- **الإطلاق:** `lib/access-context.tsx` - `refreshUserSecurityContext()`
- **الاستماع:** `components/sidebar.tsx`, `lib/realtime-provider.tsx`
- **الغرض:** إعادة تهيئة Realtime subscriptions

### Supabase Realtime Events:

#### 1. `company_members` - UPDATE
- **الفلترة:** `company_id=eq.${companyId}`
- **المعالجة:** `handleGovernanceEvent()` → `useGovernanceRealtime()` → `refreshUserSecurityContext()`
- **التأثير:** BLIND REFRESH كامل

#### 2. `user_branch_access` - INSERT/UPDATE/DELETE
- **الفلترة:** `company_id=eq.${companyId}`
- **المعالجة:** `handleGovernanceEvent()` → `useGovernanceRealtime()` → `refreshUserSecurityContext()`
- **التأثير:** BLIND REFRESH كامل

---

## 7️⃣ BLIND REFRESH Pattern

### المفهوم:

**BLIND REFRESH** يعني: عند أي UPDATE على `company_members` أو `user_branch_access` للمستخدم الحالي، يتم **دائماً** إعادة تحميل كامل للسياق الأمني من الداتابيس **بدون أي شروط أو مقارنات**.

### ✅ التطبيق:

```typescript
// في handleGovernanceEvent()
if (affectsCurrentUser) {
  // ✅ BLIND REFRESH: بدون شروط، بدون مقارنات
  await refreshUserSecurityContext()
}

// في refreshUserSecurityContext()
// ✅ BLIND REFRESH: إعادة تحميل كامل بدون شروط
const profile = await fetchAccessProfile(supabase, userId, companyId)
// ✅ تحديث Context
// ✅ إطلاق Events
// ✅ إعادة تهيئة Realtime subscriptions
```

### ❌ ممنوع:

```typescript
// ❌ خطأ - مقارنة معقدة
if (oldRole !== newRole || oldBranch !== newBranch) {
  await refreshUserSecurityContext()
}

// ❌ خطأ - شروط إضافية
if (shouldRefresh && isImportantChange) {
  await refreshUserSecurityContext()
}
```

---

## 8️⃣ Checklist للتعديلات المستقبلية

قبل أي تعديل على نظام الأمان، تأكد من:

- [ ] مراجعة `company_members` table structure
- [ ] التأكد من أن Realtime subscriptions ما زالت تعمل
- [ ] اختبار تغيير الدور من Owner/Admin
- [ ] اختبار تغيير الفرع من Owner/Admin
- [ ] التحقق من التحديث الفوري بدون Refresh
- [ ] التحقق من إعادة التوجيه لأول صفحة مسموحة
- [ ] تحديث هذا الملف (`SECURITY_REALTIME_SYSTEM.md`)
- [ ] تحديث comments في الكود
- [ ] إضافة migration scripts إذا لزم الأمر

---

## 9️⃣ Troubleshooting

### المشكلة: التحديث لا يحدث فوراً

**التحقق:**
1. ✅ Realtime subscriptions نشطة (`✅ [RealtimeManager] Successfully subscribed to Governance Channel`)
2. ✅ Events تصل من Supabase (`🔐 [RealtimeManager] company_members event received`)
3. ✅ `affectsCurrentUser = true` في logs
4. ✅ `refreshUserSecurityContext()` يُستدعى (`🔄 [AccessContext] BLIND REFRESH`)

**الحل:**
- Hard Refresh للمتصفح (`Ctrl + Shift + R`)
- التحقق من RLS policies على `company_members`
- التحقق من Realtime publications في Supabase

### المشكلة: Filter خاطئ في Realtime subscription

**التحقق:**
- ✅ `filterValid: true` في logs
- ✅ Filter لا يحتوي على `user_id=eq.${userId}`

**الحل:**
- Hard Refresh للمتصفح
- التحقق من الكود في `lib/realtime-manager.ts` - `subscribeToGovernance()`

---

## 🔟 المراجع

- `lib/access-context.tsx` - Access Context الرئيسي
- `lib/realtime-manager.ts` - Realtime Manager
- `hooks/use-governance-realtime.ts` - Governance Realtime Hook
- `components/realtime-route-guard.tsx` - Route Protection
- `scripts/111_enable_governance_realtime.sql` - Realtime Setup Script

---

**⚠️ تذكير:** هذا النظام جزء أساسي من جودة نظام ERP احترافي. أي تعديل يجب أن يتم بعناية فائقة ومراجعة شاملة.
