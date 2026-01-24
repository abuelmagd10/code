# 🔍 تشخيص مشكلة انقطاع Realtime عند تغيير الدور

## 📋 المشكلة

بعد تعديل منطق اختيار الدور، انقطع مسار التحديث اللحظي ولم تعد جلسة المستخدم تستقبل التغييرات.

## ✅ التحقق من المسار الحالي

### 1️⃣ مسار تحديث الدور

**الملف:** `app/api/member-role/route.ts`

```typescript
// ✅ يتم تحديث company_members بشكل صحيح
const { error: updateError } = await admin
  .from("company_members")
  .update({ role })
  .eq("company_id", companyId)
  .eq("user_id", userId)
```

**النتيجة:** ✅ التحديث يحدث في `company_members` (الجدول الصحيح)

### 2️⃣ Trigger في قاعدة البيانات

**الملف:** `scripts/108_user_security_events_system.sql`

```sql
CREATE TRIGGER trigger_company_members_role_changed
  AFTER UPDATE ON company_members
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION trigger_user_security_event_role_changed();
```

**النتيجة:** ✅ Trigger موجود ويجب أن يعمل عند تحديث `role` في `company_members`

### 3️⃣ Realtime Subscription

**الملف:** `lib/realtime-manager.ts`

```typescript
// ✅ الاشتراك في company_members
channel
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'company_members',
      filter: companyMembersFilter, // فلترة حسب company_id و user_id
    },
    (payload) => this.handleGovernanceEvent('company_members', payload)
  )
```

**النتيجة:** ✅ Realtime مشترك في `company_members` بشكل صحيح

## 🔍 التشخيص

### الخطوات للتحقق من المشكلة:

1. **التحقق من Trigger:**
   ```sql
   -- التحقق من وجود Trigger
   SELECT trigger_name, event_object_table, action_statement
   FROM information_schema.triggers
   WHERE trigger_name = 'trigger_company_members_role_changed';
   
   -- اختبار Trigger يدوياً
   UPDATE company_members
   SET role = 'test_role'
   WHERE user_id = 'USER_ID' AND company_id = 'COMPANY_ID';
   
   -- التحقق من وجود user_security_event
   SELECT * FROM user_security_events
   WHERE user_id = 'USER_ID'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

2. **التحقق من Realtime Replication:**
   ```sql
   -- التحقق من أن company_members في الـ publication
   SELECT * FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
   AND tablename = 'company_members';
   ```

3. **مراقبة Logs:**
   - في Console المتصفح (F12): البحث عن:
     - `🔔 [RealtimeManager] handleGovernanceEvent CALLED`
     - `🔄 [RealtimeManager] Governance event affects current user`
     - `🔄 [AccessContext] Refreshing user security context`

4. **التحقق من الفلترة:**
   - إذا كان المستخدم المتأثر ليس Owner/Admin:
     - الفلترة: `company_id=eq.${companyId}.and.user_id=eq.${userId}`
     - هذا صحيح - يجب أن يستقبل الأحداث الخاصة به فقط

## 🛠️ الحلول المطبقة

### 1️⃣ إضافة Logging شامل

**في `app/api/member-role/route.ts`:**
- ✅ Logging قبل وبعد التحديث
- ✅ التحقق من إنشاء `user_security_event` بعد التحديث
- ✅ Logging للأخطاء

**في `lib/realtime-manager.ts`:**
- ✅ Logging مفصل عند استقبال الأحداث
- ✅ Logging عند إعادة بناء السياق
- ✅ Logging عند إرسال الأحداث للـ handlers

### 2️⃣ التحقق من Trigger

إذا كان Trigger لا يعمل:
- التحقق من أن Trigger موجود ومفعل
- التحقق من أن Function `trigger_user_security_event_role_changed` موجودة
- التحقق من أن Function `insert_user_security_event` موجودة

### 3️⃣ التحقق من Realtime Subscription

إذا كانت الأحداث لا تصل:
- التحقق من أن RealtimeManager مشترك في `company_members`
- التحقق من أن الفلترة صحيحة
- التحقق من أن Channel status = 'SUBSCRIBED'

## 🎯 الخطوات التالية

1. **اختبار التحديث:**
   - تغيير دور مستخدم من Owner/Admin
   - مراقبة Console للـ logs
   - التحقق من وجود `user_security_event` في قاعدة البيانات

2. **إذا لم تصل الأحداث:**
   - التحقق من Realtime Replication في Supabase Dashboard
   - التحقق من أن الجدول `company_members` في الـ publication
   - التحقق من RLS Policies - قد تمنع Realtime من رؤية التغييرات

3. **إذا وصلت الأحداث لكن لم يتم التحديث:**
   - التحقق من `handleGovernanceEvent` - هل يستدعي `rebuildContextAndSubscriptions`؟
   - التحقق من `useGovernanceRealtime` - هل يستدعي `onRoleChanged`؟
   - التحقق من `AccessContext` - هل يستدعي `refreshUserSecurityContext`؟

## 📝 ملاحظات مهمة

1. **Service Role Updates:**
   - التحديث يتم من service role (`admin` client)
   - Trigger يستخدم `SECURITY DEFINER` - يجب أن يعمل حتى مع service role
   - لكن `auth.uid()` في Trigger قد يكون NULL عند التحديث من service role

2. **RLS Policies:**
   - Realtime يحتاج إلى رؤية التغييرات
   - إذا كانت RLS Policies تمنع Realtime من رؤية التغييرات، لن تصل الأحداث
   - التحقق من Policies على `company_members`

3. **Event Deduplication:**
   - RealtimeManager يستخدم deduplication للأحداث
   - إذا كان نفس الحدث يصل مرتين بسرعة، قد يتم تجاهل الثاني
   - التحقق من `EVENT_DEDUP_WINDOW`

## 🔧 الحل النهائي المطلوب

إذا كانت المشكلة مستمرة بعد إضافة Logging:

1. **التحقق من Trigger يدوياً:**
   ```sql
   -- تحديث يدوي ومراقبة
   UPDATE company_members
   SET role = 'new_role'
   WHERE user_id = 'USER_ID';
   
   -- التحقق من user_security_events
   SELECT * FROM user_security_events
   WHERE user_id = 'USER_ID'
   ORDER BY created_at DESC;
   ```

2. **التحقق من Realtime يدوياً:**
   - فتح Supabase Dashboard → Realtime
   - مراقبة الأحداث الواردة
   - التحقق من أن الأحداث تصل فعلاً

3. **إصلاح RLS إذا لزم الأمر:**
   - إضافة Policy للسماح لـ Realtime برؤية التغييرات
   - أو استخدام Service Role في Realtime subscription
