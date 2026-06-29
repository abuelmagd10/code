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
