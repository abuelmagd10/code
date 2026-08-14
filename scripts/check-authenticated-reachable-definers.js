/**
 * check-authenticated-reachable-definers.js
 * ---------------------------------------------------------------------------
 * v3.75.33 — **وبابٌ بصلاحيّاتٍ كاملةٍ لا يطرقُه أحدٌ ليس باباً، بل ثغرة.**
 *
 * لماذا وُلد هذا الحارس
 * ---------------------
 * حملةُ الزائرِ انتهت: ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملةِ نزلَ من
 * ١٣٤ إلى ٣٥، وصارَ محروساً بقانونٍ مغلَقٍ فى v3.75.27 و v3.75.28.
 *
 * **والمستخدِمُ المسجَّلُ لم يُقَسْ قطّ.** وقِيس أوّلَ مرّةٍ فى هذه الدفعة (بالاسم
 * لا بالتحميلِ الزائد، على الإنتاج):
 *
 *     دالّاتُ صلاحيّاتٍ كاملةٍ يبلغُها المستخدِمُ المسجَّل ......... 470
 *     منها يطرقُها طارقٌ معروف ................................. 251
 *     **ولا يطرقُها أحد** ...................................... 219
 *
 * ومن هذه المئتَينِ وتسعَ عشرة، **٧٧ يُنادَينَ من داخلِ دالّةٍ أخرى** — وهنّ
 * أوضحُ الحالات، **دواخلُ أغلفة**: `assert_company_access` و`can_access_bill`
 * و`erp_is_company_owner` و`check_period_lock` و`create_audit_log`
 * و`post_accounting_event` و`record_payment` و`next_po_number` وأخواتُها. كلُّ
 * واحدةٍ منها تعملُ **بصلاحيّاتِ مالكِها**، وأىُّ مستخدِمٍ مسجَّلٍ يستطيعُ نداءَها
 * **خارجَ غلافِها الذى يسألُ عن حقِّه**.
 *
 * وأُغلق منها **اثنانِ فى دفعةِ الميلادِ بعدَ برهانٍ حىّ** (`check_username_available`
 * و`generate_username_from_email`)، فبقىَ **٢١٧**. وهذا الحارسُ **يُثبِّتُ الرقم**:
 * لا يزيد. **ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة** — فإن نقصَ وجبَ خفضُ الرقمِ
 * فى الدفعةِ نفسِها، **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.
 *
 * **ولا يُغلَقُ مئتانِ فى دفعةٍ واحدة**: كلُّ إغلاقٍ يحتاجُ برهانَه الحىَّ كما فى
 * الاثنَين، وحملةُ الزائرِ نفسُها مشت على أربعِ دفعاتٍ مقيسة (١٣٤ ← ٦٤ ← ٣٧ ← ٣٥).
 * فهذا الحارسُ **يُوقفُ النزيفَ اليومَ ويجعلُ الرقمَ مرئيّاً فى كلِّ دفعة**.
 *
 * مَن هو «الطارق»؟ أربعةٌ، لا واحد
 * --------------------------------
 *   ١) **شاشةٌ أو مسارٌ فى المشروع**: `rpc("الاسم")` أو `/rpc/الاسم` فى ملفّاتِ
 *      `app` و`lib` و`components` و`hooks`. **والتعليقُ ليس تعليمة** فتُقنَّعُ
 *      التعليقاتُ قبلَ البحث.
 *   ٢) **سياسةُ حمايةٍ تطرقُها** — تُقرأُ من البيتِ الواحد
 *      `policy_knocked_function_names()`، **ولا يُبنى بيتٌ ثانٍ**.
 *   ٣) **عرضٌ (view) ينادِيها**. وهذا الطارقُ **ليس نظريّاً ولا زينة**: قِيس فى
 *      يومِ الميلادِ أنّ ٥٠ عرضاً فى المخطَّط، ٤٢ منها `security_invoker`، وأنّ
 *      **٧ دالّاتٍ تُنادى من داخلِها فعلاً** — منها `bill_money` و`bill_item_money`
 *      و`purchase_order_money` وأخواتُها فى مسارِ حجبِ تكلفةِ الشراء. **وعرضُ
 *      `security_invoker` يجرى بحقِّ قارئِه**، فلو عُدَّت هذه بلا طارقٍ ونُزعت
 *      منحتُها **لانكسرت ستُّ شاشاتٍ محوَّلة**. وهذا العطبُ وقعَ فى القياسِ الأوّلِ
 *      لهذه الدفعةِ وكُشف قبلَ أن يُكتَبَ سطرٌ واحد.
 *   ٤) **إعلانُ ما قبلَ الدخول** `anon_prelogin_exceptions()`.
 *
 * وما لا يُعَدُّ طارقاً: **نداءٌ من داخلِ دالّةٍ أخرى**. فداخلَ دالّةِ الصلاحيّاتِ
 * الكاملةِ يجرى النداءُ **بحقِّ المالكِ لا بحقِّ المُنادى**، فلا يحتاجُ منحةً.
 * وهذا بعينُه ما بُرهنَ حيّاً فى v3.75.33: نُزعت المنحةُ فسقطَ النداءُ المباشرُ
 * بـ`permission denied`، **وبقىَ الغلافُ يعملُ كما كان**.
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
const CODE_ROOTS = ["app", "lib", "components", "hooks"];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * **الرقمُ المُثبَّت.** قِيس ٢١٩ يومَ الميلاد، وأُغلق اثنانِ ببرهانٍ حىٍّ فى الدفعةِ
 * نفسِها، فبقىَ ٢١٧ — **مقيسٌ على الإنتاجِ بمنطقِ هذا الحارسِ نفسِه لا بحساب**.
 * لا يزيد. وإن نقصَ فليُخفَضْ هنا فى دفعةِ من خفضَه.
 */
const BASELINE = 217;

// ── الجزءُ الخالصُ من المنطق: يُختبَرُ بلا قاعدة ──────────────────────────

/** **والتعليقُ ليس تعليمة.** */
function maskComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** نداءٌ صريحٌ للاسمِ من كودِ المشروع — **والجوارُ ليس انتماءً**. */
function callsFunction(src, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.rpc\\(\\s*["'\`]${esc}["'\`]|/rpc/${esc}(?![A-Za-z0-9_])`).test(maskComments(src));
}

/**
 * نداءٌ من داخلِ تعريفِ عرض — **وعرضُ security_invoker يجرى بحقِّ قارئِه**.
 *
 * **والاسمُ المؤهَّلُ بمخطَّطِه هو الشكلُ الذى تكتبُه القاعدةُ نفسُها**: تعريفُ
 * العرضِ يخرجُ من `pg_get_viewdef` مؤهَّلاً `public.bill_money(...)`، فلو رُفض
 * السابقُ نقطةً لَما رأى الحارسُ طارقاً واحداً من العروضِ كلِّها — **ولصرخَ على
 * سبعةِ أبرياءَ منها مسارُ حجبِ تكلفةِ الشراء**. (سقطَ هذا الاتّجاهُ فى الفخِّ
 * الذاتىِّ قبلَ أن يُرسَلَ الحارس، فصُحِّح.)
 *
 * وإن جاءَ الاسمُ مؤهَّلاً بمخطَّطٍ آخرَ عُدَّ طارقاً أيضاً — **والخطأُ هنا يميلُ
 * إلى تركِ البابِ مفتوحاً لا إلى إغلاقِه على برىء**، وهو الميلُ الصحيح.
 */
function calledByView(viewDefs, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9_])(public\\.)?${esc}\\s*\\(`);
  return viewDefs.some((d) => re.test(String(d || "")));
}

/** الأبوابُ التى لا يطرقُها أحدٌ من الأربعة. */
function unknockedNames(open, files, policyNames, viewDefs, declared) {
  const pol = new Set(policyNames || []);
  const dec = new Set(declared || []);
  return open
    .filter((n) => !pol.has(n))
    .filter((n) => !dec.has(n))
    .filter((n) => !calledByView(viewDefs || [], n))
    .filter((n) => !(files || []).some((f) => callsFunction(f.src, n)))
    .sort();
}

function readCodeFiles() {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (CODE_EXT.has(path.extname(e.name))) {
        try { out.push({ rel: path.relative(repoRoot, p), src: fs.readFileSync(p, "utf8") }); } catch { /* ignore */ }
      }
    }
  };
  for (const r of CODE_ROOTS) walk(path.join(repoRoot, r));
  return out;
}

// ── الفخُّ الذاتىّ ────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  let bad = 0;
  const ok = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) console.log(`  ok  ${name}  (توقّعتُ ${w} فجاء ${g})`);
    else { console.error(`  X   ${name}  (توقّعتُ ${w} فجاء ${g})`); bad++; }
  };
  const F = (src) => [{ rel: "x.ts", src }];

  ok("يرى النداءَ بعلامتَى اقتباس مزدوجتين", callsFunction('supabase.rpc("foo", {})', "foo"), true);
  ok("ويراه بعلامةٍ مفردة", callsFunction("supabase.rpc('foo')", "foo"), true);
  ok("ويراه بعلامةٍ خلفيّة", callsFunction("supabase.rpc(`foo`)", "foo"), true);
  ok("ويرى مسارَ REST المباشر", callsFunction('fetch("/rest/v1/rpc/foo")', "foo"), true);
  ok("ولا يخدعه ذكرٌ داخل تعليقٍ سطرىّ — التعليقُ ليس تعليمة",
     callsFunction('// supabase.rpc("foo")', "foo"), false);
  ok("ولا ذكرٌ داخل تعليقٍ كتلىّ",
     callsFunction('/* supabase.rpc("foo") */', "foo"), false);
  ok("ولا اسمٌ مذكورٌ بلا نداء — والجوارُ ليس انتماءً",
     callsFunction('const x = "foo";', "foo"), false);
  ok("ولا يخلطُ اسماً بادئتُه نفسُها", callsFunction('supabase.rpc("foo_bar")', "foo"), false);
  ok("ولا يخلطُ مساراً بادئتُه نفسُها", callsFunction('fetch("/rpc/foo_bar")', "foo"), false);

  // **والعرضُ طارقٌ** — الاتّجاهُ الذى كشفَ عطبَ القياسِ الأوّلِ فى دفعةِ الميلاد.
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

  console.log(`  الفخُّ الذاتىّ: 20 اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة." : bad + " منها سقط."}`);
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

  console.log(
    `  دالّاتُ صلاحيّاتٍ كاملةٍ يبلغُها المستخدِمُ المسجَّل: ${open.length}` +
      `   ·   ملفّاتُ كودٍ مسحت: ${codeFiles.length}` +
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
        "         (والنداءُ من داخلِ غلافٍ بصلاحيّاتٍ كاملةٍ يبقى يعملُ بلا منحة.)"
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

  console.log(
    "+ no full-rights function is reachable by a logged-in user beyond the pinned debt " +
      `(${n} unknocked, pinned at ${BASELINE}; a knocker is a screen, an RLS policy, a view, ` +
      "or the documented pre-login declaration - an inner call from another definer needs no grant)."
  );
  process.exit(0);
})().catch((e) => { console.error(`X ${e && e.message ? e.message : e}`); process.exit(1); });
