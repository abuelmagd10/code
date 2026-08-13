/**
 * check-schema-snapshot-grants-match-db.js
 * ---------------------------------------------------------------------------
 * v3.75.26 — **ومرآةٌ تصفُ باباً مفتوحاً وقد أُغلق تفتحُه ثانيةً عند البناء.**
 *
 * لماذا وُلد هذا الحارس
 * ---------------------
 * فى v3.75.25 نُزعت منحةُ النداءِ من ٣١١ دالّةَ زنادٍ لا يستطيعُ أحدٌ نداءَها.
 * وكانت لقطةُ المخطَّطِ `supabase/schema/schema.sql` تحملُ تلك المنحَ كلَّها،
 * **فإعادةُ بناءٍ من المستودعِ كانت تُعيدُها بلا أن يُبلَّغَ أحد** — وهو الخطرُ
 * المكتوبُ بخطِّ `dump-db-schema.js` نفسِه:
 *
 *   > «إعادةُ البناءِ من المستودعِ بلا هذا الملفِّ تُعيدُ إنشاءَ كلِّ دالّةٍ
 *   >  بصلاحيّةِ التنفيذِ الافتراضيّةِ لـPUBLIC — فتُلغى صامتةً ما أُغلق.»
 *
 * فأُعيدَ رسمُ اللقطةِ **يدوياً**. **ونظافةٌ باليدِ لا تُورَّث**: من ينسى الأمرَ
 * مرّةً واحدةً تعودُ المرآةُ تكذبُ وهى موثوقة.
 *
 * والحارسُ القائمُ `check-schema-snapshot-matches-db.js` يقارنُ **الجداولَ
 * والأعمدةَ عمداً** ولا يقارنُ المنح — تفادياً للضجيج. **فانحرافُ المنحِ اتّجاهٌ
 * لم يكنْ يحرسُه أحد**، وهو الاتّجاهُ الذى تعيشُ فيه كلُّ مكاسبِ الإغلاقِ.
 *
 * ما يفحصه
 * --------
 * **ولا يُبنى بيتٌ ثانٍ**: لا يُعيدُ هذا الحارسُ كتابةَ منطقِ التصدير، بل ينادى
 * **المولِّدَ نفسَه** (`export_public_schema()`) الذى يكتبُ اللقطة، ثمّ يقارنُ
 * **سطورَ الصلاحيّةِ وحدَها** بما فى الملفِّ المُلتزَم — مجموعةً بمجموعة:
 *
 *   ١) سطرٌ حىٌّ غائبٌ عن اللقطة  ⇒ إعادةُ البناءِ **تُسقط** صلاحيّةً قائمة.
 *   ٢) سطرٌ فى اللقطةِ غائبٌ عن الحىّ ⇒ إعادةُ البناءِ **تُعيدُ** ما أُغلق.
 *
 * وكلا الاتّجاهَينِ عطب. **والمقارنةُ مجموعةٌ لا ترتيب**، فلا يخدعُها ترتيبُ
 * الفرزِ ولا لغةُ الترتيبِ فى القاعدة — **وحارسٌ يسقطُ لاختلافِ ترتيبٍ ليس حارساً**.
 *
 * **والصلاحيّةُ منحٌ ونزع.** اللقطةُ اليومَ تحملُ **٣٥١٩ سطرَ منحٍ و١٣٦٨ سطرَ
 * نزع**، وكلُّ ما كُسب فى v3.75.24 و v3.75.25 مكتوبٌ فى **النزع**. فلو حرسنا
 * المنحَ وحدَها لتركنا النصفَ الذى تعيشُ فيه المكاسبُ بلا عين.
 *
 * وقِيس الاتّجاهانِ حيّاً قبلَ تركيبِ الحارسِ فكانا **صفراً**: ٤٨٨٧ سطرَ
 * صلاحيّةٍ على الجانبَين، ببصمةٍ واحدة `688cbc121cae83ea57a883941620c399`.
 * **ولا يُركَّبُ حارسٌ على انحرافٍ قائمٍ فيُعتادَ صراخُه.**
 *
 * الإصلاح حين يسقط:  node scripts/dump-db-schema.js
 *
 * Usage: node scripts/check-schema-snapshot-grants-match-db.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const SNAPSHOT = process.env.SCHEMA_SNAPSHOT_PATH || path.join(repoRoot, "supabase", "schema", "schema.sql");

// ── الجزءُ الخالصُ من المنطق: يُختبَرُ بلا قاعدة ──────────────────────────
/**
 * يستخرجُ **سطورَ الصلاحيّة** من نصٍّ — منحاً كانت أو نزعاً.
 *
 * **ونزعُ المنحِ نصفُ القانونِ لا زينتُه.** اللقطةُ تحملُ ٣٥١٩ سطرَ منحٍ
 * و**١٣٦٨ سطرَ نزع**. وكلُّ ما كسبناه فى v3.75.24 و v3.75.25 مكتوبٌ فى
 * **النزعِ** لا فى المنح. فحارسٌ يقارنُ المنحَ وحدَها يترك النصفَ الذى
 * تعيشُ فيه المكاسبُ بلا عين — **وحارسٌ يحرسُ نصفَ ما يهمُّه ليس حارساً**.
 */
function grantLines(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(GRANT|REVOKE)\s/i.test(l));
}

/** الفرقُ فى الاتّجاهَين بين مجموعتَين — مجموعةٌ لا ترتيب. */
function diffGrants(liveText, snapshotText) {
  const live = new Set(grantLines(liveText));
  const snap = new Set(grantLines(snapshotText));
  const missingFromSnapshot = [...live].filter((g) => !snap.has(g)).sort();
  const staleInSnapshot = [...snap].filter((g) => !live.has(g)).sort();
  return { liveCount: live.size, snapCount: snap.size, missingFromSnapshot, staleInSnapshot };
}

// ── الفخُّ الذاتىّ ────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  let bad = 0;
  const ok = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok  ${label}  (توقّعتُ ${e} فجاء ${a})`);
    else { console.error(`  X  ${label}  (توقّعتُ ${e} فجاء ${a})`); bad++; }
  };

  const G1 = "GRANT EXECUTE ON FUNCTION public.a() TO anon;";
  const G2 = "GRANT EXECUTE ON FUNCTION public.b() TO authenticated;";
  const G3 = "GRANT SELECT ON TABLE public.t TO service_role;";
  const R1 = "REVOKE ALL ON FUNCTION public.c() FROM anon;";

  ok("يمرّ حين تتطابق المجموعتان",
     diffGrants([G1, G2].join("\n"), [G1, G2].join("\n")).missingFromSnapshot.length +
     diffGrants([G1, G2].join("\n"), [G1, G2].join("\n")).staleInSnapshot.length, 0);

  ok("ولا يخدعه اختلافُ الترتيب",
     diffGrants([G1, G2].join("\n"), [G2, G1].join("\n")).staleInSnapshot.length, 0);

  ok("ولا فراغٌ فى أوّلِ السطر",
     diffGrants("   " + G1, G1).missingFromSnapshot.length, 0);

  ok("ويرى منحةً حيّةً غائبةً عن اللقطة — إعادةُ البناء تُسقط صلاحيّة",
     diffGrants([G1, G2].join("\n"), G1).missingFromSnapshot, [G2]);

  ok("ويرى منحةً فى اللقطةِ غائبةً عن الحىّ — إعادةُ البناء تُعيدُ ما أُغلق",
     diffGrants(G1, [G1, G2].join("\n")).staleInSnapshot, [G2]);

  ok("ويرى الاتّجاهَين معاً",
     [diffGrants(G1, G2).missingFromSnapshot, diffGrants(G1, G2).staleInSnapshot], [[G1], [G2]]);

  ok("ويرى منحَ الجداولِ كما يرى منحَ الدالّات",
     diffGrants(G3, "").missingFromSnapshot, [G3]);

  ok("ولا يحسبُ سطراً ليس منحةً",
     grantLines("-- GRANT EXECUTE ON FUNCTION public.z() TO anon;\nCREATE TABLE t();").length, 0);

  ok("ولا يخدعه ذكرُ GRANT فى وسطِ سطر",
     grantLines("ALTER FUNCTION public.z() OWNER TO postgres; -- was GRANT").length, 0);

  // **ونزعُ المنحِ نصفُ القانون** — وهو النصفُ الذى تعيشُ فيه مكاسبُ الإغلاق.
  ok("ويرى سطرَ النزعِ كما يرى سطرَ المنح",
     grantLines(R1).length, 1);

  ok("ويصرخُ إذا سقط نزعٌ حىٌّ من اللقطة — إعادةُ البناءِ تفتحُ ما أُغلق",
     diffGrants([G1, R1].join("\n"), G1).missingFromSnapshot, [R1]);

  ok("ويصرخُ إذا حملتِ اللقطةُ نزعاً لا وجودَ له فى القاعدة",
     diffGrants(G1, [G1, R1].join("\n")).staleInSnapshot, [R1]);

  ok("ويقبلُ الفراغَ بلا صراخ", diffGrants("", "").missingFromSnapshot.length, 0);

  ok("ولا يعدُّ المكرَّرَ مرّتين — مجموعةٌ لا قائمة",
     diffGrants([G1, G1].join("\n"), G1).missingFromSnapshot.length, 0);

  // **ونهايةُ السطرِ ليست خاصّيّة** — شجرةُ العملِ على ويندوز تحفظُ CRLF
  // والمولِّدُ الحىُّ يعطى LF. وحارسٌ يسقطُ لحرفٍ لا يراه أحدٌ ليس حارساً.
  ok("ولا يخدعه اختلافُ نهايةِ السطر (CRLF مقابل LF)",
     [diffGrants([G1, G2].join("\n"), [G1, G2].join("\r\n") + "\r\n").missingFromSnapshot.length,
      diffGrants([G1, G2].join("\n"), [G1, G2].join("\r\n") + "\r\n").staleInSnapshot.length], [0, 0]);

  console.log(`  الفخُّ الذاتىّ: 15 اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة." : bad + " منها سقط."}`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── القياسُ الحىّ ─────────────────────────────────────────────────────────
const requireDb = process.argv.includes("--require-db");
const url = process.env.PRODUCTION_SUPABASE_DB_URL;

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot compare snapshot grants.";
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
  console.error(`X لقطةُ المخطَّطِ مفقودة: ${SNAPSHOT}`);
  console.error("  الإصلاح: node scripts/dump-db-schema.js");
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let liveBody = "";
  try {
    const { rows } = await client.query("SELECT public.export_public_schema() AS body");
    liveBody = (rows[0] && rows[0].body) || "";
  } finally {
    await client.end();
  }

  if (!liveBody.trim()) {
    console.error("X المولِّدُ الحىُّ أعادَ فراغاً — لا يُحكَمُ على مرآةٍ بلا أصل.");
    process.exit(1);
  }

  const snapshotText = fs.readFileSync(SNAPSHOT, "utf8");
  const d = diffGrants(liveBody, snapshotText);

  if (d.missingFromSnapshot.length === 0 && d.staleInSnapshot.length === 0) {
    console.log(
      `+ the snapshot's privilege lines match the live database exactly ` +
        `(${d.liveCount} GRANT/REVOKE line(s), compared as sets so sort order, ` +
        "collation and line endings cannot fool it)."
    );
    process.exit(0);
  }

  console.error("X صلاحيّاتُ اللقطةِ لا تطابقُ القاعدةَ الحيّة — وإعادةُ بناءٍ من المستودعِ تكذب:\n");
  if (d.staleInSnapshot.length > 0) {
    console.error(
      `  ${d.staleInSnapshot.length} سطرَ صلاحيّةٍ فى اللقطةِ لا وجودَ له فى القاعدة ` +
        "— إعادةُ البناءِ **تُعيدُ ما أُغلق**:"
    );
    for (const g of d.staleInSnapshot.slice(0, 20)) console.error(`    - ${g}`);
    if (d.staleInSnapshot.length > 20) console.error(`    … و${d.staleInSnapshot.length - 20} غيرُها`);
    console.error("");
  }
  if (d.missingFromSnapshot.length > 0) {
    console.error(
      `  ${d.missingFromSnapshot.length} سطرَ صلاحيّةٍ حىٍّ غائبٍ عن اللقطة ` +
        "— إعادةُ البناءِ **تُسقط صلاحيّةً قائمة**:"
    );
    for (const g of d.missingFromSnapshot.slice(0, 20)) console.error(`    - ${g}`);
    if (d.missingFromSnapshot.length > 20) console.error(`    … و${d.missingFromSnapshot.length - 20} غيرُها`);
    console.error("");
  }
  console.error("  الإصلاح:  node scripts/dump-db-schema.js");
  process.exit(1);
})().catch((e) => { console.error(`X ${e && e.message ? e.message : e}`); process.exit(1); });
