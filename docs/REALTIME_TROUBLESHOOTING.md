# 🔍 دليل استكشاف أخطاء Realtime - Blind Refresh
## Realtime Troubleshooting Guide

---

## 🎯 المشكلة الحالية

عند تغيير الدور أو الفرع من قبل Owner/Admin، لا يتم تحديث المستخدم بدون refresh يدوي.

**السلوك المتوقع**:
- ✅ وصول الحدث Realtime للمستخدم
- ✅ تحديث السياق الأمني فوراً
- ✅ إعادة فحص الصلاحيات
- ✅ إعادة توجيه المستخدم تلقائياً لأول صفحة مسموحة
- ✅ بدون Refresh
- ✅ بدون Logout

**السلوك الحالي**:
- ❌ لا يصل التحديث للمستخدم
- ❌ أو يصل لكن refreshUserSecurityContext لا يُستدعى
- ❌ أو يتم تجاهل التغيير
- ❌ المستخدم يضطر لعمل Refresh يدوي

---

## 🔍 خطوات التشخيص

### 1. التحقق من Realtime Subscription

افتح Console في المتصفح وابحث عن:

```
✅ [RealtimeManager] Successfully subscribed to Governance Channel
```

إذا لم ترى هذه الرسالة:
- ❌ Realtime subscription فشل
- ✅ تحقق من Supabase Dashboard → Database → Replication
- ✅ تأكد من أن `company_members` مفعّل في Realtime

### 2. التحقق من Handler Registration

ابحث عن:

```
🔐 [GovernanceRealtime] Setting up governance realtime hook
✅ [GovernanceRealtime] Governance event handler registered successfully
```

إذا لم ترى هذه الرسالة:
- ❌ `use-governance-realtime` hook غير mounted
- ✅ تحقق من أن `AccessContext` يتم render بشكل صحيح

### 3. التحقق من وصول الأحداث

عند تغيير الدور/الفرع، ابحث عن:

```
🔐 [RealtimeManager] company_members event received from Supabase Realtime
🔐 [RealtimeManager] Governance event received:
🔐 [GovernanceRealtime] Event received from RealtimeManager:
```

إذا لم ترى هذه الرسائل:
- ❌ الأحداث لا تصل من Supabase
- ✅ تحقق من Realtime publication في Supabase
- ✅ تحقق من network connection

### 4. التحقق من affectsCurrentUser

ابحث عن:

```
🔐 [RealtimeManager] company_members event check (BLIND REFRESH):
  affectsCurrentUser: true
```

إذا كان `affectsCurrentUser: false`:
- ❌ الحدث لا يُعتبر أنه يؤثر على المستخدم
- ✅ تحقق من `newRecordUserId` و `oldRecordUserId`
- ✅ تحقق من `currentUserId`

### 5. التحقق من Handler Execution

ابحث عن:

```
🔄 [RealtimeManager] Calling governance handler 1/1...
🔄 [GovernanceRealtime] Calling onPermissionsChanged handler...
🔄 [AccessContext] BLIND REFRESH triggered via Realtime...
```

إذا لم ترى هذه الرسائل:
- ❌ Handler لا يتم استدعاؤه
- ✅ تحقق من أن `handlersRef.current.onPermissionsChanged` معرّف

---

## 🛠️ الإصلاحات المطبقة

### 1. إصلاح affectsCurrentUser Calculation
- ✅ التحقق من `newRecord.user_id` و `oldRecord.user_id` معاً
- ✅ ضمان اكتشاف UPDATE حتى لو كان `user_id` في أحد السجلين فقط

### 2. إضافة Logging شامل
- ✅ Logging في `subscribeToGovernance` لتتبع حالة الاشتراك
- ✅ Logging في `handleGovernanceEvent` لإظهار حساب `affectsCurrentUser`
- ✅ Logging في dispatch الأحداث لإظهار عدد handlers وتنفيذها
- ✅ Logging في `use-governance-realtime` لتتبع تسجيل handlers

### 3. إصلاح recordUserId Extraction
- ✅ استخدام `newRecord.user_id || oldRecord.user_id` للاعتمادية
- ✅ إصلاح `recordCompanyId` extraction بشكل مشابه

### 4. Force Re-subscription
- ✅ إلغاء الاشتراك قبل إعادة الاشتراك لتجنب stale connections

---

## 📋 Checklist للتحقق

- [ ] ✅ Realtime مفعّل على `company_members` في Supabase Dashboard
- [ ] ✅ Channel subscription status = 'SUBSCRIBED'
- [ ] ✅ Handlers مسجلة (handlersCount > 0)
- [ ] ✅ الأحداث تصل من Supabase (event received logs)
- [ ] ✅ `affectsCurrentUser = true` عند تغيير الدور/الفرع
- [ ] ✅ Handler يتم استدعاؤه (handler execution logs)
- [ ] ✅ `refreshUserSecurityContext` يتم استدعاؤه
- [ ] ✅ AccessContext يتم تحديثه (profile updated logs)

---

## 🧪 اختبار يدوي

1. افتح Console في المتصفح
2. سجّل الدخول كمستخدم عادي (ليس owner/admin)
3. افتح صفحة أخرى (مثل `/products`)
4. من حساب Owner/Admin، غيّر دور المستخدم
5. راقب Console للرسائل التالية:

```
🔐 [RealtimeManager] company_members event received from Supabase Realtime
🔐 [RealtimeManager] Governance event received:
  affectsCurrentUser: true
🔄 [RealtimeManager] Calling governance handler 1/1...
🔄 [GovernanceRealtime] Calling onPermissionsChanged handler...
🔄 [AccessContext] BLIND REFRESH triggered via Realtime...
✅ [AccessContext] BLIND REFRESH completed successfully
```

إذا لم ترى هذه الرسائل بالترتيب، المشكلة في الخطوة المفقودة.

---

## 🔧 حلول محتملة

### إذا كان Channel subscription فشل:
1. تحقق من Supabase Dashboard → Database → Replication
2. فعّل Realtime على `company_members` table
3. تحقق من network connection

### إذا كان Handlers غير مسجلة:
1. تحقق من أن `AccessContext` يتم render
2. تحقق من أن `use-governance-realtime` يتم استدعاؤه
3. تحقق من dependency array في `use-governance-realtime`

### إذا كان الأحداث لا تصل:
1. تحقق من Realtime publication في Supabase
2. تحقق من filter في subscription (company_id, user_id)
3. تحقق من network connection

### إذا كان affectsCurrentUser = false:
1. تحقق من `newRecord.user_id` و `oldRecord.user_id`
2. تحقق من `currentUserId`
3. تحقق من أن UPDATE يتم على السجل الصحيح

---

**آخر تحديث**: 2026-01-23
