/**
 * check-code-census-has-one-home.js
 * ---------------------------------------------------------------------------
 * v3.75.35 — **وجَردٌ يقيسُ القرصَ يقيسُ جهازاً لا مشروعاً.**
 *
 * ═══ الحادثتانِ اللتانِ وُلد منهما هذا الحارس ═══
 *
 * **(الأولى، v3.75.34)** حارسٌ يَعُدُّ الأبوابَ التى لا يطرقُها أحدٌ كان يمسحُ
 * أربعةَ مجلّداتٍ **مكتوبةً بيده**: `app` و`lib` و`components` و`hooks`.
 * ومجلّدُ `actions/` ليس منها — وفيه أربعُ دالّاتٍ للقوائمِ الماليّةِ تُنادى.
 * فعُدَّت ثلاثٌ منها «بلا طارق»، **وكادت تُنزَعُ منحتُها فتنكسرُ الشاشات**.
 *
 * **(الثانية، فى تشغيلِ v3.75.34 نفسِه)** بعدَ التصحيحِ صارَ الجردُ يمشى على
 * **القرص**، فقالَ عندَ صاحبِ المشروعِ «١٣٦٣ ملفّاً» وعلى نسخةٍ نظيفةٍ من
 * المستودعِ «١٢٣٦». **ولم يتغيّرِ الحكمُ يومَها**، لكنّ ملفّاً محلّيّاً غيرَ
 * مرفوعٍ كان يكفى ليجعلَ البابَ مطروقاً على جهازٍ ويتيماً على آخَر —
 * **فيمرُّ عندَ من يدفعُ ويسقطُ عندَ من يراجع**.
 *
 * ═══ فالجوابُ بيتٌ واحد ═══
 *
 * `scripts/lib/repo-code-files.js` يقولُ ما هى شيفرةُ المشروع: يُقرأُ من
 * `git ls-files` (الفهرس: المرفوعُ وما رُحِّلَ للتوّ)، ويستثنى ما لا يجرى بحقِّ
 * المستخدِمِ المسجَّلِ **بسببٍ مكتوب**، **ويرفعُ خطأً ولا يُعيدُ فراغاً**.
 *
 * ═══ وماذا يحرسُ هذا الملفّ ═══
 *
 *   ١) **البيتُ حىٌّ ويعملُ**: يُنادى فعلاً فيُعيدُ ملفّاتٍ لا فراغاً — **وبيتٌ
 *      لا يُسكَنُ ليس بيتاً**.
 *   ٢) **ولا يُبنى بيتٌ ثانٍ**: كلُّ سكربتٍ يكتبُ بيدِه قائمةَ مجلّداتِ شيفرةِ
 *      المشروعِ **معدودٌ**، والعددُ مُثبَّتٌ فلا يزيد. **ودَينٌ يُكتَبُ ولا يُسدَّدُ
 *      يصيرُ عادة**؛ وإن نقصَ وجبَ خفضُ الرقمِ فى دفعتِه، **ومكسبٌ لا يُثبَّتُ
 *      يُلتَفُّ عليه**.
 *
 * **والخاصّيّةُ المقيسةُ هنا نصّيّةٌ باعتراف**: «سكربتٌ يقرّرُ بنفسِه ما هى
 * مجلّداتُ شيفرةِ المشروع» لا أثرَ له إلّا القائمةُ المكتوبة. **وهذا مقبولٌ هنا
 * وحدَه**، لأنّ **الطريقَ الوحيدَ للإفلاتِ من النمطِ هو حذفُ القائمةِ ونداءُ
 * البيت — أى العلاجُ نفسُه**. ولو أُخفيت القائمةُ فى متغيّرٍ ليمرَّ السكربت
 * **فذاك تهرّبٌ لا علاج**.
 *
 * Usage: node scripts/check-code-census-has-one-home.js [--selftest]
 * ---------------------------------------------------------------------------
 */
"use strict";

const fs = require("fs");
const path = require("path");

const scriptsDir = __dirname;

/**
 * **الرقمُ المُثبَّت.** قِيس ١٥ سكربتاً يكتبُ قائمتَه بيدِه يومَ وُلد البيت — بعدَ
 * تحويلِ حارسَى «ما يبلغُه الزائر» و«ما يبلغُه المستخدِمُ المسجَّل» إليه، وهما
 * الحارسانِ اللذانِ يقودُ خطؤُهما إلى نزعِ منحةٍ حيّة. لا يزيد، وإن نقصَ فليُخفَضْ
 * هنا فى دفعةِ من خفضَه.
 */
const PINNED = 15;

// ── الجزءُ الخالصُ من المنطق: يُختبَرُ بلا قرصٍ ولا git ───────────────────

/** **والتعليقُ ليس تعليمة.** */
function maskComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** هل يأخذُ هذا السكربتُ جردَه من البيتِ الواحد؟ */
function usesTheOneHome(src) {
  return /require\(\s*["'][^"']*lib\/repo-code-files["']\s*\)/.test(maskComments(src));
}

/**
 * قوائمُ مجلّداتِ شيفرةِ المشروعِ المكتوبةُ باليد: قائمةٌ حرفيّةٌ فيها `app`
 * **ومعها** واحدٌ من `lib` أو `components` أو `hooks`. واشتراطُ الاثنَين معاً
 * يمنعُ الصراخَ على قائمةٍ تذكرُ `app` لسببٍ آخَر — **وحارسٌ يصرخ على البرىء يُطفأ**.
 */
function handWrittenRootLists(src) {
  const masked = maskComments(src);
  const lists = masked.match(/\[[^\][]{0,400}\]/g) || [];
  return lists.filter(
    (L) => /["'`]app["'`]/.test(L) && /["'`](lib|components|hooks)["'`]/.test(L)
  );
}

/** السكربتاتُ التى ما زالت تكتبُ جردَها بيدِها. */
function scriptsWithTheirOwnCensus(files) {
  return (files || [])
    .filter((f) => !usesTheOneHome(f.src))
    .filter((f) => handWrittenRootLists(f.src).length > 0)
    .map((f) => f.rel)
    .sort();
}

function readScripts() {
  const out = [];
  for (const name of fs.readdirSync(scriptsDir)) {
    if (!name.endsWith(".js")) continue;
    const p = path.join(scriptsDir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    try { out.push({ rel: "scripts/" + name, src: fs.readFileSync(p, "utf8") }); } catch { /* ignore */ }
  }
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
  const F = (src) => [{ rel: "scripts/x.js", src }];

  ok("يرى قائمةً مكتوبةً باليد", handWrittenRootLists('const R = ["app", "lib"];').length, 1);
  ok("ويراها بأىِّ ترتيب", handWrittenRootLists('const R = ["components", "app"];').length, 1);
  ok("ويراها بعلامةٍ مفردة", handWrittenRootLists("const R = ['app', 'hooks'];").length, 1);
  ok("ولا يعدُّ قائمةً فيها app وحدَها — والجوارُ ليس انتماءً",
     handWrittenRootLists('const R = ["app"];').length, 0);
  ok("ولا قائمةً ليست مجلّداتِ شيفرة", handWrittenRootLists('const R = ["owner", "admin"];').length, 0);
  ok("ولا قائمةً داخلَ تعليقٍ — التعليقُ ليس تعليمة",
     handWrittenRootLists('// const R = ["app", "lib"];').length, 0);
  ok("ولا داخلَ تعليقٍ كتلىّ", handWrittenRootLists('/* ["app", "lib"] */').length, 0);

  ok("ويرى نداءَ البيتِ الواحد", usesTheOneHome('require("./lib/repo-code-files")'), true);
  ok("ويراه بمسارٍ أطول", usesTheOneHome('require("../scripts/lib/repo-code-files")'), true);
  ok("ولا يخدعه ذكرُ البيتِ فى تعليق", usesTheOneHome('// require("./lib/repo-code-files")'), false);
  ok("ولا ذكرُ اسمِه فى نصّ", usesTheOneHome('const s = "repo-code-files";'), false);

  ok("فيسقطُ سكربتٌ يكتبُ قائمتَه بيدِه",
     scriptsWithTheirOwnCensus(F('const R = ["app", "lib"];')), ["scripts/x.js"]);
  ok("ويمرُّ سكربتٌ ينادى البيتَ ولو ذكرَ المجلّداتِ فى نصٍّ",
     scriptsWithTheirOwnCensus(F('require("./lib/repo-code-files"); const doc = ["app", "lib"];')), []);
  ok("ويمرُّ سكربتٌ لا شأنَ له بجردِ الشيفرة",
     scriptsWithTheirOwnCensus(F("const migrations = readMigrations();")), []);
  ok("ويُسمّى كلَّ من يكتبُ قائمتَه مرتَّبين",
     scriptsWithTheirOwnCensus([
       { rel: "scripts/b.js", src: 'const R = ["app", "lib"];' },
       { rel: "scripts/a.js", src: 'const R = ["app", "hooks"];' },
     ]), ["scripts/a.js", "scripts/b.js"]);

  // **والبيتُ نفسُه يُختبَرُ هنا** — فمن يُلزِمُ به يجبُ أن يقيسَ صدقَه.
  const home = require("./lib/repo-code-files");
  ok("والبيتُ يُدخلُ ملفَّ الإجراءاتِ الذى سقطَ من الجردِ القديم",
     home.keepPath("actions/financial-reports.ts"), true);
  ok("ويُدخلُ مجلّداً لم يُسمَّ قطّ", home.keepPath("brand-new-folder/screen.tsx"), true);
  ok("ولا يُدخلُ سكربتَ مفتاحِ الخدمة", home.keepPath("scripts/check-x.js"), false);
  ok("ولا اختباراً لا يُشحَن", home.keepPath("tests/e2e/x.ts"), false);
  ok("ولا ملفّاً فى مجلّدٍ مخفىّ", home.keepPath(".kilo/x.js"), false);
  ok("ولا ملفّاً ليس شيفرة", home.keepPath("app/page.css"), false);
  ok("ويقبلُ الفاصلَ الخلفىَّ كما تكتبُه ويندوز", home.keepPath("app\\api\\route.ts"), true);
  ok("ولا يستثنى مجلّدَ الإجراءات", home.NOT_SHIPPED.has("actions"), false);

  console.log(`  الفخُّ الذاتىّ: ${total} اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة." : bad + " منها سقط."}`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── القياسُ ───────────────────────────────────────────────────────────────
(function main() {
  // (١) **بيتٌ لا يُسكَنُ ليس بيتاً**: يُنادى فعلاً ويجبُ أن يُعيدَ ملفّات.
  let census;
  try {
    census = require("./lib/repo-code-files").projectCodeFiles();
  } catch (e) {
    console.error(`X البيتُ الواحدُ لم يُعطِ جرداً: ${(e && e.message) || e}`);
    process.exit(1);
  }
  if (!census.files || census.files.length === 0) {
    console.error("X البيتُ الواحدُ أعادَ فراغاً — والطمأنينةُ الكاذبة أسوأُ من الغياب.");
    process.exit(1);
  }

  // (٢) **ولا يُبنى بيتٌ ثانٍ.**
  const scripts = readScripts();
  if (scripts.length === 0) {
    console.error("X لم أقرأْ سكربتاً واحداً — لا يُحكَمُ على ما لم يُبحَثْ فيه.");
    process.exit(1);
  }
  const own = scriptsWithTheirOwnCensus(scripts);

  console.log(
    `  جردُ البيتِ الواحد: ${census.files.length} ملفَّ شيفرةٍ من المستودع` +
      (census.skipped.length ? `   ·   محذوفٌ لم يُرحَّلْ حذفُه: ${census.skipped.length}` : "") +
      `   ·   سكربتاتٌ مفحوصة: ${scripts.length}`
  );
  console.log(`  ما زال يكتبُ جردَه بيدِه: ${own.length}   (المُثبَّت ${PINNED})`);

  if (own.length > PINNED) {
    console.error(
      `\nX زادَ من يكتبُ جردَ الشيفرةِ بيدِه: ${own.length} (المُثبَّت ${PINNED})` +
        " — ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة.\n"
    );
    for (const s of own) console.error(`    - ${s}`);
    console.error(
      "\n  العلاج: يُنادى البيتُ الواحد بدل القائمةِ المكتوبةِ باليد:\n" +
        '         const { projectCodeFiles } = require("./lib/repo-code-files");\n' +
        "         فيصيرُ الجردُ من المستودعِ لا من القرص، **ويدخلُ فيه أىُّ مجلّدٍ جديدٍ تلقائيّاً**."
    );
    process.exit(1);
  }

  if (own.length < PINNED) {
    console.error(
      `\nX نقصَ العددُ إلى ${own.length} والمُثبَّتُ ${PINNED} — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n` +
        `  اخفضِ PINNED إلى ${own.length} فى هذا الملفِّ، فى دفعةِ من خفضَه.`
    );
    process.exit(1);
  }

  if (own.length > 0) {
    console.log("  ! وما زال يكتبُ جردَه بيدِه — معدودٌ لا مسكوتٌ عنه، يُحوَّلُ على دفعاتٍ مقيسة:");
    for (const s of own) console.log(`      - ${s}`);
  }

  console.log(
    "+ the project's code census has one home read from git (not from the disk), it is alive and " +
      `non-empty, and the ${PINNED} script(s) that still write their own folder list are pinned - ` +
      "they may not grow, and any reduction must be pinned in the release that earns it."
  );
  process.exit(0);
})();
