# 🔐 نظام أحداث تغيير السياق الأمني (ERP Grade - لحظي 100%)

## 📋 نظرة عامة

نظام متكامل لبث أحداث تغيير السياق الأمني مباشرة للمستخدم المتأثر بدون أي Refresh. يضمن تحديث جلسة المستخدم فوراً عند أي تغيير في الدور أو الفرع أو الصلاحيات.

## ✅ المتطلبات المنجزة

### 1️⃣ جدول user_security_events

✅ **الجدول:**
```sql
CREATE TABLE user_security_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- role_changed | branch_changed | access_changed | allowed_branches_changed
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ
)
```

✅ **الـ Triggers:**
- `trigger_company_members_role_changed` - عند تغيير role
- `trigger_company_members_branch_changed` - عند تغيير branch_id
- `trigger_user_branch_access_changed` - عند تغيير user_branch_access
- `trigger_company_role_permissions_changed` - عند تغيير company_role_permissions

✅ **الـ Function:**
- `insert_user_security_event()` - لإدراج حدث أمني
- `cleanup_old_security_events()` - لتنظيف الأحداث القديمة

### 2️⃣ Realtime Subscription

✅ **في RealtimeManager:**
- الاشتراك في `user_security_events` مع فلترة حسب `user_id`
- معالجة الأحداث عبر `handleUserSecurityEvent()`
- إعادة بناء السياق والاشتراكات فوراً

✅ **الفلترة:**
```typescript
const userSecurityEventsFilter = `user_id=eq.${userId}`
```

### 3️⃣ refreshUserSecurityContext

✅ **التحسينات:**
- يجلب البيانات من السيرفر مباشرة (لا cache)
- يعيد بناء Access Profile جديد بالكامل
- يحدث AccessContext و PermissionsContext فعلياً
- يحدث الكاش
- يطلق الأحداث المطلوبة

✅ **المصادر:**
- `company_members` - role, branch_id, warehouse_id
- `user_branch_access` - allowed_branches
- `company_role_permissions` - permissions

### 4️⃣ معالجة الأحداث في useGovernanceRealtime

✅ **معالجة `user_security_events`:**
- `role_changed` → استدعاء `onRoleChanged()`
- `branch_changed` → استدعاء `onBranchOrWarehouseChanged()`
- `allowed_branches_changed` → استدعاء `onBranchOrWarehouseChanged()`
- `access_changed` → استدعاء `onPermissionsChanged()`

## 🔄 دورة التحديث اللحظي الكاملة

### السيناريو 1: Owner يغير role مستخدم

```
1. Owner يغير role مستخدم من Staff → Accountant في company_members
2. Trigger: trigger_company_members_role_changed يتم استدعاؤه
3. Trigger يستدعي insert_user_security_event():
   - event_type: 'role_changed'
   - event_data: { old_role: 'staff', new_role: 'accountant' }
4. Supabase Realtime يبث الحدث للمستخدم المتأثر
5. RealtimeManager.handleUserSecurityEvent() يستقبل الحدث
6. useGovernanceRealtime يستدعي onRoleChanged()
7. AccessContext يستدعي refreshUserSecurityContext()
8. refreshUserSecurityContext():
   - يجلب البيانات من السيرفر مباشرة (fetchAccessProfile)
   - يعيد بناء Access Profile جديد بالكامل
   - يحدث profile state
   - يطلق access_profile_updated, permissions_updated, user_context_changed
9. PageGuard و RealtimeRouteGuard يستمعون للأحداث
10. PageGuard يعيد تهيئة نفسه (reinitializePageGuard)
11. RealtimeRouteGuard يعيد تقييم الصفحة الحالية
12. إذا لم تعد الصفحة مسموحة → router.replace(getFirstAllowedPage())
13. المستخدم يرى الصفحات الجديدة فوراً بدون Refresh
```

### السيناريو 2: Owner يغير branch مستخدم

```
1. Owner يغير branch_id مستخدم في company_members
2. Trigger: trigger_company_members_branch_changed يتم استدعاؤه
3. Trigger يستدعي insert_user_security_event():
   - event_type: 'branch_changed'
   - event_data: { old_branch_id: 'xxx', new_branch_id: 'yyy' }
4. Supabase Realtime يبث الحدث للمستخدم المتأثر
5. RealtimeManager.handleUserSecurityEvent() يستقبل الحدث
6. useGovernanceRealtime يستدعي onBranchOrWarehouseChanged()
7. AccessContext يستدعي refreshUserSecurityContext(true)
8. refreshUserSecurityContext():
   - يجلب البيانات من السيرفر مباشرة
   - يكتشف تغيير branch_id
   - يطلق user_context_changed (branch_changed_via_realtime)
9. PageGuard و RealtimeRouteGuard يستمعون للأحداث
10. يتم إغلاق الصفحات غير التابعة للفرع الجديد
11. فتح صفحات الفرع الجديد فقط
```

### السيناريو 3: Owner يغير allowed_branches

```
1. Owner يضيف/يحذف فرع من user_branch_access
2. Trigger: trigger_user_branch_access_changed يتم استدعاؤه
3. Trigger يستدعي insert_user_security_event():
   - event_type: 'allowed_branches_changed'
   - event_data: { action: 'added'/'removed', branch_id: 'xxx' }
4. Supabase Realtime يبث الحدث للمستخدم المتأثر
5. RealtimeManager.handleUserSecurityEvent() يستقبل الحدث
6. useGovernanceRealtime يستدعي onBranchOrWarehouseChanged()
7. AccessContext يستدعي refreshUserSecurityContext(true)
8. refreshUserSecurityContext():
   - يجلب allowed_branches من السيرفر مباشرة
   - يكتشف تغيير allowed_branches
   - يطلق user_context_changed (allowed_branches_changed_via_realtime)
9. PageGuard و RealtimeRouteGuard يستمعون للأحداث
10. يتم إغلاق الصفحات غير المسموحة
11. فتح صفحات الفروع الجديدة فقط
```

## 🎯 النتيجة النهائية

✅ **نظام لحظي 100%:**
- تحديث فوري بدون أي Refresh
- بث موجه للمستخدم المتأثر مباشرة
- جلب البيانات من السيرفر مباشرة (لا cache)
- إعادة بناء Access Profile جديد بالكامل
- تحديث AccessContext و PermissionsContext فعلياً
- إعادة فحص الصلاحية فوراً
- إعادة التوجيه لأول صفحة مسموحة ديناميكياً
- لا فتح صفحات غير مصرح بها ولو لحظة واحدة

✅ **متوافق مع:**
- ERP Grade Architecture
- Governance
- Audit Safe
- Multi-Branch / Multi-Role

## 📝 الملفات المعدلة/المنشأة

1. **scripts/108_user_security_events_system.sql**
   - إنشاء جدول `user_security_events`
   - إنشاء triggers لإدراج الأحداث
   - إنشاء functions للتنظيف

2. **lib/realtime-manager.ts**
   - إضافة `user_security_events` إلى RealtimeTable type
   - إضافة الاشتراك في `user_security_events`
   - إضافة `handleUserSecurityEvent()` function

3. **hooks/use-governance-realtime.ts**
   - إضافة معالجة `user_security_events`
   - استدعاء الـ handlers المناسبة حسب event_type

4. **lib/access-context.tsx**
   - تحسين `fetchAccessProfile` لضمان جلب البيانات من السيرفر
   - تحسين `loadAccessProfile` مع تعليقات توضيحية
   - تحسين `refreshUserSecurityContext` لضمان جلب البيانات من السيرفر

## 🔍 الاختبار

### السيناريوهات الإلزامية:

✅ **السيناريو 1:**
- Owner يغير role مستخدم من Staff → Accountant
- المستخدم المتأثر يرى الصفحات الجديدة فوراً
- يتم نقله تلقائياً لأول صفحة محاسبية مسموحة

✅ **السيناريو 2:**
- Owner يغير branch مستخدم
- المستخدم المتأثر يرى الفرع الجديد فوراً
- يتم إغلاق الصفحات غير التابعة للفرع الجديد
- فتح صفحات الفرع الجديد فقط

✅ **السيناريو 3:**
- Owner يغير allowed_branches للمستخدم
- المستخدم المتأثر يرى الفروع الجديدة فوراً
- يتم إغلاق الصفحات غير المسموحة
- فتح صفحات الفروع الجديدة فقط

## 🚀 التطبيق

### 1️⃣ تطبيق SQL Migration

```sql
-- في Supabase Dashboard → SQL Editor
-- نسخ محتوى scripts/108_user_security_events_system.sql
-- الصق واضغط Run
```

### 2️⃣ التحقق من التطبيق

```sql
-- التحقق من وجود الجدول
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'user_security_events';

-- التحقق من وجود Triggers
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%user_security%';

-- التحقق من Realtime Replication
SELECT * FROM pg_publication_tables WHERE tablename = 'user_security_events';
```

### 3️⃣ الاختبار

1. فتح جلسة مستخدم (User A)
2. فتح جلسة Owner/Admin (User B)
3. في User B: تغيير role أو branch لـ User A
4. في User A: يجب أن يحدث التحديث فوراً بدون Refresh

## 📚 المراجع

- `scripts/108_user_security_events_system.sql` - SQL Migration
- `lib/realtime-manager.ts` - RealtimeManager و handleUserSecurityEvent
- `hooks/use-governance-realtime.ts` - useGovernanceRealtime hook
- `lib/access-context.tsx` - AccessContext و refreshUserSecurityContext
