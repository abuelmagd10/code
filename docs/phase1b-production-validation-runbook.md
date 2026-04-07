# Phase 1B Production Validation Runbook

هذا الـrunbook هو بوابة الاعتماد الفعلي لـ Phase 1. الهدف منه إثبات أن تفعيل V2 يتم بدون كسر دورة البيع الحالية، وبدون downtime، ومع trace مالي كامل وقابل للتدقيق.

## المبادئ

- لا تغيّر ترتيب دورة البيع: `Sales Order -> Draft Invoice -> Post -> Warehouse Approval -> Payment -> Return`
- جميع feature flags تبدأ `OFF`
- التفعيل يتم تدريجيًا، ولا تنتقل للخطوة التالية قبل نجاح السابقة
- لا يتم حذف V1 أو تعطيله نهائيًا داخل هذه المرحلة

## المتطلبات قبل البدء

- وجود نسخة احتياطية من قاعدة البيانات أو نقطة استعادة معتمدة
- التأكد من وجود فترة مالية مفتوحة للشركة المستهدفة
- تجهيز `PHASE1B_COMPANY_ID` إذا كانت قاعدة البيانات تحتوي أكثر من شركة
- تجهيز `PHASE1B_SCENARIOS_FILE` و`PHASE1B_FAILURE_SCENARIOS_FILE` ببيانات اختبار مسيطر عليها
- تجهيز `PHASE1B_USER_ACCESS_TOKEN` فقط إذا سيتم اختبار `process_supplier_payment_allocation`

## 1. Pre-Migration

نفّذ التحقق المبدئي من التطبيق:

```bash
npm run phase1b:prechecks
```

ونفّذ مراجعة SQL المباشرة عند الحاجة:

`[pre-migration-checks.sql](C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase1b/sql/pre-migration-checks.sql)`

ما يجب أن ينجح:

- توجد فترة مالية مفتوحة لليوم الحالي
- لا توجد `orphan invoices`
- لا توجد تواريخ فواتير خارج أي فترة مالية
- فرق `Inventory GL vs FIFO` ضمن tolerance مقبول

## 2. Migration Execution

طبّق migration التالية:

`[20260406_002_enterprise_financial_phase1_v2.sql](C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql)`

قواعد التنفيذ:

- التطبيق additive only
- لا يوجد rename أو drop للعقود الحالية
- لا يتطلب downtime
- بعد التطبيق تبقى feature flags جميعها `OFF`

بعد التطبيق مباشرة نفّذ:

```bash
npm run phase1b:postchecks
```

ويمكن دعم ذلك بفحص SQL:

`[post-migration-checks.sql](C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase1b/sql/post-migration-checks.sql)`

ما يجب أن ينجح:

- trace tables موجودة
- الـguard وbalance RPC smoke checks تعمل
- البيئة ما زالت على V1 افتراضيًا

## 3. Controlled Activation

التفعيل يكون بهذا الترتيب فقط:

1. `ERP_PHASE1_V2_INVOICE_POST=true`
2. `ERP_PHASE1_V2_WAREHOUSE_APPROVAL=true`
3. `ERP_PHASE1_V2_PAYMENT=true`
4. `ERP_PHASE1_V2_RETURNS=true`

بين كل خطوة والخطوة التالية نفّذ:

```bash
npm run phase1b:side-by-side
npm run phase1b:trace-audit
npm run phase1b:accounting-validation
```

إذا فشل أي gate:

- أعد flag الحالي إلى `false`
- لا تغيّر schema
- لا توقف النظام
- استمر على V1 للمسار المتأثر

## 4. Side-by-Side Verification

جهّز ملف السيناريوهات:

`[scenarios.example.json](C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase1b/scenarios.example.json)`

ثم شغّل:

```bash
npm run phase1b:side-by-side
```

السيناريوهات الإلزامية:

- `invoice_payment`
- `invoice_warehouse_payment`
- `partial_payment`
- `sales_return_full`
- `sales_return_partial`

معيار النجاح:

- نفس النتائج وظيفيًا: حالات الفاتورة، المدفوع، المرتجع، warehouse status
- الفروق المقبولة فقط داخل المحاسبة الداخلية والتتبع

## 5. Accounting Validation Gate

```bash
npm run phase1b:accounting-validation
```

المطلوب أن تكون النتيجة:

- لا يوجد `duplicate journals`
- لا يوجد `missing COGS`
- لا يوجد `unbalanced entries`
- لا يوجد `inventory mismatch`

## 6. Audit Trace Proof

```bash
npm run phase1b:trace-audit
```

ما يجب إثباته:

- وجود trace row لكل حدث مالي ملتزم
- وجود source link إلى الفاتورة
- وجود event-specific links مثل `payment`, `journal_entry`, `sales_return`, `third_party_inventory`
- عدم وجود `dangling traces`

## 7. Failure Simulation

جهّز ملف:

`[failure-scenarios.example.json](C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase1b/failure-scenarios.example.json)`

ثم شغّل:

```bash
npm run phase1b:failure-sim
```

ما يجب إثباته:

- فشل `warehouse approval` لا يترك أي أثر جزئي
- فشل `sales return` لا يترك أي أثر جزئي
- فشل `supplier payment allocation` لا يترك أي أثر جزئي

## 8. Performance Sanity

```bash
npm run phase1b:performance
```

السكربت يقيس بصورة sanity check:

- `require_open_financial_period_db`
- `assert_journal_entries_balanced_v2`
- FIFO summary query
- financial trace lookup
- lifecycle snapshot timing لسيناريوهات المقارنة

## 9. تقرير الاعتماد

Phase 1 يعتبر مكتملًا فقط إذا توفرت التقارير التالية:

- تقرير `prechecks`
- تقرير `postchecks`
- تقرير `side-by-side`
- تقرير `accounting-validation`
- تقرير `trace-audit`
- تقرير `failure-simulation`
- تقرير `performance-check`

وتحفظ جميعها في:

`[reports/phase1b](C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/reports/phase1b)`

## 10. Rollback Safety

الرجوع إلى V1 يتم فقط عبر feature flags:

- `ERP_PHASE1_V2_INVOICE_POST=false`
- `ERP_PHASE1_V2_WAREHOUSE_APPROVAL=false`
- `ERP_PHASE1_V2_PAYMENT=false`
- `ERP_PHASE1_V2_RETURNS=false`

الضمانات:

- لا حاجة إلى schema rollback
- لا يوجد downtime
- تبقى البيانات الجديدة additive وقابلة للقراءة
