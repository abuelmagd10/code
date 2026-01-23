# 🔒 قواعد الأمان لنظام Realtime للحوكمة

## 📋 نظرة عامة

هذا المستند يوضح قواعد الأمان الإلزامية لنظام Realtime للحوكمة. يجب اتباع هذه القواعد بدقة لضمان عدم وجود ثغرات أمنية.

## 🛡️ طبقات الأمان

### 1. طبقة قاعدة البيانات (Database Layer)

#### الفلترة الإلزامية

جميع الاشتراكات في جداول الحوكمة يجب أن تستخدم فلتر `company_id`:

```typescript
filter: `company_id=eq.${companyId}`
```

**السبب**: منع استقبال أحداث من شركات أخرى.

#### RLS Policies

يجب أن تكون RLS Policies مفعلة على جميع جداول الحوكمة:

- `company_members`
- `branches`
- `warehouses`
- `company_role_permissions`
- `permissions`

**التحقق**:
```sql
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('company_members', 'branches', 'warehouses', 'company_role_permissions', 'permissions');
```

### 2. طبقة التطبيق (Application Layer)

#### التحقق من company_id

```typescript
if (record.company_id !== companyId) {
  console.warn('🚫 Event rejected: different company')
  return false
}
```

**إلزامي**: أي حدث بدون `company_id` أو بـ `company_id` مختلف يتم رفضه فوراً.

#### التحقق من user_id

```typescript
if (table === 'company_members') {
  affectsCurrentUser = record.user_id === userId
}
```

**إلزامي**: فقط الأحداث التي تخص المستخدم الحالي يتم معالجتها.

#### التحقق من الصلاحيات

```typescript
const canSeeEvent = role === 'owner' || role === 'admin' || affectsCurrentUser

if (!canSeeEvent) {
  return // تجاهل الحدث
}
```

**القواعد**:
- **Owner/Admin**: يروا جميع الأحداث في الشركة
- **المستخدمون الآخرون**: فقط الأحداث التي تخصهم

### 3. طبقة الواجهة (UI Layer)

#### إغلاق الصفحات غير المصرح بها

عند تغيير الصلاحيات:

```typescript
// في useGovernanceRealtime
if (affectsCurrentUser) {
  // إعادة تحميل الصلاحيات
  await refreshPermissions()
  
  // التحقق من الصفحة الحالية
  const currentResource = getResourceFromPath(window.location.pathname)
  if (!canAccessPage(currentResource)) {
    // إغلاق/إعادة توجيه الصفحة
    router.push('/dashboard')
  }
}
```

#### تعطيل الأزرار

```typescript
const canDelete = canAction('invoices', 'delete')

<Button 
  disabled={!canDelete}
  onClick={handleDelete}
>
  حذف
</Button>
```

## 🚫 منع الثغرات

### 1. منع استقبال أحداث غير مصرح بها

```typescript
// ❌ خطأ: عدم التحقق من company_id
if (record.user_id === userId) {
  // معالجة الحدث
}

// ✅ صحيح: التحقق من company_id أولاً
if (record.company_id !== companyId) {
  return false
}
if (record.user_id === userId) {
  // معالجة الحدث
}
```

### 2. منع معالجة الأحداث المكررة

```typescript
const eventKey = `governance:${table}:${payload.eventType}:${record.id}:${Date.now()}`
const lastProcessed = this.processedEvents.get(eventKey)

if (lastProcessed && (now - lastProcessed) < this.EVENT_DEDUP_WINDOW) {
  return // تجاهل الحدث المكرر
}
```

### 3. منع الوصول للبيانات بعد سحب الصلاحية

```typescript
// عند تغيير الصلاحيات
if (affectsCurrentUser) {
  // إلغاء جميع الاشتراكات
  await unsubscribeAll()
  
  // إعادة بناء السياق
  await updateContext()
  
  // إعادة الاشتراك بفلاتر جديدة
  await subscribeToAllTables()
}
```

## 🔐 قواعد خاصة بكل جدول

### company_members

**الفلترة**:
- `company_id=eq.${companyId}` (إلزامي)
- التحقق من `user_id` في التطبيق

**المعالجة**:
- إذا `user_id === userId`: إعادة بناء السياق والاشتراكات
- إذا `role === 'owner' || role === 'admin'`: تحديث قوائم المستخدمين

### branches

**الفلترة**:
- `company_id=eq.${companyId}` (إلزامي)

**المعالجة**:
- إذا `record.id === context.branchId`: إعادة بناء السياق

### warehouses

**الفلترة**:
- `company_id=eq.${companyId}` (إلزامي)

**المعالجة**:
- إذا `record.id === context.warehouseId`: إعادة بناء السياق

### company_role_permissions

**الفلترة**:
- `company_id=eq.${companyId}` (إلزامي)

**المعالجة**:
- إذا `record.role === context.role`: إعادة تحميل الصلاحيات

### permissions

**الفلترة**:
- لا يوجد فلتر (صلاحيات عامة)

**المعالجة**:
- إعادة تحميل الصلاحيات لجميع المستخدمين

## ✅ قائمة التحقق الأمنية

- [ ] جميع الاشتراكات تستخدم فلتر `company_id`
- [ ] RLS Policies مفعلة على جميع الجداول
- [ ] التحقق من `company_id` في كل حدث
- [ ] التحقق من `user_id` للأحداث التي تخص المستخدم
- [ ] منع معالجة الأحداث المكررة
- [ ] إعادة بناء الاشتراكات عند تغيير الصلاحيات
- [ ] إغلاق الصفحات غير المصرح بها
- [ ] تعطيل الأزرار عند سحب الصلاحية
- [ ] لا يوجد تسريب للبيانات بين الشركات
- [ ] لا يوجد وصول للبيانات بعد سحب الصلاحية

## 🧪 اختبار الأمان

### اختبار 1: منع استقبال أحداث من شركة أخرى

```typescript
// محاولة إرسال حدث من شركة أخرى
const event = {
  company_id: 'other-company-id',
  user_id: currentUserId,
  // ...
}

// يجب رفض الحدث
expect(shouldProcessEvent(event)).toBe(false)
```

### اختبار 2: منع الوصول بعد سحب الصلاحية

```typescript
// 1. تسجيل دخول كمستخدم عادي
// 2. فتح صفحة /invoices
// 3. تغيير الدور إلى viewer (من حساب آخر)
// 4. يجب إغلاق صفحة /invoices تلقائياً
```

### اختبار 3: منع معالجة الأحداث المكررة

```typescript
// إرسال نفس الحدث مرتين خلال 5 ثواني
// يجب معالجة الحدث مرة واحدة فقط
```

## 📚 المراجع

- `lib/realtime-manager.ts` - Realtime Manager
- `hooks/use-governance-realtime.ts` - Governance Hook
- `GOVERNANCE_REALTIME_SYSTEM.md` - النظام العام
- `GOVERNANCE_REALTIME_VERIFICATION.md` - دليل التحقق
