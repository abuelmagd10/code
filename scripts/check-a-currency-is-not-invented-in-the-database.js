#!/usr/bin/env node
/**
 * check-a-currency-is-not-invented-in-the-database.js
 * ---------------------------------------------------------------------------
 * v3.75.52 — **«ولا تُخترَعُ عملةٌ، بل تُقرأُ من صاحبِها».**
 *
 * لماذا وُلد هذا الحارس
 * ---------------------
 * حارسُ v3.75.50 يمنعُ أن تُكتَبَ عملةٌ حرفاً **فى شيفرةِ الشاشات**. وكانت
 * القاعدةُ نفسُها بلا عين: قِيست فوُجدَ فيها **٤٨ موضعاً** تُسمّى عملةً
 * بعينِها داخلَ دوالِّها، و**٣٣ عموداً** فى جداولِ الشركاتِ تحملُ عملةً
 * مكتوبةً كقيمةٍ افتراضيّة — ثلاثةٌ منها لا تقولُ حتى الجنيه:
 * `purchase_orders.currency = 'SAR'`، و`approval_workflows.currency_code = 'USD'`،
 * و`company_seats.display_currency = 'USD'`.
 *
 * وثلاثةٌ من تلك المواضعِ لم تكن تسميةً بل **قرارَ مال**: مُشغِّلاتٌ تقسمُ
 * المبلغَ على سعرِ صرفٍ إن لم تكنِ العملةُ «جنيهاً» مكتوباً حرفاً. فسُدِّدت
 * فى v3.75.52، ووُلدَ لها بيتٌ واحد: `erp_company_base_currency(uuid)`.
 *
 * **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.** فهذا الحارسُ يُثبِّتُ ما بقى ويرفضُ
 * فى الاتّجاهَين: لا موضعَ جديدٌ يُسمّى عملةً فى القاعدة، ولا عمودَ جديدٌ
 * يخترعُ عملةً لشركةٍ لم تُسجَّلْ بعد — **ومن سدَّد يُثبِّتُ رقمَه الجديدَ فى
 * الدفعةِ التى سدَّدت**، وإلّا رفضَ الحارسُ أيضاً.
 *
 * ما يفحصه — بالأثرِ لا بالاسم
 * -----------------------------
 *   (١) دوالُّ القاعدةِ التى تُسمّى عملةً بعينِها **بعدَ حجبِ التعليقات** —
 *       فـ**التعليقُ ليس تعليمة**. وتُستثنى `assert_baseline_%` بالاسم، لأنّ
 *       الفحوصَ المرجعيّةَ تحملُ نصَّ المواصفةِ نفسِه — **وفحصٌ يعدُّ نفسَه
 *       ليس فحصاً**.
 *   (٢) أعمدةُ جداولِ الشركاتِ (التى تحملُ `company_id`) وقيمُها الافتراضيّةُ
 *       التى تُسمّى عملة. وما ليس من جداولِ الشركاتِ يُعلَنُ بسببِه وشرطِ رفعِه.
 *   (٣) المُسدَّدون (ثلاثةُ مُشغِّلاتٍ وثلاثةُ كُتّاب): لا يُسمّون عملةً، **وينادون البيتَ
 *       الواحدَ فعلاً** — والذِّكرُ ليس نداءً، فيُقاسُ نصُّ النداءِ لا نصُّ الاسم.
 *   (٤) البيتُ الواحدُ قائمٌ، **بصلاحيّاتِ مُنادِيه** لا بصلاحيّاتٍ كاملة،
 *       ولا يبلغُه زائرٌ ولا مستخدِمٌ مسجَّل.
 *   (٥) الفحصُ المرجعىُّ `assert_baseline_v3_75_52_check` قائمٌ ومغلَقٌ —
 *       **وحارسٌ يُفتَحُ بابُه ليس حارساً**.
 *
 * ويُصنَّفُ كلُّ موضعٍ باقٍ بأثرِه: **شرطٌ يتفرّعُ عليه سلوك** إن كانتِ العملةُ فى موضعِ
 * مقارنةٍ يتفرّعُ عليها حساب، و**وسمٌ يُكتَبُ أو يُرسَل** إن كانت قيمةً تُسجَّلُ
 * أو تُعرَض. والأوّلُ أثقل، ويُسدَّدُ أوّلاً — **الاهمُّ ثمّ الاهمّ**.
 *
 * الاستعمال
 * ---------
 *   node scripts/check-a-currency-is-not-invented-in-the-database.js [--require-db]
 *   node scripts/check-a-currency-is-not-invented-in-the-database.js --selftest
 * ---------------------------------------------------------------------------
 */
"use strict"

const { withLiveDatabase } = require("./lib/live-db")

/** الأرقامُ المُثبَّتة — قِيست حيّةً على البيتَين يومَ v3.75.52. */
// v3.75.63 — «والعملةُ تُسألُ لا تُفترَض»: السبعُ والعشرون شُفيت كلُّها فى
// دفعةٍ واحدةٍ، فصارَ كلُّ افتراضِ عملةٍ نداءً للبيتِ الواحد — والرقمُ صفرٌ
// مُثبَّتٌ فى الاتّجاهَين. **والدفعةُ التى كسبَت هى التى تُثبِّت.**
const PINNED_FUNCS = 0
const PINNED_SITES = 0
// v3.75.64 — «والصفُّ يُولَدُ بعملةِ صاحبِه»: القيمُ الافتراضيّاتُ التسعُ
// والعشرون نُزِعَت كلُّها وقامَ مُشغِّلُ الميلادِ يسألُ البيتَ عن الصامت،
// وعمودُ تسعيرِ المنصّةِ صارَ مُعلَناً بالاسمِ كإخوتِه لا دَيناً معدوداً —
// والرقمُ صفرٌ مُثبَّتٌ فى الاتّجاهَين. **والدفعةُ التى كسبَت هى التى تُثبِّت.**
const PINNED_DEFAULTS = 0

/** البيتُ الواحدُ وعنوانُ السداد. */
const HOME = "erp_company_base_currency"
const BASELINE = "assert_baseline_v3_75_52_check"

/**
 * المُسدَّدون — **وكلٌّ يُحاكَمُ بالوسيطِ الذى يُعطاه هو**، لا بوسيطِ غيرِه:
 * فالمُشغِّلُ يقرأُ الشركةَ من صفِّه (NEW.company_id)، والكاتبُ من وسيطِه
 * (p_company_id). **وشكلُ النداءِ خاصّيّةٌ فى صاحبِه لا قالبٌ واحدٌ للجميع.**
 *
 * وsecdefOnly تعنى: لهذا الاسمِ نسخةٌ أخرى بصلاحيّاتِ مُنادِيها **مُعلَنةٌ
 * ومؤجَّلةٌ على قرارِ صلاحيّة** — فلا تُحاكَمُ هنا ولا يُسكَتُ عنها.
 */
const HEALED = [
  // v3.75.52 — ثلاثةُ مُشغِّلات
  { name: "fill_customer_credit_fx_from_source",        arg: "NEW.company_id" },
  { name: "fill_customer_credit_ledger_fx_from_source", arg: "NEW.company_id" },
  { name: "fill_vendor_credit_fx_from_source",          arg: "NEW.company_id" },
  // v3.75.55 — ثلاثةُ كُتّابٍ للمرتجع
  { name: "process_purchase_return_atomic",             arg: "p_company_id" },
  { name: "process_purchase_return_multi_warehouse",    arg: "p_company_id" },
  { name: "post_purchase_transaction",                  arg: "p_company_id", secdefOnly: true },
  // v3.75.57 — أربعةُ كُتّابٍ **بصلاحيّاتِ مُنادِيهم**، ونداؤهم قائمٌ على منحةِ
  // v3.75.56 المُثبَّتة. ولإشعارِ المَدينِ نسختان تُحاكَمانِ معاً بالاسمِ نفسِه،
  // **ولا تشفعُ نسخةٌ لأخرى**.
  { name: "create_customer_debit_note",                 arg: "p_company_id" },
  { name: "create_sales_order_atomic",                  arg: "(p_so_data->>'company_id')::uuid" },
  { name: "create_vendor_credit_with_items",            arg: "(p_credit->>'company_id')::UUID" },
  // v3.75.63 — «والعملةُ تُسألُ لا تُفترَض»: السبعُ والعشرون التى كانت
  // تفترضُ «EGP» صارَ كلٌّ منها ينادى البيتَ بوسيطِه هو. (نسخةُ الدفعِ
  // القديمةُ ذاتُ الخمسةَ عشرَ وسيطاً باسمِ process_invoice_payment_atomic_v2
  // لا تقرأُ عملةً أصلاً فلا تُحاكَمُ هنا كى لا يصرخَ الحارسُ على معلوم —
  // ونسخةُ العشرين وسيطاً تُثبَّتُ بعددِ وسائطِها داخلَ
  // assert_baseline_v3_75_63_check فى القاعدةِ نفسِها، **فلا مسكوتَ عنه**.)
  { name: "apply_customer_credit_to_invoice",           arg: "p_company_id" },
  { name: "auto_create_payment_journal",                arg: "NEW.company_id" },
  { name: "dispose_asset",                              arg: "v_company_id" },
  { name: "execute_payment_correction",                 arg: "p_company_id" },
  { name: "execute_vendor_payment_correction",          arg: "p_company_id" },
  { name: "post_depreciation",                          arg: "v_asset_company_id" },
  { name: "run_fx_revaluation",                         arg: "p_company_id" },
  { name: "create_auto_invoice_from_sales_order",       arg: "v_so.company_id" },
  { name: "po_evaluate_discount_approval",              arg: "v_po.company_id" },
  { name: "so_evaluate_discount_approval",              arg: "v_so.company_id" },
  { name: "prevent_bill_overpayment",                   arg: "b.company_id" },
  { name: "prevent_return_creating_overpay",            arg: "b.company_id" },
  { name: "post_expense_atomic",                        arg: "p_company_id" },
  { name: "bill_branch_manager_notify_trg",             arg: "NEW.company_id" },
  { name: "bill_notify_accountant_trg",                 arg: "NEW.company_id" },
  { name: "invoice_branch_manager_notify_trg",          arg: "NEW.company_id" },
  { name: "invoice_notify_accountant_trg",              arg: "NEW.company_id" },
  { name: "payment_branch_manager_notify_trg",          arg: "NEW.company_id" },
  { name: "payment_customer_branch_manager_notify_trg", arg: "NEW.company_id" },
  { name: "payment_supplier_notify_approval_trg",       arg: "NEW.company_id" },
  { name: "po_branch_manager_notify_trg",               arg: "NEW.company_id" },
  { name: "purchase_return_branch_manager_notify_trg",  arg: "NEW.company_id" },
  { name: "purchase_return_notify_approval_trg",        arg: "NEW.company_id" },
  { name: "sales_return_branch_manager_notify_trg",     arg: "NEW.company_id" },
  { name: "sales_return_notify_approval_trg",           arg: "NEW.company_id" },
  { name: "so_branch_manager_notify_trg",               arg: "NEW.company_id" },
  // v3.75.64 — «والصفُّ يُولَدُ بعملةِ صاحبِه»: مُشغِّلُ الميلادِ الواحدُ
  // يختمُ الصامتَ بسؤالِ البيت، وحارسُ إشعارِ المَدينِ يرفضُ أجنبيّةً بلا
  // صفِّ صرفٍ بسؤالِ البيتِ نفسِه — كلاهما وُلدَ فى الدفعةِ التى نزعَت
  // القيمَ الافتراضيّات.
  { name: "erp_currency_is_asked_at_birth",             arg: "(v_row->>'company_id')::uuid" },
  { name: "erp_debit_note_no_foreign_without_fx",       arg: "NEW.company_id" },
]

/**
 * أعمدةٌ تُسمّى عملةً ولا تخصُّ شركةً بعينِها — **ومعلومٌ يُعلَنُ لا يُسكَتُ عنه**.
 * كلُّ إعلانٍ يحملُ سببَه وشرطَ رفعِه، ويُقاسُ أنّه ما زال حيّاً فى كلِّ تشغيل.
 */
const DECLARED = {
  "companies.base_currency": {
    why: "هذا هو **موضعُ الاختيارِ نفسُه**: العمودُ الذى يُسألُ عنه كلُّ ما سواه. وقيمتُه الافتراضيّةُ لا تُقرَأُ فى الواقع، فمسارُ التسجيلِ يكتبُها صراحةً من اختيارِ المالك",
    lift: "يُرفَع حين يصيرُ العمودُ بلا افتراضٍ أصلاً — وذلك يحتاجُ قياسَ كلِّ مسارِ إنشاءِ شركةٍ أنّه يقولُ العملةَ صراحةً",
  },
  "pending_companies.currency": {
    why: "التسجيلُ يقعُ **قبلَ وجودِ شركة**، فلا صفَّ تُقرأُ منه العملة. والقيمةُ الافتراضيّةُ هنا اختيارٌ أوّلىٌّ تُبدِّلُه الشاشةُ قبلَ الإرسال",
    lift: "يُرفَع حين تُجبِرُ شاشةُ التسجيلِ على اختيارٍ صريحٍ فيصيرُ العمودُ بلا افتراض",
  },
  "subscription_plans.base_currency": {
    why: "**عملةُ المشروعِ نفسِه** فى تسعيرِ الاشتراكات، لا عملةَ عميل. وهى قرارُ صاحبِ المنصّةِ لا قرارُ الشركةِ المشتركة",
    lift: "يُرفَع حين تُنقَلُ عملةُ التسعيرِ إلى إعداداتِ المنصّةِ فيصيرُ العمودُ بلا افتراض",
  },
  "company_seats.display_currency": {
    why: "**عملةُ عرضِ تسعيرِ المنصّةِ لمقاعدِها** لا عملةَ دفاترِ شركة (كأختِها subscription_plans.base_currency): مساراتُ الفوترةِ تكتبُها صراحةً من محرِّكِ التسعير، والافتراضُ يُطابقُ أساسَ تسعيرِ المنصّةِ المُعلَنَ لا مالَ عميل",
    lift: "يُرفَع حين يكتبُ مسارُ المقاعدِ increase_seats عملةَ التسعيرِ صراحةً فيصيرُ العمودُ بلا افتراض",
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// الأحكامُ الخالصة — تُقاسُ فى الفخِّ الذاتىِّ بلا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/** **ويرفضُ فى الاتّجاهَين**: زيادةٌ عطبٌ جديد، ونقصانٌ مكسبٌ لم يُثبَّت. */
function judgePin(found, pinned) {
  if (found > pinned) return "grew"
  if (found < pinned) return "shrank"
  return "ok"
}

/**
 * **ويُسمّى ما يُقاسُ لا أكثرَ منه**: هذا الحكمُ يرى **شكلَ الموضع** — هل
 * العملةُ فى مقارنةٍ يتفرّعُ عليها سلوك، أم فى قيمةٍ تُكتَبُ أو تُرسَل — **ولا
 * يعرفُ أهُوَ حسابُ مالٍ أم نصُّ وصفٍ يُعرَض**. وذلك يُقرأُ بالعينِ فى دفعةِ
 * السداد. وقد سُمِّىَ الصنفُ الأوّلُ «قرارَ مالٍ» فى v3.75.52 فأوهمَ أكثرَ
 * ممّا قِيس — فصارَ يُسمّى ما يُقاسُ: **شرطٌ يتفرّعُ عليه سلوك**.
 */
function classifySite(line) {
  const s = String(line || "")
  const q = "'(?:EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)'"
  const compared = new RegExp("(?:=|<>|!=|IN\\s*\\()\\s*" + q, "i").test(s) ||
                   new RegExp(q + "\\s*(?:=|<>|!=)", "i").test(s)
  const branching = /\b(CASE\s+WHEN|IF|ELSIF|AND|OR|WHERE)\b/i.test(s)
  return compared && branching ? "شرطٌ يتفرّعُ عليه سلوك" : "وسمٌ يُكتَبُ أو يُرسَل"
}

/** ولا إعلانٌ ميّت: كلُّ عمودٍ مُعلَنٍ يجبُ أن يكونَ حيّاً فى القاعدة. */
function judgeDeadDeclarations(liveCols) {
  const live = new Set(liveCols || [])
  return Object.keys(DECLARED).filter((k) => !live.has(k)).sort()
}

/**
 * والبيتُ الواحدُ يُحاكَمُ **بخاصّيّتِه لا بإغلاقِه** (v3.75.56):
 * قائمٌ · بصلاحيّاتِ مُنادِيه · وجدولُ الشركاتِ محمىٌّ بحمايةِ الصفوف · ولا
 * يبلغُه زائرٌ ولا عمومُ الأدوار.
 *
 * **والحكمُ بالأثرِ لا بالاسم**: الإغلاقُ أمامَ المستخدِمِ المسجَّلِ اسمٌ لا أثر.
 * فالبيتُ بصلاحيّاتِ مُنادِيه — من ناداه جرى بحقِّه هو، فحمايةُ الصفوفِ على
 * companies تحكمُه بالضبطِ كما تحكمُ القراءةَ المباشرةَ من الجدولِ التى يملكُها
 * المستخدِمُ المسجَّلُ أصلاً. **فالمنحةُ لا تُوسِّعُ معلومةً واحدة.** أمّا أن
 * يصيرَ بصلاحيّاتٍ كاملةٍ أو تُرفَعَ الحمايةُ عن صفوفِ جدولِه فعطبانِ حقيقيّان
 * **لم يكن شرطُ الإغلاقِ يراهما** — ولذلك بُدِّلَ السؤالُ إلى الأقوى لا رُفِع.
 *
 * **ومعدودٌ لا مسكوتٌ عنه**: منحةُ المستخدِمِ المسجَّلِ تُعَدُّ وتُعرَضُ فى
 * التقرير ولا تُشترَطُ بعد — فلا كاتبَ يعتمدُ عليها اليوم. وأوّلُ دفعةٍ يعتمدُ
 * فيها كاتبٌ عليها **تُثبِّتُها**، فمكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.
 */
function judgeHome(row) {
  const out = []
  const r = row || {}
  if (!Number(r.exists_)) out.push("البيتُ الواحدُ " + HOME + " غائبٌ من القاعدة — **وبحثٌ لا يجد ليس دليلَ غياب**، فهذا غيابٌ مقيس")
  else {
    if (Number(r.secdef)) out.push(HOME + " صارَ بصلاحيّاتٍ كاملة — وكان بصلاحيّاتِ مُنادِيه عن قصد، فحمايةُ الصفوفِ تحرسُه، والمنحةُ المُعلَنةُ تصيرُ عندئذٍ باباً لصفوفِ غيرِ صاحبِها")
    if (!Number(r.rls)) out.push("رُفعت حمايةُ الصفوفِ عن جدولِ companies — **وهى الحارسُ الحقيقىُّ للبيتِ لا إغلاقُه**")
    if (Number(r.open_)) out.push(HOME + " صارَ يبلغُه زائرٌ أو عمومُ الأدوار (" + r.open_ + " صلاحيّة)")
  }
  return out
}

/** والمُشغِّلاتُ المُسدَّدةُ تُحاكَمُ بالنداءِ لا بالاسم. */
function judgeHealed(rows) {
  const out = []
  const all = rows || []
  for (const h of HEALED) {
    // **ولا يُحكَمُ على موضعٍ لم يُقرَأ**: الاسمُ قد يحملُ أكثرَ من نسخة، فتُقرأُ
    // النسخُ المعنيّةُ كلُّها ويجبُ أن تصدُقَ جميعُها — لا أن تشفعَ واحدةٌ لأخرى.
    const mine = all.filter((r) => r.proname === h.name && (!h.secdefOnly || Number(r.prosecdef)))
    if (!mine.length) { out.push(h.name + " اختفى من القاعدة"); continue }
    for (const r of mine) {
      if (Number(r.names_currency)) out.push(h.name + " عادَ يُسمّى عملةً بعينِها")
      if (!Number(r.calls_home)) out.push(h.name + " لم يعُدْ ينادى " + HOME + "(" + h.arg + ") — **والذِّكرُ ليس نداءً**")
    }
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, JSON.stringify(got), JSON.stringify(exp)])

  // ── التثبيتُ يرفضُ فى الاتّجاهَين ────────────────────────────────────────
  t("يمرُّ حين يُطابقُ الرقمُ المُثبَّت", judgePin(35, 35), "ok")
  t("ويرفضُ موضعاً جديداً", judgePin(36, 35), "grew")
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه", judgePin(34, 35), "shrank")
  t("ويرفضُ الصفرَ غيرَ المُثبَّت", judgePin(0, 35), "shrank")

  // ── التصنيفُ بالأثر ─────────────────────────────────────────────────────
  t("يرى قرارَ مالٍ فى مقارنةِ CASE", classifySite("CASE WHEN v_currency = 'EGP' THEN NEW.amount ELSE x END"), "شرطٌ يتفرّعُ عليه سلوك")
  t("ويراه فى شرطِ IF", classifySite("IF v_exp_currency <> 'EGP' THEN"), "شرطٌ يتفرّعُ عليه سلوك")
  t("ويراه فى شرطِ WHERE", classifySite("AND COALESCE(p.original_currency, 'EGP') <> 'EGP'"), "شرطٌ يتفرّعُ عليه سلوك")
  t("ويرى الوسمَ حين تكونُ قيمةً تُكتَب", classifySite("v_currency := COALESCE(NEW.currency_code, 'EGP');"), "وسمٌ يُكتَبُ أو يُرسَل")
  t("ويراه فى قيمةٍ تُدخَلُ فى صفّ", classifySite("COALESCE(NULLIF(p_so_data->>'currency', ''), 'EGP'),"), "وسمٌ يُكتَبُ أو يُرسَل")
  t("ولا يعدُّ مساواةَ تعيينٍ مقارنةً", classifySite("v_base_ccy := UPPER(COALESCE(v_base_ccy, 'EGP'));"), "وسمٌ يُكتَبُ أو يُرسَل")
  t("ولا يحكمُ على سطرٍ بلا عملة", classifySite("NEW.original_amount := NEW.amount;"), "وسمٌ يُكتَبُ أو يُرسَل")

  // ── الإعلاناتُ حيّةٌ وكاملة ──────────────────────────────────────────────
  const ALIVE = Object.keys(DECLARED)
  t("يقبلُ الإعلاناتِ كلَّها حيّة", judgeDeadDeclarations(ALIVE).length, 0)
  t("ويمسكُ إعلاناً مات عمودُه", judgeDeadDeclarations(ALIVE.slice(1)).length, 1)
  t("ويُسمّى الميّتَ بعينِه", judgeDeadDeclarations(ALIVE.slice(1))[0], ALIVE[0])
  t("ويمسكُ موتَ الجميع", judgeDeadDeclarations([]).length, ALIVE.length)
  t("ولا إعلانَ بلا سبب", Object.values(DECLARED).every((d) => d.why && d.why.length > 30), true)
  t("ولا إعلانَ بلا شرطِ رفع", Object.values(DECLARED).every((d) => d.lift && d.lift.length > 20), true)

  // ── البيتُ الواحدُ يُحاكَمُ بخاصّيّتِه لا بإغلاقِه (v3.75.56) ────────────
  t("يقبلُ بيتاً قائماً بصلاحيّاتِ مُنادِيه وجدولُه محمىٌّ ولا يبلغُه زائر",
    judgeHome({ exists_: 1, secdef: 0, rls: 1, open_: 0 }).length, 0)
  t("ويرفضُ غيابَه", judgeHome({ exists_: 0 }).length, 1)
  t("ويرفضُ أن يصيرَ بصلاحيّاتٍ كاملة", judgeHome({ exists_: 1, secdef: 1, rls: 1, open_: 0 }).length, 1)
  t("ويرفضُ أن تُرفَعَ حمايةُ الصفوفِ عن جدولِ الشركات — وهى الحارسُ الحقيقىّ",
    judgeHome({ exists_: 1, secdef: 0, rls: 0, open_: 0 }).length, 1)
  t("ويُسمّى الجدولَ الذى رُفعت عنه الحمايةُ بعينِه",
    judgeHome({ exists_: 1, secdef: 0, rls: 0, open_: 0 })[0].indexOf("companies") >= 0, true)
  t("ويرفضُ أن يبلغَه زائرٌ أو عمومُ الأدوار", judgeHome({ exists_: 1, secdef: 0, rls: 1, open_: 2 }).length, 1)
  // **والحكمُ بالأثرِ لا بالاسم**: منحةُ المستخدِمِ المسجَّلِ مُعلَنةٌ ومقصودةٌ
  // ولا تُوسِّعُ معلومة، فلا تُعَدُّ عطباً — وتُعَدُّ وتُعرَضُ فى التقرير،
  // **ومعدودٌ لا مسكوتٌ عنه**.
  t("ولا يصرخُ على منحةِ المستخدِمِ المسجَّلِ المُعلَنة — والحكمُ بالأثرِ لا بالاسم",
    judgeHome({ exists_: 1, secdef: 0, rls: 1, open_: 0, auth: 1 }).length, 0)
  t("ويجمعُ العطبَينِ الحقيقيَّين", judgeHome({ exists_: 1, secdef: 1, rls: 0, open_: 0 }).length, 2)
  t("ويجمعُ الثلاثةَ حين تجتمع", judgeHome({ exists_: 1, secdef: 1, rls: 0, open_: 1 }).length, 3)

  // ── والمُسدَّدُ يُحاكَمُ بالنداءِ لا بالاسم ──────────────────────────────
  const OK3 = HEALED.map((h) => ({ proname: h.name, prosecdef: 1, names_currency: 0, calls_home: 1 }))
  t("يمرُّ حين المُسدَّدون كلُّهم نظافٌ وينادون البيت", judgeHealed(OK3).length, 0)
  t("ويرفضُ عودةَ عملةٍ حرفيّةٍ فى أحدِهم",
    judgeHealed(OK3.map((r, i) => (i === 0 ? { ...r, names_currency: 1 } : r))).length, 1)
  t("ويرفضُ من كفَّ عن نداءِ البيت — والذِّكرُ ليس نداءً",
    judgeHealed(OK3.map((r, i) => (i === 1 ? { ...r, calls_home: 0 } : r))).length, 1)
  t("ويرفضُ كاتبَ المرتجعِ إن كفَّ هو أيضاً",
    judgeHealed(OK3.map((r, i) => (i === 3 ? { ...r, calls_home: 0 } : r))).length, 1)
  t("ويُسمّى الغائبَ بعينِه", judgeHealed(OK3.slice(1)).length, 1)
  t("ويرفضُ الجميعَ حين لا صفَّ أصلاً — وبحثٌ لا يجد ليس دليلَ حياة", judgeHealed([]).length, HEALED.length)
  // **ولا تشفعُ نسخةٌ لأخرى**: نسختانِ بالاسمِ نفسِه، إحداهما كفَّت — يُرفَض
  t("ولا تشفعُ نسخةٌ سليمةٌ لنسخةٍ كفَّت", judgeHealed(
    OK3.concat([{ proname: "process_purchase_return_atomic", prosecdef: 1, names_currency: 0, calls_home: 0 }])).length, 1)
  // **والنسخةُ بصلاحيّاتِ مُنادِيها مُعلَنةٌ فلا تُحاكَم** — وإلّا صرخَ الحارسُ على معلوم
  t("ولا يُحاكَمُ المُعلَنُ بصلاحيّاتِ مُنادِيه", judgeHealed(
    OK3.concat([{ proname: "post_purchase_transaction", prosecdef: 0, names_currency: 1, calls_home: 0 }])).length, 0)

  let fail = 0
  for (const [name, got, exp] of cases) {
    const ok = got === exp
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════════════════════
// القياسُ الحىّ
// ═══════════════════════════════════════════════════════════════════════════
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قياسُ عملاتِ القاعدة."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

// **بيتٌ واحدٌ للقاعدةِ النمطيّة**: تُكتَبُ مرّةً وتُستعمَلُ فى كلِّ استعلام.
const CCY = "'''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)'''"
// **والتعليقُ ليس تعليمة**: يُحجَبُ الكتلىُّ والسطرىُّ قبلَ الحكم.
const BLANK = "regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', ' ', 'gs'), '--[^\\n]*', ' ', 'g')"

;(async () => {
  const data = await withLiveDatabase(url, async (c) => {
    // **ويُسمّى الأثرَ لا الشكل**: يُعادُ كلُّ موضعٍ **بسطرِه** لا سطرٌ واحدٌ
    // نموذجاً عن الدالّة — فتصنيفُ موضعٍ بسطرِ موضعٍ آخَر حكمٌ على ما لم يُقرَأ،
    // وهو الذى أخطأ فى v3.75.52 فصنَّفَ نصَّ وصفٍ «قرارَ مالٍ».
    const sites = (await c.query(`
      WITH src AS (
        SELECT p.oid, p.proname, ${BLANK} AS body
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')
          AND p.proname NOT LIKE 'assert_baseline_%'
      ), ln AS (
        SELECT s.oid, s.proname, t.ord, btrim(t.line) AS line
        FROM src s,
             LATERAL (SELECT row_number() OVER () AS ord, line
                        FROM regexp_split_to_table(s.body, E'\\n') AS line) t
      )
      SELECT oid::text AS oid, proname, ord::int AS ord, line,
             (SELECT count(*) FROM regexp_matches(line, ${CCY}, 'g'))::int AS hits
      FROM ln WHERE line ~ ${CCY}
      ORDER BY proname, ord`)).rows

    const defaults = (await c.query(`
      SELECT c.table_name || '.' || c.column_name AS col,
             replace(replace(c.column_default, '::character varying', ''), '::text', '') AS dflt,
             EXISTS (SELECT 1 FROM information_schema.columns k
                      WHERE k.table_schema = 'public' AND k.table_name = c.table_name
                        AND k.column_name = 'company_id') AS tenant
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND c.column_name ILIKE '%currency%'
        AND c.column_default ~ '''[A-Z]{3}'''
      ORDER BY col`)).rows

    // **وكلٌّ يُقاسُ بوسيطِه**: النداءُ يُبحَثُ عنه بالشكلِ الذى يخصُّ صاحبَه،
    // فلا يُبرَّأُ كاتبٌ بشكلِ مُشغِّلٍ ولا يُتَّهَمُ مُشغِّلٌ بشكلِ كاتب.
    const healed = []
    for (const h of HEALED) {
      healed.push(...(await c.query(`
        SELECT p.proname,
               (${BLANK} ~ ${CCY})::int AS names_currency,
               p.prosecdef::int AS prosecdef,
               (p.prosrc LIKE '%' || $2 || '%')::int AS calls_home
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname = $1`, [h.name, HOME + "(" + h.arg + ")"])).rows)
    }

    // v3.75.56 — **والحكمُ بالأثرِ لا بالاسم**: يُقاسُ ما يحرسُ البيتَ فعلاً
    // (صلاحيّاتُ مُنادِيه · وحمايةُ صفوفِ جدولِ الشركات) لا ما يُغلِقُه اسماً.
    // ومنحةُ المستخدِمِ المسجَّلِ تُقاسُ على حِدَةٍ لتُعرَضَ ولا تُشترَطَ بعد،
    // **ومعدودٌ لا مسكوتٌ عنه**.
    const home = (await c.query(`
      SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1)::int AS exists_,
             (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1 AND prosecdef)::int AS secdef,
             (SELECT count(*) FROM pg_class c2
                JOIN pg_namespace ns2 ON ns2.oid = c2.relnamespace
               WHERE ns2.nspname='public' AND c2.relname='companies' AND c2.relrowsecurity)::int AS rls,
             (SELECT count(*) FROM information_schema.routine_privileges
               WHERE routine_schema='public' AND routine_name=$1
                 AND grantee IN ('PUBLIC','anon'))::int AS open_,
             (SELECT count(*) FROM information_schema.routine_privileges
               WHERE routine_schema='public' AND routine_name=$1
                 AND grantee = 'authenticated')::int AS auth`, [HOME])).rows[0]

    const baseline = (await c.query(`
      SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1)::int AS n,
             (SELECT count(*) FROM information_schema.routine_privileges
               WHERE routine_schema='public' AND routine_name=$1
                 AND grantee IN ('PUBLIC','anon','authenticated'))::int AS open_`, [BASELINE])).rows[0]

    return { sites, defaults, healed, home, baseline }
  })

  const problems = []

  // ── (١) دوالُّ القاعدةِ التى تُسمّى عملة ────────────────────────────────
  const nFuncs = new Set(data.sites.map((r) => r.oid)).size
  const nSites = data.sites.reduce((a, r) => a + Number(r.hits), 0)
  const vFuncs = judgePin(nFuncs, PINNED_FUNCS)
  const vSites = judgePin(nSites, PINNED_SITES)

  // ── (٢) الأعمدةُ التى تخترعُ عملةً لشركة ────────────────────────────────
  // v3.75.64 — المُعلَنُ بالاسمِ لا يُعَدُّ ديناً ولو سكنَ جدولَ شركة.
  const tenant = data.defaults.filter((r) => r.tenant && !DECLARED[r.col])
  const others = data.defaults.filter((r) => !r.tenant)
  const vDefaults = judgePin(tenant.length, PINNED_DEFAULTS)

  const undeclared = others.filter((r) => !DECLARED[r.col]).map((r) => r.col + " = " + r.dflt)
  if (undeclared.length) problems.push(["عمودٌ لا يخصُّ شركةً يُسمّى عملةً ولم يُعلَنْ بسببِه وشرطِ رفعِه", undeclared])
  const dead = judgeDeadDeclarations(data.defaults.map((r) => r.col))
  if (dead.length) problems.push(["إعلانٌ لم يعُدْ له عمودٌ حىّ — **ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة**", dead])

  // ── (٣)(٤)(٥) الخواصُّ التى وُلدت فى v3.75.52 ───────────────────────────
  const healedProblems = judgeHealed(data.healed)
  if (healedProblems.length) problems.push(["مُشغِّلٌ سُدِّدَ فى v3.75.52 وارتدّ", healedProblems])
  const homeProblems = judgeHome(data.home)
  if (homeProblems.length) problems.push(["البيتُ الواحدُ لعملةِ الشركة", homeProblems])
  if (!Number(data.baseline.n)) problems.push(["الفحصُ المرجعىُّ " + BASELINE + " غائب", []])
  else if (Number(data.baseline.open_)) problems.push(["الفحصُ المرجعىُّ يبلغُه زائرٌ أو مستخدِم — **وحارسٌ يُفتَحُ بابُه ليس حارساً**", []])

  // ── التقرير ─────────────────────────────────────────────────────────────
  console.log("  دوالُّ القاعدة: تُسمّى عملةً بعينِها " + nFuncs + " دالّةً فى " + nSites +
    " موضعاً   (المُثبَّت " + PINNED_FUNCS + " / " + PINNED_SITES + ")")
  console.log("  أعمدةُ جداولِ الشركاتِ بقيمةٍ افتراضيّةٍ تُسمّى عملة: " + tenant.length +
    "   (المُثبَّت " + PINNED_DEFAULTS + ")   ·   مُعلَنٌ خارجَها: " + others.length)
  console.log("  البيتُ الواحدُ " + HOME + ": بصلاحيّاتِ مُنادِيه=" + (Number(data.home.secdef) ? "لا" : "نعم") +
    "   ·   حمايةُ صفوفِ companies=" + (Number(data.home.rls) ? "مفعَّلة" : "مرفوعة") +
    "   ·   لزائرٍ أو لعموم=" + Number(data.home.open_) +
    "   ·   وللمستخدِمِ المسجَّل=" + Number(data.home.auth) + " (معلَنٌ ومقصود — v3.75.56)")

  if (vFuncs === "grew" || vSites === "grew" || vDefaults === "grew") {
    problems.push(["زادَ ما يُسمّى عملةً فى القاعدة — **ولا تُخترَعُ عملةٌ، بل تُقرأُ من صاحبِها**", [
      "دوالّ: " + nFuncs + " (المُثبَّت " + PINNED_FUNCS + ")",
      "مواضع: " + nSites + " (المُثبَّت " + PINNED_SITES + ")",
      "أعمدة: " + tenant.length + " (المُثبَّت " + PINNED_DEFAULTS + ")",
    ]])
  }
  if (vFuncs === "shrank" || vSites === "shrank" || vDefaults === "shrank") {
    problems.push(["نقصَ العددُ ولم يُثبَّتْ رقمُه الجديد — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**", [
      "تُحدَّثُ الأرقامُ المُثبَّتةُ فى هذا الملفِّ فى الدفعةِ التى سدَّدت: " +
      "PINNED_FUNCS=" + nFuncs + " · PINNED_SITES=" + nSites + " · PINNED_DEFAULTS=" + tenant.length,
    ]])
  }

  if (problems.length) {
    for (const [title, lines] of problems) {
      console.error("\nX " + title + (lines.length ? " (" + lines.length + "):" : ":"))
      lines.forEach((x) => console.error("   " + x))
    }
    console.error("\n   وعنوانُ السدادِ واحد: public." + HOME + "(company_id) — تُقرأُ منه عملةُ الشركةِ،")
    console.error("   ولا تُكتَبُ عملةٌ فى قيمةٍ افتراضيّةٍ ولا فى جسدِ دالّة.")
    process.exit(1)
  }

  console.log("+ لا موضعَ جديدٌ يخترعُ عملةً فى القاعدةِ فوقَ الدَّينِ المُثبَّت (التعليقُ محجوبٌ قبلَ الحكم،" +
    " والفحوصُ المرجعيّةُ مستثناةٌ بالاسم فلا يعدُّ الحارسُ نفسَه).")
  console.log("  ok  والمُسدَّدون " + HEALED.length + " (مُشغِّلاتٌ وكُتّابٌ) ما زالوا ينادون البيتَ الواحدَ كلٌّ بوسيطِه ولا يُسمّون عملة.")
  console.log("  ok  والبيتُ الواحدُ بصلاحيّاتِ مُنادِيه، وجدولُ الشركاتِ محمىٌّ بحمايةِ الصفوف، ولا يبلغُه زائرٌ ولا عمومُ الأدوار — **ويُسمّى ما يُقاسُ لا أكثرَ منه**.")

  for (const [k, d] of Object.entries(DECLARED)) {
    console.log("  -   استثناءٌ معلَن: " + k + " — " + d.why)
    console.log("      يُرفَع حين: " + d.lift)
  }

  console.log("  ! ومعدودٌ لا مسكوتٌ عنه — يُسدَّدون على دفعاتٍ مقيسة، والأثقلُ أوّلاً:")
  const rank = (r) => (classifySite(r.line) === "شرطٌ يتفرّعُ عليه سلوك" ? 0 : 1)
  for (const r of [...data.sites].sort((a, b) => rank(a) - rank(b) || a.proname.localeCompare(b.proname) || a.ord - b.ord)) {
    console.log("      - " + r.proname + "()  سطر " + r.ord + "   [" + classifySite(r.line) + "]   " + String(r.line || "").slice(0, 90))
  }
  for (const r of tenant) console.log("      - " + r.col + " = " + r.dflt + "   [قيمةٌ افتراضيّةٌ فى جدولِ شركات]")
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
