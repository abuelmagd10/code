# 🔔 Notification Status Flow - نظام حالات الإشعارات

## 📋 نظرة عامة

هذا المستند يوضح نظام حالات الإشعارات الكامل، انتقالات الحالات، الصلاحيات، وأمثلة API.

---

## 1️⃣ الحالات الرسمية (Official Statuses)

النظام يدعم **4 حالات فقط**:

| الحالة | الوصف | متى تُستخدم |
|--------|-------|-------------|
| `unread` | غير مقروء | الحالة الافتراضية عند إنشاء إشعار جديد |
| `read` | مقروء | عندما يفتح المستخدم الإشعار |
| `actioned` | تم التنفيذ | عندما يتم تنفيذ الإجراء المطلوب (مثل الموافقة) |
| `archived` | مؤرشف | عندما يتم أرشفة الإشعار (لا يُحذف) |

⚠️ **ممنوع استخدام أي قيم أخرى**

---

## 2️⃣ انتقالات الحالات (Status Transitions)

### مخطط الانتقالات:

```
unread → read → actioned → archived
  ↓         ↓        ↓
archived  archived archived
```

### القواعد:

1. **unread → read**: تلقائي عند فتح الإشعار أو يدويًا
2. **read → actioned**: يدويًا عند تنفيذ الإجراء
3. **read → archived**: يدويًا عند الأرشفة
4. **actioned → archived**: يدويًا عند الأرشفة
5. **unread → archived**: مباشرة (نادر)

### ⚠️ قيود:

- لا يمكن العودة من `archived` إلى أي حالة أخرى
- لا يمكن العودة من `actioned` إلى `read` أو `unread`

---

## 3️⃣ من يملك حق التغيير (Permissions)

### ✅ Owner و Admin:
- يمكنهم تغيير حالة **أي إشعار** في الشركة
- لا توجد قيود

### ✅ باقي الأدوار (Manager, Accountant, etc.):
- يمكنهم تغيير حالة الإشعارات:
  - المخصصة لهم مباشرة (`assigned_to_user = user_id`)
  - العامة (`assigned_to_user IS NULL`)
  - المخصصة لدورهم (`assigned_to_role = user_role`)
- **لا يمكنهم** تغيير حالة إشعارات مخصصة لمستخدم آخر

### 🔐 التحقق من الصلاحيات:

يتم التحقق في دالة `update_notification_status`:

```sql
-- Owner و Admin: يمكنهم تغيير أي إشعار
IF v_user_role IN ('owner', 'admin') THEN
  v_has_permission := TRUE;
-- باقي الأدوار: فقط الإشعارات المخصصة لهم أو العامة
ELSIF (
  v_notification.assigned_to_user = p_user_id
  OR v_notification.assigned_to_user IS NULL
  OR (
    v_notification.assigned_to_role = v_user_role
    OR v_notification.assigned_to_role IS NULL
  )
) THEN
  v_has_permission := TRUE;
END IF;
```

---

## 4️⃣ أمثلة API

### 4.1 تحديث حالة إشعار (TypeScript)

```typescript
import { updateNotificationStatus } from '@/lib/governance-layer'

// ✅ تحديد كتم التنفيذ
const result = await updateNotificationStatus(
  notificationId,
  'actioned',
  userId
)

if (result.success) {
  console.log('✅ Status updated:', result.new_status)
} else {
  console.error('❌ Error:', result.error)
}
```

### 4.2 تحديث حالة إشعار (SQL RPC)

```sql
SELECT update_notification_status(
  'notification-id-here'::UUID,
  'actioned'::VARCHAR,
  'user-id-here'::UUID
);
```

### 4.3 النتيجة المتوقعة:

```json
{
  "success": true,
  "notification_id": "uuid-here",
  "old_status": "read",
  "new_status": "actioned",
  "updated_at": "2026-01-23T10:30:00Z"
}
```

أو في حالة الخطأ:

```json
{
  "success": false,
  "error": "Permission denied. You can only update notifications assigned to you or general notifications."
}
```

---

## 5️⃣ سيناريوهات التدقيق (Audit Scenarios)

### 5.1 Audit Log Entry

كل تغيير حالة يُسجل في `audit_logs`:

```sql
INSERT INTO audit_logs (
  company_id,
  user_id,
  action,
  entity_type,
  entity_id,
  details
)
VALUES (
  company_id,
  user_id,
  'notification_status_changed',
  'notification',
  notification_id,
  jsonb_build_object(
    'old_status', 'read',
    'new_status', 'actioned',
    'notification_title', 'طلب اعتماد إهلاك جديد'
  )
);
```

### 5.2 أمثلة على Audit Logs:

**مثال 1: تغيير من read إلى actioned**
```json
{
  "action": "notification_status_changed",
  "entity_type": "notification",
  "entity_id": "abc-123",
  "details": {
    "old_status": "read",
    "new_status": "actioned",
    "notification_title": "طلب اعتماد إهلاك جديد"
  }
}
```

**مثال 2: أرشفة إشعار**
```json
{
  "action": "notification_status_changed",
  "entity_type": "notification",
  "entity_id": "def-456",
  "details": {
    "old_status": "read",
    "new_status": "archived",
    "notification_title": "إشعار مالي"
  }
}
```

---

## 6️⃣ الفلترة في الواجهة الأمامية

### 6.1 فلتر الحالة:

| الفلتر | القيمة المرسلة | النتيجة |
|--------|----------------|---------|
| "الكل" | `null` | يعرض `unread`, `read`, `actioned` (يستبعد `archived`) |
| "غير مقروء" | `"unread"` | يعرض `unread` فقط |
| "مقروء" | `"read"` | يعرض `read` فقط |
| "تم التنفيذ" | `"actioned"` | يعرض `actioned` فقط |
| "مؤرشف" | `"archived"` | يعرض `archived` فقط |

### 6.2 منطق الفلترة في `get_user_notifications`:

```sql
AND (
  CASE 
    WHEN p_status IS NULL THEN n.status != 'archived'  -- الكل → نستبعد المؤرشفة
    WHEN p_status = 'archived' THEN n.status = 'archived'  -- طلب المؤرشفة → نعرض المؤرشفة فقط
    WHEN p_status = 'actioned' THEN n.status = 'actioned'  -- طلب تم التنفيذ → نعرض actioned فقط
    ELSE n.status = p_status  -- حالة محددة → نعرض حسب الحالة المطلوبة
  END
)
```

---

## 7️⃣ Realtime Integration

### 7.1 كيف يعمل:

1. عند تغيير الحالة عبر `update_notification_status`:
   - يتم تحديث `notifications` table
   - Supabase Realtime يبث `UPDATE` event

2. `useRealtimeTable` يلتقط الحدث:
   ```typescript
   useRealtimeTable<Notification>({
     table: 'notifications',
     onUpdate: (newNotification) => {
       if (shouldShowNotification(newNotification)) {
         addOrUpdateNotification(newNotification)
       }
     }
   })
   ```

3. `addOrUpdateNotification` يتحقق من الفلتر:
   - إذا كان `archived` والفلتر ليس `archived` → يُزال من القائمة
   - إذا كان `actioned` والفلتر ليس `actioned` → يُزال من القائمة
   - وإلا → يُضاف/يُحدث في القائمة

### 7.2 مثال:

**السيناريو:**
- المستخدم في تبويب "غير مقروء"
- يضغط "أرشفة" على إشعار
- النتيجة: يختفي فورًا من القائمة (لأن الفلتر = `unread`)

**السيناريو 2:**
- المستخدم في تبويب "مؤرشف"
- يضغط "أرشفة" على إشعار
- النتيجة: يظهر فورًا في القائمة (لأن الفلتر = `archived`)

---

## 8️⃣ حالات الاختبار (Test Scenarios)

### Test 1: تغيير من unread إلى actioned

**الخطوات:**
1. افتح Notification Center
2. اختر فلتر "غير مقروء"
3. اضغط "تم التنفيذ" على إشعار

**النتيجة المتوقعة:**
- ✅ يختفي من قائمة "غير مقروء"
- ✅ يظهر في قائمة "تم التنفيذ"
- ✅ يتم تحديث الحالة في DB
- ✅ يتم تسجيل Audit Log

### Test 2: أرشفة إشعار

**الخطوات:**
1. افتح Notification Center
2. اختر فلتر "غير مقروء" أو "مقروء"
3. اضغط "أرشف" على إشعار

**النتيجة المتوقعة:**
- ✅ يختفي فورًا من القائمة الحالية
- ✅ يظهر في قائمة "مؤرشف" عند اختيار الفلتر
- ✅ يتم تحديث الحالة في DB
- ✅ يتم تسجيل Audit Log

### Test 3: عرض المؤرشفة

**الخطوات:**
1. افتح Notification Center
2. اختر فلتر "مؤرشف"
3. اضغط على إشعار مؤرشف

**النتيجة المتوقعة:**
- ✅ يظهر الإشعار بشكل صحيح
- ✅ يمكن فتح المرجع (Deep Linking)
- ✅ لا يمكن تغيير الحالة (لأن archived نهائي)

### Test 4: Realtime Update

**الخطوات:**
1. افتح نفس الحساب في **تبويبين** (Tab 1, Tab 2)
2. في Tab 1: أرشف إشعار
3. راقب Tab 2

**النتيجة المتوقعة:**
- ✅ يختفي فورًا من Tab 2 (إذا كان الفلتر لا يسمح بـ archived)
- ✅ يظهر فورًا في Tab 2 (إذا كان الفلتر = archived)
- ✅ لا حاجة لـ Refresh

---

## 9️⃣ الأخطاء الشائعة وحلولها

### ❌ المشكلة 1: الإشعار لا يختفي بعد الأرشفة

**السبب:** الفلتر في `addOrUpdateNotification` لا يتعامل مع `archived` بشكل صحيح

**الحل:** تأكد من أن الكود يحتوي على:
```typescript
if (notification.status === 'archived' && filterStatus !== 'archived' && filterStatus !== 'all') {
  setNotifications(prev => prev.filter(n => n.id !== notification.id))
  return
}
```

### ❌ المشكلة 2: لا يمكن رؤية المؤرشفة

**السبب:** `get_user_notifications` يحتوي على `AND n.status != 'archived'` دائماً

**الحل:** تأكد من أن الكود يحتوي على:
```sql
AND (
  CASE 
    WHEN p_status = 'archived' THEN n.status = 'archived'
    WHEN p_status IS NULL THEN n.status != 'archived'
    ELSE n.status = p_status
  END
)
```

### ❌ المشكلة 3: Permission Denied

**السبب:** المستخدم يحاول تغيير حالة إشعار لا يخصه

**الحل:** تأكد من أن `update_notification_status` يتحقق من الصلاحيات بشكل صحيح

---

## 🔟 الخلاصة

✅ **الحالات الرسمية:** `unread`, `read`, `actioned`, `archived`

✅ **الدالة الموحدة:** `update_notification_status(notification_id, new_status, user_id)`

✅ **الصلاحيات:** Owner/Admin: أي إشعار | باقي الأدوار: فقط المخصصة لهم

✅ **Audit Logging:** كل تغيير يُسجل تلقائيًا

✅ **Realtime:** تحديث فوري بدون Refresh

✅ **الفلترة:** تعمل بشكل صحيح مع جميع الحالات

---

**آخر تحديث:** 2026-01-23
