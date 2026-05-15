# خطة اختبار القبول (UAT) — Phases R1–R9

> **الإصدار:** 3.0.0 | **التاريخ:** 2026-05-16

---

## الإعداد المسبق

### إنشاء مستخدمي الاختبار

```
المستخدم A: دور manufacturing_officer — فرع X
المستخدم B: دور manufacturing_officer — فرع X
المستخدم C: دور admin — كل الشركة
المستخدم D: دور booking_officer — فرع X
المستخدم E: دور purchasing_officer — فرع X
المستخدم F: دور store_manager — مخزن M
```

---

## الاختبار 1: عزل Manufacturing Officer (own_only)

**الهدف:** التحقق من أن مسؤول التصنيع لا يرى بيانات زملائه.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | A يُنشئ BOM "BOM-A" | يظهر في قائمة A | |
| 2 | B يفتح قائمة BOMs | BOM-A **غير مرئي** لـ B | |
| 3 | B يحاول GET `/api/manufacturing/boms/{BOM-A-id}` | **404** (ليس 403) | |
| 4 | C يفتح قائمة BOMs | يرى BOMs لكل من A و B | |
| 5 | A يُنشئ Routing "RV-A" | يظهر في قائمة A | |
| 6 | B لا يرى "RV-A" | **غير مرئي** | |
| 7 | A يُنشئ Production Order | يظهر في قائمته | |
| 8 | B لا يرى Production Order لـ A | **غير مرئي** | |

**معيار النجاح:** جميع الخطوات بنتائجها المتوقعة.

---

## الاختبار 2: دورة اعتماد BOM كاملة

**الهدف:** التحقق من سير دورة الاعتماد من البداية للنهاية.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | A يُنشئ BOM → Version → يُضيف مكوّنات | `status = 'draft'` | |
| 2 | A يُرسل للاعتماد (`submit-approval`) | `status = 'pending_approval'`, `cycle_no = 1` | |
| 3 | التحقق من `approval_history` | سجل بـ `action = 'submitted'` | |
| 4 | C (admin) يرى إشعار في Sidebar Badge (count > 0) | Badge يظهر بالعدد الصحيح | |
| 5 | C يوافق (`approve`) | `status = 'approved'` | |
| 6 | A يستلم إشعار "تمت الموافقة" | الإشعار وصل لـ A فقط | |
| 7 | التحقق من `approval_history` | سجل بـ `action = 'approved'` | |
| 8 | Sidebar Badge لـ C يتحدث (count يقل) | تحديث خلال 30 ثانية | |
| 9 | A يُعدّل BOM المعتمد | `status = 'pending_approval'`, `cycle_no = 2` | |
| 10 | التحقق من `approval_history` | سجل بـ `action = 'edit_triggered_reapproval'` | |
| 11 | C يوافق مجدداً | `status = 'approved'`, `cycle_no = 2` | |

**معيار النجاح:** جميع الحالات صحيحة.

---

## الاختبار 3: سلسلة تبعيات Production Order

**الهدف:** التحقق من أن PO يرفض التقديم قبل اعتماد BOM + Routing.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | A يُنشئ PO يستخدم BOM غير معتمد | PO في `status = 'draft'` | |
| 2 | A يحاول تقديم PO للاعتماد | **فشل** — رسالة: "bom_version_not_approved" | |
| 3 | A يعتمد BOM Version (`submit` + admin `approve`) | BOM `status = 'approved'` | |
| 4 | A يحاول تقديم PO مجدداً | **فشل** — رسالة: "routing_version_not_approved" | |
| 5 | A يعتمد Routing Version | Routing `approval_status = 'approved'` | |
| 6 | A يُقدّم PO للاعتماد | **نجاح** — `approval_status = 'pending_approval'` | |
| 7 | C يوافق على PO | `approval_status = 'approved'` | |
| 8 | A يحاول release قبل الاعتماد | محظور (اختبار backward compat) | |
| 9 | A يُصدر PO (`release`) | **نجاح** — `status = 'released'` | |

**معيار النجاح:** الخطوة 2 و4 تفشل، باقي الخطوات تنجح.

---

## الاختبار 4: Material Issue ثنائي المرحلة

**الهدف:** التحقق من سير الموافقة الثنائية.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | A يُنشئ طلب صرف مواد (`request-material-issue`) | `status = 'pending'` | |
| 2 | F (store_manager للمخزن M) يستلم إشعار | إشعار خاص بـ F فقط (ليس مخازن أخرى) | |
| 3 | C (admin) يرى طلب الصرف في Approvals Inbox | ظاهر في تاب "طلبات الصرف" | |
| 4 | C يوافق Stage 1 (`management-approve`) | `status = 'management_approved'` | |
| 5 | F يستلم إشعار Stage 2 | يصل لـ F فقط لا لكل المخازن | |
| 6 | A يستلم إشعار "الإدارة وافقت" | وصل لـ A | |
| 7 | F يوافق Stage 2 (`approve`) | `status = 'approved'` + مواد تُصدر من المخزون | |
| 8 | التحقق من `approval_history` | 4 سجلات: submitted, approved_management, approved | |

**معيار النجاح:** الإشعارات تصل للأشخاص الصحيحين فقط.

---

## الاختبار 5: Booking Officer — تحديد الفرع

**الهدف:** التحقق من قيود الفرع لمسؤول الحجوزات.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | D يسجّل دخول | يُحوَّل لـ `/bookings` تلقائياً | |
| 2 | D يفتح `/manufacturing/boms` | redirect (PageGuard يمنع) | |
| 3 | D يرى قائمة Bookings | فرع X فقط | |
| 4 | D يرى قائمة Services | فرع X فقط | |
| 5 | D يُنشئ Service جديدة | branch_id = X تلقائياً | |
| 6 | D يحاول تعديل Service من فرع Y | **403/404** | |
| 7 | D يُنشئ Booking جديد | يُكتمل بنجاح | |

**معيار النجاح:** البيانات مقيّدة بفرع D.

---

## الاختبار 6: Purchasing Officer — الرؤية عبر الفروع

**الهدف:** التحقق من الرؤية الشاملة مع الكتابة المقيّدة.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | E يفتح `/bills` | يرى فواتير **كل الفروع** | |
| 2 | E يفتح `/purchase-orders` | يرى POs **كل الفروع** | |
| 3 | E يُنشئ PO | branch_id = X (فرعه) تلقائياً | |
| 4 | E يحاول إنشاء PO في فرع Y صراحةً | يُجبَر على فرعه X | |
| 5 | E يفتح `/bookings` | redirect (غير مسموح) | |
| 6 | E يفتح تقارير مالية | مسموح (موروث من المحاسب) | |

**معيار النجاح:** القراءة شاملة، الكتابة مقيّدة.

---

## الاختبار 7: Sidebar Badge للموافقات

**الهدف:** التحقق من عمل الـ Badge بشكل صحيح.

| # | الخطوة | النتيجة المتوقعة | ✓/✗ |
|---|--------|-----------------|-----|
| 1 | C (admin) يسجّل دخول | Badge موجود في `🔔 الموافقات` | |
| 2 | A يُقدّم BOM للاعتماد | Badge C يزيد خلال 30 ثانية | |
| 3 | C يوافق على BOM | Badge يقل | |
| 4 | D (booking_officer) يسجّل دخول | Badge **غير موجود** | |
| 5 | A (manufacturing_officer) يسجّل دخول | Badge **غير موجود** | |
| 6 | C يفتح `/approvals` ثم يغلقه | Badge يتحدث فوراً | |
| 7 | فتح Network Tab: كل 30 ثانية | طلب لـ `/api/notifications/pending-approvals-count` | |

**معيار النجاح:** Badge يظهر فقط لأدوار الإدارة ويُحدَّث بانتظام.

---

## الاختبار 8: PageGuard للأدوار

**الهدف:** التحقق من حماية الصفحات.

| # | المستخدم | الصفحة | النتيجة المتوقعة | ✓/✗ |
|---|---------|--------|-----------------|-----|
| 1 | A (manufacturing_officer) | `/approvals` | redirect | |
| 2 | D (booking_officer) | `/manufacturing/boms` | redirect | |
| 3 | E (purchasing_officer) | `/bookings` | redirect | |
| 4 | C (admin) | `/approvals` | يُكمل الصفحة بنجاح | |
| 5 | C (admin) | `/manufacturing/boms` | يُكمل الصفحة | |
| 6 | A | `/manufacturing/boms` | يُكمل (مسموح له) | |
| 7 | A يرى `/approvals` link في Sidebar | **غير موجود** (مفلتَر) | |
| 8 | C يرى `/approvals` link في Sidebar | **موجود** مع Badge | |

**معيار النجاح:** كل redirect يعمل، Badge يظهر فقط للإدارة.

---

## Verification Queries للتشغيل في Supabase

```sql
-- 1. التحقق من Migrations
SELECT migration_name
FROM supabase_migrations.schema_migrations
WHERE migration_name LIKE '20260515%' OR migration_name LIKE '20260516%'
ORDER BY migration_name;
-- متوقع: 7 migrations

-- 2. التحقق من RPCs الجديدة
SELECT proname
FROM pg_proc
WHERE proname IN (
  'record_approval_action', 'get_approval_history',
  'submit_routing_version_for_approval_atomic',
  'approve_routing_version_atomic', 'reject_routing_version_atomic',
  'submit_production_order_for_approval_atomic',
  'approve_production_order_atomic', 'reject_production_order_atomic',
  'seed_booking_officer_permissions', 'seed_purchasing_officer_permissions',
  'get_pending_approvals_count'
);
-- متوقع: 11 functions

-- 3. التحقق من جدول approval_history
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'approval_history';
-- متوقع: صف واحد

-- 4. التحقق من أعمدة Production Orders الجديدة
SELECT column_name FROM information_schema.columns
WHERE table_name = 'manufacturing_production_orders'
  AND column_name IN ('approval_status', 'cycle_no', 'submitted_by', 'po_approved_by')
ORDER BY column_name;
-- متوقع: 4 أعمدة

-- 5. التحقق من management_approved_by في MMIA
SELECT column_name FROM information_schema.columns
WHERE table_name = 'manufacturing_material_issue_approvals'
  AND column_name IN ('management_approved_by', 'management_approved_at', 'management_approved_notes')
ORDER BY column_name;
-- متوقع: 3 أعمدة

-- 6. إحصائية approval_history (بعد الاختبارات)
SELECT reference_type, action, COUNT(*)
FROM public.approval_history
GROUP BY reference_type, action
ORDER BY reference_type, action;

-- 7. التحقق من CHECK constraint على MMIA
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.manufacturing_material_issue_approvals'::regclass
  AND contype = 'c'
  AND conname LIKE '%status%';
-- يجب أن يحتوي على 'management_approved'
```

---

## معايير النجاح الإجمالية

| المعيار | النتيجة المطلوبة |
|---------|-----------------|
| TypeScript errors | 0 (`tsc --noEmit`) |
| Manufacturing Officer isolation | 100% own_only |
| Approval workflows | كل state transitions تعمل |
| Notifications | يصل للمستلم الصحيح فقط |
| PageGuard | كل redirects تعمل |
| Sidebar Badge | يظهر للإدارة، يتحدث بانتظام |
| Backward compatibility | الأدوار القديمة تعمل كما كانت |
| Breaking changes | صفر تغييرات تكسيرية |
