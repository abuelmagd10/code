# 🏗️ Access Context Architecture - بنية AccessContext

## 📋 نظرة عامة

AccessContext هو المصدر الوحيد (Single Source of Truth) لجميع معلومات الصلاحيات والوصول في النظام. يتم تحديثه فقط من API رسمي و Realtime Governance Events.

## 🎯 المبادئ الأساسية

### 1. Single Source of Truth

**AccessContext هو المصدر الوحيد**:
- ✅ جميع الصفحات تستخدم `useAccess()`
- ✅ جميع الأزرار تستخدم `canAction()`
- ✅ جميع Route Guards تستخدم `canAccessPage()`

**ممنوع**:
- ❌ استخدام LocalStorage كمرجع أساسي
- ❌ Hardcoded roles في الواجهة
- ❌ مصادر متعددة للصلاحيات

### 2. التحديث فقط من مصادر موثوقة

**المصادر المسموحة**:
1. ✅ `fetchAccessProfile()` - API رسمي
2. ✅ Realtime Governance Events

**ممنوع**:
- ❌ تحديث مباشر من الواجهة
- ❌ تحديث من LocalStorage
- ❌ Hardcoded updates

## 🏗️ البنية

### 1. AccessProfile Interface

```typescript
interface AccessProfile {
  // معلومات المستخدم
  user_id: string
  company_id: string
  role: string
  branch_id?: string | null
  warehouse_id?: string | null
  cost_center_id?: string | null
  
  // الصفحات المسموح بها
  allowed_pages: string[]
  
  // العمليات المسموح بها (resource:action)
  allowed_actions: string[]
  
  // الفروع/المخازن المسموح بها
  allowed_branches: string[]
  allowed_warehouses: string[]
  allowed_cost_centers: string[]
  
  // معلومات إضافية
  is_owner: boolean
  is_admin: boolean
  is_manager: boolean
  is_store_manager: boolean
  is_staff: boolean
}
```

### 2. AccessContext Interface

```typescript
interface AccessContextType {
  // حالة التحميل
  isLoading: boolean
  isReady: boolean
  
  // Access Profile
  profile: AccessProfile | null
  
  // دوال التحقق
  canAccessPage: (resource: string) => boolean
  canAction: (resource: string, action: string) => boolean
  canAccessBranch: (branchId: string) => boolean
  canAccessWarehouse: (warehouseId: string) => boolean
  
  // إعادة تحميل
  refreshAccess: () => Promise<void>
  
  // الحصول على أول صفحة مسموحة
  getFirstAllowedPage: () => string
}
```

## 🔄 دورة الحياة

### 1. التهيئة

```
1. AccessProvider يبدأ
2. loadAccessProfile() يتم استدعاؤه
3. fetchAccessProfile() من API
4. تحديث profile state
5. isReady = true
```

### 2. التحديث من Realtime

```
1. Realtime Event من Governance Channel
2. useGovernanceRealtime يستقبل الحدث
3. onPermissionsChanged() يتم استدعاؤه
4. loadAccessProfile() يتم استدعاؤه
5. fetchAccessProfile() من API
6. تحديث profile state
7. جميع المكونات تتحدث تلقائياً
```

### 3. الاستخدام

```typescript
// في أي مكون
const { canAccessPage, canAction, profile } = useAccess()

// التحقق من الصفحة
if (canAccessPage('invoices')) {
  // عرض الصفحة
}

// التحقق من العملية
if (canAction('invoices', 'delete')) {
  // تفعيل زر الحذف
}
```

## 📊 بناء allowed_pages

### للمستخدمين العاديين

```typescript
// من company_role_permissions
permissions.forEach(perm => {
  if (perm.can_access !== false && 
      (perm.all_access || perm.can_read || perm.can_write || ...)) {
    allowed_pages.push(perm.resource)
  }
})
```

### للمديرين (Owner/Admin)

```typescript
// جميع الصفحات
allowed_pages = [
  "dashboard", "products", "inventory", "customers",
  "suppliers", "sales_orders", "purchase_orders",
  "invoices", "bills", "payments", "journal_entries",
  "banking", "reports", "chart_of_accounts",
  "shareholders", "settings", "users", "taxes",
  "branches", "warehouses", "cost_centers"
]
```

## 📊 بناء allowed_actions

### للمستخدمين العاديين

```typescript
permissions.forEach(perm => {
  if (perm.all_access) {
    allowed_actions.push(`${perm.resource}:*`)
  } else {
    if (perm.can_read) allowed_actions.push(`${perm.resource}:read`)
    if (perm.can_write) allowed_actions.push(`${perm.resource}:write`)
    if (perm.can_update) allowed_actions.push(`${perm.resource}:update`)
    if (perm.can_delete) allowed_actions.push(`${perm.resource}:delete`)
  }
  if (perm.allowed_actions) {
    allowed_actions.push(...perm.allowed_actions)
  }
})
```

### للمديرين (Owner/Admin)

```typescript
// جميع العمليات
allowed_actions = ["*"]
```

## 🔗 التكامل مع Realtime

### useGovernanceRealtime Integration

```typescript
useGovernanceRealtime({
  onPermissionsChanged: loadAccessProfile,
  onRoleChanged: loadAccessProfile,
  onBranchOrWarehouseChanged: loadAccessProfile,
  showNotifications: true,
})
```

### التحديث التلقائي

عند أي Realtime Event من:
- `company_members` → `onRoleChanged`
- `company_role_permissions` → `onPermissionsChanged`
- `branches` / `warehouses` → `onBranchOrWarehouseChanged`

## 🎨 استخدام في الواجهة

### Sidebar

```typescript
const { canAccessPage } = useAccess()

const isItemAllowed = (href: string) => {
  const resource = getResourceFromHref(href)
  return canAccessPage(resource)
}
```

### PageGuard

```typescript
const { canAccessPage, getFirstAllowedPage } = useAccess()

if (!canAccessPage(resource)) {
  router.replace(getFirstAllowedPage())
}
```

### ActionButton

```typescript
const { canAction } = useAccess()

if (!canAction(resource, action)) {
  return null // إخفاء الزر
}
```

## 🔒 الأمان

### التحقق المتعدد

1. **الواجهة**: `canAccessPage()` / `canAction()`
2. **المسارات**: `RealtimeRouteGuard`
3. **API**: Server-side validation
4. **Realtime**: Event filtering

### منع الثغرات

- ✅ لا تحديث مباشر من الواجهة
- ✅ لا استخدام LocalStorage كمرجع
- ✅ التحقق في كل طبقة

## 📚 المراجع

- `lib/access-context.tsx` - AccessContext Implementation
- `hooks/use-governance-realtime.ts` - Governance Realtime Hook
- `GOVERNANCE_REALTIME_SYSTEM.md` - نظام Realtime
- `DYNAMIC_PERMISSION_UI_SYSTEM.md` - النظام العام
