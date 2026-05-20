# 📋 تعليمات للـ AI المساعد - مراجعة وتحسين مشروع ERB_VitaSlims

> **تاريخ المراجعة:** 2026-05-18
> **النسخة الحالية:** 2.0.0
> **آخر الـ commits:** Phase B.3 (RLS Security Hardening)

---

## 🎯 أولاً: ملخص ما وصل إليه التطوير

المشروع نظام **ERP متكامل** مبني على:
- **Next.js 14** + TypeScript + Tailwind + shadcn/ui
- **Supabase** (Postgres + Auth + RLS + Realtime)
- **معمارية متعددة المستويات (Multi-tenant):** Company → Branch → Cost Center → Warehouse → User

**الحجم الحالي:**
- 54 مديول تطبيقي في `app/`
- 373 API route عبر 172 مجلد API
- 114 ملف في `lib/`
- 273 SQL migration في `supabase/migrations/`
- 11 دور (role) مدعوم: owner, admin, general_manager, manager, accountant, store_manager, staff, viewer, manufacturing_officer, booking_officer, purchasing_officer

**ما تم إنجازه حسب الـ git log:**
- ✅ Phases R1-R10: إضافة الأدوار الجديدة + workflows الاعتماد للتصنيع
- ✅ Phase B.1-B.3: تفعيل RLS على الجداول الحساسة + إصلاح أمني للمصادقة
- ✅ نظام الحوكمة الأساسي (governance-middleware + access-context)
- ✅ نظام الإشعارات + Realtime
- ✅ نظام الاسترداد متعدد المراحل (Refund workflow)
- ✅ نظام المرتجعات (Sales Returns + Purchase Returns)
- ✅ تطبيق RLS على 5+ جداول حساسة في آخر commits

---

## ⚠️ المشاكل المكتشفة (مرتبة حسب الأولوية)

---

### 🔴 الأولوية القصوى (Critical) — مشاكل أمنية أو معمارية تؤثر على الإنتاج

#### 1) **ازدواجية أنظمة الحوكمة في API**
يوجد **نظامان متوازيان** للحوكمة في API endpoints وهذا يسبب تشويش وعدم اتساق:

- **النظام الأول:** `enforceGovernance` من `lib/governance-middleware.ts` — مستخدم في sales-orders، purchase-orders، وغيرها
- **النظام الثاني:** `secureApiRequest` من `lib/api-security-enhanced.ts` — مستخدم في invoices/record-payment، vendor-credits، وغيرها (377 استخدام عبر 149 ملف)

**النتيجة:** كل API route يطبق الحوكمة بطريقة مختلفة، وبعض الـ endpoints قد تفقد طبقة من الحماية.

#### 2) **منطق فحص الصلاحيات في `lib/authz.ts` يحتوي ثغرة محتملة**

في `checkPermission()` السطر 299:
```ts
if (action === "read" && perm.can_read !== false) return { allowed: true, role }
```
هذا الفحص يسمح بالقراءة عندما يكون `can_read = null` (وليس فقط `true`). نفس المشكلة في write/update السطور 300-301.

**هذا قد يفتح ثغرة:** صف صلاحيات بقيم `null` يُعامل كأنه مسموح.

#### 3) **Cache الصلاحيات في الذاكرة فقط (in-memory) مع TTL = 60 ثانية**

في `lib/authz.ts` السطر 64:
```ts
const permissionCache = new Map<string, ...>()
const CACHE_TTL = 60000 // 1 دقيقة
```

**المشاكل:**
- لا يعمل عبر Serverless Functions المتعددة (كل instance له cache منفصل)
- تغيير دور المستخدم قد لا ينعكس فوراً (حتى 60 ثانية تأخير)
- على الرغم من وجود `clearUserPermissionCache` لكن يجب استدعاؤها يدوياً عند كل تحديث

#### 4) **التحقق من warehouse_id ضعيف في `validateGovernanceData`**

في `lib/governance-middleware.ts` السطر 271:
```ts
if (data.warehouse_id && context.warehouseIds.length > 0 && !context.warehouseIds.includes(data.warehouse_id))
```

إذا كان `context.warehouseIds` فارغ، **يتم تخطي الفحص تماماً** — مما يسمح بتمرير أي `warehouse_id`. نفس الشيء لـ `cost_center_id`.

#### 5) **`middleware.ts` لا يحتوي طبقة حماية على مستوى الـ routes**

الملف الحالي 47 سطر فقط ويقوم فقط بـ:
- تحديث session
- تسجيل API requests

**لا يوجد فحص صلاحيات على مستوى الـ middleware**، وكل API يحتاج لاستدعاء `enforceGovernance` أو `secureApiRequest` يدوياً → عرضة للنسيان والأخطاء.

---

### 🟠 الأولوية العالية (High) — تنظيف كود وتطهير المشروع

#### 6) **ملفات مكررة في `lib/` تسبب تشويش**

يجب حذف الملفات القديمة:

| الملف الحالي | الملفات المكررة (يجب حذفها) |
|---|---|
| `lib/data-visibility-control.ts` ✅ | `data-visibility-control-backup.ts`, `data-visibility-control-fixed.ts`, `data-visibility-control-temp-fix.ts` |
| `lib/fifo-engine.ts` ✅ | `lib/fifo-v2-approved-baseline.ts` (التأكد من الـ used واحد فقط) |
| `lib/api-security-enhanced.ts` (الأحدث) ✅ | `lib/api-security.ts` + `lib/api-security-governance.ts` (التحقق هل ما زالا مستخدمين) |

#### 7) **180 ملف Markdown في root directory**

غالبيتها وثائق قديمة أو مكررة:
- `ZERO_DEFECT_*` (8 ملفات)
- `EMERGENCY_FIX_*`, `CRITICAL_FIX_REQUIRED.md`
- `PHASE1_*` (5 ملفات)
- `GOVERNANCE_*` (25+ ملف وثائقي للحوكمة)
- `REALTIME_*` (12 ملف)
- ملفات `FIX_*.md` و `FIX_*.sql` و `FIX_*.js` (35+ ملف)

**يجب نقلها إلى مجلد `docs/archive/` أو حذفها.**

#### 8) **ملفات script/fix في root directory (35+ ملف)**

أمثلة:
- `fix-foodcana-membership.js`, `fix-sales-orders-visibility.js` (إصلاحات وقتية لشركة محددة)
- `apply-cogs-fix.ps1`, `apply-governance-fixes.ps1`
- `FIX_COGS_CALCULATION.sql`, `ULTIMATE_COGS_FIX.sql`, `FINAL_COGS_FIX.sql` (نسخ متعددة لنفس الإصلاح!)
- `check-*.js`, `debug-*.js` (سكريبتات تشخيص قديمة)

**يجب نقلها إلى `scripts/legacy/` أو `archive/`.**

#### 9) **ملفات فارغة (0 bytes) في root**

- `db_schema.sql`
- `db_dump.sql`
- `check_balance.txt`
- `output.txt`
- `tsc_result.txt`
- `tmp_capture.err.log`, `tmp_capture.out.log`

**يجب حذفها.**

#### 10) **9 worktrees في `.claude/worktrees/`**

هذه residual artifacts من عمل agents السابقين. يجب التحقق إن لم تكن قيد الاستخدام ثم حذفها.

---

### 🟡 الأولوية المتوسطة (Medium) — تحسينات منطق وكود

#### 11) **منطق `allowed_pages` في `access-context.tsx` معقد ومتشعب**

في `fetchAccessProfile` السطور 296-382: يتم بناء `allowed_pages` من:
1. قاموس `defaultRolePages` (في الكود ثابت)
2. ثم override من جدول `company_role_permissions`
3. مع شروط متشابكة لـ `can_access`, `all_access`, `can_read/write/update/delete`

**المشكلة:** صعب الفهم والصيانة + احتمال تعارض بين الـ defaults والـ overrides + duplicate (`manufacturing_boms` مذكور مرتين في FALLBACK_PAGES في authz.ts).

#### 12) **كود مكرر في `fetchAccessProfile`**

السطور 240 و 256:
```ts
if (!member) { ...; return null }  // السطر 240
...
if (!member) { return null }       // السطر 256 (لا يمكن الوصول إليه أبداً)
```

#### 13) **README.md متقادم**

يحتوي تحذيرات قديمة:
> ⚠️ **لا تفعل المرتجعات** حتى اكتمال جميع الإصلاحات
> ⚠️ **لا تفعل سير العمل** حتى تطبيق الحوكمة الكاملة

لكن من الـ git log و CHANGELOG: المرتجعات وworkflows مفعّلة فعلياً. **يجب تحديث README.**

#### 14) **عدم وجود اختبارات شاملة لطبقة الحوكمة**

من `package.json` يوجد:
- `test:critical`, `test:integration`, `test:e2e`

لكن لم أجد ملفات اختبار محددة لـ:
- `lib/authz.ts` ← لا يوجد `authz.test.ts`
- `lib/governance-middleware.ts` ← لا يوجد `governance-middleware.test.ts`
- اختبارات تكامل لكل دور (role-based integration tests)

#### 15) **استخدام `console.log` و `console.warn` مكثف في الكود**

في `access-context.tsx` وحدها 15+ استخدام لـ `console.log` لـ debugging. يجب استخدام `lib/logger.ts` الموجود فعلياً.

---

### 🟢 الأولوية المنخفضة (Low) — تحسينات أداء وجودة

#### 16) **مكتبات قد تكون قديمة في `package.json`**
يحتاج فحص `npm audit` و `npm outdated`.

#### 17) **`openapi.json` بحجم 1.4 MB في root**
ربما يجب نقله إلى `docs/api/`.

#### 18) **استخدام `any` مفرط في authz.ts**
السطور 75, 91, 106 — يجب استبدالها بـ `SupabaseClient` type.

---

## 📝 ثانياً: التعليمات الفعلية لتمريرها للـ AI المساعد

> انسخ هذه التعليمات للـ AI المساعد بالترتيب (مرحلة بمرحلة، لا تطلب كل شيء دفعة واحدة)

---

### 🚨 المرحلة 1: إصلاحات أمنية حرجة (ابدأ هنا)

```
الرجاء تنفيذ الإصلاحات الأمنية التالية في مشروع ERB_VitaSlims بحذر شديد، 
وكتابة tests قبل وبعد كل إصلاح:

1. في ملف lib/authz.ts:
   - في دالة checkPermission السطر 299-301:
     استبدل: `if (action === "read" && perm.can_read !== false) return { allowed: true, role }`
     بـ:     `if (action === "read" && perm.can_read === true) return { allowed: true, role }`
   - طبق نفس التعديل على write/update/delete
   - السبب: المنطق الحالي يسمح بالوصول عندما تكون القيمة null (يعتبرها مسموحة)
   - بعد التعديل: قم بإجراء اختبار شامل للتأكد من عدم كسر صلاحيات موجودة

2. في ملف lib/governance-middleware.ts:
   - في دالة validateGovernanceData السطر 271 و 276:
     يجب أن يفشل التحقق إذا كان warehouse_id موجود في data لكن غير موجود في context
     حتى لو كانت قائمة context.warehouseIds فارغة، يجب رفض warehouse_id غير المصرح به
   - نفس الشيء لـ cost_center_id

3. في ملف lib/authz.ts:
   - أضف Redis cache أو Supabase realtime invalidation لـ permissionCache
   - أو على الأقل: قلل CACHE_TTL من 60000 إلى 10000 (10 ثوان)
   - وأضف استدعاء clearUserPermissionCache(userId) في كل API يعدّل company_members

4. اكتب اختبارات security tests في tests/security/ لتغطية:
   - منع وصول مستخدم لشركة لا ينتمي إليها
   - منع وصول staff لبيانات فروع أخرى
   - منع تمرير warehouse_id خارج صلاحيات المستخدم
   - السلوك الصحيح عند can_read = null

أرسل لي تقرير قبل التطبيق يوضح ما ستعدله بالضبط مع شرح الأثر.
```

---

### 🧹 المرحلة 2: توحيد طبقة الحوكمة

```
في مشروع ERB_VitaSlims، أحتاج توحيد نظام الحوكمة في API:

1. حالياً يوجد نمطان: enforceGovernance و secureApiRequest
2. أريد توحيدهما تحت نمط واحد - الأقوى - في ملف واحد lib/api-guard.ts
3. يجب أن يدعم النمط الموحد:
   - Authentication check
   - Company membership check  
   - Permission check (resource:action)
   - Branch/Warehouse/CostCenter scoping
   - Role allow-list
   - معالجة موحدة للأخطاء بالعربي والإنجليزي

قبل التنفيذ:
- استخرج قائمة بكل الـ API routes (373 route) ووضح نمط الحوكمة المستخدم في كل منها
- ضع خطة هجرة تدريجية route by route
- ابدأ بالـ routes الحساسة مالياً (invoices, bills, payments, refunds, journal-entries)
```

---

### 🗂️ المرحلة 3: تنظيف ملفات المشروع

```
في مشروع ERB_VitaSlims، أحتاج تنظيف شامل للملفات. نفذ ما يلي مع git commit منفصل لكل خطوة:

الخطوة 1 - نقل الـ docs:
- أنشئ مجلد docs/archive/
- انقل إليه كل ملفات .md في root ما عدا: README.md, CHANGELOG.md, GOVERNANCE.md
- خصوصاً: ZERO_DEFECT_*, EMERGENCY_FIX_*, PHASE1_*, FIX_*.md, CLEANUP_*, CRITICAL_*, READY_*

الخطوة 2 - نقل سكريبتات الإصلاحات الوقتية:
- أنشئ مجلد scripts/legacy/
- انقل إليه: fix-*.js, fix-*.sql, apply-*.ps1, apply-*.sh, check-*.js, debug-*.js, diagnose-*.js
- انقل إليه نسخ الإصلاحات المكررة: FIX_COGS_*.sql, ULTIMATE_COGS_*.sql, FINAL_COGS_*.sql, SAFE_COGS_*.sql

الخطوة 3 - حذف ملفات فارغة:
احذف: db_schema.sql, db_dump.sql, check_balance.txt, output.txt, tsc_result.txt, tmp_*.log

الخطوة 4 - حذف ملفات lib المكررة:
- احذف lib/data-visibility-control-backup.ts (إذا لم يُستخدم)
- احذف lib/data-visibility-control-fixed.ts (إذا لم يُستخدم)
- احذف lib/data-visibility-control-temp-fix.ts (إذا لم يُستخدم)
- تأكد بـ grep قبل الحذف أن لا أحد يستوردها
- نفس الفحص لـ api-security.ts و api-security-governance.ts

الخطوة 5 - نقل openapi.json:
انقله إلى docs/api/openapi.json

الخطوة 6 - تنظيف .claude/worktrees/:
احذف كل المجلدات في .claude/worktrees/ بعد التأكد أنه لا يوجد عمل غير محفوظ

بعد كل خطوة:
- شغل npm run build للتأكد من عدم كسر شيء
- شغل npm test
- commit بعنوان واضح
```

---

### 🔧 المرحلة 4: تحديث الوثائق والمنطق

```
في مشروع ERB_VitaSlims:

1. حدّث README.md:
   - احذف القسم "إصلاحات الحوكمة الطارئة"
   - احذف التحذيرات القديمة عن "لا تفعل المرتجعات/سير العمل"
   - استبدلها بنظرة عامة محدّثة للمشروع: التقنيات، المعمارية، الأدوار، الميزات الرئيسية

2. في lib/access-context.tsx:
   - احذف السطر 256-258 (الـ if (!member) return null المكرر بدون فائدة)
   - استبدل console.log/warn بـ logger من lib/logger.ts
   - بسّط منطق بناء allowed_pages: أفصل defaults logic عن overrides في دالتين منفصلتين

3. في lib/authz.ts:
   - استبدل النوع `any` للـ supabase parameter بـ `SupabaseClient<Database>`
   - احذف الـ duplicate في FALLBACK_PAGES (manufacturing_boms مذكور مرتين السطر 388 و 414)
```

---

### 🧪 المرحلة 5: إضافة اختبارات حوكمة شاملة

```
في مشروع ERB_VitaSlims:

أنشئ مجموعة اختبارات شاملة في tests/governance/:

1. tests/governance/authz.test.ts - يغطي:
   - canAccessPage مع كل دور
   - checkPermission للحالات: مسموح/مرفوض/no_record
   - السلوك عند can_read=null vs true vs false
   - Cache invalidation

2. tests/governance/middleware.test.ts - يغطي:
   - enforceGovernance لكل دور (11 دور)
   - applyGovernanceFilters
   - validateGovernanceData (خصوصاً حالات الـ edge cases)

3. tests/governance/cross-tenant.test.ts - حماية من تسريب البيانات:
   - مستخدم من شركة A لا يستطيع رؤية بيانات شركة B
   - staff في فرع X لا يستطيع رؤية بيانات فرع Y
   - تمرير branch_id/warehouse_id من شركة أخرى يجب أن يُرفض

4. tests/governance/role-matrix.test.ts:
   - مصفوفة شاملة: 11 دور × 50+ resource × 4 actions = مصفوفة اختبار كاملة
   - تأكد كل دور لا يستطيع الوصول لما لا يحق له

شغّل: npm test -- --coverage
ويجب الوصول إلى تغطية لا تقل عن 80% في lib/authz.ts و lib/governance-middleware.ts
```

---

## 📊 ثالثاً: ملخص حالة المشروع

| الجانب | الحالة |
|---|---|
| **المعمارية العامة** | ✅ قوية ومتقدمة (Multi-tenant, Multi-role) |
| **تغطية الميزات** | ✅ شاملة جداً (محاسبة، مخزون، تصنيع، HR، تقارير) |
| **طبقة الحوكمة** | 🟡 موجودة لكن مزدوجة (نظامان متوازيان) |
| **الأمان (RLS)** | 🟡 يتم العمل عليها (آخر commits Phase B.1-B.3) |
| **نظافة الكود** | 🔴 يحتاج تنظيف كبير (ملفات مكررة + 180 ملف md) |
| **الوثائق** | 🟡 كثيرة جداً ومتقادمة بعضها |
| **الاختبارات** | 🟡 موجودة لكن تغطية الحوكمة ضعيفة |
| **جاهزية الإنتاج** | 🟡 جاهز للاستخدام لكن مع المخاطر المذكورة |

---

## 🎯 التوصية النهائية

**قبل أي ميزة جديدة، نفّذ المراحل 1 و 2 على الأقل.** هذا سيحل المشاكل الأمنية الحرجة ويوحّد طبقة الحوكمة، مما سيجعل أي تطوير لاحق أكثر أماناً وأسهل في الصيانة.

**ثم نفّذ المرحلة 3 (التنظيف)** قبل بدء أي ميزة كبيرة، لأن المشروع حالياً به ضوضاء كثيرة (180 ملف md) قد تشتت أي AI assistant أو developer جديد.

**المراحل 4 و 5 يمكن تنفيذها بالتوازي مع تطوير ميزات جديدة.**
