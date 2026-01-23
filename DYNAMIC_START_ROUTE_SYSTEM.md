# 🎯 Dynamic Start Route System - نظام اختيار الصفحة الافتتاحية الديناميكي

## 📋 نظرة عامة

نظام مركزي لاختيار أول صفحة مسموحة للمستخدم ديناميكياً، بدلاً من استخدام صفحة ثابتة مثل `/dashboard`. يمنع التوجيه إلى صفحات غير مسموحة ويحل مشكلة Redirect Loops.

## 🎯 المشكلة التي يحلها

### ❌ المشكلة السابقة:
- عند تحديث الصلاحيات، يتم التوجيه دائماً إلى `/dashboard`
- المستخدم قد لا يملك صلاحية الدخول إلى Dashboard
- يؤدي إلى: منع دخول، صفحة خطأ، أو حلقة إعادة توجيه

### ✅ الحل:
- اختيار ديناميكي لأول صفحة مسموحة فعلياً
- منع التوجيه إلى صفحات غير مسموحة
- التعامل مع حالة عدم وجود صفحات مسموحة (`/no-access`)

## 🏗️ البنية

### 1. الدالة المركزية: `getFirstAllowedRoute`

**الموقع**: `lib/access-context.tsx`

**الوظيفة**:
```typescript
export function getFirstAllowedRoute(allowedPages: string[]): string
```

**المنطق**:
1. إذا `allowedPages.length === 0` → إرجاع `/no-access`
2. البحث عن أول صفحة مسموحة حسب الأولوية
3. إذا لم توجد صفحة من الأولويات → إرجاع أول صفحة من `allowedPages`
4. إذا لم توجد أي صفحة → إرجاع `/no-access`

**أولوية الصفحات**:
```typescript
const priorityPages = [
  "dashboard",      // 1. لوحة التحكم
  "approvals",      // 2. الموافقات
  "invoices",       // 3. فواتير المبيعات
  "sales_orders",  // 4. أوامر البيع
  "customers",      // 5. العملاء
  "bills",          // 6. فواتير المشتريات
  "purchase_orders", // 7. أوامر الشراء
  "suppliers",      // 8. الموردين
  "products",       // 9. المنتجات
  "inventory",      // 10. المخزون
  "payments",       // 11. المدفوعات
  "journal_entries", // 12. القيود اليومية
  "reports",        // 13. التقارير
  "settings",       // 14. الإعدادات
]
```

### 2. `getFirstAllowedPage` في AccessContext

**الموقع**: `lib/access-context.tsx`

**الوظيفة**:
```typescript
const getFirstAllowedPage = useCallback((): string => {
  if (!profile) {
    return "/no-access"
  }
  return getFirstAllowedRoute(profile.allowed_pages)
}, [profile])
```

**الميزات**:
- يستخدم `getFirstAllowedRoute` المركزية
- حتى Owner/Admin يمر عبر المنطق الديناميكي
- لا يعتمد على صفحة ثابتة

## 🔄 دورة التحديث

### 1. عند تحديث الصلاحيات Realtime

```
Realtime Event (Governance)
    ↓
useGovernanceRealtime
    ↓
loadAccessProfile()
    ↓
AccessContext Updated
    ↓
التحقق من الصفحة الحالية:
    ├─ إذا الصفحة الحالية ∈ allowed_pages
    │  → ✅ لا Redirect
    └─ إذا الصفحة الحالية ❌ لم تعد مسموحة
       → حساب getFirstAllowedRoute()
       → Redirect فوراً
       → Toast: "تم تحديث صلاحياتك..."
```

### 2. عند تسجيل الدخول

```
Login
    ↓
loadAccessProfile()
    ↓
AccessContext Ready
    ↓
getFirstAllowedRoute(allowed_pages)
    ↓
router.replace(firstAllowedRoute)
```

### 3. عند تغيير الشركة

```
Change Company
    ↓
loadAccessProfile()
    ↓
AccessContext Updated
    ↓
getFirstAllowedRoute(allowed_pages)
    ↓
router.replace(firstAllowedRoute)
```

## 🚫 منع Redirect Loops

### الحماية:

1. **فحص الصفحة الحالية أولاً**:
   ```typescript
   if (canAccessPage(currentResource)) {
     // لا Redirect
     return
   }
   ```

2. **استخدام getFirstAllowedRoute دائماً**:
   ```typescript
   const redirectTo = getFirstAllowedRoute(allowed_pages)
   // لا نستخدم /dashboard مباشرة
   ```

3. **فحص قبل Redirect**:
   ```typescript
   if (redirectTo === pathname) {
     // نفس الصفحة - لا Redirect
     return
   }
   ```

## 📊 حالات خاصة

### الحالة 1: لا توجد صفحات مسموحة

**الشرط**: `allowed_pages.length === 0`

**السلوك**:
- Redirect إلى `/no-access`
- عرض رسالة: "لا تملك أي صلاحيات حالياً"
- زر "إعادة تحميل الصلاحيات"

### الحالة 2: المستخدم على صفحة وتم سحب صلاحيتها

**السلوك**:
- إغلاق الصفحة فوراً
- Redirect إلى `getFirstAllowedRoute()`
- Toast: "تم تحديث صلاحياتك، تم نقلك إلى صفحة مسموحة"
- بدون Refresh
- بدون Logout

### الحالة 3: Owner/Admin

**السلوك**:
- حتى Owner/Admin يمر عبر `getFirstAllowedRoute()`
- لا افتراضات خاصة
- إذا لم يكن `dashboard` في `allowed_pages` → لا يتم التوجيه إليه

## 🎨 صفحة /no-access

**الموقع**: `app/no-access/page.tsx`

**المحتوى**:
- رسالة: "لا تملك أي صلاحيات حالياً"
- زر "إعادة تحميل الصلاحيات"
- زر "الانتقال إلى الملف الشخصي"
- معلومات الحساب (الدور، الفرع، المخزن)

**السلوك**:
- مراقبة `allowed_pages`
- إذا أصبحت هناك صفحات مسموحة → Redirect تلقائي

## 📝 التحديثات في المكونات

### 1. PageGuard

**قبل**:
```typescript
const redirectTo = fallbackPath || "/dashboard"
```

**بعد**:
```typescript
const redirectTo = fallbackPath || (accessReady ? getFirstAllowedPage() : "/no-access")
```

### 2. AppShell

**قبل**:
```typescript
router.replace("/dashboard")
```

**بعد**:
```typescript
const redirectTo = accessReady ? getFirstAllowedPage() : "/no-access"
router.replace(redirectTo)
```

### 3. Sidebar

**قبل**:
```typescript
router.push("/dashboard")
```

**بعد**:
```typescript
const targetPath = getFirstAllowedPage()
router.push(targetPath)
```

### 4. RealtimeRouteGuard

**السلوك**:
- فحص الصفحة الحالية أولاً
- إذا مسموحة → لا Redirect
- إذا غير مسموحة → Redirect إلى `getFirstAllowedPage()`

## 🧪 سيناريوهات الاختبار

### 1. مستخدم بدون صلاحيات

**الخطوات**:
1. تسجيل دخول كمستخدم جديد
2. لا توجد صفحات مسموحة

**النتيجة المتوقعة**:
- ✅ Redirect إلى `/no-access`
- ✅ رسالة واضحة
- ✅ لا Redirect loop

### 2. سحب صلاحية Dashboard

**الخطوات**:
1. تسجيل دخول كمستخدم في `/dashboard`
2. من حساب Admin: سحب صلاحية `dashboard`
3. **النتيجة المتوقعة**:
   - ✅ إغلاق `/dashboard` فوراً
   - ✅ Redirect إلى أول صفحة مسموحة (مثلاً `/invoices`)
   - ✅ Toast: "تم تحديث صلاحياتك..."

### 3. تغيير الدور

**الخطوات**:
1. تسجيل دخول كمستخدم في `/invoices`
2. من حساب Admin: تغيير الدور إلى `viewer` (بدون صلاحية invoices)
3. **النتيجة المتوقعة**:
   - ✅ إغلاق `/invoices` فوراً
   - ✅ Redirect إلى أول صفحة مسموحة
   - ✅ لا Redirect إلى `/dashboard` إذا لم يكن مسموحاً

### 4. Owner بدون Dashboard

**الخطوات**:
1. تسجيل دخول كـ Owner
2. إزالة `dashboard` من `allowed_pages` (حالة نادرة)
3. **النتيجة المتوقعة**:
   - ✅ Redirect إلى أول صفحة مسموحة (مثلاً `/invoices`)
   - ✅ لا افتراض أن Owner يملك Dashboard

## ✅ القواعد الذهبية

1. **❌ ممنوع استخدام صفحة ثابتة**:
   - لا `/dashboard`
   - لا `/home`
   - لا `/`

2. **✅ يجب دائماً استخدام**:
   - `getFirstAllowedRoute(allowed_pages)`
   - `getFirstAllowedPage()` من AccessContext

3. **✅ فحص الصفحة الحالية أولاً**:
   - إذا مسموحة → لا Redirect
   - إذا غير مسموحة → Redirect

4. **✅ التعامل مع حالة no-access**:
   - إذا `allowed_pages.length === 0` → `/no-access`
   - لا محاولة Redirect إلى صفحة غير موجودة

## 📚 المراجع

- `lib/access-context.tsx` - AccessContext و getFirstAllowedRoute
- `components/page-guard.tsx` - PageGuard
- `components/app-shell.tsx` - AppShell
- `components/realtime-route-guard.tsx` - RealtimeRouteGuard
- `components/sidebar.tsx` - Sidebar
- `app/no-access/page.tsx` - صفحة No Access
- `DYNAMIC_PERMISSION_UI_SYSTEM.md` - النظام العام
