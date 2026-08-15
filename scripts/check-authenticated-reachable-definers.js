/**
 * check-authenticated-reachable-definers.js
 * ---------------------------------------------------------------------------
 * v3.75.33 — **وبابٌ بصلاحيّاتٍ كاملةٍ لا يطرقُه أحدٌ ليس باباً، بل ثغرة.**
 * v3.75.34 — **والنداءُ بمتغيّرٍ نداء، وجردٌ فى بعضِ الدارِ ليس جَرداً.**
 * v3.75.35 — **وجَردٌ يقيسُ القرصَ يقيسُ جهازاً لا مشروعاً.**
 * v3.75.36 — **والزنادُ يجرى بحقِّ من كتبَ الصفّ.**
 * v3.75.37 — **والمُرسِلُ من جدولٍ لا يراه باحثٌ فى النصّ.**
 *
 * لماذا وُلد هذا الحارس
 * ---------------------
 * حملةُ الزائرِ انتهت: ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملةِ نزلَ من
 * ١٣٤ إلى ٣٥، وصارَ محروساً بقانونٍ مغلَقٍ فى v3.75.27 و v3.75.28.
 *
 * **والمستخدِمُ المسجَّلُ لم يُقَسْ قطّ.** وقِيس أوّلَ مرّةٍ فى v3.75.33 (بالاسم لا
 * بالتحميلِ الزائد، على الإنتاج): ٤٧٠ باباً يبلغُها، ٢١٩ منها **بلا طارق**؛
 * وأُغلق اثنانِ ببرهانٍ حىٍّ فبقىَ ٢١٧.
 *
 * ولماذا صُحِّح فى v3.75.34
 * -------------------------
 * **الرقمُ ٢١٧ كان يكذب.** خمسةَ عشرَ باباً منه كان يُنادَى فعلاً من المشروع،
 * وهذا الحارسُ لا يراه، لسببَين اثنَين — وكلاهما فى **الطارقِ الأوّل**:
 *
 *   (أ) **جردٌ ناقصُ الأرجاء.** كان يمسحُ أربعةَ مجلّداتٍ مكتوبةً باليد:
 *       `app` و`lib` و`components` و`hooks`. **ومجلّدُ `actions/` ليس منها** —
 *       وفيه `actions/financial-reports.ts` ينادى `get_trial_balance` و
 *       `get_income_statement` و`get_balance_sheet` و`get_financial_summary`.
 *       ثلاثةٌ من هذه الأربعِ كانت معدودةً «بلا طارق». **ونزعُ منحتِها يكسرُ
 *       شاشاتِ القوائمِ الماليّة.**
 *
 *   (ب) **والنداءُ بمتغيّرٍ نداء.** كان يبحثُ عن `rpc("الاسم")` مكتوباً حرفاً
 *       فقط. والمشروعُ ينادى فى خمسةِ مواضعَ باسمٍ محسوبٍ لا مكتوب:
 *
 *           await this.supabase.rpc(primaryRpcName as any, params)   // خدمةُ الترحيل
 *           await createClient().rpc(fn, args)                       // شاشةُ أجورِ الإنتاج
 *           await this.adminSupabase.rpc(rpcName, params)            // أمرُ سدادِ الفاتورة
 *
 *       فكانت اثنتا عشرةَ دالّةً معدودةً «بلا طارق» **وهى قلبُ المشروع**:
 *       `post_accounting_event` و`post_accounting_event_v2` و`post_invoice_atomic_v2`
 *       و`process_invoice_payment_atomic` و`process_invoice_payment_atomic_v2`
 *       و`process_sales_return_atomic_v2` وستُّ دالّاتِ `plw_*` لأجورِ الإنتاج.
 *       **ونزعُ منحتِها يوقفُ ترحيلَ الفواتيرِ والمدفوعاتِ ومردوداتِ المبيعات.**
 *
 * وهذا العطبُ **ليس نظريّاً**: نصُّ هذا الحارسِ نفسِه يعرضُ العلاجَ صريحاً
 * («تُنزَعُ منحتُه»)، وسمّى `post_accounting_event` بالاسمِ فى ترويستِه على أنّها
 * «داخلُ غلاف». **فكان لغماً موقوتاً موقَّعاً بيدى.** وكُشف عندَ أوّلِ محاولةِ
 * سدادٍ للدَّين، بقراءةِ كلِّ ذِكرٍ للاسمِ فى الشيفرةِ بالعينِ لا بالثقةِ فى نتيجةِ
 * البحث — **وبحثٌ لا يجد ليس دليلَ غياب**.
 *
 * فصارَ الطارقُ الأوّلُ ثلاثةَ أشكال، والجردُ يشملُ الدارَ كلَّها بالافتراض.
 *
 * ولماذا صُحِّح ثانيةً فى v3.75.35
 * -------------------------------
 * الجردُ الجديدُ مشى على **القرص**، فقالَ عندَ صاحبِ المشروعِ «١٣٦٣ ملفّاً»
 * وقالَ على نسخةٍ نظيفةٍ من المستودعِ «١٢٣٦». **ولم يتغيّرِ الحكمُ يومَها** (١٩٩
 * على النسختَين)، **لكنّ الاحتمالَ كان قائماً**: ملفٌّ محلىٌّ غيرُ مرفوعٍ يحملُ
 * نداءً يجعلُ البابَ مطروقاً على جهازٍ ويتيماً على آخَر — **فيمرُّ عندَ من يدفعُ
 * ويسقطُ عندَ من يراجع**. فصارَ الجردُ يُقرأُ من `git ls-files` فى بيتٍ واحد
 * (`scripts/lib/repo-code-files.js`)، **ولا يُبنى بيتٌ ثانٍ**.
 *
 * ولماذا وُلد الطارقُ الخامسُ فى v3.75.36
 * --------------------------------------
 * عندَ أوّلِ خطوةٍ فى **سدادِ الـ١٩٩** قِيست الأبوابُ الباقيةُ ضدَّ سؤالٍ لم يُسألْ
 * قطّ: **أينَ يُنادَى هذا الاسمُ بحقِّ صاحبِ العمليّةِ لا بحقِّ مالكِ الدالّة؟**
 * فظهرَ أنّ **أحدَ عشرَ** منها مطروقةٌ فعلاً، وأخطرُها:
 *
 *     can_modify_transaction  ←  أربعةُ زناداتٍ تحرسُ الفترةَ المقفلة
 *                                (prevent_invoice/journal/payment/inventory_in_closed_period)
 *     ir_generate_reservation_number  ←  **قيمةٌ افتراضيّةٌ لعمود** فى inventory_reservations
 *     next_po_number          ←  زنادُ ترقيمِ أمرِ الشراء
 *     erp_is_company_owner / erp_is_company_senior / erp_company_senior_count  ←  erp_sod_guard
 *     assert_company_access   ←  دالّتانِ بصلاحيّاتِ مُنادِيهما
 *     regenerate_asset_schedules  ←  register_asset_addition و revalue_asset
 *
 * **ودوالُّ الزناداتِ هذه بصلاحيّاتِ مُنادِيها**، فتجرى بحقِّ المستخدِمِ الذى
 * كتبَ الصفَّ. **فنزعُ منحةِ `can_modify_transaction` كان يوقفُ كلَّ كتابةٍ فى
 * الفواتيرِ والقيودِ والمدفوعاتِ والمخزون.** وقِيس هذا **قبلَ أن يُنزَعَ سطرٌ
 * واحد** — وهو ثالثُ لغمٍ يُنزَعُ من هذا الحارسِ نفسِه.
 *
 * مَن هو «الطارق»؟ خمسةٌ، لا واحد
 * -------------------------------
 *   ١) **شاشةٌ أو مسارٌ فى المشروع** — بثلاثةِ أشكال:
 *        • `rpc("الاسم")` مكتوباً حرفاً،
 *        • `/rpc/الاسم` فى مسارِ REST،
 *        • **أو اسمٌ مكتوبٌ نصّاً فى ملفٍّ ينادى `rpc(متغيّر)`** — فالمتغيّرُ
 *          يحملُ الاسمَ وقتَ التشغيلِ ولا يراه التعبيرُ النمطىّ. **والتعليقُ ليس
 *          تعليمة** فتُقنَّعُ التعليقاتُ قبلَ البحث.
 *   ٢) **سياسةُ حمايةٍ تطرقُها** — تُقرأُ من البيتِ الواحد
 *      `policy_knocked_function_names()`، **ولا يُبنى بيتٌ ثانٍ**.
 *   ٣) **عرضٌ (view) ينادِيها**. وهذا الطارقُ **ليس نظريّاً ولا زينة**: ٥٠ عرضاً
 *      فى المخطَّط، ٤٢ منها `security_invoker`، و**٧ دالّاتٍ تُنادى من داخلِها
 *      فعلاً** — منها `bill_money` وأخواتُها فى مسارِ حجبِ تكلفةِ الشراء.
 *      **وعرضُ `security_invoker` يجرى بحقِّ قارئِه.**
 *   ٤) **إعلانُ ما قبلَ الدخول** `anon_prelogin_exceptions()`.
 *   ٥) **موضعٌ يُقيَّمُ بحقِّ صاحبِ العمليّة**: دالّةٌ بصلاحيّاتِ مُنادِيها (ومنها
 *      دوالُّ الزنادات)، أو قيمةٌ افتراضيّةٌ لعمود، أو قيدُ تحقُّق، أو فهرسٌ
 *      بتعبير، أو شرطُ زناد. **وهذه كلُّها تحتاجُ المنحةَ فعلاً.**
 *
 * وما لا يُعَدُّ طارقاً: **نداءٌ من داخلِ دالّةٍ أخرى بصلاحيّاتٍ كاملة**. فالنداءُ
 * الداخلىُّ يجرى **بحقِّ المالكِ لا بحقِّ المُنادى**، فلا يحتاجُ منحةً — وهذا
 * بعينُه ما بُرهنَ حيّاً فى v3.75.33 ثمّ فى v3.75.34. **والفرقُ بينَ هذا وبينَ
 * الطارقِ الخامسِ هو صلاحيّةُ المُنادِى نفسِه، لا موضعُ النداء.**
 *
 * **وحارسٌ يصرخ على البرىء يُطفأ** — ولذلك يرفضُ هذا الحارسُ أن يحكمَ إن لم يجدْ
 * ملفَّ كودٍ واحداً، أو إن أعادتِ القاعدةُ قائمةً فارغة. **وبحثٌ لا يجد ليس دليلَ
 * غياب**، و**الطمأنينةُ الكاذبة أسوأُ من الغياب**.
 *
 * Usage: node scripts/check-authenticated-reachable-definers.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

/**
 * **بيتٌ واحدٌ يقولُ ما هى شيفرةُ المشروع** — يُقرأُ من `git ls-files` لا من
 * القرص، ويستثنى ما لا يجرى بحقِّ المستخدِمِ المسجَّل. **ولا يُبنى بيتٌ ثانٍ.**
 */
const { keepPath, projectCodeFiles, NOT_SHIPPED } = require("./lib/repo-code-files");

/**
 * **الرقمُ المُثبَّت.** قِيس ٢١٩ فى v3.75.33 بجردٍ ناقصِ الأرجاءِ وبطارقٍ أعمى عن
 * النداءِ بمتغيّر، فثُبِّت عندَ ٢١٧ بعدَ إغلاقِ بابَين. وفى v3.75.34 صُحِّح الجردُ
 * فظهرَ أنّ **خمسةَ عشرَ منها لم تكن يتيمةً قطّ** (٢١٧ ← ٢٠٢)، ثمّ أُغلقت ثلاثةُ
 * أسماءٍ (أربعةُ توقيعات) ببرهانٍ حىٍّ على الإنتاجِ فصارَ ١٩٩. وفى v3.75.36 وُلد
 * **الطارقُ الخامس** (موضعٌ يُقيَّمُ بحقِّ صاحبِ العمليّة) فظهرَ أنّ **أحدَ عشرَ
 * منها مطروقةٌ فعلاً**، فصارَ **١٨٨** — مقيسٌ بمنطقِ هذا الحارسِ نفسِه لا محسوباً
 * بيد. ثمّ أُغلقت فى v3.75.37 **سبعٌ وخمسونَ دالّةَ فحصِ سلامةٍ** (`ic_*`) ببرهانٍ
 * حىٍّ فصارَ **١٣١** — ولا ينادِيهنّ إلّا مُرسِلٌ واحدٌ **يقرأُ أسماءَهنّ من جدول**
 * (`run_all_integrity_checks` ← `integrity_check_definitions`)، وهو بصلاحيّاتٍ
 * كاملةٍ يملكُها `postgres`. **والاسمُ الساكنُ فى صفِّ جدولٍ لا يراه باحثٌ فى
 * النصّ** — لا فى الشيفرةِ ولا فى القاعدة؛ ولذلك عُدَّت «بلا طارق» بحقّ، فالمنحةُ
 * لا تفتحُ شيئاً لأحدٍ يحتاجُها.
 * لا يزيد. وإن نقصَ فليُخفَضْ هنا فى دفعةِ من خفضَه، **فمكسبٌ لا يُثبَّتُ
 * يُلتَفُّ عليه**.
 */
const BASELINE = 131;

// ── الجزءُ الخالصُ من المنطق: يُختبَرُ بلا قاعدة ──────────────────────────

/** **والتعليقُ ليس تعليمة.** */
function maskComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

function escapeName(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** نداءٌ صريحٌ مكتوبٌ حرفاً — **والجوارُ ليس انتماءً**. */
function callsFunction(src, name) {
  const esc = escapeName(name);
  return new RegExp(`\\.rpc\\(\\s*["'\`]${esc}["'\`]|/rpc/${esc}(?![A-Za-z0-9_])`).test(maskComments(src));
}

/**
 * **ملفٌّ ينادى باسمٍ محسوبٍ لا مكتوب.** أوّلُ وسيطٍ لـ`rpc(` ليس نصّاً بين
 * علاماتِ اقتباس، بل معرِّفٌ يحملُ الاسمَ وقتَ التشغيل:
 *
 *     await this.supabase.rpc(primaryRpcName as any, params)
 *     await createClient().rpc(fn, args)
 *
 * **والتعبيرُ النمطىُّ لا يقرأُ المتغيّرات**، فيُحكَمُ على الملفِّ كلِّه: إن كان
 * فيه نداءٌ بمتغيّرٍ **وفيه الاسمُ مكتوباً نصّاً**، فالاسمُ مطروق. وقد يكونُ
 * الاسمُ فى ذلك الملفِّ لسببٍ آخرَ فيُعَدَّ مطروقاً بلا حقّ — **وهذا مقبولٌ لأنّه
 * يتركُ البابَ مفتوحاً، والعكسُ يكسرُ شاشة**.
 */
function dispatchesIndirectly(src) {
  return /\.rpc\(\s*(?!["'`])[A-Za-z_$]/.test(maskComments(src));
}

/** الاسمُ مكتوبٌ نصّاً بين علاماتِ اقتباس (بعدَ تقنيعِ التعليقات). */
function mentionsNameAsText(src, name) {
  return new RegExp(`["'\`]${escapeName(name)}["'\`]`).test(maskComments(src));
}

/** الطارقُ الأوّلُ بأشكالِه الثلاثة. */
function knockedByCode(files, name) {
  const list = files || [];
  if (list.some((f) => callsFunction(f.src, name))) return true;
  return list.some((f) => dispatchesIndirectly(f.src) && mentionsNameAsText(f.src, name));
}

/**
 * نداءٌ من داخلِ تعريفِ عرض — **وعرضُ security_invoker يجرى بحقِّ قارئِه**.
 *
 * **والاسمُ المؤهَّلُ بمخطَّطِه هو الشكلُ الذى تكتبُه القاعدةُ نفسُها**: تعريفُ
 * العرضِ يخرجُ من `pg_get_viewdef` مؤهَّلاً `public.bill_money(...)`، فلو رُفض
 * السابقُ نقطةً لَما رأى الحارسُ طارقاً واحداً من العروضِ كلِّها — **ولصرخَ على
 * سبعةِ أبرياءَ منها مسارُ حجبِ تكلفةِ الشراء**.
 */
function referencedIn(texts, name) {
  const re = new RegExp(`(^|[^A-Za-z0-9_])(public\\.)?${escapeName(name)}\\s*\\(`);
  return (texts || []).some((d) => re.test(String(d || "")));
}

function calledByView(viewDefs, name) {
  return referencedIn(viewDefs, name);
}

/**
 * **موضعٌ يُقيَّمُ بحقِّ صاحبِ العمليّةِ لا بحقِّ مالكِ الدالّة** — الطارقُ الخامس.
 *
 * القاعدةُ كلُّها كانت مبنيّةً على أنّ «النداءَ الداخلىَّ يجرى بحقِّ المالكِ فلا
 * يحتاجُ منحة». **وهذا صحيحٌ داخلَ دالّةِ صلاحيّاتٍ كاملةٍ وحدَها.** أمّا هذه
 * المواضعُ فتجرى **بحقِّ من قامَ بالعمليّة**، فالنداءُ فيها يحتاجُ المنحةَ فعلاً:
 *
 *   • **دالّةٌ بصلاحيّاتِ مُنادِيها** (`SECURITY INVOKER`) — ومنها **دوالُّ
 *     الزنادات**. وهذه أخطرُها: `can_modify_transaction` تُنادى من أربعةِ
 *     زناداتٍ تحرسُ الفترةَ المقفلة، **فنزعُ منحتِها يوقفُ كلَّ كتابةٍ** فى
 *     الفواتيرِ والقيودِ والمدفوعاتِ والمخزون.
 *   • **قيمةٌ افتراضيّةٌ لعمود** — `ir_generate_reservation_number()` هى
 *     القيمةُ الافتراضيّةُ لعمودٍ فى `inventory_reservations`، **وتُقيَّمُ
 *     بحقِّ من يُدرِجُ الصفّ**.
 *   • **قيدُ تحقُّقٍ** (`CHECK`) على جدولٍ أو نطاق، **وفهرسٌ بتعبير** أو بشرطٍ
 *     جزئىّ، **وشرطُ زنادٍ** (`WHEN`).
 *
 * وقِيس هذا **قبلَ أن يُنزَعَ سطرٌ واحد**، فوُجد أنّ **أحدَ عشرَ** من الأبوابِ
 * المعدودةِ «بلا طارق» لها طارقٌ من هذا النوع.
 *
 * **والنصُّ هنا لا تُقنَّعُ تعليقاتُه**: اسمٌ مذكورٌ فى تعليقٍ داخلَ جسمِ دالّةٍ
 * يُعَدُّ طارقاً بلا حقّ. **وهذا مقبولٌ لأنّه يتركُ البابَ مفتوحاً**، والعكسُ
 * يكسرُ كتابةً حيّة — **والميلُ الصحيحُ إلى تركِ البابِ مفتوحاً**.
 */
function evaluatedWithCallerRights(surfaces, name) {
  return referencedIn(surfaces, name);
}

/** الأبوابُ التى لا يطرقُها أحدٌ من الخمسة. */
function unknockedNames(open, files, policyNames, viewDefs, declared, callerRightsSurfaces) {
  const pol = new Set(policyNames || []);
  const dec = new Set(declared || []);
  return (open || [])
    .filter((n) => !pol.has(n))
    .filter((n) => !dec.has(n))
    .filter((n) => !calledByView(viewDefs || [], n))
    .filter((n) => !evaluatedWithCallerRights(callerRightsSurfaces || [], n))
    .filter((n) => !knockedByCode(files || [], n))
    .sort();
}

/**
 * **الأسماءُ التى تُذكَرُ نصّاً ولا تُنادى.** ليست طارقاً — قد تكونُ قيمةَ صلاحيّةٍ
 * فى شاشةٍ (`{ value: "record_payment" }`)، أو اسماً فى قائمةِ تحقُّق، أو سطرَ
 * سجلّ. لكنّها **لا تُنزَعُ منحتُها إلّا بعدَ قراءةِ كلِّ موضعٍ بالعين**، لأنّ
 * الذِّكرَ قد يكونُ نداءً لم يُرَ. تُعرَضُ ولا تُسكِتُ العدَّ.
 */
function mentionedButNotCalled(orphans, files) {
  return (orphans || []).filter((n) => (files || []).some((f) => mentionsNameAsText(f.src, n)));
}


// ── الفخُّ الذاتىّ ────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  let bad = 0;
  let total = 0;
  const ok = (name, got, want) => {
    total++;
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) console.log(`  ok  ${name}  (توقّعتُ ${w} فجاء ${g})`);
    else { console.error(`  X   ${name}  (توقّعتُ ${w} فجاء ${g})`); bad++; }
  };
  const F = (src) => [{ rel: "x.ts", src }];

  ok("يرى النداءَ بعلامتَى اقتباس مزدوجتين", callsFunction('supabase.rpc("foo", {})', "foo"), true);
  ok("ويراه بعلامةٍ مفردة", callsFunction("supabase.rpc('foo')", "foo"), true);
  ok("ويراه بعلامةٍ خلفيّة", callsFunction("supabase.rpc(`foo`)", "foo"), true);
  ok("ويراه وقد نزلَ إلى سطرٍ تال", callsFunction('supabase.rpc(\n  "foo",\n  {}\n)', "foo"), true);
  ok("ويرى مسارَ REST المباشر", callsFunction('fetch("/rest/v1/rpc/foo")', "foo"), true);
  ok("ولا يخدعه ذكرٌ داخل تعليقٍ سطرىّ — التعليقُ ليس تعليمة",
     callsFunction('// supabase.rpc("foo")', "foo"), false);
  ok("ولا ذكرٌ داخل تعليقٍ كتلىّ",
     callsFunction('/* supabase.rpc("foo") */', "foo"), false);
  ok("ولا اسمٌ مذكورٌ بلا نداء — والجوارُ ليس انتماءً",
     callsFunction('const x = "foo";', "foo"), false);
  ok("ولا يخلطُ اسماً بادئتُه نفسُها", callsFunction('supabase.rpc("foo_bar")', "foo"), false);
  ok("ولا يخلطُ مساراً بادئتُه نفسُها", callsFunction('fetch("/rpc/foo_bar")', "foo"), false);

  // **والنداءُ بمتغيّرٍ نداء** — الاتّجاهُ الذى كشفَ لغمَ v3.75.33.
  ok("ويرى ملفّاً ينادى بمتغيّر", dispatchesIndirectly("await s.rpc(rpcName, p)"), true);
  ok("ويراه ولو كان المتغيّرُ حقلاً فى كائن",
     dispatchesIndirectly("await s.rpc(fallback.rpcName as any, p)"), true);
  ok("ولا يعدُّ النداءَ المكتوبَ حرفاً نداءً بمتغيّر", dispatchesIndirectly('await s.rpc("foo", p)'), false);
  ok("ولا النداءَ المكتوبَ حرفاً وقد نزلَ سطراً", dispatchesIndirectly('await s.rpc(\n  "foo",\n  p)'), false);
  ok("ولا نداءً بمتغيّرٍ داخلَ تعليق", dispatchesIndirectly("// await s.rpc(rpcName, p)"), false);
  ok("فيمرُّ اسمٌ مكتوبٌ نصّاً فى ملفٍّ ينادى بمتغيّر — وهو post_accounting_event بعينِه",
     unknockedNames(["post_accounting_event"],
       F('const n = flag ? "v2" : "post_accounting_event"; await s.rpc(n, p)'), [], [], []), []);
  ok("ولا يمرُّ اسمٌ مذكورٌ نصّاً فى ملفٍّ لا ينادى بمتغيّر — وذِكرٌ ليس نداءً",
     unknockedNames(["record_payment"], F('{ value: "record_payment", label: "دفعة" }'), [], [], []),
     ["record_payment"]);
  ok("ولا يمرُّ اسمٌ لم يُذكَرْ فى ملفِّ النداءِ بمتغيّر",
     unknockedNames(["orphan"], F('const n = "other"; await s.rpc(n, p)'), [], [], []), ["orphan"]);

  // **والعرضُ طارقٌ** — الاتّجاهُ الذى كشفَ عطبَ القياسِ الأوّلِ فى v3.75.33.
  ok("ويعدُّ العرضَ طارقاً", calledByView(["SELECT bill_money(x) FROM t"], "bill_money"), true);
  ok("ويراه مؤهَّلاً بالمخطَّط", calledByView(["SELECT public.bill_money(x)"], "bill_money"), true);
  ok("ولا يخدعه اسمٌ يشبهُه فى عرض", calledByView(["SELECT bill_money_2(x)"], "bill_money"), false);
  ok("ولا اسمٌ لاحقتُه جزءٌ من اسمٍ أطول", calledByView(["SELECT my_bill_money(x)"], "bill_money"), false);

  ok("فيمرُّ بابٌ يناديه سطرٌ فى الكود",
     unknockedNames(["alive"], F('supabase.rpc("alive")'), [], [], []), []);
  ok("ويمرُّ بابٌ تطرقُه سياسة",
     unknockedNames(["byPolicy"], F(""), ["byPolicy"], [], []), []);
  ok("ويمرُّ بابٌ ينادِيه عرض",
     unknockedNames(["byView"], F(""), [], ["SELECT byView(1)"], []), []);
  ok("ويمرُّ بابٌ مُعلَنٌ لِما قبلَ الدخول",
     unknockedNames(["declared"], F(""), [], [], ["declared"]), []);

  // **والطارقُ الخامس**: موضعٌ يُقيَّمُ بحقِّ صاحبِ العمليّة — الاتّجاهُ الذى منعَ
  // نزعَ منحةِ can_modify_transaction فى أوّلِ خطوةٍ من سدادِ الدَّين.
  ok("ويرى دالّةً بصلاحيّاتِ مُنادِيها تنادِيه",
     evaluatedWithCallerRights(["BEGIN PERFORM can_modify_transaction(x); END"], "can_modify_transaction"), true);
  ok("ويراه فى قيمةٍ افتراضيّةٍ لعمود",
     evaluatedWithCallerRights(["ir_generate_reservation_number()"], "ir_generate_reservation_number"), true);
  ok("ويراه مؤهَّلاً بالمخطَّطِ فى قيدِ تحقُّق",
     evaluatedWithCallerRights(["CHECK ((public.can_approve(role) IS TRUE))"], "can_approve"), true);
  ok("ولا يخدعه اسمٌ يشبهُه", evaluatedWithCallerRights(["PERFORM can_approve_v2(x)"], "can_approve"), false);
  ok("ولا اسمٌ بلا نداء", evaluatedWithCallerRights(["v_name := 'can_approve';"], "can_approve"), false);
  ok("ويمرُّ بابٌ يُقيَّمُ بحقِّ صاحبِ العمليّة",
     unknockedNames(["byCallerRights"], F(""), [], [], [], ["PERFORM byCallerRights(1)"]), []);
  ok("ويسقطُ بابٌ لا موضعَ له فى تلك المواضع",
     unknockedNames(["orphan"], F(""), [], [], [], ["PERFORM somethingElse(1)"]), ["orphan"]);
  ok("ويسقطُ بابٌ لا يطرقُه أحدٌ من الأربعة",
     unknockedNames(["orphan"], F('supabase.rpc("alive")'), [], [], []), ["orphan"]);
  ok("ويُسمّى كلَّ اليتامى مرتَّبين",
     unknockedNames(["b_orphan", "a_orphan"], F(""), [], [], []), ["a_orphan", "b_orphan"]);
  ok("ويسقطُ الجميعُ حين لا ملفَّ أصلاً — وبحثٌ لا يجد ليس دليلَ غياب",
     unknockedNames(["alive"], [], [], [], []), ["alive"]);

  // **والذِّكرُ يُعرَضُ ولا يُسكِت.**
  ok("ويُفرِزُ اليتيمَ المذكورَ نصّاً ليُقرَأَ بالعين",
     mentionedButNotCalled(["record_payment", "silent"], F('{ value: "record_payment" }')), ["record_payment"]);
  ok("ولا يعدُّ ذِكراً داخلَ تعليقٍ ذِكراً",
     mentionedButNotCalled(["silent"], F('// "silent"')), []);

  // **والجردُ يشملُ ما لم يُسمَّ.** مجلّدٌ جديدٌ يدخلُ تلقائيّاً، والمستثنى بسبب.
  ok("ولا يستثنى مجلّدَ الإجراءاتِ actions - وهو الذى سقطَ من الجردِ القديم",
     NOT_SHIPPED.has("actions"), false);
  ok("ولا يستثنى مجلّدَ التطبيق", NOT_SHIPPED.has("app"), false);
  ok("ويستثنى سكربتاتِ مفتاحِ الخدمة", NOT_SHIPPED.has("scripts"), true);

  // **والجردُ يُقرأُ من المستودعِ لا من القرص** — البيتُ الواحدُ يحكمُ على المسار.
  ok("فيدخلُ ملفُّ الإجراءاتِ الذى كشفَ العطبَ", keepPath("actions/financial-reports.ts"), true);
  ok("ويدخلُ مجلّدٌ لم يُسمَّ قطّ", keepPath("brand-new-folder/screen.tsx"), true);
  ok("ولا يدخلُ سكربتُ مفتاحِ الخدمة", keepPath("scripts/check-x.js"), false);
  ok("ولا اختبارٌ لا يُشحَن", keepPath("tests/e2e/x.ts"), false);
  ok("ولا ملفٌّ فى مجلّدٍ مخفىّ", keepPath(".kilo/x.js"), false);
  ok("ولا ملفٌّ ليس شيفرة", keepPath("app/page.css"), false);
  ok("ويقبلُ الفاصلَ الخلفىَّ كما تكتبُه ويندوز", keepPath("app\\api\\route.ts"), true);

  console.log(`  الفخُّ الذاتىّ: ${total} اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة." : bad + " منها سقط."}`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── القياسُ الحىّ ─────────────────────────────────────────────────────────
const requireDb = process.argv.includes("--require-db");
const url = process.env.PRODUCTION_SUPABASE_DB_URL;

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot measure what a logged-in user reaches.";
  if (requireDb) { console.error(`X ${msg}`); process.exit(1); }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`);
  process.exit(0);
}

let Client;
try { ({ Client } = require("./lib/live-db")); } catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

(async () => {
  // **وبحثٌ لا يجد ليس دليلَ غياب**: البيتُ الواحدُ يرفعُ خطأً ولا يُعيدُ فراغاً،
  // فلو أعادَ فراغاً لَعُدَّ كلُّ بابٍ يتيماً ولَصرخَ الحارسُ على الجميع.
  let codeFiles, skippedFiles;
  try {
    const census = projectCodeFiles();
    codeFiles = census.files;
    skippedFiles = census.skipped;
  } catch (e) {
    console.error(`X ${(e && e.message) || e}`);
    process.exit(1);
  }
  const indirectFiles = codeFiles.filter((f) => dispatchesIndirectly(f.src));

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let open = [], policyNames = [], viewDefs = [], declared = [], surfaces = [];
  try {
    const a = await client.query(
      `SELECT DISTINCT p.proname AS nm
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
          AND p.prorettype <> 'trigger'::regtype
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        ORDER BY 1`
    );
    open = a.rows.map((r) => r.nm);
    const b = await client.query("SELECT public.policy_knocked_function_names(false) AS names");
    policyNames = (b.rows[0] && b.rows[0].names) || [];
    const c = await client.query(
      `SELECT pg_get_viewdef(c.oid) AS def
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('v','m')`
    );
    viewDefs = c.rows.map((r) => r.def);
    const d = await client.query("SELECT public.anon_prelogin_exceptions() AS names");
    declared = (d.rows[0] && d.rows[0].names) || [];

    // **الطارقُ الخامس**: كلُّ موضعٍ يُقيَّمُ بحقِّ صاحبِ العمليّةِ لا بحقِّ مالكِ الدالّة.
    const e = await client.query(
      `SELECT pg_get_expr(d.adbin, d.adrelid) AS txt
         FROM pg_attrdef d JOIN pg_class c ON c.oid = d.adrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
       UNION ALL
       SELECT pg_get_constraintdef(k.oid)
         FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
        WHERE n.nspname = 'public' AND k.contype = 'c'
       UNION ALL
       SELECT pg_get_indexdef(i.indexrelid)
         FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND (i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)
       UNION ALL
       SELECT pg_get_triggerdef(t.oid)
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgqual IS NOT NULL
       UNION ALL
       SELECT p.prosrc
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND NOT p.prosecdef`
    );
    surfaces = e.rows.map((r) => r.txt).filter(Boolean);
  } finally {
    await client.end();
  }

  // **ولا يُحكَمُ على قائمةٍ بلا أصل.**
  if (open.length === 0) {
    console.error("X القاعدةُ أعادت صفرَ دالّةٍ ممنوحةٍ للمستخدِم — قياسٌ مكسورٌ لا مطابقة.");
    process.exit(1);
  }
  // **وطارقٌ لا يُقاسُ يُعَدُّ غائباً**: صفرُ مواضعَ تجرى بحقِّ صاحبِ العمليّةِ
  // مستحيلٌ فى قاعدةٍ فيها مئاتُ الزنادات، فالصفرُ هنا قياسٌ مكسورٌ لا حقيقة.
  if (surfaces.length === 0) {
    console.error(
      "X القاعدةُ أعادت صفرَ موضعٍ يُقيَّمُ بحقِّ صاحبِ العمليّة — قياسٌ مكسورٌ لا مطابقة."
    );
    process.exit(1);
  }

  const orphans = unknockedNames(open, codeFiles, policyNames, viewDefs, declared, surfaces);
  const n = orphans.length;
  const mentioned = mentionedButNotCalled(orphans, codeFiles);

  console.log(
    `  دالّاتُ صلاحيّاتٍ كاملةٍ يبلغُها المستخدِمُ المسجَّل: ${open.length}` +
      `   ·   ملفّاتُ شيفرةٍ فى المستودع: ${codeFiles.length}` +
      ` (منها ${indirectFiles.length} تنادى باسمٍ محسوب` +
      (skippedFiles.length ? `، و${skippedFiles.length} محذوفٌ لم يُرحَّلْ حذفُه` : "") +
      `)   ·   عروضٌ قُرئت: ${viewDefs.length}` +
      `   ·   مواضعُ تجرى بحقِّ صاحبِ العمليّة: ${surfaces.length}`
  );
  console.log(
    `  يطرقُها طارقٌ معروف: ${open.length - n}   ·   **بلا طارق**: ${n}   (المُثبَّت ${BASELINE})`
  );

  if (n > BASELINE) {
    console.error(
      `\nX زادَ ما يبلغُه المستخدِمُ المسجَّلُ بلا طارق: ${n} (المُثبَّت ${BASELINE}) — ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة.\n`
    );
    for (const s of orphans.slice(0, 30)) console.error(`    - ${s}`);
    if (n > 30) console.error(`    … و${n - 30} غيرُها`);
    console.error(
      "\n  العلاج: إمّا يُنادى البابُ من شاشةٍ أو سياسةٍ أو عرضٍ أو موضعٍ يُقيَّمُ بحقِّ صاحبِ العمليّةِ فيصيرَ له طارق،\n" +
        "         وإمّا تُنزَعُ منحتُه: REVOKE ALL ON FUNCTION public.<name>(<args>) FROM PUBLIC, anon, authenticated;\n" +
        "         (والنداءُ من داخلِ غلافٍ بصلاحيّاتٍ كاملةٍ يبقى يعملُ بلا منحة.)\n" +
        "  **ولا تُنزَعُ منحةٌ قبلَ برهانٍ حىٍّ على الإنتاج**: نزعٌ داخلَ معاملةٍ تُلغى،\n" +
        "         ثمّ نداءٌ مباشرٌ بدورِ authenticated يجبُ أن يُرفَضَ بـ42501،\n" +
        "         ونداءٌ عبرَ غلافٍ بصلاحيّاتٍ كاملةٍ يجبُ ألّا يُرفَضَ بـ42501.\n" +
        "         **ولا يُصدَّقُ هذا بالوصف.**"
    );
    process.exit(1);
  }

  if (n < BASELINE) {
    console.error(
      `\nX نقصَ العددُ إلى ${n} والمُثبَّتُ ${BASELINE} — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n` +
        `  اخفضِ BASELINE إلى ${n} فى هذا الملفِّ، فى دفعةِ من خفضَه.`
    );
    process.exit(1);
  }

  if (mentioned.length > 0) {
    console.log(
      `  ! ومن هؤلاء ${mentioned.length} اسماً **مذكورٌ نصّاً فى الشيفرةِ ولا نداءَ ظاهراً له**.\n` +
        "    والذِّكرُ ليس نداءً، لكنّه قد يكونُ نداءً لم يُرَ — **فلا تُنزَعُ منحةُ أحدِهم قبلَ قراءةِ كلِّ موضعٍ بالعين**:"
    );
    for (const s of mentioned) console.log(`      - ${s}`);
  }

  console.log(
    "+ no full-rights function is reachable by a logged-in user beyond the pinned debt " +
      `(${n} unknocked, pinned at ${BASELINE}; a knocker is a screen - a literal rpc name, a REST path, ` +
      "or a name carried into rpc() by a variable - an RLS policy, a view, or the documented pre-login " +
      "declaration; an inner call from another definer needs no grant)."
  );
  process.exit(0);
})().catch((e) => { console.error(`X ${e && e.message ? e.message : e}`); process.exit(1); });
