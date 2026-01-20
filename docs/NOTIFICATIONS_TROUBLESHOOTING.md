# 🔧 دليل حل مشاكل الإشعارات

## ❌ المشكلة: الإشعارات لا تعمل

### 🔍 خطوات التشخيص

#### 1️⃣ **التحقق من وجود جدول notifications**

افتح Supabase SQL Editor وشغّل:
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'notifications'
);
```

**إذا كانت النتيجة `false`:**
- جدول notifications غير موجود
- **الحل:** شغّل `scripts/create_notifications_table.sql` في Supabase SQL Editor

#### 2️⃣ **التحقق من وجود دالة create_notification**

```sql
SELECT EXISTS (
  SELECT 1 FROM pg_proc 
  WHERE proname = 'create_notification'
);
```

**إذا كانت النتيجة `false`:**
- دالة create_notification غير موجودة
- **الحل:** شغّل `scripts/create_notifications_table.sql` أو `scripts/upgrade_notifications_enterprise.sql`

#### 3️⃣ **التحقق من الأعمدة الجديدة**

```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'notifications' 
AND column_name IN ('event_key', 'severity', 'category');
```

**إذا كانت النتيجة أقل من 3 أعمدة:**
- الأعمدة الجديدة غير موجودة
- **الحل:** شغّل `scripts/upgrade_notifications_enterprise.sql`

#### 4️⃣ **التحقق من Console في المتصفح**

افتح Developer Tools (F12) وانتقل إلى Console. ابحث عن:
- `Error sending notification:`
- `Error creating notification:`

**إذا وجدت أخطاء:**
- انسخ رسالة الخطأ
- راجع القسم "الأخطاء الشائعة" أدناه

---

## 🛠️ الحل السريع

### **الطريقة 1: استخدام Script الفحص والإصلاح (مُوصى بها)**

1. افتح Supabase SQL Editor
2. انسخ محتوى `scripts/check_and_fix_notifications.sql`
3. الصقه في SQL Editor
4. اضغط Run

هذا الـ script سيفحص ويصلح كل شيء تلقائياً.

### **الطريقة 2: التثبيت الكامل من الصفر**

1. شغّل `scripts/create_notifications_table.sql`
2. شغّل `scripts/upgrade_notifications_enterprise.sql`

---

## 🐛 الأخطاء الشائعة

### **خطأ 1: function create_notification does not exist**

**السبب:** دالة `create_notification` غير موجودة أو غير محدثة

**الحل:**
```sql
-- شغّل هذا في Supabase SQL Editor
\i scripts/upgrade_notifications_enterprise.sql
```

### **خطأ 2: column "event_key" does not exist**

**السبب:** الأعمدة الجديدة غير موجودة

**الحل:**
```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key TEXT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info' 
  CHECK (severity IN ('info', 'warning', 'error', 'critical'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system' 
  CHECK (category IN ('finance', 'inventory', 'sales', 'approvals', 'system'));
```

### **خطأ 3: permission denied for table notifications**

**السبب:** RLS Policies غير موجودة أو غير صحيحة

**الحل:**
```sql
-- التحقق من RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'notifications';

-- إذا كانت rowsecurity = false، فعّل RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
```

### **خطأ 4: notifications are created but not visible**

**السبب:** مشكلة في دالة `get_user_notifications` أو في الفلترة

**الحل:**
1. تحقق من أن المستخدم لديه دور صحيح في `company_members`
2. تحقق من أن `assigned_to_role` أو `assigned_to_user` صحيحة
3. تحقق من أن `branch_id` صحيح (إذا كان الإشعار مربوط بفرع)

---

## ✅ اختبار سريع

بعد إصلاح المشكلة، اختبر النظام:

```sql
-- 1. إنشاء إشعار تجريبي
SELECT create_notification(
  p_company_id := (SELECT id FROM companies LIMIT 1),
  p_reference_type := 'test',
  p_reference_id := gen_random_uuid(),
  p_title := 'Test Notification',
  p_message := 'This is a test',
  p_created_by := (SELECT id FROM auth.users LIMIT 1),
  p_event_key := 'test:notification:1',
  p_severity := 'info',
  p_category := 'system'
);

-- 2. التحقق من وجود الإشعار
SELECT * FROM notifications 
WHERE event_key = 'test:notification:1';

-- 3. حذف الإشعار التجريبي
DELETE FROM notifications WHERE event_key = 'test:notification:1';
```

---

## 📞 إذا استمرت المشكلة

1. **تحقق من Console في المتصفح** - ابحث عن أخطاء JavaScript
2. **تحقق من Supabase Logs** - اذهب إلى Supabase Dashboard > Logs
3. **تحقق من Network Tab** - ابحث عن طلبات فاشلة إلى Supabase
4. **انسخ رسالة الخطأ الكاملة** وأرسلها للمطور

---

## 📝 قائمة التحقق

- [ ] جدول `notifications` موجود
- [ ] دالة `create_notification` موجودة ومحدثة
- [ ] الأعمدة `event_key`, `severity`, `category` موجودة
- [ ] RLS Policies مفعلة
- [ ] لا توجد أخطاء في Console
- [ ] المستخدم لديه دور صحيح في `company_members`
- [ ] `assigned_to_role` أو `assigned_to_user` صحيحة
