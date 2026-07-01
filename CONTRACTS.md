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

## BI. اسم المعدّل فى إشعار reapproval + Amendment Banner على عرض المستند (v3.74.462)

### الفجوة

الإشعار "فاتورة مشتريات بانتظار الاعتماد الإدارى — BILL-0001 تحتاج
إعادة اعتماد" ما بيقولش:
- **مين عدّل**
- **ايه اللى اتغيّر**

ولما المالك يفتح الإشعار → عرض الفاتورة، مفيش سياق تعديل أصلاً.

### الحل

**١. Trigger `enforce_governance_on_insert`**:
- يحلّ اسم المعدّل: `last_edited_by_user_id → employees.full_name →
  auth.users.email → uuid prefix`
- يبنى ملخّص التغييرات: الإجمالى قبل/بعد، الشحن قبل/بعد، الخصم اتغيّر،
  شاملة الضريبة، موضع الخصم
- ينتج رسالة زى:
  > قام foodcana1976@gmail.com بتعديل فاتورة مشتريات رقم BILL-0001
  > وتحتاج إلى إعادة اعتماد إداري.
  > التغييرات: الإجمالى 45.60 → 145.60، الشحن 0.00 → 100.00

**٢. الـ trigger اتضاف كمان على `invoices`** (كان bills فقط) — نظير
كامل للمبيعات.

**٣. UI**: مكوّن `BillAmendmentBanner`:
- بيقرأ `/api/discount-approvals?document_id=` (فلتر جديد v3.74.462)
- بيلاقى آخر pending approval فيه `supersedes_approval_id`
- بيعرض: **مين عدّل، متى، الفرق فى الإجمالى + بنود مضافة/محذوفة/معدلة
  + لينك للـ /approvals**
- بيتخفى تلقائياً لو المستخدم مش approver
- بيتركّب على `bills/[id]/page.tsx` + `invoices/[id]/page.tsx`

### Section BI baseline
- `enforce_governance_on_insert` rewrite
- `governance_trigger_invoices` — trigger جديد
- API filter جديد `document_id`

## BH. Amendment Diff Card على كارت الاعتمادات (v3.74.461)

### المشكلة اللى بيحلّها

بعد v3.74.458، أى تعديل material على فاتورة draft بيلغى الـ approval
ويفتح جديد. لكن المالك على /approvals كان بيشوف الإجمالى الجديد فقط —
مش بيشوف قبل ولا بعد بالتفصيل. ثغرة أخيرة قبل production: ممكن المحاسب
يغيّر بند بأسعار مختلفة والمالك يعتقد إنه تعديل شحن فقط.

### التغييرات على DB

على `discount_approvals`:
- `supersedes_approval_id` — ربط الطلب الجديد بالسابق
- `items_snapshot` jsonb — لقطة البنود عند الاعتماد
- `shipping_snapshot / adjustment_snapshot / tax_amount_snapshot / subtotal_snapshot` numeric

Triggers:
- `bill_amendment_reset_approval_trg` (v3.74.458) — يلقط id السابق فى
  `app.superseded_approval_id` قبل الإلغاء
- `bill_request_discount_approval_trg` — يقرأ الـ session var ويلقط
  الـ snapshots من `bill_items` + الحقول المالية
- نفس الاتنين على `invoice_amendment_reset_approval_trg` +
  `inv_request_discount_approval_trg`

### API

`/api/discount-approvals` GET يرجع:
- الأعمدة الجديدة كلها
- `prior_approval` (لو `supersedes_approval_id` موجود) — snapshots
  الطلب السابق

### UI

component جديد `AmendmentDiffCard` على `/approvals/page.tsx`:
- جدول قبل/بعد لـ subtotal, shipping, tax, adjustment, total
- قوائم منفصلة: بنود مضافة (أخضر)، محذوفة (أحمر)، معدلة (كهرمانى)
- الحقول اللى ما تغيرتش تظهر باهتة، اللى اتغيرت highlighted

### Section BH baseline
- 4 columns + 1 index على discount_approvals
- 4 function bodies (bill amendment + request, invoice amendment + request)

## BG. قبول pending_approval + rejected كحالات قابلة للتعديل (v3.74.460)

### الفجوة

الـ 4 triggers `bill/invoice_(item_)protect_posted_trg` كانت رافضة
أى تعديل على مستند حالته مش بالظبط `draft` أو `voided`. لكن
`pending_approval` معناها "المحاسب حفظ، الـ v3.74.458 amendment guard
فتح دورة اعتماد، والمالك لسه ما اعتمدش". ولا حاجة اترحلت للـ ledger.

**السيناريو المكسور**: المحاسب عدّل الشحن فى BILL-0001 (draft) → save
نجح، لكن الـ status اتحول pending_approval. حاول يعدّل تانى → **رفض**
"لا يمكن تعديل بنود فاتورة منشورة".

### الحل

الـ editable whitelist اتوسع فى الـ 4 triggers:
- **قبل**: `('draft', 'voided')`
- **بعد**: `('draft', 'voided', 'pending_approval', 'rejected')`
- الـ invoice كمان يقبل `'cancelled'`

الحالات المقفولة فعلاً: `posted`, `paid`, `partially_paid`, `sent`.

### Section BG baseline
- 4 function rewrites: bill_protect_posted, bill_item_protect_posted,
  invoice_protect_posted, invoice_item_protect_posted

## BF. sync_bill/invoice ما يعدلش totals على PO/SO المعتمد (v3.74.459)

### الفجوة

المحاسب حاول يعدّل BILL-0001 draft (اختبار v3.74.458). الحفظ رفض بـ:
> "لا يمكن تعديل الخصم أو الإجماليات على أمر شراء معتمد. اعمل void
> للفاتورة المرتبطة لإعادة فتح الدورة."

**السبب**: `sync_bill_to_purchase_order_safe` كان بيحاول يـ UPDATE على
`purchase_orders.subtotal / tax_amount / total` كل ما الفاتورة تتعدل.
الـ `po_protect_approved_trg` (v3.74.425) رفض التعديل — وده الصح.

### مبدأ التصميم

الـ PO/SO totals هى baseline اعتمدها المالك. تعديلات الفاتورة/الفاتورة
مبيعات ما تنقلش للـ parent. لو الفاتورة نفسها اتعدلت، v3.74.458 بيلغى
approval الفاتورة ويفتح دورة جديدة. الـ PO يفضل زى ما اعتمده المالك.

### الحل

`sync_bill_to_purchase_order_safe` + `sync_invoice_to_sales_order_safe`
اتعادلوا ليعكسوا فقط:
- `status` (مسار الفوترة/الدفع)
- `returned_amount` / `return_status` (من المرتجعات)

**اتشال**: subtotal + tax_amount + total.

### Section BF baseline
- 2 function rewrites

## BE. حماية شاملة لتعديل الفاتورة draft — أى تعديل يفتح دورة اعتماد (v3.74.458)

### الفجوة الأوسع

بعد v3.74.457 (position + tax_inclusive)، لسه فيه ثغرات كتير:
| الحقل | كان محمى؟ |
| --- | --- |
| shipping | ❌ |
| shipping_tax_rate | ❌ |
| adjustment | ❌ |
| tax_amount | ❌ |
| subtotal | ❌ |
| total_amount | ❌ |
| currency_code / exchange_rate | ❌ |
| supplier_id / customer_id | ❌ |
| bill_items / invoice_items | ❌ |

المحاسب يقدر يفتح فاتورة draft مربوطة بـ PO معتمد، يغيّر الشحن من
0 لـ 500، يحفظ، ويرحّل — بدون اعتماد. الإجمالى النهائى مختلف عن اللى
المالك وافق عليه.

### الحل

**4 triggers جديدة**:

1. `bill_amendment_reset_approval` (BEFORE UPDATE bills)
   - يتحقق من الـ 9 حقول المذكورة أعلاه
   - أى change → يلغى الـ discount_approval الحالى (approved أو pending)
2. `invoice_amendment_reset_approval` (BEFORE UPDATE invoices) — نفس
   الشى للمبيعات
3. `bill_item_amendment_reset_approval` (AFTER INS/UPD/DEL bill_items)
   - أى تعديل بند فى bill draft → إلغاء approval
4. `invoice_item_amendment_reset_approval` (AFTER INS/UPD/DEL invoice_items)

بعد الـ cancel، الـ `bill_request_discount_approval_trg` (v3.74.424 +
v3.74.457) بيفتح approval جديد pending تلقائياً على الـ save التالى.
الـ post-gate (v3.74.424) بيرفض الترحيل لحد ما الجديد يعتمد.

### skip flag

الـ auto-create path من `approve_purchase_order_atomic` بيسِت
`app.skip_discount_approval='po'` فترة الإنشاء. كل الـ 4 triggers
بتحترم الـ flag، فالإنشاء التلقائى مش هيتأثر.

### Section BE baseline
- 4 functions + 4 triggers على bills/invoices/bill_items/invoice_items

## BD. توسيع change detection لـ discount_position + tax_inclusive (v3.74.457)

### الفجوة

المحاسب يقدر يفتح فاتورة draft ويقلب "شاملة الضريبة" أو ينقل الخصم
من قبل الضريبة لبعدها بدون دورة اعتماد. الـ "no change" shortcut فى
`bill_request_discount_approval_trg` كان يقارن `discount_value` و
`discount_type` فقط.

### الحل

الـ shortcut اتوسع ليقارن `discount_position` و `tax_inclusive` كمان.
أى تعديل فى الاتنين يخرج من الـ shortcut ويفتح دورة اعتماد جديدة. نفس
الشى فى `inv_request_discount_approval_trg` للمبيعات.

## BC. Bill/Invoice discount API يفحص linked PO/SO approval (v3.74.456)

### الفجوة

المحاسب فتح BILL-0001 (متولّد تلقائياً من PO معتمد الخصم) ووجد
warning:
```
هذا الخصم يحتاج اعتماد ولم يتم إرساله بعد
قيمة الخصم: 10.00%
احفظ الفاتورة مرة أخرى لإرسال طلب الاعتماد تلقائياً.
```

**السبب**: `/api/bills/[id]/discount-approval` كان يستعلم فقط على
`discount_approvals` بـ `document_type='purchase_invoice'`. لما الفاتورة
تُنشأ من PO عبر `approve_purchase_order_atomic`، بيتم set skip flag
وما بينشأش صف approval على مستوى الفاتورة (لأن الـ PO مغطى بالفعل).
النتيجة: الـ API يرجع `gate='blocked_no_request'` والـ banner يفصح
عن warning خطأ.

نفس الفجوة موجودة فى `/api/invoices/[id]/discount-approval` للفواتير
المتولّدة من SO.

### الحل

الـ API يفحص الـ parent (PO أو SO):
- لو `bill.purchase_order_id` موجود، اجلب آخر `discount_approval`
  للـ PO
- **PO approved** → `gate='open'` + عرض معلومات الاعتماد من الـ PO
- **PO rejected** → `gate='blocked_rejected'`
- **PO pending** → `gate='blocked_pending'`
- غير كده → الرجوع للمنطق القديم على مستوى الفاتورة

نفس المنطق للـ invoice ↔ SO.

**مش بنقارن type/value**: لأن الـ evaluator بيخزّن كـ 'amount' بينما
الـ bill/PO row بيحتفظ بـ 'percent'. الـ `bill_request_discount_approval_trg`
(v3.74.424) بيفرض المطابقة عند الكتابة، والـ banner يعكس الحالة الحالية
فقط.

### Section BC baseline
لا فحوصات DB. تعديل API فقط.

## BB. أرشفة broadcast لما يوصل targeted accountant_action (v3.74.455)

بعد v3.74.454، المحاسب لسه كان بيشوف كارتين للـ BILL-0001:
- broadcast "تنتظر اعتمادك" (approvals, null assignee)
- targeted "تحتاج إجراء" (accountant_action, assigned)

الـ dedup فى v3.74.454 يشترط `assigned_to_user` متطابق (أو
null-safe)، فالاتنين ما اتدمجوش.

**الإصلاح**: `notification_supersede_older_approval_trg` بقى، لما
targeted `accountant_action` يوصل لـ bill/invoice، يؤرشف كمان أى
broadcast لسه unread فى category `approvals` عن نفس المستند.

منطقياً: الـ broadcast معناه "حد يهتم بالفاتورة دى". لما المحاسب
اتاجرلوه إشعار مخصص، الـ broadcast بيبقى noise لكل approver — مش
محتاجينه.

One-shot UPDATE أرشف الـ backlog الموجود فى شركة تست.

مفيش baseline check جديد — Section BA بيفحص نص الـ trigger كامل.

## BA. Cross-category dedup لإشعارات المستخدم الواحد (v3.74.454)

### الحدث

بعد اعتماد PO-0001، المحاسب استقبل ٢ إشعار عن نفس الفاتورة:
1. **"فاتورة مشتريات جديدة — تَنتَظِر اعتمادك"** — category=`approvals`
   (broadcast من app-side بعد اعتماد PO)
2. **"فاتورة مشتريات جديدة تحتاج إجراء"** — category=`accountant_action`
   (من `bill_notify_accountant_trg` فى v3.74.429)

الاتنين عن نفس الـ bill وعن نفس المحاسب. v3.74.452 كانت بتـ match
بالـ category بالظبط، فالاتنين تعايشوا معاً.

### الحل

`notification_supersede_older_approval_trg` أصبح:
- **لو assigned_to_user موجود**: dedup **cross-category** بين
  `approvals` + `accountant_action` + `branch_activity` لنفس الـ
  (reference_type, reference_id, assigned_to_user). المستخدم يشوف
  كارت واحد لكل مستند.
- **لو broadcast (null)**: dedup داخل نفس الـ category فقط. فبرودكاست
  approval جديد ما يمسحش برودكاست branch_activity منفصل.

### One-shot cleanup

طبّق cross-category dedup على الإشعارات الموجودة. المحاسب دلوقتى
كارت واحد فقط.

### Section BA baseline
- نص `notification_supersede_older_approval_trg` يحتوى على
  `accountant_action` و `branch_activity`
- `PERFORM public.assert_baseline_v3_74_454_check()` مضاف لـ
  `assert_baseline`

## AZ. عرض خصم البنود منفصلاً فى بطاقة معلومات PO **و SO** (v3.74.453)

### الفجوة

بطاقة "معلومات الأمر" على صفحة عرض PO كانت بتعرض `discount_value`
(الخصم على مستوى المستند) فقط. لو الـ PO فيه خصم بنود (على كل صف
منفرد `discount_percent`)، ما بيظهرش. المالك بيشوف "خصم 10%" ويفتكر
دى القيمة الكاملة، لكن الحقيقة إن فيه خصم مخفى فى البنود.

هذا مربك:
- إجمالى الأمر ما بيتطابقش مع الحسبة اللى فى دماغ المالك
- الاعتماد فى الحقيقة على **مجموع** الخصمين (v3.74.421)، والمالك ما بيشوفش المجموع

### الحل

إضافة سطر منفصل فى financial breakdown:

- **خصم البنود** — بيتحسب من الـ items:
  `Σ (quantity × unit_price × discount_percent / 100)`
- **الخصم العام** — الـ `discount_value` (مع موضعه قبل/بعد الضريبة)

كلاهما يظهر إذا كانت قيمته > 0. المالك دلوقتى يشوف الصورة كاملة.

### التوضيح فى النص

الـ label القديم كان "الخصم" (غامض). دلوقتى:
- "خصم البنود (على كل صنف)"
- "الخصم العام (قبل/بعد الضريبة)"

### شامل PO و SO

نفس البطاقة أُضيفت على `/sales-orders/[id]` — كانت بتعرض total فقط
بدون financial breakdown أصلاً. دلوقتى تعرض: subtotal, خصم البنود,
الخصم العام, tax, shipping, ثم الإجمالى.

### Section AZ baseline
لا فحوصات DB. تعديل UI على PO view و SO view.

## AY. أرشفة إشعارات الاعتماد المتراكمة (v3.74.452)

### الحدث

المالك شاف ١٠ إشعارات "طلب اعتماد" لنفس PO. مسئول المشتريات كان
بيعدّل الـ PO عدة مرات، كل تعديل بيفتح دورة خصم جديدة + بيبعت
notification لإعادة الاعتماد. الإشعارات القديمة كانت بتفضل عند
`status='unread'` وتراكمت.

### الحل — ٣ triggers

**(A) `discount_approval_archive_notifications`** على `discount_approvals`
AFTER UPDATE OF status:
- لما discount_approval يخرج من pending (لـ approved/rejected/cancelled)
- كل الإشعارات الخاصة بيه (reference_type='approval_request') بتتحول
  لـ status='archived'

**(B) `notification_supersede_older_approval`** على `notifications`
AFTER INSERT:
- لما إشعار approvals-category جديد يوصل لـ tuple:
  `(company_id, reference_type, reference_id, assigned_to_user)`
- كل إشعار أقدم (unread) بنفس الـ tuple يتحول لـ archived
- Broadcasts (assigned_to_user NULL) متعامل معاها بـ IS NOT DISTINCT FROM

**(C) `discount_approval_cascade_notifications`** على
`discount_approvals` BEFORE DELETE:
- لو discount_approval اتحذف (cascade من PO delete، admin، ...)،
  الإشعارات المرتبطة بتنمحى
- يمنع الأيتام (اللى ظهرت مع v3.74.451 لسبب ترتيب DELETE)

### One-shot cleanup

- أرشفت الإشعارات القديمة لـ discount_approvals non-pending
- أرشفت الـ stacked approval notifications (احتفظت بأحدث واحد لكل tuple)
- مسحت الأيتام (notifications بدون discount_approval صالح)

### النتيجة العملية

المالك دلوقتى بيشوف **إشعار واحد فقط** لكل PO يحتاج اتخاذ قرار.
لا تراكم لا حيرة.

### Section AY baseline
- functions الـ 3 موجودين
- triggers الـ 3 مفعّلين على `discount_approvals` (2) و `notifications` (1)
- `PERFORM public.assert_baseline_v3_74_452_check()` مضاف لـ assert_baseline

## AX. منع حذف المستندات الحركية المُعتمَدة + cleanup الأيتام (v3.74.451)

### الحدث

مسئول المشتريات ضغط زر الحذف من قائمة أوامر الشراء على PO كان دخل
دورة اعتماد + خصم مرفوض → الحذف نجح. النتائج:
- 1 صف `discount_approvals` يشير لـ PO مش موجود
- 4 إشعارات يتيمة (reference_id لـ PO محذوف)
- audit_logs عنده سجل الحذف (بس الوحيد اللى نجى)

هذا لو حصل فى الإنتاج بيكسر:
- صفحة `/approvals` (الكارت بيشير لمستند مش موجود)
- الـ history (لا يمكن تتبع القرار)
- reports وترابط البيانات

### الحل

**Cleanup فورى**: DELETE للـ orphans (discount_approvals + notifications
اللى reference_id بيشير لمستند غير موجود).

**Trigger `transactional_document_delete_gate`** BEFORE DELETE على
٤ جداول: `purchase_orders`, `sales_orders`, `bills`, `invoices`:
- **status = 'draft'** → cascade-delete الـ discount_approvals
  والـ notifications المرتبطة بالمستند، بعدها يسمح بالـ DELETE
- **أى حالة أخرى** → RAISE بالعربية:
  ```
  لا يمكن حذف [أمر الشراء/طلب المبيعات/فاتورة المورد/فاتورة العميل]
  بحالة "[status]". استخدم "إلغاء" أو "void" بدلاً من الحذف للحفاظ
  على سجل التدقيق.
  ```

**UI**: الـ `canDelete` prop على `<OrderActions>` بقى:
```
canDelete: permDelete && row.status === 'draft'
```
زر الحذف يختفى تماماً على المستندات غير draft. للـ /purchase-orders
و /sales-orders.

### Section AX baseline
- function `transactional_document_delete_gate_trg` موجودة
- trigger `transactional_document_delete_gate` على الجداول الـ ٤
- `PERFORM public.assert_baseline_v3_74_451_check()` مضاف لـ assert_baseline

## AW. مؤشر رفض/انتظار الخصم فى قائمة أوامر البيع (v3.74.450)

### الغرض

نظير v3.74.449 على `/sales-orders`. المالك ذكّر: "لا ننسى أوامر
البيع أيضاً".

### الحل

**API** (`app/api/sales-orders/route.ts`): بعد جلب الـ SOs، batch
query لـ `discount_approvals` بـ document_type='sales_order' و
`document_id IN (soIds)`. آخر قرار خصم يضاف كـ
`discount_approval_status` على كل صف.

**قائمة `/sales-orders`**: نفس badges v3.74.449:
- rejected → أحمر "⚠ الخصم مرفوض"
- pending → أصفر "الخصم قيد الاعتماد"

يظهر فى الحالتين: SO بفاتورة أو بدون.

### Section AW baseline
لا فحوصات DB. تعديل UI + enrichment API فقط.

## AV. مؤشر رفض/انتظار الخصم فى قائمة أوامر الشراء (v3.74.449)

### الفجوة

بعد v3.74.448 (تعديل PO مع خصم مرفوض ممكن)، المالك اقترح: عند رفض
الخصم، القائمة `/purchase-orders` لسه بتعرض الحالة كـ "قيد الموافقة"
فقط. مسئول المشتريات والمالك محتاجين يشوفوا **من القائمة** إن الخصم
مرفوض (أو قيد الاعتماد) عشان يعرفوا يفتحوا أى PO يحتاج إجراء بدون
فتح كل واحد لوحده.

### الحل

**API** (`app/api/v2/purchase-orders/route.ts`): بعد جلب الـ POs،
batch query لـ `discount_approvals` بـ document_type='purchase_order' و
`document_id IN (poIds)`. آخر قرار خصم لكل PO يضاف كـ
`discount_approval_status` (pending / approved / rejected / cancelled / null).

**نوع `PurchaseOrder`** فى `types/database.ts` يضم الحقل الجديد.

**قائمة `/purchase-orders`**: تحت الـ StatusBadge (فى الصف):
- `discount_approval_status === 'rejected'` → badge أحمر **"⚠ الخصم مرفوض"**
- `discount_approval_status === 'pending'` → badge أصفر **"الخصم قيد الاعتماد"**
- غير كده (null / approved / cancelled) → لا badge إضافى

الـ indicator يظهر فى الحالتين — مع الفاتورة المرتبطة أو بدونها.

### قائمة المبيعات

المبيعات ما عندهاش API v2 مماثل، فمؤجل. لو المالك احتاج نفس الـ
indicator فى `/sales-orders`، نعمله فى إصدار لاحق.

### Section AV baseline
لا فحوصات DB. تعديل UI + enrichment API فقط.

## AU. HOTFIX تعديل PO/SO بعد رفض الخصم (v3.74.448)

### الفجوة

المالك اكتشف السيناريو أثناء الاختبار: مسئول المشتريات أنشأ PO بخصم →
بعت للاعتماد → المالك رفض الخصم → إشعار للمنشئ "عدّل المستند لفتح
دورة موافقة جديدة" → لكن لما ضغط "تعديل أمر الشراء"، الصفحة ظهرت
**"وضع القراءة فقط"** ومفيش تعديل ممكن.

**السبب**: الـ hook `checkPurchaseOrderPermissions` كان بيسمح
بالتعديل بس لما `status` هو `'draft'` أو `'rejected'`. لكن الـ PO
عنده status = `'pending_approval'` (الخصم اللى مرفوض، مش الـ PO
نفسه). فمسئول المشتريات معلّق فى halt state — لا يقدر يعدّل ولا يقدر
يعيد التقديم.

### الحل

`checkPurchaseOrderPermissions` و `checkSalesOrderPermissions` بقوا
يفحصوا آخر `discount_approval` للمستند لما الحالة `pending_approval`.
لو آخر قرار خصم = `rejected`، الـ hook يعامل المستند كـ `rejected`
لأغراض التعديل — يسمح للمنشئ يعدّل ويحفظ.

عند الحفظ:
- `po_evaluate_discount_approval` (v3.74.421) بيفتح دورة اعتماد خصم
  جديدة تلقائياً
- المالك يراجع الخصم الجديد → يعتمد → يقدر يعتمد الـ PO كامل

### لماذا فى الـ hook فقط (وليس DB)

الـ DB triggers من v3.74.425 (`po_protect_approved`) ما بترفضش تعديل
`pending_approval` — بس تحمى `approved` و ما فوق. فالمشكلة كانت UI-only.
الـ hook هى source of truth للـ `canEdit` state.

### Section AU baseline
لا فحوصات DB (تعديل UI فقط). التحقق يحصل يدوياً فى الاختبار.

## AT. Sync member.seat_number مع seat_license.assigned_user_id (v3.74.447)

### الفجوة

نفس المعلومة مسجّلة فى مكانين:
- `company_seat_licenses.assigned_user_id` — المستخدم على المقعد ده
- `company_members.seat_number` — المقعد اللى الموظف قاعد عليه

الاتنين المفروض mirror. لما تخصيص يحصل عن طريق واحد من المسارات
غير-الرسمية (admin SQL، migration، coupon، تدخل يدوى)، الاتنين
يخرجوا من التزامن. الـ UI بيقرأ من `company_members.seat_number`
ولو NULL بيعرض الموظف "على مقعد -1 / محظور" حتى لو الـ license
مخصصة له فعلاً.

اكتشفها المالك على شركة تست: بعد إعادة التفعيل اليدوى، مسئول
المشتريات كان بيظهر مقعد -1 + مقعد 1 فى نفس الوقت.

### الحل

**Trigger `sync_company_member_seat_number`** على
`company_seat_licenses`:
- AFTER INSERT / UPDATE OF assigned_user_id / DELETE
- عند تغيير `assigned_user_id`: يمسح seat_number للأسّائى القديم،
  يضبطه للجديد
- عند الحذف: يمسح seat_number للأسّائى السابق

**One-shot reconciliation**: UPDATE يعالج أى drift موجود قبل تركيب
الـ trigger (بما فيه drift شركة تست).

### التحقق (round-trip)

```
1) unassign seat #1 → member.seat_number becomes NULL ✓
2) reassign seat #1 → member.seat_number becomes 1    ✓
```

### Section AT baseline
- function `sync_company_member_seat_number_trg` موجودة
- trigger `sync_company_member_seat_number` مفعّل على
  `company_seat_licenses`
- `PERFORM public.assert_baseline_v3_74_447_check()` مضاف لـ
  `assert_baseline`

## AS. Billing E2E fixes + docs (v3.74.446)

### الغرض

آخر إصدار فى سلسلة الـ billing. تنفيذ 7-scenario walkthrough على DB
كشف baguen، وتوثيق شامل فى `docs/billing.md`.

### الـ Bugs المكتشفة والمُصلحة

**Bug A**: `notifications.created_by` هو NOT NULL، لكن
`notify_company_billing_owner` (v3.74.442) كان بيمرر NULL. أول ما cron
اشتغل، الـ INSERT بيفشل. **Fix**: قراءة `companies.user_id` (المالك)
واستخدامه كـ created_by. لو المالك NULL، fallback للـ receiver.

**Bug B**: trigger `company_seat_license_auto_reactivate` (v3.74.443)
كان يشترط `OLD.expires_at <= NOW()` قبل ما ينادى الـ reactivate. لو
Paymob جدّد مقعد ما زال فيه صلاحية (تجديد قبل ٤٨ ساعة من الانتهاء،
coupon grant على مقعد فعّال...) الـ trigger ما يشتغلش، والشركة تفضل
payment_failed. **Fix**: يشتغل لما expires_at يتحرك للأمام (أى مقدار)،
مش لازم OLD يكون منتهى.

### التحقق

E2E walkthrough سبع سيناريوهات على شركة تست:

```
PASS 1/7: T-7 reminder sent
PASS 2/7: T-3 reminder sent
PASS 3/7: T-1 reminder sent
PASS 4/7: past_due auto-transition + past_due_at auto-stamped
PASS 5/7: suspended after grace + suspended_at auto-stamped
PASS 6/7: write gate refused new PO with Arabic message
PASS 7/7: seat renewal auto-reactivated the company
```

snapshot بيترجع تلقائياً فى نهاية الاختبار — الشركة تست ما بيتأثر عليها.

### التوثيق

`docs/billing.md` — reference كامل للـ lifecycle:
- خريطة الحالات والوصول والانتقالات
- شرح الـ cron والـ ٥ خطوات
- الـ write gate آلية عمله
- Payment flow الكامل (Paymob → webhook → seats → auto-reactivate)
- Manual reactivation fallback
- قائمة "ما ممكن يغلط" مع الـ fixes التاريخية

### Section AS baseline
لا فحوصات إضافية — الفحوصات الموجودة فى AO/AP/AQ/AR تغطى الإصلاحات.

### اكتمال سلسلة الـ billing

`v3.74.442 → v3.74.446` كاملة. النظام دلوقتى production-ready:
- ✓ إشعارات تلقائية قبل الانتهاء (7/3/1 يوم)
- ✓ Grace period حقيقى (7 أيام قابل للتخصيص لكل plan)
- ✓ Read-only mode بدل الحظر الكامل
- ✓ Auto-reactivation عبر paymob webhook أو manual
- ✓ E2E verified
- ✓ Documentation

## AR. Paymob audit fixes (v3.74.445)

### الفجوتان

**١. past_due_at ما بيتعبيش**: الـ webhook TS code
(`handlePaymentFailed`) بيحوّل status لـ past_due لكن **بدون تعبية**
past_due_at. النتيجة: `daily_billing_check` من v3.74.442 محتاج
past_due_at ليحسب نهاية فترة السماح — لو مش موجود، الشركة تفضل
past_due للأبد ومطلقاً ما تنتقل لـ suspended.

**٢. Spelling mismatch**: الـ TS بيكتب `'canceled'` (US)،
`can_write_to_company` من v3.74.444 بيفحص `'cancelled'` (UK). شركة
كنسل ستفضل عندها write access لأن الفحص خطأ.

### الحل (DB level بدون تعديل الـ TS)

**Trigger `companies_subscription_status_transitions`** على
`companies` BEFORE UPDATE OF subscription_status:
- انتقال لـ `past_due` والـ past_due_at NULL → يتعبى بـ NOW()
- انتقال لـ `payment_failed` والـ suspended_at NULL → يتعبى بـ NOW()
- انتقال لـ `active` → مسح past_due_at و suspended_at + تسجيل
  reactivated_at

يشتغل من كل المسارات: webhook TS، cron، admin يدوى.

**can_write_to_company** بقى يقبل الـ ٢ spellings
(`'cancelled'` و `'canceled'`).

### التحقق

Round-trip test فى DB:
```
1. Set status='past_due' (بدون past_due_at)
   → trigger يعبى past_due_at تلقائياً ✓
2. Set status='active'
   → past_due_at و suspended_at اتمسحوا + reactivated_at اتسجل ✓
```

### Section AR baseline
- function `companies_subscription_status_transitions_trg` موجودة
- trigger `companies_subscription_status_transitions` مفعّل
- `can_write_to_company` يحتوى على `'cancelled'` و `'canceled'`
- `PERFORM public.assert_baseline_v3_74_445_check()` مضاف لـ assert_baseline

## AQ. Read-only mode للاشتراك الموقوف (v3.74.444)

### الفجوة

الحالة القديمة: `subscription_status='payment_failed'` = شاشة كاملة
"مقعدك غير مدفوع" — بدون أى وصول لبيانات الشركة، ولا يقدر يصدّر، ولا
يقدر يراجع الفواتير القديمة. الطريقة الوحيدة للخروج = ticket دعم.

سيئ للثقة، خصوصاً فى فترة السماح لما المالك بيعمل دفع.

### الحل

خريطة جديدة للحالات:

| subscription_status | الوصول |
| --- | --- |
| `active` | كامل read/write |
| `past_due` | كامل + reminders + banner (فترة السماح) |
| `payment_failed` | **read-only**: SELECTs تشتغل، INSERTs جديدة ترفض |
| `cancelled` | نفس payment_failed |

### التطبيق

**Helper** `can_write_to_company(company_id)`: يرجع `false` لـ
payment_failed و cancelled.

**Trigger مشترك** `subscription_write_gate` (BEFORE INSERT) مرفق على
كل الجداول الحركية الرئيسية:
- purchase_orders, sales_orders
- bills, invoices
- payments
- purchase_returns, sales_returns
- manufacturing_production_orders, manufacturing_bom_versions,
  manufacturing_routing_versions
- manufacturing_material_issue_approvals,
  manufacturing_product_receive_approvals

جداول البنود (items) محمية ضمنياً — الأب لو اترفض، البنود ما يوصلوش.

**UPDATE على الصفوف الموجودة مسموح**: المالك يقدر يخلص شغله الجارى.
INSERTs جديدة فقط اللى محظورة.

### الرسالة

```
الاشتراك موقوف بسبب فشل الدفع. الوصول للقراءة فقط.
جدّد الاشتراك من /settings/billing لاستعادة الوصول الكامل.
```

الـ trigger من v3.74.443 يفعّل الشركة تلقائياً بعد تجديد المقاعد،
وبكده الـ gate يبطل يُطلق تلقائياً.

### Section AQ baseline
- function `can_write_to_company` موجودة وتفحص payment_failed + cancelled
- function `subscription_write_gate_trg` موجودة
- trigger `subscription_write_gate` مفعّل على كل الـ 12 جدول
- `PERFORM public.assert_baseline_v3_74_444_check()` مضاف لـ assert_baseline

## AP. Self-service reactivation (v3.74.443)

### الفجوة

`renew_seat_licenses` كان بيمدد صلاحية المقاعد لكن ما بيلمسش
`companies.subscription_status`. المالك اللى دفع لتجديد مقاعده كان
يفضل معلّق (past_due أو payment_failed) بدون طريقة يرجع بها للحالة
النشطة إلا بتدخل يدوى من الدعم.

### الحل

**RPC `reactivate_company_subscription(company_id, performed_by)`**:
- يشترط مقعد فعّال واحد على الأقل (expires_at > NOW())
- يحوّل `subscription_status='active'`، يمسح `suspended_at` و
  `past_due_at`، يمدّد `current_period_end` لأبعد expires_at بين
  المقاعد الفعّالة
- يعيد ضبط الـ `reminder_*_sent_at` عشان الدورة الجديدة تبدأ نظيفة
- يعيد `company_seats.status='active'`
- يبعت إشعار للمالك بـ category=billing

**Trigger `company_seat_license_auto_reactivate`** على
`company_seat_licenses` AFTER UPDATE OF expires_at:
- لما expires_at ينتقل من الماضى للمستقبل والشركة past_due/payment_failed
  → ينادى الـ RPC تلقائياً
- **بهذا الشكل paymob webhook يشتغل بدون تعديل**: webhook يستدعى
  renew_seat_licenses → الـ trigger يفعّل الشركة بدون كود إضافى

**API endpoint `POST /api/billing/reactivate`** (owner only):
Manual fallback للحالات الاستثنائية (coupon grants قبل الإصدار،
تدخلات DB مباشرة، إجراءات الدعم).

### Section AP baseline
- function `reactivate_company_subscription` موجودة ومحتوية على
  فحص `no_active_seats`
- function `company_seat_license_auto_reactivate_trg` موجودة
- trigger `company_seat_license_auto_reactivate` مفعّل على الجدول
- `PERFORM public.assert_baseline_v3_74_443_check()` مضاف لـ
  assert_baseline

## AO. Grace period + auto reminders للاشتراك (v3.74.442)

### الفجوة

المالك اكتشف إن شركة تست انعلّقت (suspended) لما الدفعة فشلت — بدون
تنبيه سابق، بدون grace period، وبدون طريقة self-service للتجديد. لو
ده حصل لعميل حقيقى، هيقعد يوم كامل بدون وصول لبياناته.

الحالة قبل الإصلاح:
- `renewal_reminder_sent_at` عمود موجود لكن مفيش حاجة تعبّيه
- `mark_subscription_past_due` و `suspend_subscription` موجودين
  لكن كانوا يُستدعوا يدوياً (مفيش cron)
- مفيش grace period بين past_due والتعليق
- المالك ما بيعرفش الاشتراك قرّب ينتهى إلا لما يتعلّق فعلاً

### الحل

**Schema**: 5 أعمدة جديدة:
- `companies.past_due_at` — timestamp دخول past_due
- `companies.reminder_7d_sent_at` / `_3d_` / `_1d_` — منع تكرار الإرسال
- `subscription_plans.grace_period_days` (افتراضى 7)

**Helper `notify_company_billing_owner`**: يبعت إشعار `billing` category
لكل owner/GM/admin للشركة. reference_type='subscription'.

**Cron `daily_billing_check()`**:
يشتغل يومياً 06:00 UTC (09:00 Cairo) عبر pg_cron. يعالج ٥ transitions:

١. **T-7**: `subscription_status='active'` و`period_end` بعد 6-8 أيام
   و `reminder_7d_sent_at IS NULL` → إشعار "سينتهى بعد ٧ أيام"
٢. **T-3**: نفس المنطق لـ 2-4 أيام → إشعار "بعد ٣ أيام"
٣. **T-1**: 0-30 ساعة → إشعار "غداً"
٤. **Mark past_due**: `period_end < NOW()` و status='active' → UPDATE
   `subscription_status='past_due'`, `past_due_at=NOW()`,
   يبعت إشعار "دخلت فترة السماح"
٥. **Suspend**: `status='past_due'` و
   `past_due_at + grace_period_days < NOW()` → استدعاء
   `suspend_subscription()`، إشعار "تم تعليق الاشتراك"

كل الـ transitions idempotent (الـ *_sent_at columns تمنع التكرار).

### Section AO baseline
- ٤ أعمدة reminder على companies + past_due_at
- عمود grace_period_days على subscription_plans
- functions `daily_billing_check` و `notify_company_billing_owner` موجودين
- cron job `daily_billing_check` مفعّل
- `PERFORM public.assert_baseline_v3_74_442_check()` مضاف لـ assert_baseline

## AN. استكمال manufacturing_product_receive_approvals (v3.74.440)

### الفجوة

الجدول كان عنده schema كامل (status, approved/rejected by/at,
rejection_reason) والـ API routes تشتغل (approve, reject،
request-product-receive). لكن:

- مفيش triggers على الجدول → الـ owner/GM ما يعرفوش بأى طلب جديد
- مدير الفرع أعمى عن نشاط استلام الإنتاج فى فرعه
- مفيش حضور لقرارات الـ product_receive فى السجل الموحد

### الحل

**Trigger إشعار اعتماد** `product_receive_notify_approval`:
يبعت إشعار للمالك + GM عند طلب جديد بحالة `pending`، يوجّه لـ
/approvals بـ reference_type='approval_request'.

**Trigger FYI لمدير الفرع** `product_receive_branch_manager_notify`:
- عند إنشاء طلب جديد
- عند تغيير الحالة لـ approved أو rejected

**UI**: السجل الموحد فى /approvals (v3.74.435) دلوقتى يقرأ
`manufacturing_product_receive_approvals` بحالة approved/rejected
ويعرضها تحت chip فلتر **"استلام إنتاج"** بأيقونة CheckCircle2.

### Section AN baseline
- function `product_receive_notify_approval_trg` موجودة
- function `product_receive_branch_manager_notify_trg` موجودة
- trigger `product_receive_notify_approval` موجود على الجدول
- trigger `product_receive_branch_manager_notify` موجود على الجدول
- `PERFORM public.assert_baseline_v3_74_440_check()` مضاف لـ
  `assert_baseline`

## AM. جدول approval_history + RPCs (v3.74.439)

### الفجوة

`lib/manufacturing/approval-history.ts` بينادى على:
- RPC `record_approval_action` (لتسجيل كل approve/reject/submit)
- RPC `get_approval_history` (لعرض الـ timeline على صفحات BOM/Routing/PO/MI)
- Direct query على جدول `approval_history` (فى `getNextCycleNo`)

**كل ده غير موجود فى DB**. الـ helper عنده try/catch صامت
فالاستدعاءات كانت بتفشل فى الخفاء — كل operation محاسبى مرّ بدون
audit trail.

### الحل

**جدول `approval_history`**:
```sql
id uuid PK
company_id uuid FK companies
reference_type text CHECK (bom_version/routing/production_order/material_issue/product_receive)
reference_id uuid
cycle_no int CHECK >= 1
action text CHECK (submitted/re_submitted/approved/approved_management/
                   approved_warehouse/rejected/rejected_management/
                   edit_triggered_reapproval/cancelled)
actor_id uuid FK auth.users (ON DELETE SET NULL)
actor_role text
reason text
snapshot_data jsonb
branch_id uuid FK branches
created_at timestamptz DEFAULT NOW()
```

**Indexes**:
- `(company_id, reference_type, reference_id, cycle_no)` — primary lookup
- `(company_id, reference_type, reference_id, cycle_no DESC)` — لـ getNextCycleNo
- `(company_id, created_at DESC)` — لـ audit feeds مستقبلاً

**RLS**: أعضاء الشركة يقرأوا ويكتبوا (الـ RPCs SECURITY DEFINER فيكتبوا
تحت service role، لكن `getNextCycleNo` يستعلم مباشرة). ما فيش
UPDATE/DELETE policies — events خالدة.

**RPCs**:
- `record_approval_action(company_id, ref_type, ref_id, cycle_no, action, actor_id, actor_role, reason, snapshot_data, branch_id)` → `uuid`
- `get_approval_history(company_id, ref_type, ref_id)` → `TABLE(...)`

### النتيجة

الـ API routes فى التصنيع (`bom-versions/[id]/approve`,
`routing-versions/[id]/reject`, `production-orders/[id]/submit-approval`،
إلخ.) كلها بتنادى `recordApprovalAction(...)` بعد كل operation. دلوقتى
الـ RPC حقيقى — كل قرار تصنيع له سجل مرئى.

صفحة `/api/manufacturing/approval-history?reference_type=...&reference_id=...`
بقت ترجع البيانات الحقيقية بدل array فاضى.

### Section AM baseline
- جدول `approval_history` موجود بكل أعمدته الـ ١١
- RPCs `record_approval_action` و `get_approval_history` موجودين
- RLS policy `approval_history_select` مفعّل
- `PERFORM public.assert_baseline_v3_74_439_check()` مضاف لـ assert_baseline

## AL. دورة اعتماد أوامر الإنتاج (v3.74.438)

### الفجوة

نفس فجوة v3.74.437 لكن على `manufacturing_production_orders`. الكود
كان بيستعلم على `approval_status` غير موجود، وبينادى ٣ RPCs
(`submit_production_order_for_approval_atomic`,
`approve_production_order_atomic`, `reject_production_order_atomic`)
كلها غير موجودة فى DB.

### الحل

نفس النمط بالظبط:

١. **Schema**: ٨ أعمدة + CHECK constraint
   (`draft/pending_approval/approved/rejected`) + backfill: أى أمر
   إنتاج قديم بحالة released/in_progress/completed/cancelled بقى
   `approval_status='approved'` (grandfathered).

٢. **Transition helper** `mpo_is_order_approval_transition_allowed` +
   **Guard trigger** `mpo_guard_production_order_approval_transition`:
   - يرفض الانتقالات الغير مسموحة
   - **يفرض إن `status='released'`** (من 'draft') لا يمكن إلا لو
     `approval_status='approved'`

٣. **٣ RPCs** بـ signatures مطابقة للـ API routes:
   - `submit_production_order_for_approval_atomic` (أى عضو شركة)
   - `approve_production_order_atomic` (owner / general_manager)
   - `reject_production_order_atomic` (owner / general_manager)

٤. **Triggers إشعارات**:
   - `production_order_notify_approval` — owner + GM لما الأمر يدخل
     pending_approval
   - `production_order_branch_manager_notify` — مدير الفرع FYI عند
     الإنشاء + عند القرار

### UI

السجل الموحد فى /approvals بقى يجمع أوامر الإنتاج تحت chip "أوامر
الإنتاج" بـ Factory icon. الـ /approvals tab "أوامر الإنتاج" (الـ
pending) هيشتغل الآن بعد ما كان بيرجع 400.

### Section AL baseline
- ٨ أعمدة approval موجودة
- ٧ functions موجودة (helper + guard + 3 RPCs + 2 notify)
- ٣ triggers موجودة
- نص `approve_production_order_atomic` يحتوى على
  `'owner', 'general_manager'`
- `PERFORM public.assert_baseline_v3_74_438_check()` مضاف لـ assert_baseline

## AK. دورة اعتماد مسارات التصنيع (v3.74.437)

### الفجوة

كل الكود (UI + API + helpers) مكتوب على افتراض إن
`manufacturing_routing_versions` عندها أعمدة approval (`approval_status`,
`submitted_by/at`, `approved_by/at`, `rejected_by/at`, `rejection_reason`)
والـ RPCs موجودة. الواقع: الجدول عنده `status` فقط، والـ RPCs غير
موجودة. الـ /approvals كانت ترجع HTTP 400 على routing versions، وأى
ضغطة submit/approve/reject من API ترجع "function does not exist".

### الحل (الكامل)

١. **Schema**: إضافة الـ ٨ أعمدة + CHECK على
   `approval_status IN (draft, pending_approval, approved, rejected)`
   + backfill يتعامل مع الـ routing versions القديمة بحالة active كـ
   approved (grandfathered).

٢. **Transition helper** `mr_is_routing_version_approval_transition_allowed`
   يحدد الانتقالات المسموحة. **Guard trigger**
   `mr_guard_routing_version_approval_transition` يرفض الانتقالات
   الغلط ويفرض إن `status='active'` لا يمكن إلا لو
   `approval_status='approved'`.

٣. **٣ RPCs** بـ signatures مطابقة للى الـ API routes الموجودة
   بتنادى عليها:
   - `submit_routing_version_for_approval_atomic` (أى عضو الشركة)
   - `approve_routing_version_atomic` (owner / general_manager فقط)
   - `reject_routing_version_atomic` (owner / general_manager فقط)

٤. **Triggers إشعارات**:
   - `routing_version_notify_approval` — owner + GM يوصلهم إشعار لما
     النسخة تدخل pending_approval، يوجّه لـ /approvals
   - `routing_version_branch_manager_notify` — مدير الفرع يوصله FYI
     عند الإنشاء + عند الاعتماد/الرفض

### الواجهة

السجل الموحد فى /approvals (v3.74.435) دلوقتى بيقرأ routing_versions
بحالة approved/rejected ويعرضها تحت chip "مسارات التصنيع" بـ Icon
`GitMerge`.

الـ API routes الموجودة من قبل (approve/reject/submit-approval)
هتشتغل تلقائياً لإن الـ RPCs اللى بتنادى عليها بقت موجودة.

### Section AK baseline
- ٨ أعمدة approval موجودة على `manufacturing_routing_versions`
- ٧ functions موجودة (1 transition helper + 1 guard + 3 RPCs + 2 notify)
- ٣ triggers موجودة
- نص `approve_routing_version_atomic` يحتوى على
  `'owner', 'general_manager'` (role gate)
- `PERFORM public.assert_baseline_v3_74_437_check()` مضاف لـ assert_baseline

## AJ. HOTFIX getActiveCompanyId import فى /approvals (v3.74.436)

### الثغرة

v3.74.435 ضافت `loadHistory` تستدعى `getActiveCompanyId(supabase)`
بدون import — هو helper server-side فى `@/lib/company` ولا يجوز
import-ه فى client component. الـ tsc رفع:
```
error TS2304: Cannot find name 'getActiveCompanyId'.
```

### الحل

الـ `load()` القديم فى نفس الصفحة بيستخدم cookie parsing:
```ts
document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
```

استخدمت نفس النمط فى `loadHistory` للتناسق وبدون imports
server-side.

## AI. سجل موحّد لكل أنواع الاعتمادات (v3.74.435)

### التوسعة على v3.74.434

v3.74.434 قدّمت سجل للخصومات فقط. المالك سأل عن سجل لكل أنواع
الاعتمادات فى صفحة `/approvals`. الإصدار ده يوحّد التاريخ فى feed
واحد مع فلتر بالنوع.

### الأنواع المدعومة الآن
- **الخصومات** (`discount_approvals`) — كل الحالات النهائية:
  approved/rejected/cancelled
- **قوائم المواد** (`manufacturing_bom_versions`) — approved/rejected
- **طلبات الصرف** (`manufacturing_material_issue_approvals`) —
  approved/rejected

### غير مدعوم (سبب)
- **مسارات التصنيع** (`manufacturing_routing_versions`): الجدول مش
  عنده أعمدة approval (مفيش `approved_by` / `decided_at`)، والـ
  fetch الـ pending موجود فى الصفحة كان بيستعلم على
  `approval_status` عمود غير موجود → الـ approval flow أصلاً مش
  مكتمل لهذا النوع.
- **أوامر الإنتاج** (`manufacturing_production_orders`): نفس المشكلة
  للأعمدة الأساسية. الجدول عنده status بس.

لو احتاج المالك يضيف approval حقيقى لهذه الأنواع لاحقاً، نضيف
schema migration + loader فى السجل.

### كيفية العمل

**نوع `UnifiedHistoryEntry`** يطبّع كل أنواع القرارات فى shape واحد:
`category`, `doc_label`, `party_label`, `value_label`, `status`,
`requested_by_email`, `requested_at`, `decided_by_email`,
`decided_at`, `decision_note`, `doc_href`.

**`loadHistory()`** يستدعى ٣ مصادر بالتوازى (try/catch مستقل لكل
واحد فى حالة فشل أحدهم):
- `/api/discount-approvals?status=all` (الخصومات، مع إيميل القرار)
- `supabase.from('manufacturing_bom_versions').in('status',...)` (BOM)
- `supabase.from('manufacturing_material_issue_approvals').in(...)` (MI)

ثم يدمج ويرتب تنازلياً بـ `decided_at` (fallback لـ `requested_at`).

**فلتر بالـ chips فى أعلى السجل**:
الكل / خصومات / قوائم المواد / طلبات الصرف — كل chip يعرض count.

**`UnifiedHistoryCard`** يرسم القرار مع:
- Badge بالحالة (أخضر/أحمر/رمادى) + Badge بالنوع
- Icon مخصصة (Percent/Layers/Package حسب النوع)
- اسم المنشئ + التاريخ، المعتمد/الرافض + تاريخ القرار
- السبب لو موجود
- رابط للمستند الأصلى (لو متاح)

### Section AI baseline
لا فحوصات DB إضافية. تعديلات UI + API فقط.

## AH. سجل قرارات الخصم فى صندوق الموافقات (v3.74.434)

### الفجوة

صندوق الموافقات `/approvals` كان يعرض الطلبات المعلقة فقط. لما المالك
يعتمد أو يرفض خصم، الكارت يختفى ويروح بدون أثر مرئى للمراجعة لاحقاً.
السجل الكامل موجود فى DB (`discount_approvals` بحالاته الـ ٤
pending/approved/rejected/cancelled) لكن المالك ما عندوش طريقة
يطّلع عليه من الواجهة.

### الحل

تاب جديد فى الصفحة اسمه **"السجل"** يعرض كل قرارات الخصم السابقة
(approved/rejected/cancelled) بترتيب تاريخى تنازلى (الأحدث أولاً).

**التغييرات**:

١. **API** (`app/api/discount-approvals/route.ts`):
   - الـ enrichment الموجود كان بيجيب إيميل `requested_by` فقط
   - بقى يجيب إيميل `decided_by` كمان (للسجل التاريخى)
   - الـ status=all موجود من الأصل، تم استخدامه

٢. **UI** (`app/approvals/page.tsx`):
   - نوع جديد `HistoricalDiscountApproval extends PendingDiscountApproval`
     يضيف `decided_by`, `decided_at`, `decision_note`, `decided_by_email`
   - `HistoryCard` component على module-level (لتفادى bug الـ focus
     فى v3.74.432)
   - زر تاب جديد "السجل" مع counter
   - تحميل lazy: السجل ما يتحملش إلا أول ما المستخدم يفتح التاب
   - زر "تحديث السجل" لإعادة التحميل
   - الكارت يعرض: نوع المستند، رقمه، الطرف، إجمالى المستند، قيمة الخصم،
     badge حالة (أخضر معتمد / أحمر مرفوض / رمادى ملغى)، المنشئ + التاريخ،
     المعتمد/الرافض + التاريخ، السبب لو موجود، رابط للمستند الأصلى

### Section AH baseline
- لا فحوصات DB إضافية (تعديل UI + API فقط)
- الـ `decision_note` و `decided_by` كانوا موجودين قبلاً، الإصلاح بيستخدمهم

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
