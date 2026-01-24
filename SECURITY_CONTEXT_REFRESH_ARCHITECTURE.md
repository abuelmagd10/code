# 🔐 معمارية إعادة تهيئة السياق الأمني عند تغيير الفرع

**التاريخ**: 2026-01-23  
**الحالة**: ✅ **معتمد رسميًا**  
**الإصدار**: 1.0.0

---

## 📋 ملخص القرار المعماري

تم اعتماد نظام شامل لإعادة تهيئة السياق الأمني (Security Context) عند تغيير فرع المستخدم، بدون أي Refresh للصفحة، وبشكل لحظي.

---

## 🎯 المشكلة الأساسية

عند تغيير `branch_id` للمستخدم:

❌ **لا يتم تحديث السياق الحالي تلقائيًا**  
❌ **لا يتم إعادة حساب الصفحات المصرح بها**  
❌ **لا يتم توجيه المستخدم للصفحات الصحيحة**  
❌ **لا يتم تحديث Session / Auth Context**  
❌ **Realtime يعمل بسياق الفرع القديم**

**النتيجة:**
- ❌ بقاء المستخدم على صفحات غير مصرح بها
- ❌ أخطاء صلاحيات
- ❌ كسر منطق العزل بين الفروع
- ❌ مشاكل Realtime
- ❌ أخطاء عند الدخول على Dashboard أو غيرها

---

## ✅ الحل المعماري المعتمد

### المبدأ الأساسي

**عند تغيير فرع المستخدم يجب تنفيذ إعادة تهيئة كاملة للسياق الأمني (Security Context) بدون Refresh صفحة، وبشكل لحظي.**

---

## 🏗️ البنية المعمارية

### 1️⃣ User Security Context الموحد

**الموقع**: `lib/access-context.tsx`

**المصدر الوحيد المعتمد:**
```typescript
AccessProfile {
  user_id
  role
  branch_id
  warehouse_id
  cost_center_id
  allowed_pages[]
  allowed_actions[]
  allowed_branches[]
  allowed_warehouses[]
  allowed_cost_centers[]
}
```

**يستخدم في:**
- ✅ الفلاتر
- ✅ القوائم
- ✅ Realtime
- ✅ التوجيه
- ✅ إظهار الصفحات
- ✅ إظهار القوائم

---

### 2️⃣ دالة إعادة تهيئة السياق الأمني

**الموقع**: `lib/access-context.tsx` → `refreshUserSecurityContext()`

**الخطوات الإلزامية بالترتيب:**

#### 🔹 1. تحديث الفرع في قاعدة البيانات
```typescript
// يتم في app/settings/users/page.tsx
await updateUserBranch(user_id, new_branch_id)
window.dispatchEvent(new Event('user_context_changed'))
```

#### 🔹 2. إعادة تحميل بيانات المستخدم كاملة من السيرفر
```typescript
const freshProfile = await loadAccessProfile()
// ❌ ممنوع الاكتفاء بتغيير branch_id محليًا
// ✅ مطلوب: جلب بيانات كاملة من السيرفر
```

**يجب أن تعود:**
- ✅ `branch_id` الجديد
- ✅ `role`
- ✅ `permissions` حسب الفرع
- ✅ `allowed_pages` حسب الفرع

#### 🔹 3. تحديث Realtime Manager بسياق الفرع الجديد
```typescript
const realtimeManager = getRealtimeManager()
await realtimeManager.updateContext()
```

#### 🔹 4. التحقق من الصفحة الحالية
```typescript
const currentResource = getResourceFromPath(pathname)
const hasAccess = freshProfile.allowed_pages.includes(currentResource)

if (!hasAccess) {
  // توجيه تلقائي لأول صفحة مسموحة
  const firstAllowedPage = getFirstAllowedRoute(freshProfile.allowed_pages)
  router.replace(firstAllowedPage)
}
```

---

### 3️⃣ قاعدة توجيه ذهبية (إلزامية)

**الموقع**: `lib/access-context.tsx` → `redirectToFirstAllowedPage()`

```typescript
function redirectToFirstAllowedPage() {
  const first = getFirstAllowedRoute(profile.allowed_pages)
  
  if (first) {
    router.replace(first)
  } else {
    router.replace('/no-access')
  }
}
```

**❌ ممنوع:**
- ❌ التوجيه التلقائي إلى `/dashboard` دائمًا
- ❌ ترك المستخدم على صفحة غير مصرح بها

**✅ يجب:**
- ✅ استخدام `getFirstAllowedRoute()` دائماً
- ✅ توجيه لأول صفحة مسموحة فعلياً

---

### 4️⃣ منع الدخول على صفحات غير مصرح بها

**الموقع**: `components/app-shell.tsx` + `components/realtime-route-guard.tsx`

**في كل Route Guard:**
```typescript
if (!allowedPages.includes(requestedRoute)) {
  redirectToFirstAllowedPage()
}
```

**❌ ممنوع:**
- ❌ ترك المستخدم على صفحة غير مصرح بها
- ❌ التوجيه التلقائي إلى dashboard دائمًا

---

### 5️⃣ حل مشكلة Dashboard

**المشكلة:**
- النظام دائمًا يوجه إلى `/dashboard` بعد التحديث
- المستخدم في الفرع الجديد قد لا يملك صلاحية dashboard
- يحدث كسر في النظام

**الحل المعماري:**
```typescript
// ❌ خطأ
router.replace('/dashboard')

// ✅ صحيح
const homePage = getFirstAllowedRoute(profile.allowed_pages)
router.replace(homePage)
```

---

### 6️⃣ تحديث Realtime Context بعد تغيير الفرع

**الموقع**: `lib/realtime-provider.tsx` + `lib/realtime-manager.ts`

**بعد تغيير الفرع:**

1. **إلغاء الاشتراكات القديمة**
   ```typescript
   realtimeManager.unsubscribeAll()
   ```

2. **إعادة الاشتراك بسياق الفرع الجديد**
   ```typescript
   await realtimeManager.updateContext()
   // يعيد بناء السياق من getUserAccessInfo()
   // يعيد الاشتراك في جميع الجداول
   ```

3. **الاستماع لـ `user_context_changed` event**
   ```typescript
   window.addEventListener('user_context_changed', async () => {
     await realtimeManager.updateContext()
   })
   ```

---

## 🔄 دورة العمل الكاملة

### عند تغيير الفرع:

```
1. app/settings/users/page.tsx
   └─> updateUserBranch(user_id, new_branch_id)
   └─> window.dispatchEvent('user_context_changed')

2. lib/access-context.tsx
   └─> refreshUserSecurityContext()
       ├─> loadAccessProfile() [جلب بيانات كاملة من السيرفر]
       ├─> realtimeManager.updateContext() [تحديث Realtime]
       ├─> التحقق من الصفحة الحالية
       └─> redirectToFirstAllowedPage() [إذا لزم الأمر]

3. lib/realtime-provider.tsx
   └─> Listens to 'user_context_changed'
       └─> realtimeManager.updateContext()

4. components/realtime-route-guard.tsx
   └─> useGovernanceRealtime({ onBranchOrWarehouseChanged })
       └─> إعادة فحص الصلاحية للصفحة الحالية
       └─> redirectToFirstAllowedPage() [إذا لزم الأمر]
```

---

## ✅ النتيجة المطلوبة (السلوك النهائي)

بعد التنفيذ:

**عند تغيير الفرع للمستخدم:**

✅ **يتم تحديث الفرع فورًا في السياق**  
✅ **يتم إعادة تحميل الصلاحيات**  
✅ **يتم تحديث القوائم والصفحات المصرح بها**  
✅ **يتم إخفاء الصفحات غير المصرح بها مباشرة**  
✅ **يتم توجيه المستخدم تلقائيًا لأول صفحة مسموحة**  
✅ **لا يحدث أي Refresh**  
✅ **لا يحدث أي خطأ Dashboard**  
✅ **Realtime يعمل بسياق الفرع الجديد**  
✅ **أمان كامل**  
✅ **منطق ERP احترافي حقيقي**

---

## 📐 القواعد الإلزامية

### ✅ ما يجب فعله

1. **إعادة تحميل بيانات المستخدم من السيرفر** (لا تحديث محلي)
2. **تحديث Realtime Manager بسياق الفرع الجديد**
3. **التحقق من الصفحة الحالية وإعادة التوجيه إذا لزم الأمر**
4. **استخدام `getFirstAllowedRoute()` دائماً** (لا `/dashboard` افتراضياً)
5. **منع الوصول للصفحات غير المصرح بها**

### ❌ ما يُمنع

1. ❌ **الاكتفاء بتغيير `branch_id` محليًا**
2. ❌ **التوجيه التلقائي إلى `/dashboard` دائمًا**
3. ❌ **ترك المستخدم على صفحة غير مصرح بها**
4. ❌ **عدم تحديث Realtime Context**
5. ❌ **استخدام Refresh للصفحة**

---

## 🔗 التكامل مع Realtime

### Governance Realtime Events

**الموقع**: `hooks/use-governance-realtime.ts`

```typescript
useGovernanceRealtime({
  onBranchOrWarehouseChanged: async () => {
    await refreshUserSecurityContext()
  }
})
```

**يعمل مع:**
- ✅ `RealtimeManager` Governance Channel
- ✅ `company_members` table changes
- ✅ `branches` table changes
- ✅ `warehouses` table changes

---

## 📚 الملفات المتأثرة

| الملف | التغيير |
|------|---------|
| `lib/access-context.tsx` | ✅ إضافة `refreshUserSecurityContext()` |
| `lib/access-context.tsx` | ✅ إضافة `redirectToFirstAllowedPage()` |
| `lib/access-context.tsx` | ✅ Listener لـ `user_context_changed` |
| `lib/realtime-provider.tsx` | ✅ Listener لـ `user_context_changed` |
| `components/app-shell.tsx` | ✅ استخدام `getFirstAllowedPage()` |
| `components/realtime-route-guard.tsx` | ✅ معالجة `onBranchOrWarehouseChanged` |
| `app/settings/users/page.tsx` | ✅ إطلاق `user_context_changed` event |

---

## ✅ قائمة التحقق

### الوظيفية
- [x] تحديث السياق فوراً عند تغيير الفرع
- [x] إعادة تحميل الصلاحيات من السيرفر
- [x] تحديث القوائم والصفحات المصرح بها
- [x] توجيه تلقائي لأول صفحة مسموحة
- [x] لا يحدث أي Refresh

### الأمان
- [x] منع الوصول للصفحات غير المصرح بها
- [x] تحديث Realtime Context بسياق الفرع الجديد
- [x] عزل كامل بين الفروع
- [x] احترام الصلاحيات المرتبطة بالفرع

### التكامل
- [x] يعمل مع Governance Realtime
- [x] يعمل مع Route Guards
- [x] يعمل مع Navigation
- [x] يعمل مع جميع الصفحات

---

## 🎯 الخلاصة

**✅ تم اعتماد هذا القرار المعماري رسميًا**

النظام الآن:
- ✅ يحدث السياق الأمني فوراً عند تغيير الفرع
- ✅ يوجه المستخدم تلقائياً للصفحات المسموحة
- ✅ يمنع الوصول للصفحات غير المصرح بها
- ✅ يعمل بدون أي Refresh
- ✅ متوافق مع معايير ERP الاحترافية

**جاهز للإنتاج** 🚀
