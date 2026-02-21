# تقرير التحقق الرسمي: تطبيق نموذج GL-Driven ERP

**التاريخ:** 2025-02-21  
**الغرض:** التأكد من أن المشروع يعمل كنواة ERP مالية احترافية تعتمد **GL-Driven Architecture**.

---

## 1. مؤشرات الأداء المالية من قيود GL المرحلة فقط (Posted)

| المعيار | الحالة | التفاصيل |
|---------|--------|----------|
| Revenue, COGS, Operating Expenses, Net Profit, Profit Margin | ✅ **مطبق** | بطاقات لوحة التحكم الرئيسية (DashboardStats) تُغذى من `getGLSummary()` في `lib/dashboard-gl-summary.ts` التي تقرأ **فقط** من `journal_entry_lines` مع `journal_entries.status = 'posted'`. لا تُستخدم فواتير أو فواتير شراء لحساب هذه المؤشرات في الواجهة الرئيسية. |
| قائمة الدخل (Income Statement) | ✅ **مطبق** | `app/api/income-statement/route.ts` يعتمد بالكامل على `journal_entries` + `journal_entry_lines` مع `status = 'posted'` ولا يستخدم invoices أو bills. |
| ملخص GL (API) | ✅ **مطبق** | `app/api/dashboard-gl-summary/route.ts` يستدعي `getGLSummary()` بنفس الشروط. |

**ملاحظة:** واجهة لوحة التحكم (Dashboard page) لا تستخدم `/api/dashboard-stats` لعرض الإيرادات أو الأرباح؛ تستخدم `getGLSummary` من الـ Server Component وتمرر النتائج إلى `DashboardStats`. مسار `/api/dashboard-stats` لا يزال موجوداً (مثلاً للتحميل أو عملاء آخرين) ولا يعتمد على GL للإيرادات/الأرباح — يُنصح بإهماله للتقارير المالية أو جعله يقرأ من GL فقط.

---

## 2. توليد القيود المحاسبية من Subledgers → GL

| المصدر | الحالة | الملفات / الآلية |
|--------|--------|-------------------|
| الفواتير (invoices) | ✅ | قيد الإيراد والذمم: `postARRevenueJournal` في `app/invoices/[id]/page.tsx`، و`createInvoiceRevenueJournal` في `lib/accrual-accounting-engine.ts`. قيد COGS: `reference_type = 'invoice_cogs'` مع ربط بالفاتورة. |
| فواتير الشراء (bills) | ✅ | `postBillJournalAndInventory` في `app/bills/[id]/edit/page.tsx`، و`postBillJournalOnFirstPayment` في `app/payments/page.tsx`. قيود من نوع `bill` مع AP والمخزون/المصروفات. |
| المدفوعات (payments) | ✅ | `createPaymentJournal` في `lib/accrual-accounting-engine.ts`، وقيد السداد (Cash/AR) في `app/payments/page.tsx`. |
| حركات المخزون (inventory) | ✅ | قيود الشراء للمخزون، و`invoice_cogs` عند التسليم. |
| حوكمة التكرار | ✅ | `lib/journal-entry-governance.ts`: `checkDuplicateJournalEntry` و`createJournalEntryWithGovernance` تمنع القيود المكررة لنفس المرجع. |

الخلاصة: **GL هو المصدر النهائي للأرقام**؛ القيود تُنشأ تلقائياً من الفواتير والمدفوعات وفواتير الشراء وحركات المخزون.

---

## 3. عدم اعتماد أي Dashboard/تقرير على invoices أو bills مباشرة للإيرادات/المصروفات

| المكون | الحالة | التوضيح |
|--------|--------|---------|
| بطاقات KPIs (إيرادات، COGS، مصروفات، صافي ربح، هامش) | ✅ **لا اعتماد مباشر** | مصدرها `getGLSummary()` فقط (من GL). |
| قائمة الدخل (Income Statement API) | ✅ | من GL فقط. |
| دفتر الأستاذ العام (General Ledger API) | ✅ | من GL فقط. |
| **رسم الأداء الشهري (Performance Charts)** | ⚠️ **استثناء** | `monthlyData` في `app/dashboard/page.tsx` يُبنى من **invoices** (salesByMonth) و**bills** (purchasesByMonth) وليس من GL. يوجد في `getGLSummary` حقل `monthlyBreakdown` (YYYY-MM → revenue, expense) من GL — يُوصى باستخدامه للرسم البياني لتحقيق توحيد المصدر. |
| تقرير الملخص المبسط (simple-report) | ⚠️ **استثناء محدود** | المبيعات والإيرادات والمصروفات وCOGS من GL. **المشتريات**: يُستخدم GL أولاً؛ إذا لم توجد قيود مشتريات يُستخدم جدول **bills** كاحتياطي لعدم إظهار مشتريات = 0 رغم وجود فواتير شراء (موثق في التعليقات). |
| API إحصائيات لوحة التحكم (dashboard-stats) | ⚠️ **غير معتمد على GL للإيرادات** | يحسب المبيعات من `invoices` والأرباح من `salesStats.paid` وCOGS من `cogs_transactions` (مع fallback لـ cost_price). لوحة التحكم الرئيسية **لا تعرض** من هذا الـ API للـ KPIs — لكن أي عميل يستدعي `/api/dashboard-stats` يحصل على أرقام غير GL. يُوصى بعدم استخدامه كمرجع مالي أو تحويله ليعتمد على GL. |

---

## 4. الفلترة بالفرع على مستوى journal_entries.branch_id قبل التجميع

| المكون | الحالة | التفاصيل |
|--------|--------|----------|
| getGLSummary (لوحة التحكم + API ملخص GL) | ✅ **مطبق** | عند تمرير `options.branchId` يُضاف شرط `query.eq("journal_entries.branch_id", options.branchId)` **قبل** جلب السطور وأي تجميع. |
| dashboard-gl-summary API | ✅ | يحدد `effectiveBranchId` حسب الصلاحيات (owner/admin/general_manager يمكنهم أي فرع؛ غيرهم فرعهم فقط) ويمرره إلى `getGLSummary(..., { branchId: effectiveBranchId })`. |
| دفتر الأستاذ العام (General Ledger) RPC | ➖ | دوال `get_gl_transactions_paginated` و`get_gl_account_summary` لا تحتوي معامل `branch_id` — مصممة لعرض مستوى الشركة. فلترة الفرع متوفرة في مسار ملخص GL ولوحة التحكم. |

الخلاصة: **في مسارات لوحة التحكم وملخص GL تتم الفلترة على `journal_entries.branch_id` في الاستعلام قبل أي تجميع.**

---

## 5. تتبع كل رقم مالي حتى مستوى سطر القيد (Audit Trail)

| المكون | الحالة | التفاصيل |
|--------|--------|----------|
| دفتر الأستاذ (تفصيلي حسب حساب) | ✅ | RPC `get_gl_transactions_paginated` تُرجع لكل حركة: `line_id` (سطر القيد)، `reference_type`، `reference_id`، `entry_number`، `date`، `debit`، `credit`. يمكن تتبع أي مبلغ إلى قيد وسطر محدد. |
| قائمة الدخل | ➖ | يعرض تجميعاً حسب الحساب؛ التتبع إلى السطر يتم عبر فتح دفتر الأستاذ للحساب المعني. |
| ملخص GL | ➖ | يعرض مجاميع؛ التتبع يتم عبر دفتر الأستاذ أو تقرير تفصيلي مرتبط بالحسابات. |

الخلاصة: **يمكن تتبع كل رقم مالي حتى مستوى سطر القيد** عبر دفتر الأستاذ (مع `line_id` و`reference_type` و`reference_id`).

---

## 6. Company Ledger = مجموع Branch Ledgers (مع استثناء branch_id IS NULL)

| المعيار | الحالة | التفاصيل |
|--------|--------|----------|
| تصميم البيانات | ✅ **متوافق** | جدول `journal_entries` يحتوي على `branch_id` (قابل لـ NULL). عرض الشركة = كل القيود (أي branch_id). عرض الفرع = قيود حيث `journal_entries.branch_id = <branch_id>`. |
| العلاقة الرياضية | ✅ | **Company Ledger** = قيود (branch_id أي قيمة بما فيها NULL). **Branch Ledger لفرع B** = قيود حيث branch_id = B. المجموع: Sum(Branch Ledgers لجميع الفروع) + قيود حيث **branch_id IS NULL** = Company Ledger. القيود ذات `branch_id IS NULL` (مثل قيود افتتاحية أو مركزية) لا تُنسب لفرع معين وتُحسب مرة واحدة على مستوى الشركة. |
| تنفيذ صريح في الكود | ➖ | لا يوجد دالة واحدة تتحقق من المساواة رياضياً؛ لكن البنية تدعم المفهوم و`getGLSummary` بدون `branchId` يعطي مستوى الشركة ومع `branchId` يعطي مستوى الفرع. |

الخلاصة: **نعم** — تصميم الدفاتر يتوافق مع أن Company Ledger = مجموع Branch Ledgers مع استثناء القيود غير المرتبطة بفرع (branch_id IS NULL).

---

## 7. الصلاحيات وعدم تسرب بيانات الفروع (Server-Side Authorization)

| المعيار | الحالة | التفاصيل |
|--------|--------|----------|
| التحقق من الفرع على الخادم | ✅ | `secureApiRequest` في `lib/api-security-enhanced.ts` يقرأ العضوية من `company_members` (branch_id, role) على الخادم ويرجع `branchId: member.branch_id`. لا يعتمد على قيمة فرع من العميل فقط. |
| فلترة البيانات حسب الفرع | ✅ | استخدام `buildBranchFilter(branchId, member.role)` في عدة APIs: owner/admin يرون كل الفروع (فلتر فارغ)؛ غيرهم مقيدون بفرعهم. الفلتر يُطبق في استعلامات الخادم (invoices، bills، journal_entries حيثما وُجد). |
| dashboard-gl-summary | ✅ | التحقق: `canAccessBranch = isPrivileged || memberBranchId === requestedBranchId`؛ إن طلب المستخدم فرعاً غير مسموح يُرجع 403. |
| منع تسرب بيانات فرع آخر | ✅ | APIs التي تتطلب `requireBranch: true` (مثل dashboard-stats، account-lines، aging-ar، إلخ) ترفض الطلب إذا لم يكن للمستخدم فرع، وتُمرر `branchId` و`buildBranchFilter` لتصفية النتائج. |

الخلاصة: **نعم** — نظام الصلاحيات يمنع الوصول لبيانات فرع غير مصرح به على مستوى الخادم (Server-Side Authorization)، ولا يعتمد على الفرع من العميل دون التحقق من العضوية.

---

## تأكيد المعايير المطلوبة

| المعيار | الحالة |
|---------|--------|
| **Single Source of Truth عبر GL** | ✅ مطبق للمؤشرات الرئيسية (إيرادات، COGS، مصروفات، صافي ربح، هامش) في لوحة التحكم وقائمة الدخل وملخص GL. استثناءات: رسم الأداء الشهري من invoices/bills؛ simple-report احتياطي مشتريات من bills؛ API dashboard-stats غير معتمد على GL. |
| **Branch Ledger Isolation** | ✅ الفلترة على `journal_entries.branch_id` في استعلامات ملخص GL ولوحة التحكم قبل التجميع؛ تصميم الدفاتر يدعم عزل الفرع. |
| **Role & Branch-Aware Access Control** | ✅ صلاحيات حسب الدور وربط المستخدم بفرع من `company_members`؛ فلترة البيانات حسب الفرع والدور على الخادم. |
| **No Cross-Branch Data Leakage** | ✅ التحقق من الفرع وبناء الفلتر على الخادم؛ منع عرض بيانات فرع غير مصرح به في dashboard-gl-summary ومسارات أخرى. |
| **Financial Consistency & Auditability** | ✅ القيود تُولد من Subledgers وتُحفظ في GL؛ التقارير المالية الرسمية من GL؛ إمكانية التتبع حتى سطر القيد عبر دفتر الأستاذ. |

---

## توصيات اختيارية لتعزيز الامتثال الكامل

1. **رسم الأداء الشهري:** استخدام `monthlyBreakdown` من `getGLSummary()` بدلاً من تجميع `invoices` و`bills` في `app/dashboard/page.tsx` ليكون مصدر الرسم البياني GL فقط.
2. **تقرير simple-report:** تقييد مصدر المشتريات بالـ GL فقط (أو توثيق واضح أن استخدام bills احتياطي تشغيلي وليس للمرجعية المحاسبية النهائية).
3. **API dashboard-stats:** إما إهمال استخدامه للتقارير المالية أو جعل مؤشرات الإيرادات/الأرباح/COGS تعتمد على GL (مثلاً استدعاء `getGLSummary` أو استعلام مشابه).
4. **دفتر الأستاذ العام (RPC):** إضافة معامل اختياري `p_branch_id` لدوال `get_gl_transactions_paginated` و`get_gl_account_summary` إذا رُغب في تقارير دفتر أستاذ على مستوى الفرع من نفس الـ API.

---

---

## تنفيذ ERP Financial Core (2025-02-21)

تم تنفيذ المتطلبات التالية:

### 1. توحيد التقارير المالية على GL فقط
- **Performance Charts:** الرسم البياني الشهري يعتمد على `getGLSummary().monthlyBreakdown` فقط (لا invoices/bills).
- **`/api/dashboard-stats`:** الإيرادات، COGS، المصروفات، صافي الربح، وهامش الربح من `getGLSummary()` فقط.
- **`/api/simple-report`:** إزالة fallback المشتريات من bills — المشتريات من GL فقط.

### 2. branch_id إجباري في journal_entries
- **Migration:** `20260221_010_erp_financial_core.sql`: تعيين القيود ذات `branch_id IS NULL` إلى الفرع الرئيسي أو فرع "HQ" ثم `ALTER COLUMN branch_id SET NOT NULL`.
- **ملاحظة:** أي مسار في التطبيق ينشئ قيداً جديداً يجب أن يمرّر `branch_id` (غير null).

### 3. إغلاق الفترات المحاسبية (fiscal_periods)
- جدول **`fiscal_periods`** (company_id, year, month, status: open/closed/locked).
- **`check_fiscal_period_locked(company_id, entry_date)`** وتكاملها مع **`enforce_period_lock_header`** لمنع إنشاء/تعديل/حذف قيد في فترة مغلقة.
- **`close_fiscal_period`** و **`reopen_fiscal_period`** مع تسجيل في **`system_audit_log`**.

### 4. منع تعديل القيود المرحلة (Reversal-Only)
- عمود **`reversal_of_entry_id`** في `journal_entries`.
- Triggers: **`enforce_posted_entry_no_edit`** (لا UPDATE/DELETE على قيد posted)، **`enforce_posted_entry_lines_no_edit`** (لا إضافة/تعديل/حذف سطور قيد مرحّل).
- **RPC:** **`create_reversal_entry(original_entry_id, reversal_date, posted_by)`** لإنشاء القيد العكسي.

### 5. سجل تدقيق ثابت (system_audit_log)
- جدول **`system_audit_log`** (user_id, action, entity_type, entity_id, before_snapshot, after_snapshot, created_at) مع trigger يمنع UPDATE/DELETE.
- **`system_audit_log_insert`** للتسجيل من التطبيق أو RPC. يُستخدم في close/reopen period.

### 6. حوكمة دليل الحسابات
- عمود **`is_archived`** في `chart_of_accounts`.
- عند **DELETE** لحساب له قيود: يتم **أرشفته** (UPDATE is_archived=TRUE, is_active=FALSE) بدلاً من الحذف.
- منع تغيير **account_type** بعد أول استخدام (موجود مسبقاً في `prevent_critical_account_changes`).

---

*تم إعداد هذا التقرير بناءً على مراجعة الكود في المشروع بتاريخ 2025-02-21.*
