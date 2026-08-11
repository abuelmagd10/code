#!/usr/bin/env node
/**
 * check-db-senior-pair-matches-home.js — القوائمُ المبعثرةُ تُربَط ولا تُكنَس.
 * ---------------------------------------------------------------------------
 *   node scripts/check-db-senior-pair-matches-home.js [--require-db]
 *   node scripts/check-db-senior-pair-matches-home.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * فى قاعدة البيانات **١٠٢ دالّة** و**١١٥ سياسةَ رؤية** تكتب «المالك أو المدير
 * العام» بيدها. وكان الحلُّ الظاهرُ أن تُحوَّل كلُّها إلى نداءٍ على البيت
 * الواحد كما فُعل بالكود — **وقِستُ فرفضتُ**:
 *
 *   • سياسةُ الرؤية تُنفَّذ **على كلِّ صفٍّ يُقرأ**. واستبدالُ قائمةٍ ثابتةٍ
 *     بنداءِ دالّةٍ يعنى نداءً لكلِّ صفّ، وقد يمنع استعمالَ الفهارس.
 *     **ولا يُصلَح شكلٌ بثمنٍ يدفعه المستخدمُ فى كلِّ فتحةِ شاشة.**
 *   • واليومَ الرتبةُ **حرفٌ ثابت**. ولو صارت نداءً يقرأ جدولَ الوظائف لَصار
 *     تعديلُ صفٍّ واحدٍ يفتح أو يغلق ٢١٧ باباً دفعةً واحدة.
 *     **وقاعدةُ صلاحيّةٍ تتبع بياناتٍ تُعدَّل أخطرُ من قاعدةٍ مكتوبةٍ ثابتة.**
 *
 * ═══ فالعلاجُ رَبطٌ لا كنس ═══
 *
 * تبقى القوائمُ فى مواضعها، **ويُمنع صمتُها**: كلُّ قائمةٍ تجمع المالكَ
 * والمديرَ العامَّ ولا تذكر وظيفةً حيّةً أخرى **يجب أن تُطابق
 * `erp_senior_roles()` تمامَ المطابقة**. فمن غيّر الرتبَ يوماً ونسى موضعاً
 * سقط البناءُ وسمّى الموضعَ بالاسم.
 *
 * **وقاعدةٌ لها مئتا بيتٍ مُراقَبةٍ خيرٌ من مئتى بيتٍ صامت.**
 *
 * ═══ وما ليس رتبةً لا يُحاكَم ═══
 *
 * قائمةٌ فيها `manager` أو `accountant` قائمةٌ أخرى لا رتبةٌ عليا، فتُترك.
 * والتهجئاتُ الميّتة (`gm`, `general_manager`…) تُعدّ وتُذكر ولا تُسقِط، لأنّ
 * حارساً آخرَ يتولّاها. **وحارسٌ يصرخ على البرىء يُطفأ ثمّ لا يحرس شيئاً.**
 * ---------------------------------------------------------------------------
 */
"use strict"

const DEAD = new Set(["gm", "generalmanager", "general_manager", "superadmin", "super_admin", "employee", "sales", "supervisor", "warehouse_manager", "branch_manager", "inventory"])

/** يستخرج مجموعاتِ أسماءِ الأدوارِ المكتوبةِ فى نصٍّ واحد (قائمة أو مقارنات). */
function roleGroups(sql) {
  const out = []
  const arr = /ARRAY\s*\[([^\]]*)\]|\(\s*((?:'[a-z_]+'(?:::text)?\s*,\s*)+'[a-z_]+'(?:::text)?)\s*\)/gi
  let m
  while ((m = arr.exec(sql))) {
    const body = m[1] || m[2] || ""
    const toks = [...body.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    if (toks.length >= 2) out.push({ at: m.index, toks })
  }
  return out
}

/**
 * الحكم: مجموعةٌ تجمع owner و admin ولا تذكر وظيفةً حيّةً أخرى يجب أن تساوى
 * الرتبةَ العليا كما تقولها القاعدة. تُعيد سببَ السقوط أو null.
 */
function judgeGroup(toks, senior, liveVocab) {
  const set = new Set(toks)
  if (!(set.has("owner") && set.has("admin"))) return null
  const live = toks.filter((t) => liveVocab.includes(t))
  const others = live.filter((t) => !senior.includes(t))
  if (others.length) return null // قائمةٌ أخرى لا رتبةٌ عليا
  const missing = senior.filter((s) => !set.has(s))
  if (missing.length) return "تنقصها رتبةٌ عليا: " + missing.join(", ")
  // **وقائمةٌ صحيحةٌ تُعدّ ولا تُهمَل.** كانت تُعيد null فلا تُحصى، فقال
  // الحارسُ «لم أجد قائمةً واحدة» وسقطَ بقاعدته الخاصّة — وهى قاعدةٌ صحيحة
  // كشفت عيبَ العدّ لا عيبَ القاعدة. **وحارسٌ لا يعدُّ ما مرَّ لا يعرف أنّه فحص.**
  const dead = toks.filter((t) => !liveVocab.includes(t))
  return { ok: true, note: dead.length ? "تهجئاتٌ ميّتة: " + dead.join(", ") : "" }
}

if (process.argv.includes("--selftest")) {
  const S = ["owner", "admin"]
  const V = ["owner", "admin", "manager", "accountant", "staff", "viewer"]
  const one = (sql) => roleGroups(sql).map((g) => judgeGroup(g.toks, S, V)).filter((r) => typeof r === "string")
  const cases = [
    ["يقبل قائمةً تطابق الرتبة", "cm.role = ANY (ARRAY['owner'::text, 'admin'::text])", 0],
    ["ويرفض قائمةً نقصت منها رتبة", "cm.role = ANY (ARRAY['owner'::text])", 0],
    ["ويرفض قائمةً فيها المالكُ وحدَه مع ميّت", "cm.role = ANY (ARRAY['owner'::text, 'gm'::text])", 0],
    ["ويرفض قائمةً بها admin بلا owner", "cm.role = ANY (ARRAY['admin'::text, 'gm'::text])", 0],
    ["ولا يحاكم قائمةً فيها مدير الفرع", "role = ANY (ARRAY['owner'::text,'admin'::text,'manager'::text])", 0],
    ["ولا يحاكم قائمةَ حالاتٍ ليست أدواراً", "status = ANY (ARRAY['draft'::text,'sent'::text])", 0],
    ["ويقبل الشكلَ بين قوسين", "role IN ('owner','admin')", 0],
    ["ويقبل الرتبةَ ومعها ميّتٌ معدود", "role = ANY (ARRAY['owner'::text,'admin'::text,'gm'::text])", 0],
  ]
  let fail = 0
  for (const [name, sql, exp] of cases) {
    const got = one(sql).length
    if (got !== exp) fail++
    console.log((got === exp ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  // الاتّجاه الحاسم: لو تغيّرت الرتبةُ فى البيت، تسقط القوائمُ القديمة
  const S3 = ["owner", "admin", "deputy"]
  const got3 = roleGroups("role = ANY (ARRAY['owner'::text,'admin'::text])").map((g) => judgeGroup(g.toks, S3, V.concat("deputy"))).filter((r) => typeof r === "string").length
  const ok3 = got3 === 1
  if (!ok3) fail++
  console.log((ok3 ? "  ok  " : "  X   ") + "ويسقط حين تُضاف رتبةٌ عليا ثالثةٌ ولم تُذكر  (توقّعتُ 1 فجاء " + got3 + ")")
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + (cases.length + 1) + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة القوائم الحيّة."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}
let Client
try { ({ Client } = require("./lib/live-db")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const senior = (await c.query("SELECT unnest(public.erp_senior_roles()) AS r")).rows.map((x) => x.r)
    const vocab = (await c.query("SELECT unnest(public.erp_membership_roles()) AS r")).rows.map((x) => x.r)
    if (!senior.length || !vocab.length) { console.error("X قراءةٌ فارغةٌ من القاعدة — عطبٌ لا براءة."); process.exit(1) }

    const fns = (await c.query(`SELECT p.proname AS name, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind IN ('f','p')
        AND p.prolang <> (SELECT oid FROM pg_language WHERE lanname='internal')`)).rows
    const pols = (await c.query(`SELECT c.relname||' / '||pol.polname AS name,
        coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')||' '||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') AS def
      FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'`)).rows

    let seen = 0, dead = 0
    const bad = []
    for (const o of fns.concat(pols)) {
      for (const g of roleGroups(o.def)) {
        const v = judgeGroup(g.toks, senior, vocab)
        if (v === null) continue
        if (typeof v === "string") { bad.push(o.name + " :: " + v + "  [" + g.toks.join(", ") + "]"); seen++ }
        else { seen++; dead++ }
      }
    }
    console.log("  الرتبةُ العليا فى القاعدة: " + senior.join(", "))
    console.log("  قوائمُ مربوطةٌ ومفحوصة: " + seen + "   ·   منها فيها تهجئةٌ ميّتةٌ معدودة: " + dead)
    if (seen === 0) { console.error("X لم أجد قائمةً واحدة — **بحثٌ لا يجد ليس دليلَ غياب.**"); process.exit(1) }
    if (bad.length) {
      console.error("\nX قائمةٌ خرجت عن الرتبةِ كما تقولها القاعدة (" + bad.length + "):")
      bad.forEach((b) => console.error("   " + b))
      console.error("\n   العلاج: صحّحِ القائمةَ لتطابق erp_senior_roles()، أو صحّحِ الرتبةَ فى كتالوج الوظائف.")
      process.exit(1)
    }
    console.log("  ok  كلُّ قائمةٍ تجمع المالكَ والمديرَ العامَّ تطابق الرتبةَ الحيّة — مُراقَبةٌ لا مبعثَرة.")
  } finally { await c.end() }
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
