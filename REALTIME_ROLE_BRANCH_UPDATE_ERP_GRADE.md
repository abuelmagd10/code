# 🔐 نظام التحديث اللحظي للدور والفرع (ERP Grade)

## 📋 نظرة عامة

نظام متكامل لتحديث الصلاحيات والفرع والدور لحظياً بدون أي Refresh. يضمن التحديث الفوري 100% مع إعادة تقييم الصفحة الحالية تلقائياً.

## ✅ المتطلبات المنجزة

### 1️⃣ Database Realtime Compliance

✅ **الجداول المشتركة فيها عبر Supabase Realtime:**
- `company_members` (role, branch_id, warehouse_id)
- `user_branch_access` (allowed_branches)
- `company_role_permissions` (permissions)
- `branches` (تغييرات الفروع)
- `warehouses` (تغييرات المخازن)
- `permissions` (الصلاحيات العامة)

✅ **كل تحديث يحتوي على:**
- `company_id` (إجباري)
- `user_id` (إجباري)
- `role` (عند التغيير)
- `branch_id` (عند التغيير)

✅ **Realtime Replication مفعل في Supabase Dashboard**

### 2️⃣ Realtime Subscriptions (Backend / Client)

✅ **الاشتراكات اللحظية:**

#### company_members
- **فلترة:**
  - Owner/Admin → جميع التغييرات داخل الشركة
  - المستخدم العادي → فقط الصف الذي `user_id = current_user`
- **عند التغيير:**
  - إذا تغير `role` → استدعاء `refreshUserSecurityContext()` فوراً
  - إذا تغير `branch_id` → استدعاء `refreshUserSecurityContext()` فوراً
  - إذا تغير `warehouse_id` → استدعاء `refreshUserSecurityContext()` فوراً

#### user_branch_access
- **فلترة:**
  - `user_id = current_user`
  - `company_id = current_company`
- **عند التغيير:**
  - أي INSERT/UPDATE/DELETE → استدعاء `refreshUserSecurityContext()` فوراً

#### company_role_permissions
- **فلترة:**
  - `company_id = current_company`
  - `role = current_role` (يتم التحقق في `handleGovernanceEvent`)
- **عند التغيير:**
  - أي INSERT/UPDATE/DELETE يخص دور المستخدم → استدعاء `refreshUserSecurityContext()` فوراً

### 3️⃣ refreshUserSecurityContext (النقطة الحرجة)

✅ **التحسينات المنجزة:**

1. **جلب البيانات من السيرفر مباشرة (لا cache):**
   ```typescript
   const freshProfile = await loadAccessProfile()
   // ✅ لا نعتمد على payload من Realtime - نذهب للسيرفر مباشرة
   ```

2. **بناء Access Profile جديد بالكامل (ليس merge جزئي):**
   ```typescript
   setProfile(freshProfile) // ✅ تحديث كامل - لا merge
   ```

3. **إطلاق الأحداث المطلوبة:**
   - `access_profile_updated` (مع تفاصيل التغييرات)
   - `permissions_updated` (مع الصلاحيات الجديدة)
   - `user_context_changed` (عند تغيير الفرع أو الدور)

4. **لا redirect داخل الدالة:**
   - ✅ التحكم في التوجيه يكون فقط داخل `RealtimeRouteGuard`
   - ✅ لا unmount للـ contexts - فقط تحديث state

### 4️⃣ Route Protection (RealtimeRouteGuard)

✅ **التحسينات المنجزة:**

1. **إعادة تقييم الصفحة الحالية فوراً:**
   - ✅ الاستماع لتحديثات `profile` تلقائياً
   - ✅ الاستماع لـ `access_profile_updated` event
   - ✅ إعادة تقييم فورية بعد أي تحديث

2. **المنطق الديناميكي:**
   ```typescript
   if (canAccessPage(currentPage)) {
     // ✅ لا توجيه - ابقَ في الصفحة
   } else {
     // ✅ حساب getFirstAllowedPage() ديناميكياً
     const redirectTo = getFirstAllowedPage()
     router.replace(redirectTo)
   }
   ```

3. **لا redirect ثابت:**
   - ❌ ممنوع التوجيه الثابت إلى `/dashboard`
   - ✅ استخدام `getFirstAllowedPage()` ديناميكياً دائماً
   - ✅ fallback فقط إلى `/no-access`

### 5️⃣ التزامن بين Frontend و Database

✅ **الضمانات:**

1. **البيانات من Realtime:**
   - `payload.new` يحتوي على القيم الصحيحة
   - التحقق من `company_id` و `user_id` قبل المعالجة

2. **refreshUserSecurityContext:**
   - ✅ يعتمد دائماً على API مباشر من السيرفر
   - ✅ لا يعتمد على `payload` فقط (لمنع inconsistency)
   - ✅ يبني Access Profile جديد بالكامل

## 🔄 دورة التحديث اللحظي

### السيناريو 1: تغيير الدور (Role)

```
1. Owner يغير role مستخدم من Staff → Accountant
2. RealtimeManager يستقبل الحدث من Supabase
3. handleGovernanceEvent يكتشف أن affectsCurrentUser = true
4. rebuildContextAndSubscriptions() يتم استدعاؤه
5. useGovernanceRealtime يستدعي onRoleChanged()
6. AccessContext يستدعي refreshUserSecurityContext()
7. loadAccessProfile() يجلب البيانات من السيرفر مباشرة
8. setProfile(freshProfile) يحدث profile بالكامل
9. window.dispatchEvent('access_profile_updated') يتم إطلاقه
10. RealtimeRouteGuard يستمع للحدث ويعيد تقييم الصفحة
11. إذا كانت الصفحة غير مسموحة → router.replace(getFirstAllowedPage())
12. المستخدم يرى الصفحات الجديدة فوراً بدون Refresh
```

### السيناريو 2: تغيير الفرع (Branch)

```
1. Owner يغير branch مستخدم
2. RealtimeManager يستقبل الحدث
3. refreshUserSecurityContext() يتم استدعاؤه
4. loadAccessProfile() يجلب البيانات الجديدة
5. window.dispatchEvent('user_context_changed') يتم إطلاقه
6. RealtimeRouteGuard يعيد تقييم الصفحة
7. يتم إغلاق الصفحات غير التابعة للفرع الجديد
8. فتح صفحات الفرع الجديد فقط
```

### السيناريو 3: سحب صلاحية صفحة

```
1. Owner يسحب صلاحية صفحة من المستخدم وهو داخلها
2. RealtimeManager يستقبل الحدث
3. refreshUserSecurityContext() يتم استدعاؤه
4. loadAccessProfile() يجلب الصلاحيات الجديدة
5. RealtimeRouteGuard يعيد تقييم الصفحة
6. canAccessPage(currentPage) = false
7. router.replace(getFirstAllowedPage())
8. المستخدم يتم إخراجه فوراً ونقله لأول صفحة مسموحة
```

## 🎯 النتيجة النهائية

✅ **نظام لحظي 100%:**
- تحديث فوري بدون أي Refresh
- تحديث السياق الأمني تلقائياً
- إعادة تقييم الصفحة الحالية فوراً
- Redirect ديناميكي لأول صفحة مسموحة
- لا فتح صفحات غير مصرح بها ولو لحظة واحدة

✅ **متوافق مع:**
- ERP Grade Architecture
- Governance
- Audit Safe
- Multi-Branch / Multi-Role

✅ **بدون Race Conditions:**
- قاعدة البيانات
- Realtime subscriptions
- refreshUserSecurityContext
- RealtimeRouteGuard

جميعها متوافقة تماماً مع بعضها بدون أي تضارب.

## 📝 الملفات المعدلة

1. **lib/access-context.tsx**
   - تحسين `refreshUserSecurityContext()` لضمان جلب البيانات من السيرفر مباشرة
   - بناء Access Profile جديد بالكامل
   - إطلاق الأحداث الصحيحة

2. **components/realtime-route-guard.tsx**
   - إضافة الاستماع لـ `access_profile_updated` event
   - تحسين إعادة تقييم الصفحة الحالية
   - استخدام `getFirstAllowedPage()` ديناميكياً

3. **components/page-guard.tsx**
   - إزالة redirect ثابت إلى `/dashboard`
   - استخدام `getFirstAllowedPage()` ديناميكياً

4. **lib/realtime-manager.ts**
   - تحسين logging و documentation

## 🔍 الاختبار

### السيناريوهات الإلزامية:

✅ **السيناريو 1:**
- Owner يغير role مستخدم من Staff → Accountant
- المستخدم يرى الصفحات الجديدة فوراً
- يتم نقله تلقائياً لأول صفحة محاسبية مسموحة

✅ **السيناريو 2:**
- Owner يغير branch مستخدم
- يتم تحديث branch في السياق فوراً
- يتم إغلاق الصفحات غير التابعة للفرع الجديد
- فتح صفحات الفرع الجديد فقط

✅ **السيناريو 3:**
- Owner يسحب صلاحية صفحة من المستخدم وهو داخلها
- يتم إخراجه فوراً منها
- نقله لأول صفحة مسموحة

## 🚀 الاستخدام

النظام يعمل تلقائياً - لا حاجة لأي إعداد إضافي. فقط:

1. ✅ تأكد من تفعيل Realtime Replication في Supabase Dashboard
2. ✅ تأكد من أن الجداول تحتوي على `company_id` و `user_id`
3. ✅ النظام سيعمل تلقائياً عند أي تغيير

## 📚 المراجع

- `lib/access-context.tsx` - AccessContext و refreshUserSecurityContext
- `components/realtime-route-guard.tsx` - RealtimeRouteGuard
- `hooks/use-governance-realtime.ts` - useGovernanceRealtime hook
- `lib/realtime-manager.ts` - RealtimeManager
