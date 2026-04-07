# Phase 1C Production Remediation Runbook

هذا الـrunbook خاص بمرحلة `Phase 1C` بعد ثبوت أن فجوة الاعتماد الحالية ناتجة من:

- بيئة deployment غير مكتملة لـ V2 RPCs
- غياب الفترات المحاسبية
- تضخم FIFO مقابل GL

الهدف هنا ليس تغيير دورة البيع أو العقود، بل جعل البيئة والبيانات متسقة مع التصميم المؤسسي الذي تم بناؤه في Phase 1.

## 1. Deployment Integrity

هذا الجزء لا يمكن إتمامه من داخل workspace الحالي إذا لم يتوفر واحد من الآتي:

- `exec_sql` RPC فعّال
- اتصال Postgres مباشر
- `supabase` CLI مع مشروع linked فعليًا

### الخطوات المطلوبة

1. افتح `Supabase SQL Editor`.
2. طبّق الملف:
   `supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql`
3. بعد نجاح التطبيق نفّذ:

```sql
NOTIFY pgrst, 'reload schema';
```

4. أعد تشغيل:

```powershell
npm run phase1c:deployment
```

### Definition of Done

- `require_open_financial_period_db` reachable من الـAPI layer
- `assert_journal_entries_balanced_v2` reachable من الـAPI layer
- `process_invoice_payment_atomic_v2` reachable من الـAPI layer

## 2. Financial Period Correction

هذه الخطوة additive وآمنة إذا لم تكن هناك فترات موجودة أصلًا.

### Dry Run

```powershell
$env:PHASE1B_COMPANY_ID='9c92a597-8c88-42a7-ad02-bd4a25b755ee'
npm run phase1c:periods
```

### Apply

```powershell
$env:PHASE1B_COMPANY_ID='9c92a597-8c88-42a7-ad02-bd4a25b755ee'
$env:PHASE1C_APPLY='1'
npm run phase1c:periods
```

### ملاحظات

- السكربت ينشئ periods شهرية فقط.
- إذا وجد periods قائمة بالفعل، سيتوقف افتراضيًا.
- إذا لزم تجاوز ذلك بعد مراجعة overlap يدويًا، استخدم:

```powershell
$env:PHASE1C_APPLY='1'
$env:PHASE1C_FORCE='1'
npm run phase1c:periods
```

### Definition of Done

- `0` معاملات خارج الفترات على المصادر الأساسية:
  `invoices`, `payments`, `journal_entries`, `bills`, `sales_returns`, `purchase_returns`

## 3. Inventory vs GL Reconciliation

لا يُنصح بتشغيل legacy path:

- `backfill_fifo_lots_from_bills`
- `apply_fifo_consumption_from_invoices`
- `full_repair`

على البيانات الحية الحالية بدون dry-run جديد، لأن مسار الاستهلاك القديم غير idempotent، وقد يعيد خصم lots موجودة بالفعل أو يضاعف التشوه.

### Dry Run

```powershell
$env:PHASE1B_COMPANY_ID='9c92a597-8c88-42a7-ad02-bd4a25b755ee'
npm run phase1c:inventory
```

### ماذا يخرج السكربت

- القيمة الحالية لـ `GL Inventory`
- القيمة الحالية لـ `FIFO`
- تفكيك GL حسب `reference_type`
- مقارنة `products.quantity_on_hand` مع `inventory_transactions`
- مقارنة `products.quantity_on_hand` مع `fifo_cost_lots.remaining_quantity`
- Dry-run لإعادة بناء FIFO زمنيًا من:
  opening stock + bills + invoices + returns + adjustments
- كشف أي fallback cost مع `COST_FALLBACK_USED`

### القرار المؤسسي الصحيح

إذا أظهر التقرير أن:

- `products.quantity_on_hand` متسق مع `inventory_transactions`
- لكن `fifo_cost_lots` متضخم

فهذا يعني أن الحقيقة التشغيلية موجودة أصلًا في الحركات، وأن المطلوب ليس “backfill إضافي”، بل:

1. بناء FIFO rebuild ذري ومخصص
2. تشغيله على dry-run
3. اعتماد audit trail
4. بعدها فقط تمرير قيد GL reconciliation مستقل ومدقق

## 4. Validation Gate Re-Run

بعد إصلاح deployment + periods، وبعد اعتماد خطة المخزون:

```powershell
$env:PHASE1B_COMPANY_ID='9c92a597-8c88-42a7-ad02-bd4a25b755ee'
npm run phase1b:prechecks
npm run phase1b:postchecks
npm run phase1b:accounting-validation
npm run phase1b:performance
```

ثم فقط:

```powershell
npm run phase1b:side-by-side
npm run phase1b:trace-audit
npm run phase1b:failure-sim
```

## 5. Expected Outcome

Phase 1 يقترب من الاعتماد فقط عندما تتحقق الشروط التالية معًا:

- V2 RPCs reachable من الـAPI
- لا توجد معاملات خارج الفترات
- لا يوجد `inventory mismatch`
- `accounting-validation` نظيف
- اختبارات trace وfailure ناجحة

