## Phase 2B.3

هذه المرحلة تشغل أول `consolidation dry_run` فعلي على جداول Phase 2B.2 بدون أي `group posting`.

### الترتيب

1. شغّل التحقق من جاهزية الـschema:

```bash
npm run phase2b3:migration
```

2. إذا كانت البيئة تسمح بالتطبيق عبر `exec_sql` وأردت المحاولة من السكربت:

```bash
PHASE2B3_APPLY=1 npm run phase2b3:migration
```

3. بعد تأكيد الجداول والأعمدة، شغّل أول dry-run:

```bash
npm run phase2b3:dry-run
```

### المتغيرات المدعومة

- `PHASE1B_COMPANY_ID`: الشركة المضيفة.
- `PHASE2B3_HOST_COMPANY_ID`: override للشركة المضيفة.
- `PHASE2B3_GROUP_ID`: group محددة بدل auto-resolution.
- `PHASE2B3_ENTITY_IDS`: قائمة `legal_entity_id` مفصولة بفواصل لتشغيل partial consolidation.
- `PHASE2B3_PERIOD_START`
- `PHASE2B3_PERIOD_END`
- `PHASE2B3_AS_OF`
- `PHASE2B3_RATE_SET_CODE`
- `PHASE2B3_RATE_SOURCE`
- `PHASE2B3_RATE_OVERRIDES_JSON`: JSON map مثل `{"USD->EGP": 49.5}`.
- `ERP_PHASE2B_DRY_RUN_MAX_ENTITIES`
- `ERP_PHASE2B_DRY_RUN_MAX_LINES`

### ما الذي يتم التحقق منه

- جاهزية migration والجداول الجديدة
- Trial balance correctness لكل كيان
- FX translation correctness بدون fallback صامت
- Elimination correctness مع mismatch alerts
- Statement consistency للـBalance Sheet وP&L
- Audit trace من بداية run إلى نهايتها
- Performance baseline للـdry-run

### مخرجات التقارير

كل التشغيلات تُكتب إلى:

- `reports/phase2b3/*-phase2b3-migration-apply-plan.json`
- `reports/phase2b3/*-phase2b3-dry-run-validation.json`

### ملاحظات تشغيلية

- الوضع الافتراضي دائمًا `dry_run`.
- لا يتم إنشاء `consolidation_book_entries` في هذه المرحلة.
- أي `commit_run` أو posting رسمي يظل مؤجلًا إلى Phase 2B.4.
