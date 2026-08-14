/**
 * check-functions-snapshot-matches-db.js
 * ---------------------------------------------------------------------------
 * v3.75.32 — **ومرآةٌ لا يقيسُها أحدٌ تكذبُ بثقة.**
 *
 * لماذا وُلد هذا الحارس
 * ---------------------
 * `supabase/schema/functions.sql` يقولُ عن نفسِه بخطِّ مولِّدِه:
 *
 *   > «مرآةُ المصدرِ الوحيدِ للحقيقة — كلُّ دالّاتِ القاعدةِ العامّة.»
 *
 * وأختُه `schema.sql` يحرسُها حارسان (`...-matches-db` للجداولِ والأعمدة،
 * و`...-grants-match-db` للصلاحيّات). **أمّا أجسادُ الدالّاتِ فلم يكنْ يقيسُها
 * أحد** — لا حارسَ واحد. فالملفُّ يُعادُ رسمُه **باليد**، **ونظافةٌ باليدِ لا
 * تُورَّث**: من نسىَ الأمرَ دفعةً واحدةً بقيتِ المرآةُ تكذبُ وهى موثوقة.
 *
 * وقِيس الانحرافُ قبلَ كتابةِ هذا السطر (2026-08-14، الإنتاج):
 *
 *   • آخرُ رسمٍ للمرآة .................. v3.75.4  (2026-08-10)
 *   • دالّاتٌ حيّةٌ **غائبةٌ عنها تماماً** ... 36
 *   • دالّاتٌ فيها **بجسدٍ قديم** ......... منها `copy_default_permissions_for_company`
 *     و`trg_auto_seed_role_permissions` — **وهما بعينُهما مَن يمنحُ شركةً جديدةً
 *     صلاحيّاتِ وظائفِها** — و`get_suppliers_overview` و`ic_ap_balance`.
 *   • فجوةُ النصِّ بعدَ تسويةِ نهايةِ السطر ... 18,252 حرفاً
 *   • دالّاتٌ ماتت وبقيت فى المرآة ....... 0
 *
 * فإعادةُ بناءٍ من المستودعِ اليومَ كانت **تُعيدُ منطقَ بذرِ صلاحيّاتِ الشركةِ
 * الجديدةِ إلى ما كان قبلَ ثلاثين دفعة**، بلا أن يُبلَّغَ أحد. وهو الخطرُ نفسُه
 * الذى وُلد له حارسُ الصلاحيّاتِ فى v3.75.26، فى الاتّجاهِ الذى بقىَ بلا عين.
 *
 * ما يفحصه
 * --------
 * **ولا يُبنى بيتٌ ثانٍ**: لا يُعيدُ هذا الحارسُ كتابةَ منطقِ التصدير، بل ينادى
 * **المولِّدَ نفسَه** (`export_public_routines()`) الذى يكتبُ الملفَّ، ثمّ يقابلُ
 * نصَّه بما فى الملفِّ المُلتزَم — كتلةً بكتلة:
 *
 *   ١) دالّةٌ حيّةٌ غائبةٌ عن المرآة ⇒ إعادةُ البناءِ **لا تُنشئُها**.
 *   ٢) دالّةٌ فى المرآةِ ماتت ....... ⇒ إعادةُ البناءِ **تبعثُ ما حُذف**.
 *   ٣) جسدٌ يختلف ................. ⇒ إعادةُ البناءِ **تُعيدُ منطقاً قديماً**، وهو
 *      **أخبثُ الثلاثة**: الاسمُ حاضرٌ فيبدو كلُّ شىءٍ سليماً.
 *
 * **ونهايةُ السطرِ ليست خاصّيّة.** ١٨٣ جسداً فى الإنتاجِ تحملُ CRLF داخلَها،
 * والملفُّ المُلتزَمُ LF خالص (قانونُ نهاياتِ الأسطرِ فى المشروع). فمقارنةٌ خامٌ
 * تصرخُ على ١٨٣ برىءاً. **وحارسٌ يصرخ على البرىء يُطفأ** — فتُسوَّى النهاياتُ
 * على الجانبَينِ قبلَ الحكم. (وهذا بعينُه ما وقعَ فى قياسِ هذه الدفعة: أشارَ
 * القياسُ الأوّلُ إلى ثلاثِ دالّاتٍ منحرفةٍ فى حرفِ الدال، فلمّا سُوِّيت النهاياتُ
 * كانت **مطابقةً تماماً**.)
 *
 * **والترويسةُ ليست محتوى**: المولِّدُ يختمُ الملفَّ بطابعٍ زمنىٍّ يتغيّرُ فى كلِّ
 * رسم. فتُسقَطُ الترويسةُ قبلَ المقارنة — وإلّا كان الحارسُ يصرخُ فى كلِّ مرّة.
 *
 * **ولا مرآةَ بلا أصل**: إن أعادَ المولِّدُ الحىُّ فراغاً رُفض ولم يمرّ.
 * **والطمأنينةُ الكاذبة أسوأُ من الغياب.**
 *
 * **ولا يُركَّبُ حارسٌ على انحرافٍ قائمٍ فيُعتادَ صراخُه**: أُعيد رسمُ المرآةِ فى
 * دفعتِه نفسِها **قبل** أن يُركَّبَ هذا الحارس، فوُلد وهو يقولُ صفراً.
 *
 * الإصلاح حين يسقط:  node scripts/dump-db-functions.js
 *
 * Usage: node scripts/check-functions-snapshot-matches-db.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const SNAPSHOT =
  process.env.FUNCTIONS_SNAPSHOT_PATH || path.join(repoRoot, "supabase", "schema", "functions.sql");

const SEP = "-- ---------------------------------------------------------------";

// ── الجزءُ الخالصُ من المنطق: يُختبَرُ بلا قاعدة ──────────────────────────

/** **ونهايةُ السطرِ ليست خاصّيّة.** */
const normEol = (s) => String(s || "").replace(/\r\n/g, "\n");

/**
 * **والترويسةُ ليست محتوى.**
 * المولِّدُ يكتبُ: سبعةَ أسطرِ ترويسةٍ بين سطرَى `-- ====` ثمّ سطراً فارغاً ثمّ
 * النصّ. والطابعُ الزمنىُّ داخلَها يتغيّرُ فى كلِّ رسمٍ ولو لم تتغيّرْ دالّةٌ
 * واحدة — فلو دخلَ المقارنةَ لصرخَ الحارسُ فى كلِّ مرّةٍ ولَما عنى صراخُه شيئاً.
 * والنصُّ الحىُّ يأتى بلا ترويسةٍ أصلاً، فالإسقاطُ يجعلُ الجانبَينِ سواء.
 */
function stripHeader(text) {
  const lines = normEol(text).split("\n");
  if (!lines.length || !lines[0].startsWith("-- =====")) return normEol(text);
  let i = 1;
  while (i < lines.length && !lines[i].startsWith("-- =====")) i++;
  i++; // سطرُ الإغلاق
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n");
}

/**
 * يقسمُ نصَّ المولِّدِ إلى كتلٍ: كلُّ كتلةٍ فاصلٌ ثمّ `-- توقيع` ثمّ فاصلٌ ثمّ الجسد.
 *
 * **والقسمةُ واحدةٌ على الجانبَين**، لأنّ الجانبَينِ كليهما نصُّ المولِّدِ نفسِه —
 * فلا يُقارَنُ شكلٌ بشكلٍ آخر. والجسدُ يُشذَّبُ من الفراغِ الطرفىِّ وحدَه، فاختلافُ
 * سطرٍ فارغٍ فى الذيلِ ليس انحرافَ منطق.
 */
function routineBlocks(text) {
  const lines = normEol(text).split("\n");
  const out = new Map();
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i] !== SEP || lines[i + 2] !== SEP) continue;
    if (!/^--\s+\S+\(/.test(lines[i + 1])) continue;
    const sig = lines[i + 1].replace(/^--\s+/, "").trim();
    let j = i + 3;
    const buf = [];
    while (j + 2 < lines.length && !(lines[j] === SEP && lines[j + 2] === SEP && /^--\s+\S+\(/.test(lines[j + 1]))) {
      buf.push(lines[j]);
      j++;
    }
    if (j + 2 >= lines.length) while (j < lines.length) buf.push(lines[j++]);
    const body = buf.join("\n").trim();
    // التحميلُ الزائدُ يجعلُ التوقيعَ مفتاحاً لا الاسم؛ ولو تكرّرَ التوقيعُ حُفظَ الأوّل.
    if (!out.has(sig)) out.set(sig, body);
    i = j - 1;
  }
  return out;
}

/** الاتّجاهاتُ الثلاثة. */
function diffRoutines(liveText, snapshotText) {
  const live = routineBlocks(liveText);
  const snap = routineBlocks(stripHeader(snapshotText));
  const missing = [];  // حىٌّ وغائبٌ عن المرآة
  const dead = [];     // فى المرآةِ ولا وجودَ له حيّاً
  const changed = [];  // موجودٌ فى الاثنَينِ وجسدُه يختلف
  for (const [sig, body] of live) {
    if (!snap.has(sig)) missing.push(sig);
    else if (snap.get(sig) !== body) changed.push(sig);
  }
  for (const sig of snap.keys()) if (!live.has(sig)) dead.push(sig);
  missing.sort(); dead.sort(); changed.sort();
  return { liveCount: live.size, snapCount: snap.size, missing, dead, changed };
}

/** الحكمُ لا يقتصرُ على الكتل: نصٌّ خارجَها لو اختلفَ فهو انحرافٌ أيضاً. */
function textsAgree(liveText, snapshotText) {
  return normEol(liveText).trim() === stripHeader(snapshotText).trim();
}

// ── الفخُّ الذاتىّ ────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  let bad = 0;
  const ok = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) console.log(`  ok  ${name}  (توقّعتُ ${w} فجاء ${g})`);
    else { console.error(`  X   ${name}  (توقّعتُ ${w} فجاء ${g})`); bad++; }
  };

  const blk = (sig, body) => [SEP, `-- ${sig}`, SEP, body, ""].join("\n");
  const A = blk("a_fn(p integer)", "CREATE OR REPLACE FUNCTION public.a_fn(p integer)\nAS $function$ SELECT 1 $function$;");
  const B = blk("b_fn()", "CREATE OR REPLACE FUNCTION public.b_fn()\nAS $function$ SELECT 2 $function$;");
  const B2 = blk("b_fn()", "CREATE OR REPLACE FUNCTION public.b_fn()\nAS $function$ SELECT 99 $function$;");
  const HDR =
    "-- =====================================================================\n" +
    "-- AUTO-GENERATED SNAPSHOT\n" +
    "-- Generated: 2026-01-01T00:00:00.000Z\n" +
    "-- =====================================================================\n\n";

  ok("يمرّ حين تتطابق المرآةُ والقاعدة",
     (() => { const d = diffRoutines(A + B, HDR + A + B); return [d.missing.length, d.dead.length, d.changed.length]; })(), [0, 0, 0]);

  ok("ويقرأُ عددَ الدالّاتِ على الجانبَين",
     (() => { const d = diffRoutines(A + B, HDR + A + B); return [d.liveCount, d.snapCount]; })(), [2, 2]);

  ok("ويرى دالّةً حيّةً غائبةً عن المرآة — إعادةُ البناءِ لا تُنشئُها",
     diffRoutines(A + B, HDR + A).missing, ["b_fn()"]);

  ok("ويرى دالّةً فى المرآةِ ماتت — إعادةُ البناءِ تبعثُ ما حُذف",
     diffRoutines(A, HDR + A + B).dead, ["b_fn()"]);

  ok("ويرى جسداً اختلف — وهو أخبثُ الثلاثةِ لأنّ الاسمَ حاضر",
     diffRoutines(A + B, HDR + A + B2).changed, ["b_fn()"]);

  ok("ولا يخلطُ الاتّجاهاتِ الثلاثة",
     (() => { const d = diffRoutines(A + B, HDR + A + B2); return [d.missing.length, d.dead.length]; })(), [0, 0]);

  // **ونهايةُ السطرِ ليست خاصّيّة** — هذا بعينُه ما أخطأَ فيه قياسُ هذه الدفعةِ أوّلاً.
  ok("ولا يخدعه اختلافُ نهايةِ السطر (CRLF مقابل LF)",
     (() => { const d = diffRoutines((A + B).replace(/\n/g, "\r\n"), HDR + A + B); return [d.missing.length, d.dead.length, d.changed.length]; })(), [0, 0, 0]);

  ok("ولا فى الاتّجاهِ المعاكس",
     (() => { const d = diffRoutines(A + B, (HDR + A + B).replace(/\n/g, "\r\n")); return [d.missing.length, d.dead.length, d.changed.length]; })(), [0, 0, 0]);

  // **والترويسةُ ليست محتوى** — طابعٌ زمنىٌّ يتغيّرُ فى كلِّ رسم.
  ok("ولا يخدعه طابعُ الترويسةِ الزمنىّ",
     textsAgree(A + B, HDR.replace("2026-01-01T00:00:00.000Z", "2099-12-31T23:59:59.999Z") + A + B), true);

  ok("وتُسقَطُ الترويسةُ ولا يُسقَطُ ما بعدَها",
     stripHeader(HDR + A + B).startsWith(SEP), true);

  ok("ولا يُسقِطُ شيئاً من نصٍّ بلا ترويسة",
     stripHeader(A + B).startsWith(SEP), true);

  // **والفحصُ يقولُ ما وجد**: لو اختلفَ النصُّ وجبَ أن يُسمّىَ شىء.
  ok("وحين يختلفُ النصُّ لا يسكتُ الحكم",
     textsAgree(A + B, HDR + A + B2), false);

  ok("وحين يتطابقُ النصُّ يوافقُ الحكمُ القسمة",
     textsAgree(A + B, HDR + A + B), true);

  ok("ولا يعدُّ سطراً ليس رأسَ كتلةٍ كتلةً",
     routineBlocks([SEP, "-- ليس توقيعاً", SEP, "x"].join("\n")).size, 0);

  ok("ولا يخدعه ذكرُ الفاصلِ داخلَ جسدٍ",
     diffRoutines(blk("c_fn()", "AS $f$\n" + SEP + "\nSELECT 1 $f$;"),
                  HDR + blk("c_fn()", "AS $f$\n" + SEP + "\nSELECT 1 $f$;")).changed.length, 0);

  ok("ويقبلُ الفراغَ بلا صراخ",
     (() => { const d = diffRoutines("", ""); return [d.missing.length, d.dead.length, d.changed.length]; })(), [0, 0, 0]);

  ok("ولا يعدُّ فراغاً طرفيّاً انحرافَ منطق",
     diffRoutines(A, HDR + A + "\n\n\n").changed.length, 0);

  console.log(`  الفخُّ الذاتىّ: 17 اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة." : bad + " منها سقط."}`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── القياسُ الحىّ ─────────────────────────────────────────────────────────
const requireDb = process.argv.includes("--require-db");
const url = process.env.PRODUCTION_SUPABASE_DB_URL;

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot compare the function mirror.";
  if (requireDb) { console.error(`X ${msg}`); process.exit(1); }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`);
  process.exit(0);
}

let Client;
try { ({ Client } = require("./lib/live-db")); } catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error(`X مرآةُ الدالّاتِ مفقودة: ${SNAPSHOT}`);
  console.error("  الإصلاح: node scripts/dump-db-functions.js");
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let liveBody = "";
  try {
    const { rows } = await client.query("SELECT public.export_public_routines() AS body");
    liveBody = (rows[0] && rows[0].body) || "";
  } finally {
    await client.end();
  }

  // **ولا مرآةَ بلا أصل.**
  if (!liveBody.trim()) {
    console.error("X المولِّدُ الحىُّ أعادَ فراغاً — لا يُحكَمُ على مرآةٍ بلا أصل.");
    process.exit(1);
  }

  const snapshotText = fs.readFileSync(SNAPSHOT, "utf8");
  const d = diffRoutines(liveBody, snapshotText);
  const agree = textsAgree(liveBody, snapshotText);

  // **وبحثٌ لا يجد ليس دليلَ غياب**: مرآةٌ بلا كتلةٍ واحدةٍ ليست مطابقةً، بل مكسورة.
  if (d.snapCount < 1 || d.liveCount < 1) {
    console.error(
      `X لم تُقرأْ كتلةٌ واحدة (حىٌّ ${d.liveCount} · مرآة ${d.snapCount}) — قسمةٌ مكسورةٌ لا مطابقة.`
    );
    process.exit(1);
  }

  if (d.missing.length === 0 && d.dead.length === 0 && d.changed.length === 0 && agree) {
    console.log(
      `+ the function mirror matches the live database exactly ` +
        `(${d.liveCount} routine(s), bodies compared block by block; ` +
        "line endings normalised on both sides and the generated header ignored, " +
        "so neither can fool it)."
    );
    process.exit(0);
  }

  console.error("X مرآةُ الدالّاتِ لا تطابقُ القاعدةَ الحيّة — وإعادةُ بناءٍ من المستودعِ تكذب:\n");
  const say = (list, title) => {
    if (list.length === 0) return;
    console.error(`  ${list.length} ${title}`);
    for (const s of list.slice(0, 20)) console.error(`    - ${s}`);
    if (list.length > 20) console.error(`    … و${list.length - 20} غيرُها`);
    console.error("");
  };
  say(d.changed, "دالّةً جسدُها فى المرآةِ يخالفُ الحىَّ — إعادةُ البناءِ **تُعيدُ منطقاً قديماً**:");
  say(d.missing, "دالّةً حيّةً غائبةً عن المرآة — إعادةُ البناءِ **لا تُنشئُها**:");
  say(d.dead, "دالّةً فى المرآةِ لا وجودَ لها حيّاً — إعادةُ البناءِ **تبعثُ ما حُذف**:");
  if (!agree && d.missing.length === 0 && d.dead.length === 0 && d.changed.length === 0) {
    console.error("  ونصٌّ خارجَ الكتلِ يختلف — والحكمُ لا يقتصرُ على ما قُسِّم.\n");
  }
  console.error(`  (حىٌّ ${d.liveCount} دالّةً · مرآة ${d.snapCount})`);
  console.error("  الإصلاح:  node scripts/dump-db-functions.js");
  process.exit(1);
})().catch((e) => { console.error(`X ${e && e.message ? e.message : e}`); process.exit(1); });
