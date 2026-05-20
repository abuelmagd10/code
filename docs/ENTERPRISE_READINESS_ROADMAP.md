# 🌍 Enterprise Readiness Roadmap — ERB VitaSlims ERP
## خارطة الطريق نحو ERP بمستوى المؤسسات العالمية

| الحقل | القيمة |
|---|---|
| **Document ID** | ERR-2026-05-001 |
| **Version** | 1.0 |
| **Date** | 2026-05-18 |
| **Owner** | Project Lead — أحمد |
| **Classification** | Internal — Strategic Planning |
| **Audience** | C-Level, Tech Lead, External Auditors, Investors |
| **Status** | DRAFT — Awaiting Sign-off |
| **Supersedes** | `docs/ENTERPRISE_ERP_AUDIT_REPORT.md` (2026-02-21) |
| **Related** | `GOVERNANCE.md`, `ERP_COMPLIANCE_AUDIT.md`, `CHANGELOG.md` v3.0.0 |

---

## 📑 Table of Contents

1. [Executive Summary — الملخص التنفيذى](#1-executive-summary)
2. [Target Definition — ما يعنيه Enterprise-Grade](#2-target-definition)
3. [12-Dimension Maturity Matrix — مصفوفة النضج](#3-maturity-matrix)
4. [Current State Assessment — تقييم الحالة الحالية](#4-current-state)
5. [Gap Analysis — تحليل الفجوات](#5-gap-analysis)
6. [Phase Roadmap — خارطة المراحل](#6-phase-roadmap)
7. [Success Criteria & KPIs — معايير النجاح](#7-success-criteria)
8. [Governance Operating Model — نموذج التشغيل](#8-governance-model)
9. [Risk Register — سجل المخاطر](#9-risk-register)
10. [Compliance Mapping — التوافق مع المعايير](#10-compliance-mapping)
11. [Findings Catalog — كاتالوج الاكتشافات](#11-findings-catalog)
12. [Appendices — الملاحق](#12-appendices)

---

<a name="1-executive-summary"></a>
## 1. Executive Summary — الملخص التنفيذى

### 1.1 الموقف اليوم

نظام **ERB VitaSlims ERP** هو نظام تخطيط موارد مؤسسة متطور، مبنى على معمارية حديثة (Next.js + Supabase/Postgres + RLS + RPC) مع قاعدة محاسبية سليمة (Double-Entry, FIFO, GL as SoT, COGS). المشروع وصل إلى نقطة فاصلة:

- **القلب المحاسبى:** ✅ سليم ومُختبر
- **الحوكمة الأساسية:** ✅ مُطبَّقة (RBAC, Branch Defaults, Approval Workflows v3.0.0)
- **التغطية الوظيفية:** ✅ شاملة (Sales, Purchase, Inventory, Manufacturing, HR, Bookings, Multi-Currency)
- **التوثيق:** ✅ غنى (200+ مستند)

### 1.2 لماذا "ليس بعد Enterprise-Grade"؟

التقرير السابق `docs/ENTERPRISE_ERP_AUDIT_REPORT.md` (فبراير 2026) صرّح: *"نظام محلى قوى يتجه نحو ERP احترافى، **وليس بعد** ERP بمستوى عالمى"*. هذا التصنيف لا يزال صحيحاً لـ **8 فجوات حرجة موثقة + 3 فجوات جديدة** مكتشفة فى Phase C (مايو 2026).

### 1.3 الهدف المُستهدَف

تحويل النظام خلال **8-10 أسابيع** إلى:

| الشهادة / المعيار | الحالة المُستهدفة |
|---|---|
| ✅ **Enterprise-Grade ERP** | قابل للعرض على Big-4 auditors أو مستثمر استراتيجى |
| ✅ **SOC 2 Type I Ready** | جاهز للتدقيق فى الأمان والتوافر والسرية |
| ✅ **ISO 27001 Aligned** | متوافق مع متطلبات أمن المعلومات |
| ✅ **IFRS Compliant** | متوافق مع معايير المحاسبة الدولية |
| ✅ **ETA E-Invoice Ready** | جاهز للتكامل مع مصلحة الضرائب المصرية |
| ✅ **High Availability + DR** | مع runbook موثّق للكوارث |
| ✅ **Multi-Tenant Production** | عزل صارم بين الشركات على مستوى DB + API + UI |

### 1.4 الجدول الزمنى المختصر

```
Week 1     : Phase C — Closure (Cleanup + Documentation)
Weeks 2-4  : Phase A — Integration & Module Wiring Audit
Weeks 5-6  : Phase G — Governance Hardening (5 Critical Gaps)
Week 7     : Phase S — Scale & Performance
Weeks 8-9  : Phase R — Resilience & Compliance
Week 10    : Phase T — Test Coverage & Documentation Consolidation
```

### 1.5 الاستثمار المطلوب

- **وقت Engineering:** ~400-500 ساعة (مهندس أول بمعدل 40h/week × 10 أسابيع)
- **مراجعات خارجية موصى بها:** Pen-test (Week 9), External Accounting Review (Week 6)
- **أدوات إضافية:** Sentry/DataDog (Monitoring), Snyk (Security Scan), Playwright (E2E)

---

<a name="2-target-definition"></a>
## 2. Target Definition — ما يعنيه "Enterprise-Grade ERP"؟

### 2.1 التعريف العملى

نظام ERP يُعتبر Enterprise-Grade إذا اجتاز اختبار **"الـ 5 Whys للمدقق الخارجى"**:

> 1. هل يمكنك إثبات أن كل قرش فى GL له مصدر مُرتبط بعملية تشغيلية؟
> 2. هل يمكنك إعادة بناء حالة النظام عند أى نقطة زمنية فى آخر 7 سنوات؟
> 3. هل يمكنك إثبات أن لا أحد عدّل بياناً مالياً بدون أثر (audit trail)؟
> 4. هل يمكنك إثبات أن المستخدم X لا يستطيع رؤية بيانات الشركة Y؟
> 5. هل يمكنك استرجاع النظام كاملاً فى ≤ 4 ساعات بعد كارثة؟

### 2.2 المنافسون المعياريون (Benchmarks)

| النظام | الـ Tier | المرجع |
|---|---|---|
| **SAP S/4HANA** | Tier 1 | الـ baseline الذهبى للشركات الكبيرة |
| **Oracle NetSuite** | Tier 1 | معيار Mid-Market العالمى |
| **Microsoft Dynamics 365** | Tier 1-2 | معيار التكامل والتشغيل |
| **Odoo Enterprise** | Tier 2-3 | أقرب modular benchmark |
| **ERB VitaSlims (الهدف)** | **Tier 2** | منافس قوى فى الشرق الأوسط |

### 2.3 المعايير الدولية المرجعية

- **ISO 27001** — أمن المعلومات
- **SOC 2 Type II** — التحكم فى الخدمات
- **IFRS 15, 16** — الإيرادات وعقود الإيجار
- **GAAP** — المبادئ المحاسبية المقبولة عموماً
- **ETA Egypt** — مصلحة الضرائب المصرية (E-Invoice)
- **GDPR-compatible** — حماية البيانات (للتوسع المستقبلى)

---

<a name="3-maturity-matrix"></a>
## 3. 12-Dimension Maturity Matrix — مصفوفة النضج

كل بُعد مُقيَّم على مقياس من 5 مستويات:
- **L1 — Initial:** يعمل لكن غير موثَّق/مُنظَّم
- **L2 — Repeatable:** نمط واضح، عمليات مكررة
- **L3 — Defined:** موثَّق ومُطبَّق بصرامة
- **L4 — Managed:** مُقاس بـ KPIs ويُحسَّن باستمرار
- **L5 — Optimized:** ذاتى التحسين، نموذج للصناعة

### 3.1 المصفوفة الكاملة

| # | البُعد | الحالى | المُستهدَف | الفجوة | الأولوية |
|---|---|:---:|:---:|:---:|:---:|
| **1** | **Data Integrity** (GL/FIFO/COGS) | L3 | L4 | -1 | عالية |
| **2** | **Module Integration** (Cross-Module Flows) | L2 | L4 | -2 | **حرجة** |
| **3** | **Governance & RBAC** (User→Branch→Defaults) | L3 | L4 | -1 | عالية |
| **4** | **Security** (RLS, Auth, Authz) | L2 | L4 | -2 | **حرجة** |
| **5** | **Period Locks & Closing** | L1 | L4 | -3 | **حرجة** |
| **6** | **Audit Trail** (Immutable Logs) | L3 | L4 | -1 | متوسطة |
| **7** | **Resilience** (Idempotency, Recovery) | L1 | L4 | -3 | **حرجة** |
| **8** | **Compliance** (IFRS/ETA/SOC2) | L1 | L3 | -2 | عالية |
| **9** | **Performance** (Pagination, Indexes, Cache) | L2 | L3 | -1 | متوسطة |
| **10** | **Operability** (Monitoring, Backup, DR) | L1 | L3 | -2 | عالية |
| **11** | **Testing & QA** | L2 | L4 | -2 | عالية |
| **12** | **Documentation** | L3 | L4 | -1 | منخفضة |

### 3.2 خلاصة المصفوفة

- **متوسط النضج الحالى:** 2.1 / 5 (Repeatable, متجه نحو Defined)
- **متوسط النضج المُستهدف:** 3.7 / 5 (Defined, متجه نحو Managed)
- **عدد الأبعاد الحرجة:** 4 (Module Integration, Security, Period Locks, Resilience)
- **التصنيف العالمى:** اليوم = **Tier 3 (Departmental)**، الهدف = **Tier 2 (Mid-Market Enterprise)**

---

<a name="4-current-state"></a>
## 4. Current State Assessment — تقييم الحالة الحالية

### 4.1 ما هو قوى ومُختبَر (Strengths)

#### 4.1.1 القلب المحاسبى
- ✅ **General Ledger كمصدر الحقيقة** لكل التقارير المالية الرسمية (Balance Sheet, P&L, Trial Balance, Cash Flow)
- ✅ **Double-Entry** مُطبَّقة عبر RPCs ذرية (`post_accounting_event`)
- ✅ **FIFO Engine** مع `fifo_cost_lots`, `fifo_lot_consumptions`, `cogs_transactions`
- ✅ **Multi-Currency** مع `exchange_rate_log`, `display_*` columns
- ✅ **Reverse Operations** على المبيعات والمشتريات (Returns)

#### 4.1.2 الحوكمة والصلاحيات
- ✅ **RBAC متعدد الطبقات** (Governance → Page → API → Row)
- ✅ **14 دور** مُوثَّق (`docs/ROLES_AND_PERMISSIONS.md`) مع نطاقات واضحة
- ✅ **Branch Defaults** مُفعَّل (`lib/governance-branch-defaults.ts`)
- ✅ **Approval Workflows v3.0.0** (BOM, Routing, PO, Material Issue, Goods Receipt)
- ✅ **Approval History Append-Only** (`approval_history` table, no UPDATE/DELETE)

#### 4.1.3 المعمارية
- ✅ **Modular Structure** (actions/, app/, components/, lib/, supabase/migrations/)
- ✅ **Migration-First** — كل تغيير DB يمر عبر migration
- ✅ **TypeScript End-to-End**
- ✅ **Real-Time** على بعض الجداول (`enable_realtime_*`)

#### 4.1.4 التغطية الوظيفية
- ✅ Sales & Invoicing
- ✅ Purchase & Bills
- ✅ Inventory & Warehouses (Multi-Warehouse)
- ✅ Manufacturing (BOM + Routing + PO + Material Issue v2-stage)
- ✅ Bookings & Services
- ✅ HR & Payroll
- ✅ Multi-Tenant + Multi-Branch + Multi-Currency
- ✅ Shipping Integration
- ✅ Notifications (Outbox Pattern)
- ✅ Product Bundles
- ✅ Fixed Assets & Depreciation
- ✅ Commission Engine

### 4.2 ما هو ضعيف أو ناقص (Weaknesses)

موثَّق فى [Section 5 — Gap Analysis](#5-gap-analysis).

### 4.3 ما هو فُرص للقيمة المضافة (Opportunities)

- 💎 **AI Module** (`docs/INTELLIGENT_ERP_AI_MODULE_DESIGN.md`) — موجود فى التصميم، يمكن تفعيله كميزة تنافسية
- 💎 **Phase 2a Multi-Entity Consolidation** — قيد التطوير، إذا اكتمل يفتح سوق الـ Holdings
- 💎 **ETA E-Invoice** — متطلب قانونى يفتح السوق المصرى الرسمى
- 💎 **Mobile App** — لم يُذكر، فرصة قوية لـ Field Sales/Warehouse Staff

### 4.4 ما هو تهديد (Threats)

- ⚠️ **Period Lock غير مُفعَّل** يعرّض النظام لتعديلات على فترات مُغلقة (مخالف لـ IFRS)
- ⚠️ **RLS ناقص** على جداول مالية حساسة (`journal_entries`, `invoices`, `bills`, `payments`)
- ⚠️ **لا حماية من Double-Submission** يمكن أن ينتج قيود مكررة
- ⚠️ **BILL-0001 Pattern** يكشف إمكانية تعديل بيانات مالية بدون audit trail رسمى

---

<a name="5-gap-analysis"></a>
## 5. Gap Analysis — تحليل الفجوات

### 5.1 الفجوات الـ 8 الموثَّقة (من تقرير فبراير 2026)

| # | الفجوة | المرجع | الخطورة | Phase |
|---|---|---|:---:|:---:|
| **G-01** | DB Trigger لتوازن القيد غير موجود | §1.2 | 🔴 عالية | G |
| **G-02** | Period Lock غير مُفعَّل على كل APIs | §6.3 | 🔴 **حرجة** | G |
| **G-03** | RLS ناقص على journal_entries, invoices, bills, payments | §4.1 | 🔴 **حرجة** | G |
| **G-04** | لا حماية من Double-Submission (Idempotency Keys) | §4.4 | 🔴 عالية | G |
| **G-05** | Dashboard ≠ P&L (يقرأ من جداول تشغيلية) | §1.1, §2.2 | 🟡 متوسطة | G |
| **G-06** | إلغاء الفاتورة بعد الترحيل غير مكتمل (no reversal) | §1.3 | 🟡 متوسطة | A |
| **G-07** | Pagination ناقص فى تقارير كبيرة | §5.4 | 🟡 متوسطة | S |
| **G-08** | Race Conditions محتملة فى بعض API routes | §3.5 | 🟡 متوسطة | G |

### 5.2 الفجوات الـ 3 الجديدة (مكتشفة فى Phase C — مايو 2026)

| # | الفجوة | الدليل | الخطورة | Phase |
|---|---|---|:---:|:---:|
| **G-09** | **BILL-0001 Orphan Return** — `returned_amount=4,800` بدون سجل `purchase_returns` | استعلامات Phase C | 🟡 متوسطة | C |
| **G-10** | **Test Data Pollution** — 43 Test Companies + جدول `erp_test_2026` يلوّثان production schema | استعلامات Phase C | 🟢 منخفضة | C |
| **G-11** | **Module Integration Audit مفقود** — لا يوجد dependency map رسمى | مراجعة هذه الوثيقة | 🔴 **حرجة** | A |

### 5.3 الفجوات الـ 5 المُستنتَجة (من معايير enterprise العالمية)

| # | الفجوة | المعيار | الخطورة | Phase |
|---|---|---|:---:|:---:|
| **G-12** | **Disaster Recovery Plan** غير موثَّق | SOC 2, ISO 27001 | 🔴 عالية | R |
| **G-13** | **Monitoring + Alerting** غير مُطبَّق | Operability L3+ | 🟡 متوسطة | R |
| **G-14** | **IFRS Compliance Mapping** غير موثَّق | IFRS 15, 16 | 🔴 عالية | R |
| **G-15** | **ETA E-Invoice Integration** غير موجود | قانون مصرى | 🔴 عالية | R |
| **G-16** | **Test Coverage Report** غير متوفر | Testing L3+ | 🟡 متوسطة | T |

### 5.4 ملخص الفجوات

- **إجمالى:** 16 فجوة
- **حرجة:** 5 (G-02, G-03, G-04, G-11, G-12)
- **عالية:** 6
- **متوسطة:** 5
- **منخفضة:** 0 (G-10 منخفضة فى الخطورة لكن سهل الإغلاق)

---

<a name="6-phase-roadmap"></a>
## 6. Phase Roadmap — خارطة المراحل

### 🔵 Phase C — Closure (Week 1)
**الهدف:** إغلاق Phase C الحالى بشكل enterprise-grade

#### C-1: PHASE_C_FINAL_REPORT.md
- وثيقة رسمية بنتائج C.1 إلى C.7 مع شواهد قاعدة بيانات
- توقيع رسمى (Project Lead + Accounting Lead)

#### C-2: BILL-0001 Governance Remediation
- إنشاء `purchase_return` تاريخى رسمى:
  ```sql
  INSERT INTO purchase_returns (bill_id, return_date, total_amount, status, notes)
  VALUES (
    'cec5aa99-...',
    '2025-10-01',
    4800.00,
    'completed',
    'Backfilled — historical orphan return discovered in Phase C audit (ERR-2026-05-001 §11.1)'
  );
  ```
- إنشاء `purchase_return_items` للسطر المُرتجع (جينيدايجستف × 12)
- التحقق من FIFO reversal — هل حدث فى وقتها أم نحتاج تعديل manual؟
- تسجيل supplier credit balance رسمى (الفرق 4,800)

#### C-3: Test Data Cleanup
- **C-3.1:** Backup شامل (`pg_dump` + JSON snapshot)
- **C-3.2:** DROP `erp_test_2026` (آمن: 0 FK)
- **C-3.3:** Migration `2026XXXX_cleanup_test_companies.sql` بـ rollback صريح
  ```sql
  -- استثناء صريح لشركة "تست" الحقيقية
  DELETE FROM companies
  WHERE name ILIKE '%test%'
    AND name NOT IN ('تست')
    AND id NOT IN (SELECT id FROM companies WHERE last_activity > NOW() - INTERVAL '30 days');
  ```
- **C-3.4:** Verify (43 companies → 0, 1,849 chart_of_accounts → 0)

#### C-4: PHASE_C_COMPLETION_REPORT.md
- نفس قالب `CLEANUP_TEST_COMPANY_COMPLETED.md` (يناير 2026)
- توقيع نهائى

**Exit Criteria:**
- ✅ كل الـ false positives موثَّقة
- ✅ BILL-0001 صار له `purchase_return` رسمى
- ✅ 43 Test Companies محذوفة + backup محفوظ
- ✅ شركة "تست" والشركة الحقيقية سليمتان
- ✅ تقريران موقَّعان

---

### 🟠 Phase A — Integration & Module Wiring Audit (Weeks 2-4) ⭐ الأهم

**الهدف:** ضمان أن كل المديولات تعمل معاً بشكل ذرى وموثوق

#### A-1: Module Dependency Map (Week 2)
- رسم خريطة كاملة:
  ```
  Sales Order → Invoice → Payment → GL Entry → Inventory Movement → COGS → P&L
              ↓                                                       ↑
            Customer Credit ←—— Return ←—— Sales Return Entry ————————┘
  ```
- لكل سهم: توثيق RPC/Function المسؤول + Atomicity Level
- Deliverable: `docs/MODULE_DEPENDENCY_MAP.md` + Mermaid diagrams

#### A-2: Cross-Module Atomicity Audit (Week 2)
- مراجعة كل عملية متعددة الجداول:
  - Invoice posting (4 جداول)
  - Payment processing (5 جداول)
  - Material Issue (6 جداول)
  - Booking completion (8 جداول)
- لكل عملية: إثبات أنها فى transaction واحد أو RPC ذرى
- Deliverable: `docs/ATOMICITY_AUDIT_REPORT.md`

#### A-3: Event-Driven Flows Audit (Week 3)
- مراجعة Notification Outbox Pattern (مكتمل فى O8)
- مراجعة Approval Workflows
- مراجعة Webhook Handlers (`shipping_webhook_logs`)
- Deliverable: `docs/EVENT_FLOWS_AUDIT.md`

#### A-4: API Contract Map (Week 3)
- توسيع `phase1a-rpc-contract-map.md` ليشمل **كل** الـ RPCs
- لكل RPC: Input Schema, Output Schema, Side Effects, Permissions
- Deliverable: `docs/API_CONTRACT_MAP_V2.md` (OpenAPI 3.0 format)

#### A-5: Frontend-Backend State Sync (Week 3-4)
- مراجعة optimistic updates
- مراجعة cache invalidation
- مراجعة real-time subscriptions
- Deliverable: `docs/STATE_SYNC_AUDIT.md`

#### A-6: Error Propagation & Recovery (Week 4)
- مراجعة error boundaries
- مراجعة retry logic
- مراجعة compensation transactions
- مراجعة sales/purchase return reversal completeness
- معالجة **G-06** (Invoice cancellation reversal)
- Deliverable: `docs/ERROR_RECOVERY_AUDIT.md`

**Exit Criteria:**
- ✅ Dependency Map كامل ومُوقَّع
- ✅ كل العمليات متعددة الجداول ذرية أو موثَّقة كاستثناء
- ✅ كل API له contract موثَّق
- ✅ Invoice cancellation له workflow ذرى موثَّق

---

### 🟢 Phase G — Governance Hardening (Weeks 5-6)

**الهدف:** سدّ الـ 5 ثغرات الحرجة

#### G-Phase Task Breakdown

| Task | الفجوة | الحل |
|---|---|---|
| **G.1** | DB Balance Trigger | Trigger على `journal_entry_lines` يفرض sum(debit) = sum(credit) |
| **G.2** | Universal Period Lock | استدعاء `assertPeriodNotLocked` فى كل API route مالى + RPC guard |
| **G.3** | Complete RLS Coverage | RLS على `journal_entries`, `journal_entry_lines`, `invoices`, `bills`, `payments`, `inventory_transactions` |
| **G.4** | Idempotency Keys | Middleware `requireIdempotencyKey` على كل POST مالى + `idempotency_keys` table |
| **G.5** | Dashboard from GL | Refactor Dashboard queries → GL aggregates أو views موحدة |
| **G.6** | Race Condition Fixes | تطبيق `SELECT ... FOR UPDATE` فى المسارات الحساسة |
| **G.7** | Duplicate JE Prevention | Trigger على `journal_entries` يرفض المرجع المكرر (reference_type + reference_id) |

**Exit Criteria:**
- ✅ كل الـ 5 ثغرات الحرجة مُغلقة بـ migrations
- ✅ Test cases تثبت سلوك السدّ
- ✅ تقرير `docs/GOVERNANCE_HARDENING_COMPLETED.md`

---

### 🟣 Phase S — Scale & Performance (Week 7)

**الهدف:** تجهيز النظام لـ 10,000 فاتورة/شهر, ملايين GL entries

#### Tasks
- **S.1:** Pagination على كل التقارير الكبيرة (`Trial Balance`, `Account Statement`, `GL Detail`)
- **S.2:** Index Audit (تشغيل `EXPLAIN ANALYZE` على slow queries)
- **S.3:** Materialized Views للتقارير المُكثَّفة
- **S.4:** Cache Strategy (Redis للـ static lookups)
- **S.5:** Connection Pooling Audit (PgBouncer)
- **S.6:** Load Test (target: 100 concurrent users, p95 < 500ms)

**Exit Criteria:**
- ✅ كل تقرير يدعم pagination
- ✅ Load test report موثَّق
- ✅ Slow query log < 1% من الاستعلامات

---

### 🔴 Phase R — Resilience & Compliance (Weeks 8-9)

**الهدف:** جاهزية SOC 2 + IFRS + ETA + DR

#### Tasks
- **R.1:** Backup Strategy
  - Daily full backups (Supabase + custom snapshots)
  - Point-in-time recovery test (PITR)
  - Backup verification automation
- **R.2:** Disaster Recovery Runbook
  - RTO target: 4 ساعات
  - RPO target: 15 دقيقة
  - Drill schedule: ربعى
- **R.3:** Monitoring + Alerting
  - Sentry للأخطاء
  - DataDog/Grafana للـ metrics
  - PagerDuty للـ on-call
  - SLO definitions
- **R.4:** Security Hardening
  - Snyk dependency scan
  - OWASP Top 10 audit
  - Pen-test خارجى (recommended)
  - Secrets rotation policy
- **R.5:** IFRS Compliance Mapping
  - IFRS 15 (Revenue Recognition) checklist
  - IFRS 16 (Leases) — إذا متعلق
  - IAS 2 (Inventories)
  - مراجعة من محاسب قانونى مُعتمَد
- **R.6:** ETA E-Invoice Integration
  - تكامل مع API مصلحة الضرائب المصرية
  - QR codes على الفواتير
  - Digital signature
  - Submission queue + retry logic

**Exit Criteria:**
- ✅ DR drill ناجح (RTO ≤ 4h)
- ✅ Monitoring يُنتج alerts قبل الأعطال
- ✅ IFRS checklist مُوقَّع من محاسب قانونى
- ✅ ETA test environment integration ناجح

---

### ⚫ Phase T — Test Coverage & Documentation (Week 10)

**الهدف:** الإكمال النهائى

#### Tasks
- **T.1:** Test Coverage Report
  - هدف: ≥ 70% unit + 100% critical paths integration
  - E2E عبر Playwright
- **T.2:** Documentation Consolidation
  - دمج 200+ ملف MD فى structure منظَّم تحت `docs/`:
    ```
    docs/
    ├── 01-architecture/
    ├── 02-modules/
    ├── 03-governance/
    ├── 04-compliance/
    ├── 05-operations/
    ├── 06-api/
    ├── 07-changelog/
    └── 08-user-guides/
    ```
  - Archive الملفات القديمة فى `archive/`
- **T.3:** User Manual
  - دليل مستخدم نهائى (PDF + online)
- **T.4:** Onboarding Guide
  - للمطورين الجدد
  - للمستخدمين الجدد

**Exit Criteria:**
- ✅ Coverage ≥ 70%
- ✅ Documentation منظَّمة ومُحدَّثة
- ✅ User Manual منشور

---

<a name="7-success-criteria"></a>
## 7. Success Criteria & KPIs

### 7.1 KPIs لكل Phase

| Phase | KPI الأساسى | Target |
|---|---|---|
| C | Test data في production | 0 شركة، 0 جدول |
| A | Module integration coverage | 100% من العمليات الذرية موثَّقة |
| G | Critical security gaps | 0 |
| S | p95 response time | < 500ms |
| R | RTO / RPO | 4h / 15min |
| T | Test coverage | ≥ 70% |

### 7.2 Overall Readiness Scorecard

عند اكتمال كل المراحل، النظام يجب أن يحصل على:

| المعيار | Target Score |
|---|:---:|
| **Data Integrity** | 95%+ |
| **Security Posture** | 90%+ |
| **Operational Readiness** | 85%+ |
| **Compliance Coverage** | 95%+ (IFRS, ETA) |
| **Test Coverage** | 70%+ |
| **Documentation Completeness** | 90%+ |
| **Overall Enterprise Score** | **88%+** (Tier 2 Mid-Market) |

### 7.3 Audit Acceptance Criteria

- ✅ ينجح فى محاكاة SOC 2 Type I audit
- ✅ يُقبَل من مُدقق Big-4 كأساس للمراجعة
- ✅ يستوفى متطلبات ETA للفواتير الإلكترونية
- ✅ يمر فى pen-test خارجى بدون High/Critical findings

---

<a name="8-governance-model"></a>
## 8. Governance Operating Model

### 8.1 Decision Rights (RACI)

| القرار | Responsible | Accountable | Consulted | Informed |
|---|:---:|:---:|:---:|:---:|
| Migration approval | Tech Lead | Project Lead | Accounting Lead | Team |
| Production deploy | DevOps | Tech Lead | Security | All |
| Data fix (manual) | DBA | Project Lead | Audit | Accounting |
| Phase sign-off | Phase Lead | Project Lead | External (إن وُجد) | Stakeholders |

### 8.2 Change Management

كل تغيير يمر بـ 5 بوابات:
1. **Design Review** (PR description + impact analysis)
2. **Code Review** (peer + senior approval)
3. **Test Gate** (CI passes + manual testing for critical changes)
4. **Migration Gate** (backup + rollback plan موثَّق)
5. **Production Gate** (deploy window + monitoring active)

### 8.3 Quality Gates لكل Phase

```
Entry → Plan → Execute → Test → Document → Sign-off → Exit
                  ↓ fail
              Rollback + Postmortem
```

### 8.4 Communication Cadence

- **Daily:** Stand-up (15min) أثناء Phases A, G
- **Weekly:** Phase Review (60min)
- **Monthly:** Stakeholder Briefing (90min)
- **Phase End:** Sign-off Ceremony + Retrospective

---

<a name="9-risk-register"></a>
## 9. Risk Register

| # | الخطر | الاحتمالية | الأثر | Mitigation |
|---|---|:---:|:---:|---|
| **R-01** | تأخير Phase A بسبب complexity | عالية | متوسط | Buffer 1 أسبوع + parallel tasks |
| **R-02** | Migration G.2 (Period Lock) تكسر workflows حالية | متوسطة | عالى | Feature flag + gradual rollout |
| **R-03** | RLS migration G.3 تكسر API routes موجودة | عالية | عالى | Comprehensive test suite قبل deploy |
| **R-04** | Backup/restore لا يعمل فى DR drill | منخفضة | حرج | Test backup كل أسبوع |
| **R-05** | ETA API يتغير أثناء integration | متوسطة | متوسط | Adapter pattern + versioning |
| **R-06** | فقدان معرفة (Project Lead) | منخفضة | حرج | Documentation-as-Code culture |
| **R-07** | Pen-test يكشف Critical | متوسطة | عالى | Internal security audit أولاً |

---

<a name="10-compliance-mapping"></a>
## 10. Compliance Mapping

### 10.1 IFRS Mapping

| IFRS Standard | المتطلب | الحالة | الإجراء |
|---|---|:---:|---|
| **IFRS 15** | Revenue Recognition | 🟡 جزئى | R.5 — checklist مفصَّل |
| **IFRS 16** | Leases | ❓ غير مُقَيَّم | R.5 — مراجعة |
| **IAS 2** | Inventories (FIFO) | ✅ مُطبَّق | تأكيد فى R.5 |
| **IAS 8** | Accounting Policies | ✅ موثَّق | فى `docs/ACCOUNTING_PATTERN.md` |
| **IAS 21** | Foreign Exchange | ✅ مُطبَّق | exchange_rate_log |
| **IAS 36** | Impairment | ❓ غير مُقَيَّم | R.5 — مراجعة |

### 10.2 SOC 2 Trust Service Criteria

| Criterion | الحالة | Phase |
|---|:---:|:---:|
| **Security** | 🟡 جزئى | G + R |
| **Availability** | 🔴 ضعيف | R |
| **Processing Integrity** | ✅ قوى | C + A |
| **Confidentiality** | 🟡 جزئى | G |
| **Privacy** | ❓ غير مُقَيَّم | R |

### 10.3 ETA Egypt Requirements

| المتطلب | الحالة | Phase |
|---|:---:|:---:|
| E-Invoice format (UBL/JSON) | ❌ غير موجود | R.6 |
| Digital signature | ❌ غير موجود | R.6 |
| QR code on invoices | ❌ غير موجود | R.6 |
| Submission to ETA portal | ❌ غير موجود | R.6 |
| Tax registration linking | 🟡 جزئى | R.6 |

---

<a name="11-findings-catalog"></a>
## 11. Findings Catalog

### 11.1 BILL-0001 Case Study (Governance Gap G-09)

**Identifier:** ERR-2026-05-001/F-001
**Discovered:** Phase C audit, 2026-05-18
**Classification:** Data Governance Gap (NOT data integrity bug)

**Facts:**
- `bills.id = cec5aa99-335a-4ddc-8fab-5b5b38c7ccdf`
- `bills.bill_number = BILL-0001`
- `bills.subtotal = 70,200 EGP`
- `bills.returned_amount = 4,800 EGP`
- `bills.total_amount = 65,400 EGP` ✅ (matches: 70,200 - 4,800)
- `bills.paid_amount = 70,200 EGP` ⚠️ (overpaid by 4,800)
- `bills.return_status = 'partial'`
- `bill_items[جينيدايجستف].returned_quantity = 12 / 16`
- **`purchase_returns` WHERE bill_id = ... → 0 rows** ❌

**Why It's a Gap (Not False Positive):**

1. **No FIFO Reversal Audit Trail** — هل تم عكس استهلاك المخزون عند الإرجاع؟ لا يوجد دليل.
2. **No COGS Reversal Audit Trail** — هل تم تخفيض تكلفة البضاعة المباعة؟ لا يوجد دليل.
3. **No Journal Entry Reversal** — هل تم عكس قيد المخزون/الموردين؟ غير معروف.
4. **Supplier Credit Balance Orphan** — 4,800 EGP رصيد دائن للمورد بدون توثيق رسمى.
5. **Violates DB Safeguards** — migration `20260219_002_purchase_return_db_safeguards.sql` يفترض workflow صحيح.
6. **Audit Trail Loss** — `system_audit_log` لم يُسأل عن BILL-0001 (الـ AI السابق فشل فى تشغيل الاستعلام بسبب column name error).

**Recommended Remediation (Phase C-2):**

Option A (Preferred): إنشاء `purchase_return` تاريخى رسمى
```sql
BEGIN;
  INSERT INTO purchase_returns (id, bill_id, return_date, total_amount, status, notes, created_by)
  VALUES (gen_random_uuid(), 'cec5aa99-...', '2025-10-01', 4800.00, 'completed',
    'BACKFILL: Historical orphan return discovered in audit ERR-2026-05-001. Original data showed returned_quantity=12 on bill_items but no purchase_return record. Created to maintain governance integrity.',
    (SELECT id FROM users WHERE email = 'system@erb-vitaslims.com'));

  INSERT INTO purchase_return_items (purchase_return_id, bill_item_id, product_id, quantity, unit_price, line_total)
  SELECT pr.id, bi.id, bi.product_id, 12, 400, 4800
  FROM purchase_returns pr, bill_items bi
  WHERE pr.bill_id = 'cec5aa99-...' AND bi.product_id = (SELECT id FROM products WHERE name = 'جينيدايجستف - GeneDigestive');

  -- Verify supplier credit balance
  -- Verify FIFO state matches (if not, create remediation journal entry)
COMMIT;
```

Option B (Alternative): تسجيل "Grandfathered Exception"
```sql
INSERT INTO system_audit_log (entity_type, entity_id, action, metadata)
VALUES ('bills', 'cec5aa99-...', 'grandfather_exception',
  '{"reason": "Orphan return discovered post-fact", "audit_ref": "ERR-2026-05-001/F-001", "amount": 4800}');
```

### 11.2 Other Findings Will Be Added Here

سيتم إضافة كل finding مُكتشف فى Phases A-T بنفس الصيغة.

---

<a name="12-appendices"></a>
## 12. Appendices

### Appendix A: File Mapping (Current State Documentation)

| الوثيقة | الموقع | Phase ذات صلة |
|---|---|:---:|
| Enterprise ERP Audit (Feb 2026) | `docs/ENTERPRISE_ERP_AUDIT_REPORT.md` | A, G |
| ERP Compliance Audit | `ERP_COMPLIANCE_AUDIT.md` | R |
| Governance Data Model Audit | `ERP_GOVERNANCE_DATA_MODEL_AUDIT_REPORT.md` | A |
| Roles & Permissions v3.0.0 | `docs/ROLES_AND_PERMISSIONS.md` | G |
| Approval Workflows | `docs/APPROVAL_WORKFLOWS.md` | A |
| RPC Contract Map (Phase 1a) | `docs/phase1a-rpc-contract-map.md` | A |
| Notification Outbox (O1-O8) | `docs/NOTIFICATION_OUTBOX_*.md` | A |
| Multi-Entity Consolidation | `docs/phase2a-*.md`, `phase2b-*.md` | Future |
| Test Plan (UAT) | `docs/UAT_TEST_PLAN.md` | T |
| Migrations History | `docs/MIGRATIONS_HISTORY.md` | All |
| Changelog v3.0.0 | `CHANGELOG.md` | All |

### Appendix B: Recommended External Reviews

| Review | Provider | Phase | Cost Estimate |
|---|---|:---:|---|
| Accounting Compliance | محاسب قانونى مُعتمَد | C, R | متوسط |
| Penetration Test | Bug Bounty / Consultancy | R | عالى |
| SOC 2 Readiness | SOC 2 Consultant | R, T | عالى |
| IFRS Adoption | Big-4 (PwC/EY/Deloitte/KPMG) | R | عالى جداً |

### Appendix C: Glossary

| المصطلح | التعريف |
|---|---|
| **GL** | General Ledger — دفتر الأستاذ العام |
| **SoT** | Source of Truth — مصدر الحقيقة الوحيد |
| **FIFO** | First In First Out — الوارد أولاً يصرف أولاً |
| **COGS** | Cost of Goods Sold — تكلفة البضاعة المباعة |
| **RPC** | Remote Procedure Call (Supabase stored function) |
| **RLS** | Row-Level Security |
| **RBAC** | Role-Based Access Control |
| **RTO** | Recovery Time Objective |
| **RPO** | Recovery Point Objective |
| **ETA** | Egyptian Tax Authority |
| **IFRS** | International Financial Reporting Standards |
| **SOC 2** | Service Organization Control 2 |
| **DR** | Disaster Recovery |

### Appendix D: Sign-off

| الدور | الاسم | التوقيع | التاريخ |
|---|---|---|---|
| Project Lead | أحمد | _______________ | _____ |
| Accounting Lead | _______________ | _______________ | _____ |
| Tech Lead | _______________ | _______________ | _____ |
| External Reviewer (Optional) | _______________ | _______________ | _____ |

---

**End of Document — ERR-2026-05-001 v1.0**

> هذه الوثيقة وثيقة حية. أى تحديث يجب أن يرفع رقم الإصدار ويُسجَّل فى `CHANGELOG.md`.
