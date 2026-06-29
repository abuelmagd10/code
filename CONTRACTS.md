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

## H. ربط الضريبة بصفحة الضرائب (v3.74.394 — المرحلة 1)

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
