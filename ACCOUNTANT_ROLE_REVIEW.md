# 📊 تقرير مراجعة دور المحاسب (Accountant Role Review)

## 📋 ملخص تنفيذي

هذا التقرير يقدم مراجعة شاملة لدور **المحاسب (Accountant)** في النظام من حيث:
- الصلاحيات الافتراضية
- القيود على مستوى الفروع (Branches)
- القيود على مستوى المخازن (Warehouses)
- القيود على مستوى مراكز التكلفة (Cost Centers)
- كيفية تطبيق هذه القيود في الكود

---

## 1️⃣ الصلاحيات الافتراضية للمحاسب

### 1.1 الصلاحيات الممنوحة (من `scripts/040_enhanced_rbac_system.sql`)

```sql
-- === Accountant - محاسب (صلاحيات مالية ومحاسبية) ===
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'accountant', action FROM permissions
WHERE (
  category IN ('accounting', 'sales', 'purchases')
  OR action LIKE 'dashboard:%'
  OR action LIKE 'products:read'
  OR action LIKE 'products:access'
  OR action LIKE 'inventory:read'
  OR action LIKE 'inventory:access'
  OR action LIKE 'customers:read'
  OR action LIKE 'customers:access'
  OR action LIKE 'suppliers:read'
  OR action LIKE 'suppliers:access'
  OR action LIKE 'fixed_assets:%'
  OR action LIKE 'asset_categories:%'
)
AND action NOT LIKE '%:delete'
AND action NOT LIKE 'users:%'
AND action NOT LIKE 'company_settings:%'
```

### 1.2 الصلاحيات المسموحة:

✅ **المالية والمحاسبة:**
- جميع عمليات المحاسبة (journal entries, chart of accounts, banking, etc.)
- التقارير المالية
- الأصول الثابتة (Fixed Assets)

✅ **المبيعات:**
- قراءة الفواتير (invoices)
- قراءة العملاء (customers)
- قراءة أوامر البيع (sales orders)
- قراءة المرتجعات (sales returns)

✅ **المشتريات:**
- قراءة الفواتير (bills)
- قراءة الموردين (suppliers)
- قراءة أوامر الشراء (purchase orders)
- قراءة المرتجعات (purchase returns)

✅ **المخزون:**
- قراءة المنتجات (products)
- قراءة المخزون (inventory)
- **لا يمكن حذف أي شيء**

❌ **الصلاحيات المحظورة:**
- حذف أي سجل (`action NOT LIKE '%:delete'`)
- إدارة المستخدمين (`action NOT LIKE 'users:%'`)
- إعدادات الشركة (`action NOT LIKE 'company_settings:%'`)

---

## 2️⃣ القيود على مستوى الفروع (Branches)

### 2.1 مستوى الوصول (Access Level)

من `lib/validation.ts`:
```typescript
export function getRoleAccessLevel(role: string): AccessLevel {
  switch (role?.toLowerCase()) {
    case 'accountant':
      return 'branch'; // 🔹 المحاسب: مثل المدير (رؤية كاملة + قيود تنظيمية)
  }
}
```

**النتيجة:** المحاسب لديه مستوى وصول `branch` - يرى جميع البيانات في فرعه فقط.

### 2.2 تطبيق القيود في الكود

#### أ) من `lib/role-based-access.ts`:

```typescript
// الأدوار التي ترى جميع البيانات لكن مع قيود تنظيمية
export const MANAGER_ROLES = ["manager", "accountant"]

// بناء فلتر الوصول
export function buildAccessFilter(accessInfo: UserAccessInfo): AccessFilter {
  // المحاسب والمدير: قيود تنظيمية فقط
  if (accessInfo.isManager) {
    return {
      filterByCreatedBy: false, // ✅ يرى جميع السجلات (ليس فقط ما أنشأه)
      filterByBranch: true,     // ✅ قيود الفرع
      branchId: accessInfo.branchId,
      allowedBranchIds: accessInfo.branchAccess,
      filterByCostCenter: true,  // ✅ قيود مركز التكلفة
      costCenterId: accessInfo.costCenterId,
      filterByWarehouse: true,   // ✅ قيود المخزن
      warehouseId: accessInfo.warehouseId,
    }
  }
}
```

#### ب) من `lib/branch-access-control.ts`:

```typescript
export const BRANCH_LEVEL_ROLES = ['manager', 'general_manager', 'accountant', 'supervisor']

// جلب الفروع المصرح بها
export async function getAllowedBranches(
  supabase: any,
  companyId: string,
  userRole: string,
  userBranchId: string | null
): Promise<{ id: string; name: string }[]> {
  const roleLower = userRole.toLowerCase()
  
  // Owner/Admin يرون كل الفروع
  if (FULL_ACCESS_ROLES.includes(roleLower)) {
    // ... جميع الفروع
  }
  
  // باقي المستخدمين (بما فيهم المحاسب) يرون فرعهم فقط
  if (userBranchId) {
    const { data } = await supabase
      .from('branches')
      .select('id, name, code, is_main')
      .eq('id', userBranchId)
      .eq('is_active', true)
    return data || []
  }
  
  return []
}
```

### 2.3 الفروع المتعددة (Multi-Branch Access)

من `lib/role-based-access.ts`:
```typescript
// جلب الفروع المسموح بها
let branchAccess: string[] = []
if (!UNRESTRICTED_ROLES.includes(role)) {
  const { data: access } = await supabase
    .from("user_branch_access")
    .select("branch_id")
    .eq("company_id", companyId)
    .eq("user_id", currentUserId)
    .eq("is_active", true)

  if (access) {
    branchAccess = access.map(a => a.branch_id)
  }
  // إضافة الفرع الأساسي
  if (member?.branch_id && !branchAccess.includes(member.branch_id)) {
    branchAccess.push(member.branch_id)
  }
}
```

**النتيجة:** المحاسب يمكن أن يكون لديه وصول لعدة فروع من خلال جدول `user_branch_access`.

---

## 3️⃣ القيود على مستوى المخازن (Warehouses)

### 3.1 تطبيق القيود

من `lib/branch-access-control.ts`:
```typescript
// جلب المخازن المصرح بها
export async function getAllowedWarehouses(
  supabase: any,
  companyId: string,
  userRole: string,
  userBranchId: string | null,
  userWarehouseId: string | null,
  filterByBranchId?: string
): Promise<{ id: string; name: string }[]> {
  const roleLower = userRole.toLowerCase()
  
  // Owner/Admin يرون كل المخازن
  if (FULL_ACCESS_ROLES.includes(roleLower)) {
    // ... جميع المخازن
  }
  
  // مدير الفرع (بما فيهم المحاسب) يرى المخازن في فرعه
  if (BRANCH_LEVEL_ROLES.includes(roleLower) && userBranchId) {
    const { data } = await supabase
      .from('warehouses')
      .select('id, name, code, branch_id, is_main')
      .eq('company_id', companyId)
      .eq('branch_id', userBranchId)  // ✅ فقط مخازن فرعه
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name')
    return data || []
  }
  
  // الموظف يرى مخزنه فقط
  if (userWarehouseId) {
    // ... مخزن واحد فقط
  }
  
  return []
}
```

### 3.2 التحقق من الوصول للمخزن

من `lib/branch-access-control.ts`:
```typescript
export async function checkBranchAccess(
  config: BranchAccessConfig
): Promise<BranchAccessResult> {
  // التحقق من الوصول للمخزن
  if (config.requiredWarehouseId && member.warehouse_id !== config.requiredWarehouseId) {
    if (!['owner', 'admin', 'store_manager'].includes(member.role)) {
      return {
        hasAccess: false,
        error: 'لا يمكن الوصول لهذا المخزن'
      }
    }
  }
}
```

**⚠️ ملاحظة مهمة:** المحاسب **لا** مدرج في قائمة الأدوار المسموح لها بالوصول لمخزن مختلف عن مخزنهم (`['owner', 'admin', 'store_manager']`). هذا يعني:
- إذا كان المحاسب لديه `warehouse_id` محدد، يمكنه الوصول فقط لمخزنه
- إذا كان `warehouse_id` = null، يمكنه الوصول لجميع المخازن في فرعه

---

## 4️⃣ القيود على مستوى مراكز التكلفة (Cost Centers)

### 4.1 تطبيق القيود

من `lib/branch-access-control.ts`:
```typescript
// جلب مراكز التكلفة المصرح بها
export async function getAllowedCostCenters(
  supabase: any,
  companyId: string,
  userRole: string,
  userBranchId: string | null,
  userCostCenterId: string | null,
  filterByBranchId?: string
): Promise<{ id: string; cost_center_name: string }[]> {
  const roleLower = userRole.toLowerCase()
  
  // Owner/Admin يرون كل مراكز التكلفة
  if (FULL_ACCESS_ROLES.includes(roleLower)) {
    // ... جميع مراكز التكلفة
  }
  
  // مدير الفرع (بما فيهم المحاسب) يرى مراكز التكلفة في فرعه
  if (BRANCH_LEVEL_ROLES.includes(roleLower) && userBranchId) {
    const { data } = await supabase
      .from('cost_centers')
      .select('id, cost_center_name, cost_center_code, branch_id')
      .eq('company_id', companyId)
      .eq('branch_id', userBranchId)  // ✅ فقط مراكز تكلفة فرعه
      .eq('is_active', true)
      .order('cost_center_name')
    return data || []
  }
  
  // الموظف يرى مركز تكلفته فقط
  if (userCostCenterId) {
    // ... مركز تكلفة واحد فقط
  }
  
  return []
}
```

### 4.2 التحقق من الوصول لمركز التكلفة

من `lib/branch-access-control.ts`:
```typescript
// التحقق من الوصول لمركز التكلفة
if (config.requiredCostCenterId && member.cost_center_id !== config.requiredCostCenterId) {
  if (!['owner', 'admin'].includes(member.role)) {
    return {
      hasAccess: false,
      error: 'لا يمكن الوصول لمركز التكلفة هذا'
    }
  }
}
```

**⚠️ ملاحظة مهمة:** المحاسب **لا** مدرج في قائمة الأدوار المسموح لها بالوصول لمركز تكلفة مختلف. هذا يعني:
- إذا كان المحاسب لديه `cost_center_id` محدد، يمكنه الوصول فقط لمركز تكلفته
- إذا كان `cost_center_id` = null، يمكنه الوصول لجميع مراكز التكلفة في فرعه

---

## 5️⃣ ملخص القيود للمحاسب

| المستوى | القيد | التفاصيل |
|---------|-------|----------|
| **الفرع** | ✅ قيود | يرى فقط البيانات في فرعه (أو الفروع المصرح بها عبر `user_branch_access`) |
| **المخزن** | ✅ قيود | يرى فقط المخازن في فرعه (إذا `warehouse_id` = null) أو مخزنه فقط (إذا `warehouse_id` محدد) |
| **مركز التكلفة** | ✅ قيود | يرى فقط مراكز التكلفة في فرعه (إذا `cost_center_id` = null) أو مركز تكلفته فقط (إذا `cost_center_id` محدد) |
| **المنشئ** | ❌ بدون قيود | يرى جميع السجلات في نطاقه (ليس فقط ما أنشأه) |

---

## 6️⃣ المشاكل المحتملة والتحسينات

### 6.1 مشكلة: عدم اتساق في قيود المخزن

**المشكلة:**
- في `lib/branch-access-control.ts`، المحاسب **لا** مدرج في قائمة الأدوار المسموح لها بالوصول لمخزن مختلف (`['owner', 'admin', 'store_manager']`)
- لكن في `lib/role-based-access.ts`، المحاسب مدرج في `MANAGER_ROLES` ويطبق عليه `filterByWarehouse: true`

**التأثير:**
- إذا كان المحاسب لديه `warehouse_id` محدد، قد لا يتمكن من الوصول لمخازن أخرى في فرعه حتى لو كان من المفترض أن يراها

**الحل المقترح:**
```typescript
// في lib/branch-access-control.ts
if (!['owner', 'admin', 'store_manager', 'accountant'].includes(member.role)) {
  return {
    hasAccess: false,
    error: 'لا يمكن الوصول لهذا المخزن'
  }
}
```

### 6.2 مشكلة: عدم اتساق في قيود مركز التكلفة

**المشكلة:**
- في `lib/branch-access-control.ts`، المحاسب **لا** مدرج في قائمة الأدوار المسموح لها بالوصول لمركز تكلفة مختلف (`['owner', 'admin']`)
- لكن في `lib/role-based-access.ts`، المحاسب يطبق عليه `filterByCostCenter: true`

**التأثير:**
- إذا كان المحاسب لديه `cost_center_id` محدد، قد لا يتمكن من الوصول لمراكز تكلفة أخرى في فرعه

**الحل المقترح:**
```typescript
// في lib/branch-access-control.ts
if (!['owner', 'admin', 'accountant'].includes(member.role)) {
  return {
    hasAccess: false,
    error: 'لا يمكن الوصول لمركز التكلفة هذا'
  }
}
```

### 6.3 تحسين: توثيق أفضل

**الاقتراح:**
- إضافة تعليقات توضيحية في الكود توضح منطق القيود للمحاسب
- إنشاء دليل للمسؤولين يشرح كيفية إعداد المحاسب بشكل صحيح

---

## 7️⃣ التوصيات

### ✅ التوصيات الفورية:

1. **إضافة المحاسب لقائمة الأدوار المسموح لها بالوصول للمخازن:**
   ```typescript
   // في lib/branch-access-control.ts
   if (!['owner', 'admin', 'store_manager', 'accountant'].includes(member.role))
   ```

2. **إضافة المحاسب لقائمة الأدوار المسموح لها بالوصول لمراكز التكلفة:**
   ```typescript
   // في lib/branch-access-control.ts
   if (!['owner', 'admin', 'accountant'].includes(member.role))
   ```

3. **التحقق من تطبيق القيود بشكل متسق في جميع أنحاء النظام**

### 📋 التوصيات طويلة المدى:

1. **إنشاء صفحة إعدادات خاصة للمحاسب:**
   - عرض الفروع والمخازن ومراكز التكلفة المصرح بها
   - إمكانية طلب وصول إضافي

2. **إضافة سجلات Audit للوصول:**
   - تسجيل كل محاولة وصول لمخزن أو مركز تكلفة خارج نطاق المحاسب

3. **تحسين رسائل الخطأ:**
   - رسائل واضحة بالعربية والإنجليزية عند رفض الوصول

---

## 8️⃣ الخلاصة

دور المحاسب في النظام:
- ✅ لديه صلاحيات مالية ومحاسبية كاملة
- ✅ يرى جميع البيانات في نطاقه (ليس فقط ما أنشأه)
- ✅ مقيد بالفرع والمخزن ومركز التكلفة
- ⚠️ يحتاج إلى تحسينات في تطبيق قيود المخزن ومركز التكلفة

**الحالة الحالية:** النظام يعمل بشكل جيد، لكن هناك بعض عدم الاتساق في تطبيق القيود يحتاج إلى إصلاح.

---

**تاريخ المراجعة:** ${new Date().toLocaleDateString('ar-SA')}  
**المراجع:** 
- `scripts/040_enhanced_rbac_system.sql`
- `lib/validation.ts`
- `lib/role-based-access.ts`
- `lib/branch-access-control.ts`
