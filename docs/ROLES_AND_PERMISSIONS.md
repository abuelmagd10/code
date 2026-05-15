# نظام الأدوار والصلاحيات — ERB VitaSlims ERP

> **تاريخ الإصدار:** 2026-05-16 | **الإصدار:** 3.0.0 | **المراحل المغطّاة:** R1–R9

---

## نظرة عامة

يعتمد النظام على نموذج **RBAC (Role-Based Access Control)** متعدد الطبقات:

1. **طبقة الحوكمة (Governance Layer)** — `lib/governance-middleware.ts` تُحدد نطاق الفروع والمخازن
2. **طبقة الصفحات (Page Access)** — `lib/access-context.tsx` تُحدد الصفحات المرئية
3. **طبقة API (API Guards)** — `getManufacturingApiContext` + `apiGuard` تُحدد العمليات المسموحة
4. **طبقة own_only (Manufacturing Officer)** — فلتر `created_by = user.id` على مستوى الاستعلام

---

## الأدوار في النظام

### الأدوار الأصلية

| الدور | الوصف | نطاق الفروع | نطاق البيانات |
|-------|-------|-------------|---------------|
| `owner` | مالك الشركة | كل الشركة | كل شيء |
| `admin` | مدير النظام | كل الشركة | كل شيء |
| `general_manager` | المدير العام | كل الشركة | كل شيء |
| `manager` | مدير فرع | فرع واحد | فرعه |
| `accountant` | محاسب | فرع واحد | فرعه |
| `store_manager` | مسؤول مخزن | فرع + مخزن | مخزنه |
| `warehouse_manager` | مدير مخزن | فرع + مخزن | مخزنه |
| `cashier` | صراف | فرع واحد | فرعه |
| `sales_representative` | مندوب مبيعات | فرع واحد | فرعه |
| `staff` / `employee` | موظف | فرع واحد | شخصي |
| `viewer` | مشاهد | محدود | قراءة فقط |

### الأدوار الجديدة (Phase R1 — 2026-05-15)

| الدور | الوصف | نطاق الفروع | نطاق البيانات | يحتاج اعتماد |
|-------|-------|-------------|---------------|--------------|
| `manufacturing_officer` | مسؤول التصنيع | فرع واحد | **own_only** (created_by = user.id) | ✅ نعم |
| `booking_officer` | مسؤول الحجوزات | فرع واحد | فرعه | ❌ لا |
| `purchasing_officer` | مسؤول المشتريات | **قراءة: كل الشركة** / **كتابة: فرع واحد** | فرعه (كتابة) | ❌ لا |

---

## Governance Middleware — نطاق البيانات

ملف: `lib/governance-middleware.ts` — دالة `buildGovernanceContext`

```
owner / admin / general_manager / purchasing_officer → branchIds = كل فروع الشركة
manager / accountant / branch_manager               → branchIds = [member.branch_id]
store_manager / warehouse_manager                   → branchIds + warehouseIds
manufacturing_officer / booking_officer / staff     → branchIds = [member.branch_id]
```

**ملاحظة خاصة للـ purchasing_officer:**
- `buildGovernanceContext` → نطاق شركة كامل (يرى كل الفواتير/POs)
- `addGovernanceData` → مُجبَر على فرعه عند الكتابة (مثل المحاسب)

---

## مصفوفة الصلاحيات — Manufacturing Officer

| الـ Endpoint | GET List | GET [id] | POST/PATCH | DELETE | ملاحظة |
|-------------|----------|----------|-----------|--------|---------|
| `/api/manufacturing/boms` | own_only | own_only | ✅ | own_only | |
| `/api/manufacturing/boms/[id]/versions` | — | — | own_only | — | يجب أن يملك BOM الأب |
| `/api/manufacturing/bom-versions/[id]` | — | own_only | own_only | own_only | فحص BOM الأب |
| `/api/manufacturing/bom-versions/[id]/structure` | — | — | own_only | — | |
| `/api/manufacturing/bom-versions/[id]/submit-approval` | — | — | own_only | — | يُرسل للاعتماد |
| `/api/manufacturing/routings` | own_only | own_only | ✅ | own_only | |
| `/api/manufacturing/routing-versions/[id]` | — | own_only | own_only | own_only | فحص Routing الأب |
| `/api/manufacturing/routing-versions/[id]/submit-approval` | — | — | own_only | — | |
| `/api/manufacturing/routing-versions/[id]/activate` | — | — | own_only | — | يتطلب approval_status='approved' |
| `/api/manufacturing/production-orders` | own_only | — | ✅ | — | |
| `/api/manufacturing/production-orders/[id]` | — | own_only | own_only | own_only | |
| `/api/manufacturing/material-issue-approvals` | requested_by | — | — | — | |

**ملاحظة أمنية:** جميع الـ guards تُعيد **404** (ليس 403) لمنع enumeration attacks.

---

## مصفوفة الصلاحيات — Booking Officer

| الـ Resource | قراءة | كتابة | تعديل | حذف | ملاحظة |
|-------------|-------|-------|-------|-----|---------|
| `bookings` | فرعه | فرعه | فرعه | ❌ | |
| `services` | فرعه | فرعه | فرعه | ❌ | فحص branch_id في GET/PUT |
| `customers` | فرعه | فرعه | فرعه | ❌ | |
| `payments` | فرعه | فرعه | ❌ | ❌ | |
| `reports` | فرعه | ❌ | ❌ | ❌ | |
| `manufacturing_boms` | ❌ | ❌ | ❌ | ❌ | PageGuard يمنع الوصول |
| `invoices` | ❌ | ❌ | ❌ | ❌ | |

ملف: `app/api/services/route.ts` — فلتر `branch_id` تلقائي للـ booking_officer  
ملف: `app/api/services/[id]/route.ts` — فحص `branch_id` قبل التعديل

---

## مصفوفة الصلاحيات — Purchasing Officer

| الـ Resource | قراءة | كتابة | ملاحظة |
|-------------|-------|-------|---------|
| `bills` | كل الفروع ✅ | فرعه ✅ | cross-branch visibility |
| `purchase_orders` | كل الفروع ✅ | فرعه ✅ | |
| `suppliers` | كل الشركة | فرعه | |
| `purchase_returns` | كل الفروع | فرعه | |
| `vendor_credits` | كل الفروع | فرعه | |
| `payments` | فرعه | فرعه | |
| `journal_entries` | فرعه | ❌ | قراءة فقط |
| `products` | فرعه | ❌ | |
| `inventory` | فرعه | ❌ | |

---

## الصفحات الافتراضية لكل دور

تعريف في: `lib/access-context.tsx` — `defaultRolePages`

```typescript
manufacturing_officer: ['dashboard', 'manufacturing_boms', 'products', 'inventory', 'product_availability', 'reports']
booking_officer:       ['dashboard', 'bookings', 'services', 'customers', 'payments', 'reports']
purchasing_officer:    ['dashboard', 'reports', 'bills', 'suppliers', 'purchase_orders', 'purchase_returns',
                        'vendor_credits', 'payments', 'expenses', 'journal_entries', ...]
```

> **ملاحظة:** إذا كانت الشركة لديها `company_role_permissions` مُخصَّصة → تتخطى الافتراضيات.

---

## كيفية إضافة دور جديد

1. **أضف الدور في `api-guard.ts`** — `Role` type union
2. **أضف `defaultRolePages`** في `lib/access-context.tsx`
3. **أضف الـ flags** (`is_booking_officer` etc.) في `AccessProfile` interface
4. **أضف `roleLabels`** في `app/settings/users/page.tsx`
5. **أضف Governance scope** في `lib/governance-middleware.ts`
6. **أنشئ migration** لـ `seed_[role]_permissions()`
7. **أضف own_only filter** إذا لزم (مثل manufacturing_officer)
8. **أضف للـ Sidebar** في `components/sidebar.tsx`

---

## Default Permissions Migration

عند إنشاء شركة جديدة، تشغيل:

```sql
-- Booking Officer
SELECT seed_booking_officer_permissions('company-uuid');

-- Purchasing Officer
SELECT seed_purchasing_officer_permissions('company-uuid');
```

المهاجرات تشتغل تلقائياً للشركات الموجودة.

---

## Role Type — TypeScript

ملف: `lib/core/security/api-guard.ts`

```typescript
export type Role =
  | 'owner' | 'admin' | 'general_manager' | 'manager'
  | 'accountant' | 'store_manager' | 'warehouse_manager'
  | 'cashier' | 'sales_representative'
  | 'manufacturing_officer' | 'booking_officer' | 'purchasing_officer'
  | 'staff' | 'employee' | 'viewer' | ''
```
