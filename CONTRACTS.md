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
