# CONTRACTS.md

العقود (contracts) المعتمدة فى DB. كل عقد منهم انفذ بـ migration معين
وله فحص فعّال داخل `assert_baseline()` (انظر
`supabase/migrations/20260629000392_v3_74_392_integrity_baseline.sql`).

> **القاعدة:** أى migration جديدة بتمس واحد من العناصر دى لازم تحدّث
> الفحص المقابل فى `assert_baseline()` + `baseline_report()`. لو
> اضفنا عقد جديد، نضيف صف هنا + فحص هناك. النية: ما حصلش لفّة
> "نصلح حاجة فنكسر حاجة تانية".

## كيف نتحقق

```sql
-- بعد كل migration:
SELECT assert_baseline();          -- ينجح بصمت، أو يفشل بـ EXCEPTION

-- للتشخيص:
SELECT * FROM baseline_report();   -- جدول صفوف بحالة كل عقد
```

---

## A. دوال DB لا غنى عنها

| الدالة | من migration | الدور |
| --- | --- | --- |
| `can_modify_data(uuid)` | v3.74.390 | بوابة write الموحدة على 22 جدول. لازم تشمل الأدوار الحديثة |
| `can_manage_supplier_row(uuid, uuid)` | v3.74.391 | RLS الموردين، محدود بالفرع |
| `complete_booking_atomic(...)` | v3.74.387 (آخر) | اتمام الحجز + بوابة المخزون + خصم الاستهلاكيات |
| `execute_sales_invoice_accounting(...)` | v3.74.385 | يطبع JE المبيعات بضمير contra-revenue على الخصم |
| `check_booking_service_inventory(...)` | v3.74.387 | يرفض الحجز لو الاستهلاكيات ناقصة |
| `run_all_integrity_checks(uuid)` | <مؤسسى> | المنسق الموحد لكل فحوصات `ic_*` |

## B. جداول لا غنى عنها

| الجدول | من migration | الدور |
| --- | --- | --- |
| `discount_approvals` | v3.74.372 | كل خصم → صف موافقة. كل موافقة منفصلة |
| `company_seat_licenses` | v3.74.377 | مقعد لكل license مع expiry مستقل |
| `service_products` | v3.74.386 | BOM ربط الخدمات بالمنتجات الاستهلاكية |

## C. Triggers حرجة

| Trigger | على جدول | من migration | الدور |
| --- | --- | --- | --- |
| `bkg_request_discount_approval` | bookings | v3.74.374 | يفتح طلب موافقة عند discount > 0 |
| `inv_request_discount_approval` | invoices | v3.74.375 | نفس الشئ للفواتير |
| `inv_block_post_unapproved_discount` | invoices | v3.74.375 | يمنع post قبل الموافقة |
| `bill_request_discount_approval` | bills | v3.74.376 | نفس الشئ لفواتير المشتريات |
| `bill_block_post_unapproved_discount` | bills | v3.74.376 | يمنع post قبل الموافقة |
| `sync_employee_user_id_ins/upd/del` | company_members | v3.74.384 | يحافظ على employees.user_id متطابق |

## D. RLS Policies حرجة

| Policy | على جدول | من migration | الدور |
| --- | --- | --- | --- |
| `suppliers_insert` / `_update` / `_delete` | suppliers | v3.74.391 | يستخدم `can_manage_supplier_row` (شركة + فرع) |

## E. بصمات داخل أجسام الدوال (Fingerprints)

| الفحص | من migration | السبب |
| --- | --- | --- |
| `can_modify_data` يتضمن كل الأدوار الحديثة (`purchasing_officer`, `general_manager`, `booking_officer`, `manufacturing_officer`, `hr_officer`, `store_manager`) | v3.74.390 | لو حد عدّل الدالة وحذف دور، تتكسر سيناريوهات اضافة موردين/POs/payments |
| `can_manage_supplier_row` يحتوى على شرط `p_row_branch_id = v_user_branch_id` | v3.74.391 | لو حد بسّط الدالة وشال التحقق، الفروع تقدر تعدّل موردين فروع تانية |

## AG. HOTFIX enum coercion فى notify_discount_decision_trg (v3.74.433)

### الثغرة

اكتشفها المالك على أول رفض اعتماد خصم بعد التنظيف: HTTP 500. الـ
Postgres logs:

```
ERROR: invalid input value for enum discount_document_type: "bill"
PL/pgSQL function notify_discount_decision_trg() line 40
```

ال trigger كان بيبنى `reference_type` بـ CASE:
```sql
CASE NEW.document_type
  WHEN 'purchase_order'   THEN 'purchase_order'
  WHEN 'sales_order'      THEN 'sales_order'
  WHEN 'purchase_invoice' THEN 'bill'      -- ليست قيمة enum
  WHEN 'sales_invoice'    THEN 'invoice'   -- ليست قيمة enum
  WHEN 'booking'          THEN 'booking'
  ELSE NEW.document_type                   -- enum
END
```

لأن الـ ELSE بيرجع enum، Postgres استنتج إن نوع نتيجة الـ CASE هو
`discount_document_type`، فحاول يحوّل كل THEN literal لقيمة enum
صحيحة. `'bill'` و `'invoice'` مش أعضاء فى الـ enum → الـ planner رفض
الـ INSERT كاملاً، حتى لو الـ branch المُطابق كان `'purchase_order'`
بس.

### الحل

cast كل من الـ input والـ ELSE لـ `text`:
```sql
CASE NEW.document_type::text
  WHEN 'purchase_order'   THEN 'purchase_order'
  ...
  ELSE NEW.document_type::text
END
```

دلوقتى نتيجة الـ CASE نص (text)، المقارنات نص-لـ-نص، ومفيش enum
coercion.

### الدرس المستفاد

لما تستخدم CASE على عمود enum وتحب ترجّع نص مختلف، **اعمل cast للنص
من البداية** (`enum_col::text`) فى الـ CASE input وفى الـ ELSE. وإلا
الـ planner هيتعامل مع المخرج كـ enum ويحاول يحوّل القيم اللى مش جزء
من الـ enum مما يفشل قبل ما يصل لـ runtime.

### Section AG baseline
- لا فحص جديد لازم — السلوك يفشل صراحةً عند الاختبار لو الإصلاح اتراجع

## AF. إصلاح focus textarea رفض الخصم (v3.74.432)

### الثغرة

اكتشفها المالك أثناء اختبار رفض اعتماد خصم: textarea سبب الرفض كان
بيقبل **حرف واحد فقط** كل مرة، وبعدها يفقد الـ focus.

السبب: `DiscountApprovalCard` كانت function معرّفة جوّا
`ApprovalsContent` (parent component). لما المستخدم يكتب حرف، الـ
state `rejectReason` يتغيّر، الـ parent يـ re-render، وعلى كل render
JavaScript يولّد دالة `DiscountApprovalCard` بـ **identity جديدة**.
React reconciler يقارن أنواع المكونات بالـ identity، فيرى "نوع مختلف"
ويـ unmount الـ Card كاملة + الـ Textarea بداخلها. الـ focus بيضيع
لأن الـ DOM node اتمسحت وحلت محلها واحدة جديدة.

### الحل

نقل `DiscountApprovalCard` من جوّا الـ parent إلى **module level** فوق
`ApprovalsContent`. الـ identity بقت ثابتة عبر الـ renders، React
يحافظ على الـ subtree، الـ Textarea تبقى focused.

كل القيم اللى كانت متاحة عبر الـ closure (`t`, `appLang`, `fmtMoney`,
`docTypeLabel`, `rejectId`, `rejectReason`, `setRejectReason`,
`runningId`, `handleApprove`, `handleReject`, إلخ.) بقت تُمرَّر داخل
حزمة واحدة اسمها `ctx: CardCtx` للتنظيف.

### تأثير محتمل على الكروت الأخرى

نفس النمط (function داخل function) موجود فى `BomCard`,
`RoutingCard`, `MaterialIssueCard`, `ProductionOrderCard`. لو حصلت
نفس المشكلة فى رفضهم، نطبق نفس الإصلاح. الأولوية الآن للخصم لأنه
الـ flow اللى المالك بيختبره دلوقتى.

### Section AF baseline
- النص الجوّانى لـ `app/approvals/page.tsx` يحتوى على
  `const DiscountApprovalCard = ({ d, ctx }` (دلالة على Module-level)
- لا توجد فحوصات DB لهذا الإصلاح (تعديل واجهة فقط)

## AE. HOTFIX notifications.category CHECK (v3.74.431)

### الثغرة

اكتشفها المالك أول لحظة محاولة إنشاء PO بعد تنظيف شركة "تست": HTTP 400
بـ "فشل في إنشاء أمر الشراء". الـ Postgres logs قالت:

```
ERROR: new row for relation "notifications" violates check constraint
"notifications_category_check"
PL/pgSQL function notify_branch_manager(...) line 13
```

السبب: الـ FYI insert من `po_branch_manager_notify_trg` بيدخل
`category='branch_activity'` (مضاف فى v3.74.428)، لكن الـ CHECK
constraint الأصلى ما كانش يقبل القيمة دى. والـ PO INSERT والـ FYI
INSERT فى نفس الـ transaction، فالاتنين يتراجعوا.

نفس الموقف هيحصل مع `accountant_action` (v3.74.429) لما فاتورة جديدة
تتعمل.

### الحل

DROP CONSTRAINT + ADD CONSTRAINT بقيم موسّعة:
```
finance, inventory, sales, approvals, system,
billing, hr, manufacturing,
branch_activity,    -- v3.74.428
accountant_action   -- v3.74.429
```

### Section AE baseline
- `notifications_category_check` موجود ويحتوى على `branch_activity` و
  `accountant_action`
- `PERFORM public.assert_baseline_v3_74_431_check()` مضاف لـ
  `assert_baseline`

### الدرس المستفاد

لما نضيف trigger يستخدم category جديد، لازم نتأكد إن الـ CHECK
constraint بيقبله. القاعدة الجديدة فى `assert_baseline`: لو ضفنا
category جديد فى أى trigger مستقبلاً، الـ baseline يفحص الـ CHECK
ويرفع failure قبل ما المستخدم يكتشف.

## AD. نظائر دورة المبيعات (v3.74.430)

### الثغرة

بعد v3.74.426..429 المشتريات بقت كاملة (اعتماد دفع المورد، اعتماد
مرتجعات، إشعارات لمدير الفرع والمحاسب). لكن دورة المبيعات لسة ناقصها:
- مرتجع المبيعات بدون أعمدة اعتماد ولا triggers تفرضها
- مدير الفرع أعمى عن نشاط البيع (طلب مبيعات، فاتورة، تحصيل، مرتجع)
- المحاسب ما بيُبَلَّغش بفواتير المبيعات الجديدة

### الحل

**(أ) إضافة أعمدة لـ `sales_returns`**:
`approved_by`, `approved_at`, `rejected_by`, `rejected_at`,
`rejection_reason` — نفس الـ schema بتاع `purchase_returns`.

**(ب) دورة اعتماد مرتجع المبيعات** — نظير v3.74.427:
- `sales_return_approval_insert` BEFORE INSERT — non-privileged ما يقدروش
  يدخّلوا بحالة approved مباشرة
- `sales_return_approval_update` BEFORE UPDATE — الانتقال لـ approved
  يتطلب approved_by + approved_at
- `sales_return_notify_approval` AFTER — إشعار للمالك + GM فى
  pending_approval
- `approve_sales_return_atomic` — RPC للاعتماد/الرفض

**(ج) إشعارات نشاط الفرع للمبيعات** — نظائر v3.74.428:
- `so_branch_manager_notify` على `sales_orders`
- `invoice_branch_manager_notify` على `invoices`
- `payment_customer_branch_manager_notify` على `payments` (للعميل فقط،
  بيستبعد دفعات الموردين عشان trigger المشتريات يتولاها)
- `sales_return_branch_manager_notify` على `sales_returns`

**(د) إشعار المحاسب بفواتير المبيعات الجديدة** — نظير v3.74.429:
- `invoice_notify_accountant` AFTER INSERT على `invoices`، يبعت لمحاسبى
  الفرع (أو محاسبى الشركة كـ fallback)، الفاعل مستبعد

### UI
صفحة `/approvals` بقت تعرف `document_type='sales_return'` وتوجّهه لـ
`/sales-returns/<id>`.

### Section AD baseline
- sales_returns عندها كل الـ 5 أعمدة approval
- ٩ trigger functions موجودة (٤ للمرتجع + ٤ للـ FYI + ١ للمحاسب)
- ٨ triggers موجودة على الجداول الصحيحة (sales_returns 3، sales_orders 1،
  invoices 2، payments 1، sales_returns FYI 1)
- المنطق فى `sales_return_approval_insert_trg` بيشتمل على
  `'owner', 'general_manager'`
- `invoice_notify_accountant_trg` بيستهدف `role='accountant'` و
  `category='accountant_action'`
- `PERFORM public.assert_baseline_v3_74_430_check()` مضاف لـ
  `assert_baseline`

### اكتمال الخطة

بكده الـ ٥ خطوات (v3.74.426..430) المطلوبة فى مراجعة دورة الأعمال
كاملة على المشتريات + المبيعات + الإشعارات الإدارية. كل اللى وصفتى
بـ "هذا ما يوجد فى دورة المشتريات ليس على سبيل الحصر" أصبح متطبّقاً
بقاعدة بيانات تفرضه + إشعارات تعرضه.

## AC. إشعار المحاسب بفواتير المشتريات الجديدة (v3.74.429)

### الثغرة

الفواتير كانت بتظهر صامتة. لو الـ PO اتعتمد → الفاتورة تتولد تلقائياً
بحالة draft، لكن المحاسب يكتشفها لما يفتح قائمة الفواتير بنفسه. مفيش
push يبلّغه إن فيه شغل محاسبى جاى عليه.

### الحل

trigger `bill_notify_accountant` على `bills` بـ AFTER INSERT.
يبعت إشعار لكل محاسب يخصه:

١. **التفضيل الأول**: المحاسبين بدور `accountant` و
   `branch_id = NEW.branch_id` (محاسب الفرع تحديداً)
٢. **Fallback**: لو الفرع ما عندوش محاسب مخصص، الإشعار يروح لكل
   المحاسبين على مستوى الشركة

الفاعل (اللى عمل الـ INSERT) يستبعد عشان ما يبعتش لنفسه. الإشعار
بـ `category='accountant_action'` للفلترة فى الـ inbox. الرسالة بتقول
رقم الفاتورة + المورد + الـ PO المرتبط + الإجمالى + توجيه واضح
"راجع الفاتورة وحضّر دورة الدفع".

### Section AC baseline
- function `bill_notify_accountant_trg` موجودة وتستهدف `role='accountant'`
- trigger `bill_notify_accountant` موجود على bills
- الـ category `'accountant_action'` مستخدم
- `PERFORM public.assert_baseline_v3_74_429_check()` مضاف لـ assert_baseline

## AB. إشعارات نشاط الفرع لمدير الفرع (v3.74.428)

### الثغرة

مدير الفرع (role='manager' وعنده branch_id) كان أعمى تماماً عن نشاط
فرعه. ترايجرات اعتماد الخصم كانت بتستبعد دور `manager` صراحة، وإشعارات
اعتماد الـ PO كانت بتروح للمالك والمدير العام فقط. مفيش قناة "للعلم
فقط" تخلّى مدير الفرع يعرف ايه اللى بيحصل فى فرعه. كان لازم يفتح
القوائم بنفسه يكتشف.

### الحل

دالة مركزية + ٤ triggers:

**`notify_branch_manager(company_id, branch_id, ref_type, ref_id,
actor_id, title, message, [severity, priority])`** — نقطة دخول واحدة.
بتدوّر على كل المستخدمين بدور `manager` و `branch_id` المحدد فى نفس
الشركة، بتستبعد الـ actor (لو هو نفسه مدير الفرع)، وبتدخّل صف للكل فى
notifications بـ `category='branch_activity'`.

**الـ triggers**:
- `po_branch_manager_notify` على `purchase_orders` — إشعار FYI عند
  الإنشاء + عند الاعتماد/الرفض
- `bill_branch_manager_notify` على `bills` — FYI عند الإنشاء + عند
  الانتقال لـ paid / partially_paid / voided
- `payment_branch_manager_notify` على `payments` (للموردين فقط) —
  FYI عند الإنشاء + عند الانتقال لـ approved/rejected/posted/paid
- `purchase_return_branch_manager_notify` على `purchase_returns` —
  FYI عند الإنشاء + عند الانتقال لـ approved/rejected/sent_to_vendor

`reference_type` بيبقى نوع المستند الأصلى (purchase_order, bill,
payment, purchase_return) عشان الـ routing map الموجودة توجّه مدير
الفرع لصفحة المستند. `category='branch_activity'` يخلّى الـ inbox UI
يقدر يفلتر النشاط الفرعى عن طلبات الاعتماد.

الـ helper بيرجع بصمت لو branch_id بـ NULL.

### Section AB baseline
- function `notify_branch_manager` موجودة وبتستهدف role=manager
  وفلتر branch_id وتستخدم category='branch_activity'
- functions الـ ٤ trigger functions موجودة
- triggers الـ ٤ موجودة على الجداول الصحيحة

أُضيف `PERFORM public.assert_baseline_v3_74_428_check()` لـ
`assert_baseline` ليفحص هذه الـ contracts فى كل run.

## AA. دورة اعتماد مرتجعات المشتريات (v3.74.427)

### الثغرة

جدول `purchase_returns` كان عنده الأعمدة الكاملة
(`approved_by`, `approved_at`, `rejected_by`, `rejected_at`,
`rejection_reason`) والـ RPC `approve_purchase_return_atomic` كانت
موجودة وشغالة، **لكن مفيش enforcement على DB level**. أى مستخدم عنده
صلاحية كتابة كان يقدر يدخّل صف مرتجع بـ `status='approved'` مباشرة
متجاوزاً الـ RPC. الـ trigger القديم `purchase_return_auto_lock` كان
يقفل الصف فوراً، فالمرتجع يبقى مُلزم محاسبياً ومخزنياً بدون مراجعة من
المالك.

### الحل

نفس النمط المعمول لدفع المورد فى Section Z. ثلاث triggers جديدة:

١. `purchase_return_approval_insert` (BEFORE INSERT) — لو منشئ المرتجع
   owner/general_manager → السماح بـ approved/sent_to_vendor مع
   auto-fill لـ approved_by/at. غيرهم → الحالة المسموحة فى الإنشاء
   draft / pending_approval فقط. أى محاولة لتجاوز ده → RAISE بالعربى.

٢. `purchase_return_approval_update` (BEFORE UPDATE) — أى انتقال إلى
   approved أو sent_to_vendor لازم يكون approved_by + approved_at
   معبّيين. لو NULL → RAISE مع توجيه لاستخدام الـ RPC.

٣. `purchase_return_notify_approval` (AFTER INSERT/UPDATE OF status) —
   أول ما الحالة تبقى pending_approval، إشعار للمالك + المدير العام
   بـ reference_type='approval_request' يوجّه لـ
   `/approvals?highlight=<id>`.

الـ RPC `approve_purchase_return_atomic` كان موجود من قبل ولم يُمَس،
هو نقطة الدخول الشرعية الوحيدة لاعتماد/رفض المرتجع.

### UI

صفحة `/approvals` بقت تعرف `document_type='purchase_return'` وتوجّهه
لـ `/purchase-returns/<id>`.

### Section AA baseline
- functions: `purchase_return_approval_insert_trg`,
  `purchase_return_approval_update_trg`,
  `purchase_return_notify_approval_trg`,
  `approve_purchase_return_atomic`
- triggers الثلاث موجودة على purchase_returns
- النصوص الجوّانية للـ triggers تحتوى على invariants الـ contract

ملاحظة: `sales_returns` ما عندوش أعمدة approved_by/at/rejected_by،
فمن غير الممكن تطبيق نفس النمط بدون migration هيكلى أولاً. ده مؤجل
لـ v3.74.430 (المبيعات).

## Z. دورة اعتماد دفع المورد (v3.74.426)

### الثغرة

جدول `payments` كان عنده `approved_by` و `approved_at` (مع `rejected_*`
و `current_approval_role`) لكن مفيش حد بيفرضهم. أى مستخدم عنده صلاحية
كتابة كان يقدر يدخّل دفعة لفاتورة مورد بـ `status='approved'` مباشرةً
ومش بس كده — الـ trigger `trg_auto_create_payment_journal` كان يطلق
على الـ INSERT بدون فحص الحالة ويعمل قيد محاسبى فورى. يعنى دفعة بدون
اعتماد المالك كانت بترحل للأستاذ العام بصمت.

كان فيه ١٣ دفعة legacy بحالة `approved` بدون `approved_by` (مستوردة
أو أُنشئت قبل سن الـ contract الجديد).

### الحل

**Backfill**: الـ ١٣ دفعة القديمة بقت
`approved_by = COALESCE(created_by_user_id, created_by)` و
`approved_at = COALESCE(created_at, NOW())`. مفيش دفعة ضاع منها صف.

**أربع triggers على `payments`**:

١. `payment_supplier_approval_insert` (BEFORE INSERT) — لو دفعة
   مورد (supplier_id أو bill_id ≠ NULL):
   - منشئها owner/general_manager → السماح بـ `status='approved'`
     مع auto-fill لـ `approved_by`/`approved_at` (self-approval).
   - أى دور تانى → الحالة المسموحة فى الإنشاء `draft` أو
     `pending_approval` فقط. غير كده → RAISE بالعربى.

٢. `payment_supplier_approval_update` (BEFORE UPDATE) — أى انتقال
   لحالة (approved/posted/paid/partially_paid) لازم يكون
   `approved_by` و `approved_at` معبّيين. لو NULL → RAISE.

٣. `payment_supplier_notify_approval` (AFTER INSERT/UPDATE OF status) —
   أول ما الحالة تبقى `pending_approval`، إشعار للمالك + المدير العام
   بـ `reference_type='approval_request'` (يوجّه لـ
   `/approvals?highlight=<id>`).

**Auto-journal split**: الـ trigger القديم
`trg_auto_create_payment_journal` كان AFTER INSERT بس مع
`WHEN journal_entry_id IS NULL`. الآن:
- `trg_auto_create_payment_journal_ins` — INSERT + شرط الحالة مش
  pending_approval / draft / rejected
- `trg_auto_create_payment_journal_upd` — UPDATE OF status + شرط الانتقال
  من حالة غير-معتمدة لمعتمدة

يعنى دفعة جديدة بـ pending_approval ما يُنشأ ليها قيد. لما تتعتمد، الـ
UPDATE trigger يطلق ويعمل القيد. مفيش double-fire لإن
`journal_entry_id IS NULL` شرط على الترايجرين.

**RPC `approve_supplier_payment_atomic`**: نقطة دخول الواجهة للاعتماد
أو الرفض. تفحص الدور (owner/GM فقط) وحالة الدفعة (`pending_approval`)،
وتحدّث الأعمدة بشكل atomic.

### UI

صفحة `/approvals` بقت تعرف `document_type='supplier_payment'`
وتوجّهه لـ `/payments/<id>`.

### Section Z baseline
- functions: `payment_supplier_approval_insert_trg`,
  `payment_supplier_approval_update_trg`,
  `payment_supplier_notify_approval_trg`,
  `approve_supplier_payment_atomic`
- triggers: نفس الأسماء + `trg_auto_create_payment_journal_ins/upd`
- legacy `trg_auto_create_payment_journal` لازم يكون اتمسح
- النصوص الجوّانية للـ triggers تحتوى على invariants الـ contract

## Y. القفل الصارم على المستندات المعتمدة (v3.74.425)

### الثغرة

`po_evaluate_discount_approval` كان عنده guard فى أول سطر:
```sql
IF v_po.status NOT IN ('draft', 'pending_approval') THEN RETURN; END IF;
```
يعنى لو الـ PO فى حالة approved أو sent_to_vendor أو received وحد عدّل
`discount_value` أو غيّر بنود، الـ trigger كان بيخرج بصمت ومبيفتحش طلب
اعتماد جديد للقيمة المعدّلة. التغيير كان يدخل بدون مراجعة.

نفس الفجوة على الفواتير: بعد ما الفاتورة تتنشر، أى تعديل لخصم لا
يطلق أى دورة موافقة.

### الحل (الصارم)

أربع triggers على مستوى DB، كل واحدة BEFORE event عشان ترفض قبل ما
التغيير يبقى persistent:

١. `po_protect_approved` BEFORE UPDATE على `purchase_orders` — لو حالة
   الـ PO فى (approved, sent_to_vendor, received) وحالة الحالة ما اتغيرتش
   لكن واحد من حقول الخصم/الإجماليات (discount_value, discount_type,
   discount_position, tax_inclusive, exchange_rate, subtotal,
   total_amount, tax_amount, shipping) اتغيّر → RAISE.

٢. `po_item_protect_approved` BEFORE INS/UPD/DEL على
   `purchase_order_items` — لو الـ PO الأب فى الحالات المعتمدة → RAISE.
   مع honor لـ `app.skip_po_lock` token للسماح بـ flows الـ system
   الشرعية مستقبلاً.

٣. `bill_protect_posted` BEFORE UPDATE على `bills` — لو الحالة مش
   draft ولا voided وحد عدّل خصم/إجماليات → RAISE.

٤. `bill_item_protect_posted` BEFORE INS/UPD/DEL على `bill_items` —
   نفس المنطق على البنود.

كل الـ triggers بتسمح بانتقالات الحالة (status transitions) عشان
`void_bill_atomic` يقدر يرجّع الـ PO من approved لـ pending_approval
بدون مشكلة.

### UI

صفحة عرض الـ PO:
- زر "تعديل" بقى مخفى لو الحالة فى (approved, sent_to_vendor, received)
- Banner أزرق تفسيرى يظهر فى نفس الحالات: "أمر شراء معتمد — مقفول
  للتعديل. اعمل void للفاتورة لإعادة فتح الدورة"

### إجراء التعديل بعد القفل

١. افتح الفاتورة المرتبطة  
٢. اضغط "إلغاء (Void)"  
٣. الـ PO يرجع تلقائياً لـ pending_approval (من v3.74.402)  
٤. اعدّل الـ PO (الـ trigger هيشتغل ويفتح طلب اعتماد جديد للخصم لو
   اتغيّر)  
٥. اعتمد الـ PO من جديد (الفاتورة الجديدة تتولد تلقائياً)

### Section Y baseline
- `po_protect_approved_trg` فيها `'approved'` و `discount_value`
- `po_item_protect_approved_trg` فيها `'approved'`
- `bill_protect_posted_trg` فيها `discount_value` و `'draft'`
- `bill_item_protect_posted_trg` فيها `'draft'`
- triggers الـ 4 موجودة على الجداول الصحيحة

## X. فاتورة المشتريات تقرأ اعتماد خصم الـ PO المرتبط (v3.74.424)

### الثغرة

`bill_request_discount_approval_trg` كان يفتح صف اعتماد جديد بـ
`document_type='purchase_invoice'` لأى فاتورة مشتريات بخصم > 0، حتى لو
الـ PO المرتبط (`bills.purchase_order_id`) كان عنده صف اعتماد بنفس
الخصم بحالة `approved` بالفعل. النتيجة: المالك يفتح صندوق الموافقات
ويلقى نفس الخصم بكارت تانى — مرة كأمر شراء، مرة كفاتورة مشتريات. ومش بس
إزعاج: لو المالك رفض الفاتورة بنية رفض إعادة الاعتماد، الـ PO نفسه يفضل
معتمد لكن الفاتورة محظورة من الترحيل، فالدورة المحاسبية تتعطّل بدون
وضوح للسبب.

برضه `bill_block_post_unapproved_discount_trg` (الـ guard اللى بيمنع
ترحيل الفاتورة لو الخصم مش معتمد) كان بيدوّر على صف
`purchase_invoice` فقط، فلو لأى سبب الفاتورة الـ trigger ما فتحلهاش صف
(مثلاً اتعملت تلقائياً عند اعتماد PO و الـ skip flag كان نشط)، الـ guard
يرفض الترحيل بالخطأ.

### الحل

`bill_request_discount_approval_trg` بقى يفحص أولاً:
- لو `NEW.purchase_order_id IS NOT NULL` يقرأ أحدث صف اعتماد على الـ PO
- لو الـ PO `rejected` → `RAISE` (الفاتورة ما تتحفظش بخصم مرفوض من المصدر)
- لو الـ PO `approved` ونفس القيمة + النوع → `RETURN NEW` بدون فتح صف جديد
- غير كده → نزول للمنطق العادى (فتح صف purchase_invoice)

`bill_block_post_unapproved_discount_trg` بنفس المنطق:
- PO rejected → `RAISE`
- PO approved بنفس الخصم → `RETURN NEW` (الفاتورة معتمدة الخصم)
- غير كده → الفحص العادى على صف purchase_invoice

### Section X baseline
- `bill_request_discount_approval_trg` body يحتوى على `NEW.purchase_order_id`
- `bill_block_post_unapproved_discount_trg` body يحتوى على `NEW.purchase_order_id`

نظير منطقى لـ v3.74.419 (فى دورة المبيعات: invoice ↔ sales_order).

## W. إلغاء اعتماد الخصم تلقائياً عند رفض/إلغاء المستند (v3.74.423)

### الثغرة

اكتشفها المالك أثناء اختبار v3.74.422: قام برفض PO-0001 مباشرةً من
صفحة PO قبل ما يتعامل مع اعتماد الخصم. النتيجة:
- `purchase_orders.status = 'rejected'` ✓
- `discount_approvals.status` لسه `'pending'` ✗
- صفحة `/approvals` لسه بتعرض كارت اعتمد/رفض لمستند تم رفضه

السبب: ما فيش trigger يربط الانتقال إلى rejected/cancelled على المستند
بإلغاء صف الاعتماد المعلّق.

### الحل

triggers جديدة:
- `po_cancel_discount_on_status` على `purchase_orders` (AFTER UPDATE OF status)
- `so_cancel_discount_on_status` على `sales_orders` (نفس الشيء)

السلوك: لما الحالة تنتقل لـ `'rejected'` أو `'cancelled'` (وفعلاً
تتغيّر، مش UPDATE نفس القيمة)، الـ trigger يبحث عن كل صف
`discount_approvals` بـ `status='pending'` لهذا المستند ويحوّله إلى
`'cancelled'` مع `decision_note` عربى يشرح السبب.

- الصفوف بحالة `approved` أو `rejected` ما تتغيّرش (audit trail).
- لو المستخدم رجّع PO من rejected إلى draft وأعاد التعديل، فإن
  `po_evaluate_discount_approval` (Section U) يفتح صف pending جديد
  تلقائياً — re-open flow يشتغل بدون كود إضافى.

### Catch-up

الـ migration بيضم UPDATE فورى لتنظيف الصفوف القديمة المعلّقة لمستندات
مرفوضة/ملغاة. PO-0001 اللى المالك ضرب عليه مثلاً اتنظف فى نفس الـ run.

### Section W baseline
- function `po_cancel_discount_on_status_trg` موجودة وتشير لـ
  `'rejected'` و `'cancelled'`
- function `so_cancel_discount_on_status_trg` نفس الشيء
- triggers `po_cancel_discount_on_status` و `so_cancel_discount_on_status` موجودة

## V. صفحة /approvals تتعامل مع purchase_order و sales_order (v3.74.422 — HOTFIX)

### الثغرة

`app/approvals/page.tsx` كان معرّف الـ TypeScript union لـ `document_type` على
ثلاث قيم فقط: `"sales_invoice" | "purchase_invoice" | "booking"`. وكان فيه
fallback صامت داخل `docTypeLabel` و `docHref`:

```ts
const docTypeLabel = (d) =>
  d === "sales_invoice"    ? "فاتورة مبيعات" :
  d === "purchase_invoice" ? "فاتورة مشتريات" :
                             "حجز خدمة"
```

النتيجة: أى صف بـ `document_type='purchase_order'` (أُضيف لقاعدة البيانات
فى v3.74.401 + إصدار الـ enum فى v3.74.417) كان يُعرَض على إنه
**"حجز خدمة"** ورابط "عرض المستند" يفتح `/bookings/<po-id>` بدلاً من
`/purchase-orders/<po-id>`. اكتشفها المالك أثناء اختبار v3.74.421 لما
لقى PO-0001 معروض كحجز.

### الحل

- توسيع الـ union ليشمل `purchase_order` و `sales_order`.
- استبدال السلاسل الشرطية بـ `switch` فيها branch صريح لكل قيمة وبـ
  `default` يرجع `"مستند" / "Document"` و `href = "#"` بدلاً من
  افتراض أنه حجز.

### Section V baseline
لا تغييرات على الـ DB. فحص ساكن: ملف `app/approvals/page.tsx` يحتوى على
`"purchase_order"` و `"sales_order"` فى الـ union وكذلك على
`/purchase-orders/${item.document_id}` و `/sales-orders/${item.document_id}`.

## U. تجميع خصم البنود + خصم المستند (v3.74.421)

### الثغرة

كان `po_request_discount_approval_trg` ينظر إلى `NEW.discount_value`
(خصم المستند) فقط. مسئول المشتريات كان يقدر يحط 50% خصم على كل بند
منفرد ويسيب خصم المستند صفر → الـ trigger ما يتفعّلش، الـ PO يبقى
قابل للاعتماد **بدون** اعتماد خصم. نفس الثغرة كانت موجودة فى
`sales_orders`. مكتشَفة بسؤال المالك المباشر.

### الحل

دالتان جديدتان `po_evaluate_discount_approval(po_id)` و
`so_evaluate_discount_approval(so_id)` تحسبان مجموع الخصم الفعّال:

```
line_total = Σ (qty × unit_price × discount_percent / 100)
doc_amt    = discount_value                                 if discount_type='amount'
             else (subtotal - line_total) × discount_value / 100
total      = line_total + doc_amt
```

لو `total > 0` → يُفتح صف واحد فى `discount_approvals` بقيمة المجموع
كاملاً (currency-amount). لو المستخدم عدّل البنود أو شال خصم المستند →
الدالة تتفعّل تانى، تلغى الصف القديم وتفتح صف جديد بالقيمة الجديدة، أو
تلغى نهائياً لو المجموع رجع صفر.

الـ triggers الجديدة:
- `po_item_request_discount_approval` على `purchase_order_items`
  (INS / UPD على quantity / unit_price / discount_percent / DEL)
- `so_item_request_discount_approval` على `sales_order_items` (نفس الشيء)

ال triggers القديمة على `purchase_orders` و `sales_orders` بقت رفيعة
وتنادى الدالة. الـ approve gate الموجود فى `approve_purchase_order_atomic`
(v3.74.419) بيقرأ نفس الصف، فالحماية تمتد تلقائياً للحالة الجديدة.

### Section U baseline
- function `po_evaluate_discount_approval` موجودة وتحتوى على
  `purchase_order_items` و `'approval_request'`
- function `so_evaluate_discount_approval` موجودة وتحتوى على
  `sales_order_items` و `'approval_request'`
- triggers `po_item_request_discount_approval` و
  `so_item_request_discount_approval` موجودة

## T. تجربة اعتماد PO + توجيه إشعار الخصم (v3.74.420)

ثلاث تحسينات على دورة الاعتماد:

١. **إشعار طلب اعتماد الخصم يفتح صندوق الموافقات**:
   triggers `po_request_discount_approval_trg` و
   `so_request_discount_approval_trg` كانت تنشئ الإشعار بـ
   `reference_type='purchase_order'` (أو `'sales_order'`) +
   `reference_id=<doc_id>`. الراوتر فى `lib/notification-routing.ts` كان
   يوجّه ده لصفحة المستند.
   الآن: `reference_type='approval_request'` +
   `reference_id=<discount_approval.id>` → الراوتر يوجّه لـ
   `/approvals?highlight=<id>` (صندوق الموافقات).

   إشعار **القرار** (`notify_discount_decision_trg`) لسه يوجّه لصفحة
   المستند عمداً — المنشئ مش بيعتمد، هو بيقرأ النتيجة ويمكن يحتاج يعدّل
   المستند فوراً.

٢. **Banner تحذيرى على صفحة PO**: لما `discount_value > 0` و آخر
   `discount_approval` بـ `status='pending'` أو `'rejected'`:
   - **pending** → banner أصفر مع زر "فتح صندوق الموافقات"
   - **rejected** → banner أحمر مع السبب + زر "تعديل أمر الشراء"
   - **PO بدون خصم (discount_value=0 أو null)** → ما يظهرش banner أصلاً
     (الحقل يُتجاهل والصفحة تشتغل عادى)

٣. **تعطيل زر "اعتماد"**: لو الخصم pending/rejected، الزر `disabled`
   مع `title` يشرح السبب بالعربى. زر "رفض" لسه يشتغل عادى لإن المالك
   ممكن يحب يرفض الـ PO بدون انتظار اعتماد الخصم.
   - **PO بدون خصم** → الزر شغّال عادى بدون أى تأثير.

### Section T baseline
- `po_request_discount_approval_trg` بيدخل
  `reference_type = 'approval_request'`
  (يفحص محتوى الـ function body فى `pg_proc`)
- `so_request_discount_approval_trg` نفس الشيء
- `app/purchase-orders/[id]/page.tsx` فيه `discountApproval` state +
  المرجع لـ `/approvals?highlight=` (push script grep)

## S. سد ٤ ثغرات فى دورة اعتماد الخصم (v3.74.419)

١. **اعتماد PO بعد رفض الخصم**: كان النظام يسمح. دلوقتى:
   - الخصم pending → يرفض الاعتماد ويقول "اعتمد الخصم أولاً"
   - الخصم rejected → يرفض ويقول "عدّل أمر الشراء"
   - الخصم approved → يسمح
٢. **اعتماد مزدوج للخصم على SO→Invoice**: دلوقتى trigger الفاتورة بيقرأ
   اعتماد الخصم على الـ SO المرتبط:
   - approved → ما يفتحش دورة ثانية
   - rejected → يرفض إنشاء الفاتورة بـ exception
٣. **إشعار رفض الخصم للمنشئ**: trigger جديد
   `discount_approval_notify_decision` على discount_approvals بيرسل
   إشعار للى عمل المستند مع السبب لما يتم الاعتماد أو الرفض.
٤. **Block فاتورة المبيعات من خصم مرفوض**: نفس الـ trigger فى (٢).

### Section S baseline
- function `notify_discount_decision_trg` موجود
- trigger `discount_approval_notify_decision` موجود
- `approve_purchase_order_atomic` فيه `v_last_disc_status` + يفحص rejected
- `inv_request_discount_approval_trg` يقرأ `NEW.sales_order_id`

## R'. po/so_request_discount_approval_trg يقرأ NEW.created_by اللى مش موجود (v3.74.418 — HOTFIX)

triggers v3.74.401 و v3.74.404 نسخت من bill trigger السطر التالى:
```
v_requester := COALESCE(NEW.created_by_user_id, NEW.created_by);
```
`bills` عندها الـ 2 columns. `purchase_orders` و `sales_orders`
عندهم `created_by_user_id` بس → الـ trigger كان بيرفع exception:
> record "new" has no field "created_by"

وكل الـ INSERT بيتراجع. ده ظهر للمستخدم كـ "فشل فى إنشاء أمر الشراء"
بدون سبب واضح.

تم تعديل الـ trigger ليستخدم `NEW.created_by_user_id` مباشرة بدون
fallback لعمود مش موجود.

## R. قيم enum discount_document_type (v3.74.417 — HOTFIX)

الـ enum `discount_document_type` كان فيه ٣ قيم بس:
`booking, sales_invoice, purchase_invoice`

triggers v3.74.401 و v3.74.404 بتدخل بقيمتين جديدتين:
`purchase_order, sales_order` — ودى مكنش موجودة فى الـ enum، فأى
insert من triggers دى كان بيفشل بـ HTTP 400 من Supabase REST.

اكتشف المالك المشكلة لما مسئول المشتريات حاول يعمل أمر شراء بخصم
بعد التنظيف، وقام الـ form بـ POST مباشر لـ /rest/v1/purchase_orders.

تم إضافة القيمتين بـ ALTER TYPE ADD VALUE IF NOT EXISTS.
**Section R** assert_baseline يفحص دلوقتى إن الـ 5 قيم موجودة كلها.

## Q. إصلاح SECURITY DEFINER على الفيوهات (v3.74.408 — المرحلة 1)

Supabase Security Advisor أبلغ عن 12 view من نوع `security_definer_view`.
كل view بـ SECURITY DEFINER بيقرأ بصلاحية المنشئ (يتجاوز RLS).

### المرحلة 3 — 2 فيوهات حساسة (v3.74.410):
- `v_erp_integrity_monitor` — بسيط: ALTER VIEW SET security_invoker=true.
  كل الـ 6 جداول الأصلية عندها RLS.
- `dashboard_gl_period_summary` — معقد: الجدول الأصلى MATERIALIZED
  VIEW بدون RLS. تم DROP/CREATE مع فلتر صريح:
  `WHERE company_id IN (SELECT get_user_company_ids())` + security_invoker=true.

**Section Q fingerprint** بقى يفحص:
- كل الـ 12 view عندها security_invoker=true
- نص dashboard_gl_period_summary يحتوى على get_user_company_ids
  (لو حد بدّل التعريف لاحقاً وفات الفلتر، الـ baseline يفشل)

**Supabase Security Advisor**: 12 ERROR → **0 ERROR** ✓

### المرحلة 2 — 7 فيوهات تقارير (v3.74.409):
- `v_bookings_full`
- `v_service_revenue_summary`
- `v_staff_performance`
- `v_branch_occupancy_rate`
- `v_commission_summary_by_employee`
- `v_invoices_with_cogs`
- `v_cogs_journal_entries`

كل واحد منهم بقى `security_invoker = true`. كل الجداول الأصلية
(bookings, invoices, services, branches, employees, journal_entries,
commission_*) عندها RLS مفعّل.

### المرحلة 1 — 3 فيوهات منخفضة الخطر (v3.74.408):
- `inventory_available_balance`
- `v_inventory_reservation_balances`
- `v_shared_with_me`

كل واحد منهم بقى `security_invoker = true`. الجداول الأصلية
(inventory_transactions + permission_sharing) عندها RLS مفعّل بالفعل،
فالتغيير شفّاف وآمن.

### Section Q fingerprint
الـ 3 فيوهات لازم يحافظوا على `security_invoker = true` فى reloptions.
لو DROP / CREATE من غير الـ option، الـ baseline يفشل.

### المراحل القادمة
المرحلة 2: 7 فيوهات تقارير
المرحلة 3: 2 فيوهات نظام حساسة

## P. إلغاء فاتورة المبيعات (v3.74.406)

نفس فكرة v3.74.402 لكن على ناحية المبيعات.

**عمود جديد**: `invoices.voided_by, voided_at, voided_reason`

**RPC جديدة**: `void_invoice_atomic(invoice_id, user_id, company_id, reason)`
- الشروط: status='draft' + لا مدفوعات + لا قيود محاسبية + لا حركات مخزون
- الصلاحية: owner / admin / general_manager / accountant
- الإجراءات:
  - الفاتورة تصبح `voided`
  - أى pending discount_approvals عليها يتلغى
  - **`sales_orders.invoice_id` يتمسح** لطلب المبيعات المرتبط
  - SO **status ما يتغيرش** (لإن مفيش approval workflow على SO)
  - audit log

**API**: `/api/invoices/[id]/void`

**UI**:
- زر "إلغاء" على `invoices/[id]/page.tsx` (صفحة التفاصيل)
- `app/invoices/page.tsx` (القائمة): handleDelete بقى يستدعى `/void` بدل `/delete`
- نص الـ confirm dialog محدّث

### Section P fingerprint
`void_invoice_atomic` body لازم يحتوى:
- `invoice_id = NULL` (لتحرير طلب المبيعات)
- `sales_order` (المرجع للجدول)
- `discount_approvals` (إلغاء الـ pending)
- `status = 'voided'`

## O. الموافقة على الخصم لطلب المبيعات (v3.74.404)

نفس فكرة v3.74.401 لكن على ناحية المبيعات:

- **Trigger** `so_request_discount_approval` على `sales_orders`:
  - يُنشئ صف `discount_approvals` بنوع `sales_order` لما الطلب فيه
    خصم > 0
  - يُدخل صفوف `notifications` للمالك + المدير العام + admin مباشرة
    (نفس النمط — DB trigger يدبّ الإشعارات بدون انتظار API)
- **Bypass** فى `inv_request_discount_approval_trg`:
  - يحترم أى قيمة فى `app.skip_discount_approval` (مش بس 'booking')
  - الفاتورة الـ auto-created من SO معتمد تقدر تتجنب الاعتماد المزدوج
    لو فيه RPC مستقبلى يحطّ flag = 'so'

### Section O baseline
- trigger `so_request_discount_approval` موجود على sales_orders
- نص `inv_request_discount_approval_trg` فيه `COALESCE(current_setting('app.skip_discount_approval...))` (يحترم non-empty bypass)

### الفجوة المتبقية
حالياً مفيش `approve_sales_order_atomic` RPC — يعنى مفيش gate يمنع
تحويل SO إلى Invoice قبل اعتماد الخصم. ده ممكن يتعمل فى مرحلة د
(SO → Invoice carryover) لو ظهر صراحة فى الـ flow.

## N. إلغاء الفاتورة بدل حذفها (v3.74.402 → v3.74.405)

### v3.74.405 — قائمة الفواتير كانت بتتجاوز void

كانت `app/bills/page.tsx` فيها `handleDelete` خاص بيستعمل
`supabase.from("bills").delete()` مباشرة. الزر ده على كل صف فى
الجدول، فلما المالك ضغط عليه من القائمة، الفاتورة اتمحت بدون نداء
`void_bill_atomic` — وأمر الشراء فضل فى حالة "معتمد" مع bill_id يتيم.

تم استبدال handleDelete بـ POST لـ `/api/bills/[id]/void` مطابق
لصفحة التفاصيل. الـ confirm dialog النص بقى "تأكيد إلغاء الفاتورة".

### v3.74.402 — الأصل

أى hard-delete لفاتورة بيكسر العلاقات الـ downstream:
- الـ PO المرتبط يبقى عنده bill_id يشير لفاتورة محذوفة
- الإشعارات وطلبات الموافقة على الخصم تبقى يتيمة
- لو الفاتورة دخلت أى تقرير محاسبى، الأرقام تتغير بأثر رجعى

**الحل**: استبدال زر "حذف" بزر "إلغاء" (void) — الفاتورة تبقى موجودة
بحالة `voided`، الـ PO يرجع `pending_approval` لتوليد فاتورة جديدة.

### المكونات
- **العمود الجديد**: `bills.voided_by`, `voided_at`, `voided_reason`
- **RPC جديدة**: `void_bill_atomic(p_bill_id, p_user_id, p_company_id, p_reason)`
  - تتحقق: status='draft' + لا مدفوعات
  - تضع status='voided' + تسجل voided_*
  - تلغى أى pending discount_approvals على الفاتورة
  - تحرر الـ PO: bill_id=NULL, status='pending_approval'
  - تكتب audit log
- **API**: `/api/bills/[id]/void` بدل `/delete`
- **UI**: زر "إلغاء" بدل "حذف" فى صفحة عرض الفاتورة

### Section N fingerprint
`void_bill_atomic` body يجب يحتوى:
- `bill_id = NULL` (لتحرير الـ PO)
- `pending_approval` (إعادة الـ PO للمعتمد)
- `discount_approvals` (لإلغاء الطلبات الـ pending)
- `status = 'voided'`

## M. الموافقة على الخصم لأمر الشراء (v3.74.400 → v3.74.401 → v3.74.407)

### v3.74.407 — ثغرة مدير الفرع
دالة `approve_purchase_order_atomic` كانت تسمح لـ role='manager' (مدير
الفرع) باعتماد أمر الشراء. السياسة الصحيحة: المالك + المدير العام
(general_manager) فقط. تم تصحيح:
- DB function role gate: `IN ('owner', 'general_manager')` بدل `'manager'`
- UI button فى `purchase-orders/[id]/page.tsx`: نفس التصحيح
- assert_baseline: يرفض الـ migration لو رجعت الـ string القديم

### v3.74.400 → v3.74.401

**اعتمادان منفصلان لأمر الشراء عند وجود خصم**:

1. اعتماد أمر الشراء (PO approval) — كما كان.
2. اعتماد الخصم (discount approval) — جديد على مستوى PO، يصدر له
   إشعار تلقائياً لأصحاب الصلاحية (المالك + المدير العام + admin).

### المكونات:
- **Trigger** `po_request_discount_approval` على `purchase_orders`:
  - يخلق صف `discount_approvals` بنوع `purchase_order`
  - يُدخل صفوف `notifications` للمعتمدين المعنيين (محل النقص فى
    triggers الـ booking / invoice / bill القديمة اللى ما كانتش
    تبعت إشعار)
- **Gate** فى `approve_purchase_order_atomic`:
  - يرفض اعتماد PO له خصم > 0 لو الـ discount_approval لسه pending
  - رسالة الخطأ: "افتح صندوق الموافقات واعتمد الخصم أولاً"
- **Bypass** فى `bill_request_discount_approval_trg`:
  - يحترم أى قيمة فى `app.skip_discount_approval` (مش بس 'booking')
  - الفاتورة المُنشأة من PO معتمد بتعدّى الـ trigger ده

### Section M baseline:
- trigger `po_request_discount_approval` موجود على purchase_orders
- نص `approve_purchase_order_atomic` يحتوى على gate (لا يمكن اعتماد...)
- نص `bill_request_discount_approval_trg` يقبل أى قيمة bypass

## L. سطر الخصم فى ملخص الفواتير (v3.74.399)

كل forms اللى فيها discount header (purchase-orders، bills، invoices،
sales-orders، vendor-credits) لازم تعرض سطر "الخصم" فى الملخص بين
المجموع الفرعى والضريبة، عشان الـ visible math يقفل:

```
subtotalBeforeDiscount − discount + tax + shipping + adjustment = total
```

اللى مكنش بيظهر سطر الخصم (bills/[id]/edit + باقى الـ 5)، كانت
الأرقام تبدو متناقضة (مثلاً 10 + 1.34 + 1 = 12.34 ≠ 10.94).

أى form جديد يضيف header discount لازم يضيف نفس السطر أيضاً.

## K. ترحيل الحقول من أمر الشراء للفاتورة (v3.74.398)

دالة `approve_purchase_order_atomic` بتنشئ الفاتورة تلقائياً عند
اعتماد أمر الشراء. كان فى أعمدة ناقصة فى الـ INSERT لمسة الـ bill:
`shipping_tax_rate`, `discount_position`, `tax_inclusive`,
`exchange_rate`، و على bill_items: `tax_code_id`.

النتيجة قبل الإصلاح: الـ bill بياخد القيم الافتراضية للجدول (صفر/NULL)
وتتلخبط breakdown الضرائب. مثلاً PO-0001 كان شحن=1، ضريبة الشحن=14%،
لكن BILL-0001 خزّن ضريبة الشحن=0 مع الإبقاء على tax_amount=1.34
(فيها 0.14 ضريبة شحن يتيمة).

v3.74.398 يصلح:
1. الدالة كلها CREATE OR REPLACE بنفس الـ body + الأعمدة المفقودة.
2. backfill يدوى لـ BILL-0001 من PO-0001.
3. Section K fingerprint فى assert_baseline:
   - نص دالة `approve_purchase_order_atomic` لازم يحتوى على كل العمود
     (`shipping_tax_rate`, `discount_position`, `tax_inclusive`,
     `exchange_rate`, `tax_code_id`)
   - أى migration مستقبلية تشيل عمود من القائمة هتفشل قبل التطبيق.

## J. اسم المنشئ فى إشعارات الموافقة (v3.74.397)

إشعار "طلب موافقة على أمر شراء" بيظهر اسم المُنشئ (resolved من
`employees.full_name`، fallback لـ `company_members.email`)، عشان
المالك / المدير العام يقدر يحدد طالب الموافقة من قائمة الإشعارات
مباشرة بدون فتح الـ PO. الـ field اسمه `createdByName` على
`PurchaseOrderApprovalRequestNotificationParams` (اختيارى للـ
backwards compatibility).

نفس النمط مطلوب فى أنواع إشعارات الموافقة الأخرى:
- BankVoucherNotificationService (وصل approve)
- PaymentApprovalNotificationService
- BookingNotificationService
- PurchaseReturnNotificationService
- WriteOffNotificationService
- InventoryTransferNotificationService

التطبيق على باقى الخدمات: TODO فى migrations مستقبلية لو المالك طلب.

## I. حساب الإجماليات الموحد (v3.74.395 → v3.74.396)

### v3.74.396 — تفريق صريح بين عرض UI وحفظ DB

كل form بيتعامل مع items + خصم + ضريبة لازم يحسب الإجماليات عبر
`lib/document-totals.ts → computeDocumentTotals(input)`. الـ utility ده
بيضمن:

- لو `discount_position = "before_tax"`: الخصم يقلل الـ taxable base،
  والضريبة تعاد حسابها على الـ base المنخفض.
- لو `discount_position = "after_tax"`: الضريبة على كامل الـ subtotal،
  والخصم يتطرح من الـ after-tax total.
- لو `discountValue = 0`: الفرق بين الموضعين = 0 (regression guard).
- يعتنى بـ `tax_inclusive` (السعر يشمل الضريبة).

self-tests داخل الملف بترفع warnings فى dev mode لو contracts الأرقام
انكسرت. أى form يضيف حقل discount_position فى المستقبل لازم يستعمل
الـ utility ده — مش يعمل implementation محلية.

**Forms مُربوطة دلوقتى**:
purchase-orders/new + /[id]/edit، bills/[id]/edit، invoices/new + /[id]/edit،
sales-orders/new + /[id]/edit، vendor-credits/new.

**v3.74.396**: تفريق مهم بين عرض الـ UI وحفظ DB:
- `totals.subtotal` → الـ POST-discount value (للـ DB save؛ يحافظ على
  الـ convention القديم: INV-0011 خزّن 1500 = 1600 lines − 100 discount).
- `totals.subtotalBeforeDiscount` → الـ PRE-discount value (للـ UI
  display؛ يخلى المعادلة البصرية تتجمع: subtotal − discount + tax = total).
- self-test جديد فى `lib/document-totals.ts` يلزم الـ UI breakdown
  يقفل رياضياً.

## H. ربط الضريبة بصفحة الضرائب (v3.74.394 — v3.74.403)

### v3.74.403 — توسعة لـ المبيعات
العمود `tax_code_id` اتضاف على باقى جداول البنود:
- `invoice_items`, `sales_order_items`, `vendor_credit_items`
- `estimate_items`, `customer_debit_note_items`

Section H assert_baseline يفحص الـ 7 جداول كلها + أى صف مرتبط بـ
`tax_codes` لازم rate الـ snapshot يساوى rate الـ master.

الـ UI Component `TaxCodeSelect` (من v3.74.394) موصول الآن فى:
purchase-orders + bills + invoices + sales-orders + vendor-credits.

### v3.74.394 — المرحلة الأصلية

كل صف فى `purchase_order_items` و `bill_items` لازم يكون له عمود
`tax_code_id` (UUID مرجع لـ `tax_codes(id)` ON DELETE SET NULL). أى صف
مربوط بـ tax_code: قيمة `tax_rate` لازم تساوى `tax_codes.rate` المرتبط.
الـ UI الموحّد عبر `<TaxCodeSelect>` (components/forms/tax-code-select.tsx)
يقرأ من DB (مش localStorage) عبر `lib/taxes.ts → listTaxCodes`.

**المراحل القادمة (نفس Section H تتوسّع):** sales orders + invoices →
returns + credit notes → product/service tax defaults.

## G. اتساق عمود quantity_on_hand مع الـ ledger (v3.74.393)

كل منتج فيزيائى (مش خدمة): قيمة `products.quantity_on_hand` لازم تساوى
مجموع `inventory_transactions.quantity_change` لنفس المنتج. أى انحراف =
خطأ — الـ ledger هو مصدر الحقيقة. ده اتضاف بعد ما اكتشفنا VitaSlims
كان فيه 4 وحدات معلقة فى العمود ده بدون أى حركة فى الـ ledger.

## F. سلامة بيانات لكل شركة

`assert_baseline()` يستدعى `run_all_integrity_checks()` على كل شركة، ويعتبر
صفوف `severity='error'` blocking. تشمل (ليست حصراً):

- `ic_trial_balance` — Trial balance balanced
- `ic_ar_balance` / `ic_ap_balance` — رصيد ذمم العملاء/الموردين متطابق
- `ic_cogs_balance` — COGS عام = مجموع `cogs_transactions`
- `ic_inventory_gl_vs_fifo` — GL المخزون = مجموع `fifo_cost_lots`
- `ic_negative_stock` / `ic_negative_assets` — لا أرصدة سالبة
- `ic_unbalanced_journals` / `ic_orphaned_journals` / `ic_duplicate_journals`
- `ic_branch_isolation` — حدود الفرع محترمة
- `ic_fx_amount_accuracy` — العملات الأجنبية مضبوطة
- `ic_payment_double_allocation` — لا تخصيص مزدوج للمدفوعات
- (~50 فحص اجمالاً — كاملة فى `pg_proc` تحت `ic_*`)

## كيف نضيف عقد جديد

1. اعمل migration جديدة كالعادة (مثلاً v3.74.395 تضيف policy جديدة على جدول x).
2. افتح `supabase/migrations/2026.._v3_74_392_integrity_baseline.sql`، ضيف
   فحص الـ contract الجديد فى نفس `assert_baseline()` و `baseline_report()`.
3. ضيف سطر هنا فى الجدول المناسب.
4. شغّل `SELECT assert_baseline();` بعد التطبيق للتأكد أن العقد الجديد
   يمر، وإن باقى العقود السابقة لسه شغالة.

النتيجة: بدل ما نعتمد على ذاكرتى عبر 50+ migration، عندنا فحص ذاتى
يجرى بدقائق ويقول صراحة "هذا الـ contract اللى اتكسر".
