# دليل نظام الإشعارات — ERB VitaSlims ERP

> **تاريخ الإصدار:** 2026-05-16 | **الإصدار:** 3.0.0 | **المراحل:** R3–R8

---

## نظرة عامة على البنية

يعتمد النظام على:
- **`notifications` table** في Supabase
- **`create_notification` RPC** لإنشاء الإشعارات بأمان
- **`NotificationCenter` component** في الـ UI
- **Sidebar Badge** لعرض عدد الموافقات المعلقة (R8)

---

## استراتيجيات التوجيه

### 1. Role-Based Routing (توجيه بالدور)

يُرسل الإشعار لجميع مستخدمي دور معيّن في الشركة.

```typescript
await createNotification({
  companyId,
  referenceType: "manufacturing_bom_version",
  referenceId: versionId,
  assignedToRole: "admin",
  eventKey: `bom_submitted_admin_${versionId}`,
  // ...
})
```

**متى يُستخدم:**
- إشعارات الاعتماد للأدوار العليا (admin/owner/general_manager)
- عند عدم معرفة المستخدم المحدد المعنيّ

---

### 2. Warehouse-Specific Routing (توجيه بالمخزن) — R8

يُرسل الإشعار **فقط** للمستخدمين المرتبطين بمخزن محدد.

**المساعد:** `lib/manufacturing/notification-helpers.ts` — `notifyWarehouseStaff()`

```typescript
await notifyWarehouseStaff({
  admin, companyId,
  warehouseId: approval.warehouse_id,  // المخزن المحدد
  notifBase,
  eventKeyPrefix: "mmia_request",
  referenceId: approvalId,
})
```

**الآلية:**
1. استعلام `company_members` بـ `warehouse_id = warehouseId` + `role IN ['store_manager', 'warehouse_manager']`
2. إرسال `assigned_to_user` لكل مستخدم مُعثور عليه
3. Fallback: إذا لا يوجد مستخدم → إرسال `assigned_to_role: 'store_manager'` عاماً

**متى يُستخدم:**
- طلب صرف المواد → `request-material-issue`
- موافقة الإدارة → `management-approve`

---

### 3. User-Specific Routing (توجيه للمستخدم)

يُرسل الإشعار لمستخدم محدد (عادةً من قدّم الطلب).

```typescript
await createNotification({
  companyId,
  referenceType: "manufacturing_production_order",
  referenceId: orderId,
  assignedToUser: order.submitted_by,  // المستخدم المحدد
  title: "✅ تمت الموافقة على أمر الإنتاج",
  // ...
})
```

**متى يُستخدم:**
- إشعار مقدّم الطلب عند الموافقة/الرفض

---

## قائمة event_keys

| الحدث | event_key Pattern | المستلم |
|-------|-----------------|---------|
| BOM submitted | `bom_v_submitted_admin_{id}` | admin/owner/gm |
| BOM approved | `bom_v_approved_{id}` | submitted_by |
| BOM rejected | `bom_v_rejected_{id}` | submitted_by |
| BOM re-approval | `bom_v_reapproval_admin_{id}` | admin/owner/gm |
| Routing submitted | `rv_submitted_admin_{id}` | admin/owner/gm |
| Routing approved | `rv_approved_{id}` | submitted_by |
| Routing rejected | `rv_rejected_{id}` | submitted_by |
| Routing re-approval | `rv_reapproval_admin_{id}` | admin/owner/gm |
| PO submitted | `po_submitted_admin_{id}` | admin/owner/gm |
| PO approved | `po_approved_{id}` | submitted_by |
| PO rejected | `po_rejected_{id}` | submitted_by |
| PO re-approval | `po_reapproval_admin_{id}` | admin/owner/gm |
| MI requested | `mmia_request_user_{uid}_{id}` | warehouse staff |
| MI mgmt approved | `mmia_mgmt_approved_user_{uid}_{id}` | warehouse staff |
| MI mgmt approved | `mmia_mgmt_approved_req_{id}` | submitted_by |
| PO released | `po_released_mgr_{id}` | manager |

---

## Sidebar Badge — R8

### RPC: `get_pending_approvals_count`

**المهاجرة:** `20260516000100_pending_approvals_count_rpc.sql`

```sql
-- يُعيد مجموع الموافقات المعلقة للأدوار العليا فقط
-- يُعيد 0 لباقي الأدوار
SELECT get_pending_approvals_count(company_id, user_id);
```

**ما يُحسبه:**
- `manufacturing_bom_versions` → `status = 'pending_approval'`
- `manufacturing_routing_versions` → `approval_status = 'pending_approval'`
- `manufacturing_production_orders` → `approval_status = 'pending_approval'`
- `manufacturing_material_issue_approvals` → `status IN ('pending', 'management_approved')`

**الأدوار التي ترى الـ Badge:** `admin`, `owner`, `general_manager`, `manager`

### API Endpoint

```
GET /api/notifications/pending-approvals-count
Response: { count: number }
```

### في Sidebar

ملف: `components/sidebar.tsx`

```typescript
// polling كل 30 ثانية
const interval = setInterval(refreshApprovalsCount, 30_000)

// refresh عند التنقل بين الصفحات
useEffect(() => { refreshApprovalsCount() }, [pathname])
```

الـ Badge يظهر في مجموعة `🔔 الموافقات` بالـ Sidebar.

---

## كيفية إضافة إشعار جديد

### الخطوة 1: تحديد الحدث والمستلمين

```typescript
// من هو المستلم؟
// - role: إذا كل أعضاء الدور معنيّون
// - user: إذا مستخدم محدد (submitted_by/requested_by)
// - warehouse: إذا مرتبط بمخزن محدد → استخدم notifyWarehouseStaff()
```

### الخطوة 2: اختيار الـ event_key

```typescript
// نمط: {context}_{action}_{scope}_{id}
// مثال: bom_v_submitted_admin_${versionId}
// مثال: mmia_mgmt_approved_user_${userId}_${approvalId}
```

### الخطوة 3: إرسال الإشعار

```typescript
// في API route (server-side):
await admin.rpc("create_notification", {
  p_company_id:       companyId,
  p_reference_type:   "your_reference_type",
  p_reference_id:     recordId,
  p_title:            "عنوان الإشعار",
  p_message:          "نص الإشعار مع تفاصيل",
  p_created_by:       user.id,
  p_branch_id:        branchId,
  p_assigned_to_role: "admin",    // أو null
  p_assigned_to_user: userId,     // أو null
  p_priority:         "high",     // high | normal | low
  p_severity:         "info",     // info | warning | error
  p_category:         "approvals",
  p_event_key:        `unique_key_${recordId}`,
})

// أو عبر governance-layer (client-side):
await createNotification({ companyId, assignedToRole: "admin", ... })
```

### الخطوة 4: اختبار

```sql
-- التحقق من وصول الإشعار
SELECT id, title, message, assigned_to_role, assigned_to_user, created_at
FROM notifications
WHERE company_id = 'your-company-id'
  AND event_key LIKE 'your_prefix%'
ORDER BY created_at DESC
LIMIT 5;
```

---

## الإشعارات التي لا تُرسل (Non-Critical)

جميع إشعارات الاعتماد مُغلَّفة بـ `try/catch` — فشل الإشعار لا يوقف العملية:

```typescript
try {
  await createNotification({ ... })
} catch { /* non-critical — لا يوقف العملية */ }
```

---

## Realtime Updates (مستقبلي)

يمكن تفعيل Supabase Realtime لتحديث الـ Badge فوراً:

```typescript
supabase
  .channel('approvals-changes')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'approval_history',
    filter: `company_id=eq.${companyId}`
  }, () => refreshApprovalsCount())
  .subscribe()
```

---

## Troubleshooting

| المشكلة | السبب المحتمل | الحل |
|---------|--------------|------|
| Badge لا يظهر | الدور ليس admin/owner/gm/manager | تحقق من `get_pending_approvals_count` يعيد 0 للدور |
| إشعار لم يصل | event_key مكرر | عدّل الـ event_key ليكون فريداً |
| warehouse staff لا يستلم | warehouse_id غير مُعيَّن للمستخدم | تحقق من `company_members.warehouse_id` |
| إشعار يصل لكل المخازن | warehouseId = null | تأكد من تمرير `issue_warehouse_id` صحيح |
