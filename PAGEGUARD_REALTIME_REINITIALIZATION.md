# 🔐 نظام إعادة تهيئة PageGuard لحظياً (ERP Grade)

## 📋 نظرة عامة

نظام متكامل لإعادة تهيئة PageGuard بالكامل عند أي تغيير في السياق الأمني (الدور، الفرع، الصلاحيات) بدون Refresh.

## ✅ المتطلبات المنجزة

### 1️⃣ إعادة تهيئة PageGuard عند تغيير السياق الأمني

✅ **الأحداث المستمعة:**
- `permissions_updated` - عند تغيير الصلاحيات
- `access_profile_updated` - عند تحديث Access Profile
- `user_context_changed` - عند تغيير الفرع أو الدور

✅ **الإجراءات المنفذة عند استقبال أي حدث:**
```typescript
// إعادة تهيئة جميع refs
hasRedirectedRef.current = false
wasAccessNotReadyRef.current = false
initialRedirectPathRef.current = null
isRefreshingRef.current = false

// إعادة حساب initialAccessCheck من الكاش المحدث
const updatedCachedCheck = getCachedPermissions()
const hasAccess = canAccessPageSync(targetResource) || canAccessPage(targetResource)

// تحديث accessState
setAccessState(hasAccess ? "allowed" : "denied")

// إذا لم تعد الصفحة مسموحة، إعادة التوجيه فوراً
if (!hasAccess && !showAccessDenied) {
  const redirectTo = fallbackPath || getFirstAllowedPage()
  router.replace(redirectTo)
}
```

### 2️⃣ دالة reinitializePageGuard

✅ **الوظيفة:**
- إعادة تهيئة جميع refs
- إعادة حساب initialAccessCheck من الكاش المحدث
- استخدام canAccessPage من AccessContext (أكثر دقة)
- إعادة التوجيه فوراً إذا لم تعد الصفحة مسموحة

✅ **الاستخدام:**
- يتم استدعاؤها تلقائياً عند استقبال أي من الأحداث المذكورة أعلاه
- لا تحتاج لاستدعاء يدوي

### 3️⃣ Event Listeners

✅ **الأحداث المستمعة:**
```typescript
window.addEventListener("permissions_updated", handleContextChange)
window.addEventListener("access_profile_updated", handleContextChange)
window.addEventListener("user_context_changed", handleContextChange)
```

✅ **الـ Handler:**
- يتحقق من أننا لسنا في `/settings/users` (لمنع إعادة التوجيه أثناء تعديل الصلاحيات)
- يستدعي `reinitializePageGuard()` لإعادة تهيئة PageGuard بالكامل

### 4️⃣ التكامل مع RealtimeManager

✅ **RealtimeManager يستقبل الأحداث من Supabase:**
- `company_members` (role, branch_id, warehouse_id)
- `user_branch_access` (allowed_branches)
- `company_role_permissions` (permissions)

✅ **عند أي تغيير:**
1. RealtimeManager يستقبل الحدث
2. `handleGovernanceEvent` يكتشف أن `affectsCurrentUser = true`
3. `rebuildContextAndSubscriptions()` يتم استدعاؤه
4. `useGovernanceRealtime` يستدعي `refreshUserSecurityContext()`
5. `refreshUserSecurityContext` يطلق الأحداث:
   - `access_profile_updated`
   - `permissions_updated`
   - `user_context_changed` (عند تغيير الفرع أو الدور)
6. PageGuard يستمع للأحداث ويعيد تهيئة نفسه

## 🔄 دورة التحديث اللحظي

### السيناريو 1: تغيير الدور (Role)

```
1. Owner يغير role مستخدم من Staff → Accountant
2. RealtimeManager يستقبل الحدث من Supabase
3. useGovernanceRealtime يستدعي onRoleChanged()
4. AccessContext يستدعي refreshUserSecurityContext()
5. refreshUserSecurityContext يطلق:
   - access_profile_updated
   - permissions_updated
   - user_context_changed (role_changed_via_realtime)
6. PageGuard يستمع للأحداث ويعيد تهيئة نفسه
7. reinitializePageGuard() يعيد فحص الصلاحية
8. إذا لم تعد الصفحة مسموحة → router.replace(getFirstAllowedPage())
9. المستخدم يرى الصفحات الجديدة فوراً بدون Refresh
```

### السيناريو 2: تغيير الفرع (Branch)

```
1. Owner يغير branch مستخدم
2. RealtimeManager يستقبل الحدث
3. refreshUserSecurityContext() يتم استدعاؤه
4. refreshUserSecurityContext يطلق:
   - access_profile_updated
   - user_context_changed (branch_changed_via_realtime)
5. PageGuard يعيد تهيئة نفسه
6. reinitializePageGuard() يعيد فحص الصلاحية
7. إذا لم تعد الصفحة مسموحة → router.replace(getFirstAllowedPage())
8. يتم إغلاق الصفحات غير التابعة للفرع الجديد
9. فتح صفحات الفرع الجديد فقط
```

### السيناريو 3: تغيير allowed_branches

```
1. Owner يغير allowed_branches للمستخدم
2. RealtimeManager يستقبل الحدث من user_branch_access
3. refreshUserSecurityContext() يتم استدعاؤه
4. refreshUserSecurityContext يطلق:
   - access_profile_updated
   - user_context_changed (allowed_branches_changed_via_realtime)
5. PageGuard يعيد تهيئة نفسه
6. reinitializePageGuard() يعيد فحص الصلاحية
7. إذا لم تعد الصفحة مسموحة → router.replace(getFirstAllowedPage())
```

## 🎯 النتيجة النهائية

✅ **نظام لحظي 100%:**
- تحديث فوري بدون أي Refresh
- إعادة تهيئة PageGuard تلقائياً عند أي تغيير
- إعادة فحص الصلاحية فوراً
- إعادة التوجيه لأول صفحة مسموحة ديناميكياً
- لا فتح صفحات غير مصرح بها ولو لحظة واحدة

✅ **متوافق مع:**
- ERP Grade Architecture
- Governance
- Audit Safe
- Multi-Branch / Multi-Role

## 📝 الملفات المعدلة

1. **components/page-guard.tsx**
   - إضافة `reinitializePageGuard()` function
   - إضافة event listeners للأحداث الثلاثة
   - إعادة تهيئة refs عند تغيير السياق الأمني

## 🔍 الاختبار

### السيناريوهات الإلزامية:

✅ **السيناريو 1:**
- Owner يغير role مستخدم من Staff → Accountant
- PageGuard يعيد تهيئة نفسه تلقائياً
- المستخدم يرى الصفحات الجديدة فوراً
- يتم نقله تلقائياً لأول صفحة محاسبية مسموحة

✅ **السيناريو 2:**
- Owner يغير branch مستخدم
- PageGuard يعيد تهيئة نفسه تلقائياً
- يتم إغلاق الصفحات غير التابعة للفرع الجديد
- فتح صفحات الفرع الجديد فقط

✅ **السيناريو 3:**
- Owner يغير allowed_branches للمستخدم
- PageGuard يعيد تهيئة نفسه تلقائياً
- يتم إغلاق الصفحات غير المسموحة
- فتح صفحات الفروع الجديدة فقط

## 🚀 الاستخدام

النظام يعمل تلقائياً - لا حاجة لأي إعداد إضافي. فقط:

1. ✅ تأكد من تفعيل Realtime Replication في Supabase Dashboard
2. ✅ تأكد من أن الجداول تحتوي على `company_id` و `user_id`
3. ✅ النظام سيعمل تلقائياً عند أي تغيير

## 📚 المراجع

- `components/page-guard.tsx` - PageGuard مع إعادة التهيئة
- `lib/access-context.tsx` - AccessContext و refreshUserSecurityContext
- `hooks/use-governance-realtime.ts` - useGovernanceRealtime hook
- `lib/realtime-manager.ts` - RealtimeManager
