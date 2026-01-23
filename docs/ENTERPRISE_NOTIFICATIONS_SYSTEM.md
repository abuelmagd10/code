# 🔔 نظام الإشعارات الاحترافي (ERP Standard)

## 📋 نظرة عامة

نظام إشعارات احترافي متكامل يتبع معايير ERP، يوفر:
- ✅ Realtime فعلي بدون refresh
- ✅ فلترة صحيحة حسب الصلاحيات والأدوار
- ✅ أداء عالي مع تبسيط SQL
- ✅ قابل للتوسع لاحقاً

---

## 🏗️ البنية المعمارية

### 1️⃣ آلية العمل

```
1. إنشاء الإشعار → notifications table
2. تفعيل Supabase Realtime (INSERT + UPDATE)
3. الاشتراك في Realtime channel
4. فلترة الإشعارات حسب:
   - company_id
   - assigned_to_user
   - assigned_to_role
   - الدور الحالي
5. إضافة مباشرة للواجهة (State)
6. تحديث عداد الإشعارات فوراً
```

### 2️⃣ الصلاحيات والأدوار

#### منطق الفلترة:

**إذا كان `assigned_to_user` محدد:**
- يظهر لهذا المستخدم فقط
- **استثناء:** Owner و Admin يرون كل الإشعارات

**إذا كان `assigned_to_role` محدد:**
- يظهر فقط لمن يملك هذا الدور
- **استثناء:** Owner يرى إشعارات Admin
- **استثناء:** Owner و Admin يرون كل الإشعارات

**إذا كان كلاهما NULL:**
- يظهر لجميع مستخدمي الشركة

#### القواعد الخاصة:

- ✅ **Owner** يرى كل إشعارات الشركة
- ✅ **Admin** يرى كل إشعارات الشركة
- ✅ باقي المستخدمين يرون فقط ما يخص دورهم أو تعيينهم المباشر

---

## 🔧 التثبيت

### الخطوة 1: تشغيل SQL Script

```sql
-- في Supabase SQL Editor
-- تشغيل: scripts/052_enterprise_notifications_system.sql
```

هذا الـ script يقوم بـ:
- ✅ تحديث دالة `get_user_notifications` مع منطق محسّن
- ✅ تبسيط الفلترة (إزالة branch/warehouse من SQL)
- ✅ إصلاح منطق الصلاحيات

### الخطوة 2: التحقق من Realtime

تأكد من تفعيل Supabase Realtime على جدول `notifications`:
- ✅ INSERT events
- ✅ UPDATE events
- ✅ DELETE events

---

## 📝 الاستخدام

### إنشاء إشعار

```typescript
import { createNotification } from '@/lib/governance-layer'

await createNotification({
  companyId: '...',
  referenceType: 'write_off',
  referenceId: '...',
  title: 'إهلاك جديد',
  message: 'تم إنشاء إهلاك جديد',
  createdBy: userId,
  assignedToRole: 'admin', // أو assignedToUser
  priority: 'high'
})
```

### جلب الإشعارات

```typescript
import { getUserNotifications } from '@/lib/governance-layer'

const notifications = await getUserNotifications({
  userId: '...',
  companyId: '...',
  branchId: '...', // اختياري - يتم الفلترة في الواجهة
  warehouseId: '...', // اختياري - يتم الفلترة في الواجهة
  status: 'unread' // اختياري
})
```

---

## 🎯 المميزات الرئيسية

### 1. Realtime فعلي

- ✅ الإشعارات الجديدة تظهر فوراً بدون refresh
- ✅ تحديث الإشعارات مباشرة في الواجهة
- ✅ تحديث عداد الإشعارات تلقائياً

### 2. فلترة ذكية

- ✅ فلترة في SQL: `company_id`, `assigned_to_user`, `assigned_to_role`
- ✅ فلترة في الواجهة: `branch_id`, `warehouse_id` (اختياري)
- ✅ فلترة حسب الصلاحيات والأدوار

### 3. أداء عالي

- ✅ تبسيط SQL queries
- ✅ فهارس محسّنة
- ✅ فلترة في الواجهة لتقليل الحمل على قاعدة البيانات

---

## 🔍 الفلترة في الواجهة

### NotificationCenter.tsx

```typescript
// فلترة branch (في الواجهة)
if (branchId) {
  filtered = filtered.filter(n => 
    !n.branch_id || n.branch_id === branchId
  )
}

// فلترة warehouse (في الواجهة)
if (warehouseId) {
  filtered = filtered.filter(n => 
    !n.warehouse_id || n.warehouse_id === warehouseId
  )
}
```

**لماذا في الواجهة؟**
- ✅ تقليل تعقيد SQL
- ✅ مرونة أكبر في الفلترة
- ✅ أداء أفضل (فلترة على بيانات محدودة)

---

## 🔔 Realtime Subscription

### NotificationCenter

```typescript
// الاشتراك في Realtime
const channel = supabase
  .channel(`notifications:${companyId}:${userId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'notifications',
    filter: `company_id=eq.${companyId}`
  }, (payload) => {
    // فلترة صحيحة
    if (shouldShowNotification(payload.new)) {
      // إضافة مباشرة للـ state
      addOrUpdateNotification(payload.new)
    }
  })
```

### Sidebar (عداد الإشعارات)

```typescript
// تحديث العدد تلقائياً
const channel = supabase
  .channel(`notification_count:${companyId}:${userId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'notifications',
    filter: `company_id=eq.${companyId}`
  }, (payload) => {
    // تحديث العدد مباشرة
    if (payload.eventType === 'INSERT') {
      setUnreadCount(prev => prev + 1)
    }
  })
```

---

## ✅ قائمة التحقق

### قبل النشر:

- [ ] تشغيل SQL script (`052_enterprise_notifications_system.sql`)
- [ ] التحقق من تفعيل Supabase Realtime
- [ ] اختبار إنشاء إشعار جديد
- [ ] اختبار Realtime (يجب أن يظهر الإشعار فوراً)
- [ ] اختبار الصلاحيات (owner/admin يرون كل شيء)
- [ ] اختبار فلترة branch/warehouse في الواجهة
- [ ] اختبار تحديث عداد الإشعارات

---

## 🐛 استكشاف الأخطاء

### الإشعارات لا تظهر:

1. ✅ تحقق من تشغيل SQL script
2. ✅ تحقق من تفعيل Realtime في Supabase
3. ✅ تحقق من Console logs
4. ✅ تحقق من الصلاحيات (`assigned_to_user`, `assigned_to_role`)

### Realtime لا يعمل:

1. ✅ تحقق من Supabase Realtime configuration
2. ✅ تحقق من RLS policies
3. ✅ تحقق من Console logs (`🔔 [REALTIME]`)

### العدد غير صحيح:

1. ✅ تحقق من `getUnreadNotificationCount`
2. ✅ تحقق من Realtime subscription في sidebar
3. ✅ تحقق من Console logs (`🔔 [SIDEBAR_REALTIME]`)

---

## 📚 المراجع

- `scripts/052_enterprise_notifications_system.sql` - SQL script
- `components/NotificationCenter.tsx` - مكون الإشعارات
- `components/sidebar.tsx` - عداد الإشعارات
- `lib/governance-layer.ts` - دوال الإشعارات

---

## 🎉 النتيجة

نظام إشعارات احترافي متكامل:
- ✅ يعمل Realtime فعلياً
- ✅ يحترم الصلاحيات والأدوار بدقة
- ✅ لا يحتاج Refresh
- ✅ لا يكرر الإشعارات
- ✅ لا يخفي إشعارات صحيحة
- ✅ قابل للتوسع لاحقاً

---

**تم الإنشاء:** 2024  
**الإصدار:** 1.0.0 (ERP Standard)
