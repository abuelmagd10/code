# 🔍 دليل حل مشاكل الإشعارات

## المشكلة: الإشعارات لم تصل

إذا كانت الإشعارات لا تصل أو لا تظهر، اتبع الخطوات التالية:

---

## ✅ الخطوة 1: تشخيص المشكلة

شغّل script التشخيص في Supabase SQL Editor:

```sql
scripts/diagnose_notifications_issue.sql
```

هذا الـ script سيفحص:
- ✅ وجود جدول `notifications`
- ✅ عدد الإشعارات في قاعدة البيانات
- ✅ حالة دالة `create_notification` (هل محدثة؟)
- ✅ حالة دالة `get_user_notifications` (هل محدثة؟)
- ✅ عينة من الإشعارات الأخيرة
- ✅ الصلاحيات (RLS Policies)
- ✅ وجود أعمدة `event_key`, `severity`, `category`

---

## ✅ الخطوة 2: تحديث دالة create_notification

**المشكلة المحتملة:** دالة `create_notification` في قاعدة البيانات قد لا تدعم المعاملات الجديدة (`p_event_key`, `p_severity`, `p_category`).

**الحل:** شغّل script التحديث:

```sql
scripts/048_fix_create_notification_function.sql
```

هذا الـ script سيقوم بـ:
- ✅ حذف الدالة القديمة
- ✅ إنشاء دالة جديدة تدعم المعاملات الجديدة
- ✅ التحقق من أن التحديث نجح

---

## ✅ الخطوة 3: تحديث دالة get_user_notifications

**المشكلة المحتملة:** دالة `get_user_notifications` قد لا تدعم المؤرشفة أو المعاملات الجديدة.

**الحل:** شغّل script التحديث:

```sql
scripts/fix_archived_notifications.sql
```

هذا الـ script سيقوم بـ:
- ✅ تحديث الدالة لدعم المؤرشفة
- ✅ إصلاح نوع البيانات (`branch_name` من `VARCHAR` إلى `TEXT`)
- ✅ إضافة دعم للمعاملات الجديدة (`p_severity`, `p_category`)

---

## ✅ الخطوة 4: التحقق من الصلاحيات (RLS)

تأكد من أن RLS Policies موجودة وصحيحة:

```sql
-- التحقق من Policies
SELECT * FROM pg_policies WHERE tablename = 'notifications';
```

إذا لم تكن موجودة، شغّل:

```sql
scripts/create_notifications_table.sql
```

---

## ✅ الخطوة 5: التحقق من الأعمدة الجديدة

تأكد من وجود أعمدة `event_key`, `severity`, `category`:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notifications' 
  AND column_name IN ('event_key', 'severity', 'category');
```

إذا لم تكن موجودة، أضفها:

```sql
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS event_key TEXT,
ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info',
ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'system';
```

---

## ✅ الخطوة 6: اختبار إنشاء إشعار

اختبر إنشاء إشعار يدوياً:

```sql
SELECT create_notification(
  'YOUR_COMPANY_ID'::UUID,
  'test_notification'::VARCHAR,
  gen_random_uuid()::UUID,
  'Test Notification'::VARCHAR,
  'This is a test notification'::TEXT,
  'YOUR_USER_ID'::UUID,
  NULL,  -- branch_id
  NULL,  -- cost_center_id
  NULL,  -- warehouse_id
  'admin'::VARCHAR,  -- assigned_to_role
  NULL,  -- assigned_to_user
  'normal'::VARCHAR,  -- priority
  'test-event-key-' || NOW()::TEXT,  -- event_key
  'info'::TEXT,  -- severity
  'system'::TEXT  -- category
);
```

---

## ✅ الخطوة 7: التحقق من Console Logs

افتح Developer Console في المتصفح وابحث عن:

- ✅ `📤 Calling create_notification RPC:` - يعني أن الكود يحاول إنشاء إشعار
- ✅ `✅ create_notification RPC succeeded:` - يعني أن الإشعار تم إنشاؤه بنجاح
- ❌ `❌ Error in create_notification RPC:` - يعني أن هناك خطأ في إنشاء الإشعار

---

## ✅ الخطوة 8: التحقق من الفلترة

تأكد من أن الإشعارات لا يتم استبعادها بسبب:
- ✅ `assigned_to_role` - يجب أن يطابق دور المستخدم
- ✅ `assigned_to_user` - يجب أن يكون `NULL` أو يطابق `user_id`
- ✅ `branch_id` - يجب أن يكون `NULL` أو يطابق فرع المستخدم
- ✅ `warehouse_id` - يجب أن يكون `NULL` أو يطابق مخزن المستخدم
- ✅ `status` - يجب أن يكون `unread` أو `read` (ليس `archived`)

---

## 📋 قائمة التحقق السريعة

- [ ] شغّلت `diagnose_notifications_issue.sql` وفحصت النتائج
- [ ] شغّلت `048_fix_create_notification_function.sql`
- [ ] شغّلت `fix_archived_notifications.sql`
- [ ] تحققت من وجود أعمدة `event_key`, `severity`, `category`
- [ ] تحققت من RLS Policies
- [ ] اختبرت إنشاء إشعار يدوياً
- [ ] فحصت Console Logs للأخطاء
- [ ] تحققت من الفلترة والصلاحيات

---

## 🆘 إذا استمرت المشكلة

1. **افتح Console Logs** وابحث عن أخطاء JavaScript
2. **افتح Network Tab** وابحث عن طلبات `get_user_notifications` و `create_notification`
3. **تحقق من Response** - هل هناك أخطاء من Supabase؟
4. **تحقق من الصلاحيات** - هل المستخدم لديه صلاحيات للوصول إلى الإشعارات؟

---

## 📞 معلومات إضافية

- **ملف التشخيص:** `scripts/diagnose_notifications_issue.sql`
- **ملف إصلاح create_notification:** `scripts/048_fix_create_notification_function.sql`
- **ملف إصلاح get_user_notifications:** `scripts/fix_archived_notifications.sql`
- **ملف التحقق من الأرشيف:** `scripts/verify_archived_notifications_fix.sql`
