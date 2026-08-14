/**
 * check-authenticated-reachable-definers.js
 * ---------------------------------------------------------------------------
 * v3.75.33 — **وبابٌ بصلاحيّاتٍ كاملةٍ لا يطرقُه أحدٌ ليس باباً، بل ثغرة.**
 * v3.75.34 — **والنداءُ بمتغيّرٍ نداء، وجردٌ فى بعضِ الدارِ ليس جَرداً.**
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
 * مَن هو «الطارق»؟ أربعةٌ، لا واحد
 * --------------------------------
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
 *
 * وما لا يُعَدُّ طارقاً: **نداءٌ من داخلِ دالّةٍ أخرى بصلاحيّاتٍ كاملة**. فالنداءُ
 * الداخلىُّ يجرى **بحقِّ المالكِ لا بحقِّ المُنادى**، فلا يحتاجُ منحةً — وهذا
 * بعينُه ما بُرهنَ حيّاً فى v3.75.33 ثمّ فى v3.75.34.
 *
 * **وحارسٌ يصرخ على البرىء يُطفأ** — ولذلك يرفضُ هذا الحارسُ أن يحكمَ إن لم يجدْ
 * ملفَّ كودٍ واحداً، أو إن أعادتِ القاعدةُ قائمةً فارغة. **وبحثٌ لا يجد ليس دليلَ
 * غياب**، و**الطمأنينةُ الكاذبة أسوأُ من الغياب**.
 *
 * Usage: node scripts/check-authenticated-reachable-definers.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * **الجردُ يشملُ الدارَ كلَّها بالافتراض، ويُستثنى ما يُسمَّى.**
 *
 * القائمةُ المكتوبةُ باليدِ كانت قائمةَ **المشمول** (`app`, `lib`, `components`,
 * `hooks`) — فأىُّ مجلّدٍ جديدٍ يسقطُ من الجردِ صامتاً، وهو بعينُه ما وقعَ مع
 * `actions/`. **فقُلبت**: تُمسَحُ كلُّ الشيفرةِ إلّا ما يُستثنى هنا بسببٍ مكتوب،
 * **وأىُّ مجلّدٍ جديدٍ يُمسَحُ تلقائيّاً**.
 *
 * وخطأُ الشمولِ يتركُ باباً معدوداً مطروقاً (دَينٌ ظاهرٌ لم يُسدَّدْ بعد)، وخطأُ
 * النقصِ يدعو إلى نزعِ منحةٍ حيّة — **والميلُ الصحيحُ إلى تركِ البابِ مفتوحاً لا
 * إلى إغلاقِه على برىء**.
 *
 * ولا يُستثنى إلّا ما **لا يجرى بحقِّ المستخدِمِ المسجَّل**:
 */
const NOT_SHIPPED = new Set([
  "node_modules", // ليس من المشروع
  "scripts",      // تجرى بمفتاح الخدمة (service_role) لا بحقِّ المستخدِم
  "tests",        // لا تُشحَن
  "scratch",      // لا يُشحَن
  "archive",      // لا يُشحَن
  "supabase",     // هجراتٌ ودوالُّ حافّةٍ تجرى بمفتاح الخدمة
  "docs",
  "knowledge",
  "governance",
  "ops",
]);

/**
 * **الرقمُ المُثبَّت.** قِيس ٢١٩ فى v3.75.33 بجردٍ ناقصِ الأرجاءِ وبطارقٍ أعمى عن
 * النداءِ بمتغيّر، فثُبِّت عندَ ٢١٧ بعدَ إغلاقِ بابَين. وفى v3.75.34 صُحِّح الجردُ
 * فظهرَ أنّ **خمسةَ عشرَ منها لم تكن يتيمةً قطّ** (٢١٧ ← ٢٠٢)، ثمّ أُغلقت ثلاثةُ
 * أسماءٍ (أربعةُ توقيعات) ببرهانٍ حىٍّ على الإنتاجِ فصارَ **١٩٩** — مقيسٌ بمنطقِ
 * هذا الحارسِ نفسِه لا محسوباً بيد. لا يزيد. وإن نقصَ فليُخفَضْ هنا فى دفعةِ من
 * خفضَه، **فمكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.
 */
const BASELINE = 199;

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
function calledByView(viewDefs, name) {
  const re = new RegExp(`(^|[^A-Za-z0-9_])(public\\.)?${escapeName(name)}\\s*\\(`);
  return (viewDefs || []).some((d) => re.test(String(d || "")));
}

/** الأبوابُ التى لا يطرقُها أحدٌ من الأربعة. */
function unknockedNames(open, files, policyNames, viewDefs, declared) {
  const pol = new Set(policyNames || []);
  const dec = new Set(declared || []);
  return (open || [])
    .filter((n) => !pol.has(n))
    .filter((n) => !dec.has(n))
    .filter((n) => !calledByView(viewDefs || [], n))
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

/**
 * **والاستثناءُ يُقاسُ من الجذرِ وحدَه.** `NOT_SHIPPED` قائمةُ مجلّداتٍ عُليا،
 * فلو طُبِّقت على كلِّ عمقٍ لَسقطَ `app/.../ops/` و`lib/.../docs/` من الجردِ
 * بلا سبب — **وهو نقصُ جردٍ من الشكلِ الذى وُلدت هذه الدفعةُ لتُصحّحَه**.
 */
function readCodeFiles() {
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.name === "node_modules") continue;
      if (depth === 0 && NOT_SHIPPED.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (CODE_EXT.has(path.extname(e.name))) {
        try { out.push({ rel: path.relative(repoRoot, p), src: fs.readFileSync(p, "utf8") }); } catch { /* ignore */ }
      }
    }
  };
  walk(repoRoot, 0);
  return out;
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

  // **والجردُ يشملُ ما لم يُسمَّ.** مجلّدٌ جديدٌ يُمسَحُ تلقائيّاً، والمستثنى بسبب.
  ok("ولا يستثنى مجلّدَ الإجراءاتِ actions - وهو الذى سقطَ من الجردِ القديم",
     NOT_SHIPPED.has("actions"), false);
  ok("ولا يستثنى مجلّدَ التطبيق", NOT_SHIPPED.has("app"), false);
  ok("ويستثنى سكربتاتِ مفتاحِ الخدمة", NOT_SHIPPED.has("scripts"), true);

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
  const codeFiles = readCodeFiles();
  // **وبحثٌ لا يجد ليس دليلَ غياب**: بلا ملفّاتٍ لَعُدَّ كلُّ بابٍ يتيماً وصرخَ على الجميع.
  if (codeFiles.length === 0) {
    console.error("X لم أقرأْ ملفَّ كودٍ واحداً — لا يُحكَمُ على طارقٍ لم يُبحَثْ عنه.");
    process.exit(1);
  }
  const indirectFiles = codeFiles.filter((f) => dispatchesIndirectly(f.src));

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let open = [], policyNames = [], viewDefs = [], declared = [];
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
  } finally {
    await client.end();
  }

  // **ولا يُحكَمُ على قائمةٍ بلا أصل.**
  if (open.length === 0) {
    console.error("X القاعدةُ أعادت صفرَ دالّةٍ ممنوحةٍ للمستخدِم — قياسٌ مكسورٌ لا مطابقة.");
    process.exit(1);
  }

  const orphans = unknockedNames(open, codeFiles, policyNames, viewDefs, declared);
  const n = orphans.length;
  const mentioned = mentionedButNotCalled(orphans, codeFiles);

  console.log(
    `  دالّاتُ صلاحيّاتٍ كاملةٍ يبلغُها المستخدِمُ المسجَّل: ${open.length}` +
      `   ·   ملفّاتُ كودٍ مسحت: ${codeFiles.length}` +
      ` (منها ${indirectFiles.length} تنادى باسمٍ محسوب)` +
      `   ·   عروضٌ قُرئت: ${viewDefs.length}`
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
      "\n  العلاج: إمّا يُنادى البابُ من شاشةٍ أو سياسةٍ أو عرضٍ فيصيرَ له طارق،\n" +
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
