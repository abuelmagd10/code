# دورات الاعتماد (Approval Workflows) — ERB VitaSlims ERP

> **تاريخ الإصدار:** 2026-05-16 | **الإصدار:** 3.0.0 | **المراحل:** R2–R5

---

## نظرة عامة

يعتمد النظام على **نمط موحّد** لجميع دورات الاعتماد:

```
draft → pending_approval → approved / rejected
                ↑
           (re-submit)
```

**المبادئ الأساسية:**
- `approval_status` منفصل عن `status` التشغيلي
- `cycle_no` يزيد عند كل دورة جديدة (تعديل بعد الاعتماد)
- `approval_history` جدول append-only لا يُحذف ولا يُعدَّل
- **Re-approval on edit**: تعديل سجل معتمد → إعادة دورة الاعتماد تلقائياً

---

## 1. Approval History — البنية التحتية

**الجدول:** `public.approval_history`  
**المهاجرة:** `20260515000100_approval_history.sql`

```sql
CREATE TABLE public.approval_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'bom_version', 'routing', 'production_order', 'material_issue', 'product_receive'
  )),
  reference_id   UUID NOT NULL,
  cycle_no       INTEGER NOT NULL DEFAULT 1,
  action         TEXT NOT NULL CHECK (action IN (
    'submitted', 're_submitted', 'approved', 'approved_management',
    'approved_warehouse', 'rejected', 'rejected_management',
    'edit_triggered_reapproval', 'cancelled'
  )),
  actor_id       UUID NOT NULL REFERENCES auth.users(id),
  actor_role     TEXT NOT NULL,
  reason         TEXT,
  snapshot_data  JSONB,
  branch_id      UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- لا يوجد UPDATE أو DELETE — جدول immutable
```

**RPCs:**
- `record_approval_action()` — تسجيل عملية اعتماد
- `get_approval_history()` — جلب تاريخ الاعتماد مرتّباً

**TypeScript helpers:** `lib/manufacturing/approval-history.ts`
- `recordApprovalAction()` — يلتهم الأخطاء (non-critical)
- `buildApprovalSnapshot()` — بناء snapshot موحّد
- `getNextCycleNo()` — حساب رقم الدورة التالي
- `assertManufacturingOfficerOwnership()` — حارس own_only

---

## 2. BOM Version Approval Workflow

**المهاجرة:** `20260501000100_fix_manufacturing_bom_versions_approval_columns.sql` (موجودة سابقاً)  
**الأعمدة:** `status`, `cycle_no`, `submitted_by`, `approved_by`, `approved_at`, `rejected_at`

### State Machine

```
        ┌──────────┐
        │  draft   │
        └────┬─────┘
             │ submit-approval
             ▼
   ┌──────────────────┐
   │ pending_approval │ ◄─── re-submit (بعد رفض)
   └────────┬─────────┘
            │
       ┌────┴────┐
       ▼         ▼
  ┌─────────┐  ┌──────────┐
  │approved │  │ rejected │
  └────┬────┘  └──────┬───┘
       │               │
       │ edit          │ re-submit
       ▼               ▼
  pending_approval (cycle_no++)
```

### API Routes

| Route | Method | الدور المسموح |
|-------|--------|--------------|
| `/api/manufacturing/bom-versions/[id]/submit-approval` | POST | manufacturing_officer (own_only) |
| `/api/manufacturing/bom-versions/[id]/approve` | POST | admin, owner, general_manager, manager |
| `/api/manufacturing/bom-versions/[id]/reject` | POST | admin, owner, general_manager, manager |

### Re-approval on Edit

ملف: `app/api/manufacturing/bom-versions/[id]/route.ts` — PATCH handler

```typescript
const wasApproved = existing.status === "approved"
if (wasApproved) {
  // status → pending_approval, cycle_no++, approved_by = null
  await recordApprovalAction({ action: "edit_triggered_reapproval", ... })
  // notify admin/owner/gm
}
```

---

## 3. Routing Version Approval Workflow

**المهاجرة:** `20260515000200_routing_approval_and_bom_cycle.sql`  
**الأعمدة:** `approval_status`, `cycle_no`, `submitted_by`, `approved_by`, `rejected_by`

### ملاحظة مهمة

Routings لها دورة حياة **مزدوجة**:
- `status` → التشغيلي: `draft / active / inactive / archived` (موجودة سابقاً)
- `approval_status` → الاعتماد: `draft / pending_approval / approved / rejected` (مُضاف في R3)

**القيد:** `activate` يتطلب `approval_status = 'approved'` أولاً.

### API Routes

| Route | Method | الدور المسموح |
|-------|--------|--------------|
| `/api/manufacturing/routing-versions/[id]/submit-approval` | POST | manufacturing_officer (own_only) |
| `/api/manufacturing/routing-versions/[id]/approve` | POST | admin, owner, general_manager, manager |
| `/api/manufacturing/routing-versions/[id]/reject` | POST | admin, owner, general_manager, manager |
| `/api/manufacturing/routing-versions/[id]/activate` | POST | manufacturing_officer (own_only) + يتحقق من approval |

---

## 4. Production Order Approval Workflow

**المهاجرة:** `20260515000300_production_order_approval.sql`  
**الأعمدة:** `approval_status`, `cycle_no`, `submitted_by`, `po_approved_by/at`, `po_rejected_by/at/reason`

> **تنبيه:** استُخدم البادئة `po_approved_by` (لا `approved_by`) لتجنّب تعارض الأسماء مع `released_by`.

### State Machine

```
          ┌──────────┐     submit     ┌──────────────────┐
          │  draft   │ ─────────────► │ pending_approval │
          └──────────┘                └────────┬─────────┘
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                 ▼
                        ┌──────────┐                      ┌──────────┐
                        │ approved │                      │ rejected │
                        └────┬─────┘                      └──────────┘
                             │ release                    (re-submit ممكن)
                             ▼
                    ┌─────────────────┐
                    │    released     │  ← status التشغيلي (منفصل)
                    └─────────────────┘
```

### شرط التقديم للاعتماد

RPC `submit_production_order_for_approval_atomic` يتحقق من:
1. `bom_version.status = 'approved'`
2. `routing_version.approval_status = 'approved'`

إذا فشل أحدهما → `RAISE EXCEPTION` مع رسالة واضحة.

### API Routes

| Route | Method | الدور |
|-------|--------|-------|
| `/api/manufacturing/production-orders/[id]/submit-approval` | POST | manufacturing_officer (own_only) |
| `/api/manufacturing/production-orders/[id]/approve` | POST | admin, owner, general_manager, manager |
| `/api/manufacturing/production-orders/[id]/reject` | POST | admin, owner, general_manager, manager |
| `/api/manufacturing/production-orders/[id]/release` | POST | يتطلب `approval_status = 'approved'` |

---

## 5. Material Issue Two-Stage Workflow

**المهاجرة:** `20260515000400_material_issue_two_stage.sql`  
**الجدول:** `manufacturing_material_issue_approvals`

### State Machine الكامل

```
          ┌─────────┐
          │ pending │ ◄─── request-material-issue (manufacturing_officer)
          └────┬────┘
               │
    ┌──────────┴──────────┐
    │ Stage 1             │ Stage 1 (Optional bypass)
    │ management-approve  │
    ▼                     ▼
┌──────────────────┐   ┌──────────┐
│management_approved│   │ approve  │ (warehouse يعتمد مباشرة — backward compat)
└────────┬─────────┘   └──────────┘
         │
         │ Stage 2: warehouse approve
         ▼
    ┌──────────┐
    │ approved │ ← يصدر المواد فعلياً من المخزون
    └──────────┘

    ┌──────────┐
    │ rejected │ ← من أي مرحلة
    └──────────┘
```

### الأدوار في كل مرحلة

| المرحلة | الـ Endpoint | الأدوار المسموحة |
|---------|------------|-----------------|
| طلب الصرف | `request-material-issue` | manufacturing_officer |
| Stage 1 — إدارة | `management-approve` | admin, owner, general_manager, manager |
| Stage 2 — مخزن | `approve` | store_manager, warehouse_manager, وإدارة عليا |
| الرفض | `reject` | أي من الأعلى |

### Backward Compatibility

المخزن (store_manager/warehouse_manager) لا يزال قادراً على الاعتماد مباشرة من `pending` (Stage 1 اختيارية).

### Warehouse-Specific Notification Routing

عند management-approve → إشعار يصل لمسؤولي **المخزن المحدد** في أمر الإنتاج فقط.  
`lib/manufacturing/notification-helpers.ts` — `notifyWarehouseStaff()`

Fallback: إذا لا يوجد مستخدم مرتبط بالمخزن → إرسال للـ role عاماً.

---

## 6. نمط Re-approval on Edit

**يُطبَّق على:** BOM Versions + Routing Versions + Production Orders

```typescript
// في PATCH handler
const wasApproved = existing.[approval_status_column] === "approved"
if (wasApproved) {
  // 1. إعادة الحالة
  updateData.[approval_status_column] = "pending_approval"
  updateData.cycle_no = existing.cycle_no + 1
  updateData.[approved_by] = null
  updateData.[approved_at] = null

  // 2. تسجيل في approval_history
  await recordApprovalAction({ action: "edit_triggered_reapproval", ... })

  // 3. إشعار الأدوار العليا
  await createNotification({ assignedToRole: "admin", ... })
  await createNotification({ assignedToRole: "owner", ... })
  await createNotification({ assignedToRole: "general_manager", ... })
}
```

---

## 7. صفحة الموافقات — `/approvals`

**الملف:** `app/approvals/page.tsx`  
**الحماية:** `PageGuard resource="approvals"` — يمنع `manufacturing_officer` من الوصول

### التبويبات

| التاب | المحتوى | الإجراءات |
|-------|---------|----------|
| الكل | جميع الطلبات المعلقة | موافقة / رفض |
| قوائم المواد | BOM Versions pending | موافقة / رفض |
| مسارات التصنيع | Routing Versions pending | موافقة / رفض |
| أوامر الإنتاج | Production Orders pending | موافقة / رفض |
| طلبات الصرف | Material Issues pending (Stage 1 + 2) | اعتماد الإدارة / اعتماد المخزن / رفض |

---

## Verification Queries

```sql
-- التحقق من جميع RPCs الجديدة
SELECT proname FROM pg_proc
WHERE proname IN (
  'submit_manufacturing_bom_version_for_approval_atomic',
  'approve_manufacturing_bom_version_atomic',
  'submit_routing_version_for_approval_atomic',
  'approve_routing_version_atomic',
  'reject_routing_version_atomic',
  'submit_production_order_for_approval_atomic',
  'approve_production_order_atomic',
  'reject_production_order_atomic',
  'get_pending_approvals_count'
);

-- إحصائية approval_history
SELECT reference_type, action, COUNT(*)
FROM public.approval_history
GROUP BY reference_type, action
ORDER BY reference_type, action;

-- التحقق من الأعمدة الجديدة
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'manufacturing_production_orders'
  AND column_name IN ('approval_status', 'cycle_no', 'po_approved_by', 'submitted_by')
ORDER BY column_name;
```
