#!/usr/bin/env node
/**
 * check-no-caller-schema-precedes-the-house.js
 * ---------------------------------------------------------------------------
 * v3.75.59 — **ولا يُسبَقُ البيتُ بمكانٍ يملكُه المُنادى.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * كان مستشارُ Supabase يبلِّغُ عن `function_search_path_mutable`، وأعلنّاه
 * ثلاثَ دفعاتٍ «عطباً أمنيّاً يُسدَّدُ بدفعتِه». فلمّا قِيسَ **انقلبَ الحكم**:
 *
 *   · الـ٥٨٨ التى يصرخُ عليها المستشارُ **كلُّها بصلاحيّاتِ مُنادِيها** —
 *     فلا ترفعُ صلاحيّةً، وهى الأخفّ.
 *   · و**٧٣٨ دالّةً بصلاحيّاتٍ كاملةٍ** كان مسارُها مضبوطاً **ولا يذكرُ
 *     `pg_temp`** — **وهذه لا يبلِّغُ عنها المستشارُ أصلاً**.
 *
 * وPostgres يبحثُ فى مخطَّطِ الجداولِ المؤقّتةِ **أوّلاً** ما لم يُذكَرْ صراحةً.
 * فمُنادٍ يُنشئُ `CREATE TEMP TABLE company_members` ثمّ ينادى بوّابةَ هويّةٍ
 * بصلاحيّاتٍ كاملة — **فتقرأُ البوّابةُ عضويّتَه المزوّرةَ لا صفَّ الشركة**.
 *
 * ═══ والبرهانُ حىٌّ لا مُستنتَج (بيتُ الاختبار، غُرسَ ثمّ أُلغى) ═══
 *
 *     البوّابةُ الحيّةُ is_company_member  قبلَ التزوير = false
 *                                          بعدَ التزوير = false   ← محصَّنة
 *     شاهدُ الضبطِ القديم (public, pg_catalog) ......... = true    ← نافذ
 *
 * **والشاهدُ ضرورىّ**: بلا نسخةٍ بالضبطِ القديمِ لكان «false» يُقرَأُ حصانةً
 * وهو قد يكونُ عجزَ التزوير. **وفخٌّ لا يُشغَّلُ ليس فخّاً.**
 *
 * ═══ ما يفحصه — بالأثرِ لا بالاسم ═══
 *
 *   (١) **صفرٌ مُثبَّت**: لا دالّةَ بصلاحيّاتٍ كاملةٍ فى `public` مسارُها يخلو
 *       من `pg_temp` — سواءٌ كان مضبوطاً ناقصاً أو غيرَ مضبوطٍ أصلاً.
 *   (٢) **وبوّاباتُ الهويّةِ تُسمّى بأعيانِها**: عليهنّ يقومُ كلُّ عزلٍ بين
 *       الشركات، فلا يكفى أن يكونَ العددُ صفراً — تُقاسُ كلُّ واحدةٍ باسمِها،
 *       **فغيابُ اسمٍ من القاعدةِ يُرفَضُ كما يُرفَضُ ضبطُه الناقص**.
 *   (٣) **ومعدودٌ لا مسكوتٌ عنه**: من بصلاحيّاتِ مُنادِيها بلا مسارِ بحثٍ
 *       مُثبَّتٌ عند رقمِه فلا يزيد — **ويُرفَضُ نقصانُه أيضاً حتّى يُثبَّتَ فى
 *       الدفعةِ التى كسبَتْه**.
 *   (٤) والفحصُ المرجعىُّ `assert_baseline_v3_75_59_check` قائمٌ ومغلَق —
 *       **وحارسٌ يُفتَحُ بابُه ليس حارساً**.
 *
 * **ولا يُبنى بيتٌ ثانٍ**: الاتّصالُ من `scripts/lib/live-db.js`.
 *
 * Usage: node scripts/check-no-caller-schema-precedes-the-house.js [--require-db] [--list]
 *        node scripts/check-no-caller-schema-precedes-the-house.js --selftest
 * ---------------------------------------------------------------------------
 */
"use strict"

/**
 * **v3.75.60 — الدَّينُ سُدِّدَ فنزلَ الرقم.** كان ٥٨٨ يومَ وُلد هذا الحارس.
 * فلمّا حملت v3.75.60 مسارَ البحثِ إلى **٤٩١ دالّةً من دوالِّنا**، لم يبقَ تحتَ
 * هذا القياسِ إلّا **١٤٥ كلُّها لحمُ امتدادَين** (vector · pg_trgm) بلغةِ C —
 * **لا جسدَ يُقرَأُ فيها فلا يمرُّ حلُّ أسمائِها بمسارِ بحثٍ أصلاً**، فليست
 * ديناً علينا، **ولا يُعالَجُ لحمُ غيرِنا**.
 *
 * **والبيتانِ صارا يقولانِ رقماً واحداً** — ١٤٥ و١٤٥ — بعد أن كانا يختلفان.
 * **ويُرفَضُ النقصانُ كما تُرفَضُ الزيادة**: الدفعةُ التى تكسِبُ تُنزِلُ الرقمَ بيدِها.
 */
const PINNED_INVOKER_UNSET = 145

/** البوّاباتُ التى يقومُ عليها العزلُ بين الشركات — تُقاسُ بأعيانِها لا بالعدد. */
const GATES = [
  "assert_company_access",
  "is_company_member",
  "check_permission",
  "can_modify_data",
  "fn_user_company_access",
  "fn_user_company_ids",
  "get_user_company_ids",
  "assert_is_self",
]

const BASELINE = "assert_baseline_v3_75_59_check"

// ═══════════════════════════════════════════════════════════════════════════
// الأحكامُ الخالصة — تُقاسُ فى الفخِّ الذاتىِّ بلا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/**
 * **والحكمُ بالأثرِ لا بالشكل**: المسارُ الذى لا يذكرُ `pg_temp` **يُقدِّمُ**
 * مخطَّطَ المُنادى، سواءٌ أكان غائباً أم مضبوطاً ناقصاً — والحالتانِ سواءٌ فى
 * الأثر، فتُسمَّيانِ باسمٍ واحد.
 */
function judgeSearchPath(sp) {
  if (sp === null || sp === undefined || sp === "") return "غائبٌ — ومخطَّطُ المُنادى يسبق"
  if (!/(^|[,\s])pg_temp([,\s]|$)/.test(sp)) return "مضبوطٌ ولا يذكرُ pg_temp — ومخطَّطُ المُنادى يسبق"
  return "ok"
}

/** **ويرفضُ فى الاتّجاهَين**: زيادةٌ عطبٌ جديد، ونقصانٌ مكسبٌ لم يُثبَّت. */
function judgePin(found, pinned) {
  if (found > pinned) return "grew"
  if (found < pinned) return "shrank"
  return "ok"
}

/**
 * **وبوّاباتُ الهويّةِ تُسمّى بأعيانِها**: غيابُ بوّابةٍ من القاعدةِ لا يُقرَأُ
 * نجاحاً — **وبحثٌ لا يجد ليس دليلَ غياب**، بل هو غيابٌ يُعلَنُ ويُرفَض.
 */
function judgeGates(rows, gates) {
  const seen = new Map()
  for (const r of rows || []) {
    const v = judgeSearchPath(r.sp)
    if (v !== "ok") seen.set(r.proname, v)
    else if (!seen.has(r.proname)) seen.set(r.proname, "ok")
  }
  const out = []
  for (const g of gates || GATES) {
    if (!seen.has(g)) out.push(g + " غائبةٌ من القاعدة")
    else if (seen.get(g) !== "ok") out.push(g + ": " + seen.get(g))
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ — **وفخٌّ لا يُشغَّلُ ليس فخّاً**
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  let bad = 0
  let cases = 0
  const t = (label, got, want) => {
    cases++
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + label + "  (توقّعتُ " + JSON.stringify(want) + " فجاء " + JSON.stringify(got) + ")")
  }

  // ── الحكمُ على المسار ────────────────────────────────────────────────────
  t("يقبلُ مساراً يذكرُ pg_temp", judgeSearchPath("public, pg_catalog, pg_temp"), "ok")
  t("ويقبلُه ولو كان أوّلَ الذكر", judgeSearchPath("pg_temp, public"), "ok")
  t("ويقبلُه بلا فراغ", judgeSearchPath("public,pg_temp"), "ok")
  t("ويرفضُ مساراً ناقصاً", judgeSearchPath("public, pg_catalog").indexOf("لا يذكرُ") > 0, true)
  t("ويرفضُ غيابَ المسارِ أصلاً", judgeSearchPath(null).indexOf("غائبٌ") === 0, true)
  t("ويرفضُ الفراغ", judgeSearchPath("").indexOf("غائبٌ") === 0, true)
  // **وشكلُ النصِّ ليس خاصّيّة**: اسمٌ يحملُ pg_temp جزءاً من كلمةٍ ليس ذِكراً له
  t("ولا يخدعه اسمٌ يشبهُه", judgeSearchPath("public, my_pg_temp_schema").indexOf("لا يذكرُ") > 0, true)
  t("ولا لاحقةٌ تشبهُه", judgeSearchPath("public, pg_temporary").indexOf("لا يذكرُ") > 0, true)

  // ── التثبيتُ يرفضُ فى الاتّجاهَين ────────────────────────────────────────
  t("يمرُّ حين يُطابقُ الرقمُ المُثبَّت", judgePin(588, 588), "ok")
  t("ويرفضُ زيادةً", judgePin(589, 588), "grew")
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه", judgePin(587, 588), "shrank")

  // ── البوّاباتُ بأعيانِها ─────────────────────────────────────────────────
  const OK = GATES.map((g) => ({ proname: g, sp: "public, pg_catalog, pg_temp" }))
  t("يمرُّ حين البوّاباتُ كلُّها محصَّنة", judgeGates(OK), [])
  t("ويمسكُ بوّابةً ناقصةَ الضبط",
    judgeGates(OK.map((r, i) => (i === 0 ? { ...r, sp: "public, pg_catalog" } : r))).length, 1)
  t("ويُسمّيها بعينِها",
    judgeGates(OK.map((r, i) => (i === 0 ? { ...r, sp: "public, pg_catalog" } : r)))[0].indexOf(GATES[0]), 0)
  t("ويمسكُ بوّابةً غابت عن القاعدة — وبحثٌ لا يجد ليس دليلَ غياب",
    judgeGates(OK.slice(1)).length, 1)
  t("ويرفضُ الجميعَ حين لا صفَّ أصلاً", judgeGates([]).length, GATES.length)
  // **ولا تشفعُ نسخةٌ لأخرى**: للاسمِ الواحدِ نسختان، إحداهما ناقصة
  t("ولا تشفعُ نسخةٌ محصَّنةٌ لنسخةٍ ناقصة",
    judgeGates(OK.concat([{ proname: GATES[2], sp: "public" }])).length, 1)
  t("ولا قائمةَ بوّاباتٍ فارغةً تمرُّ صامتة", judgeGates(OK, []).length, 0)

  console.log("  الفخُّ الذاتىّ: " + cases + " اتّجاهاً، " + (bad ? bad + " منها خاطئ." : "كلُّها صحيحة."))
  process.exit(bad ? 1 : 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// القياسُ الحىّ
// ═══════════════════════════════════════════════════════════════════════════
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const { withLiveDatabase } = require("./lib/live-db")
const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قياسُ مساراتِ البحث."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

;(async () => {
  const data = await withLiveDatabase(url, async (c) => {
    const definers = (await c.query(`
      SELECT p.oid::regprocedure::text AS sig, p.proname,
             (SELECT substring(x from 13) FROM unnest(coalesce(p.proconfig,'{}')) x
               WHERE x LIKE 'search_path=%') AS sp
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.prokind = 'f'
         AND p.prosecdef
       ORDER BY p.oid::regprocedure::text`)).rows

    const invokerUnset = (await c.query(`
      SELECT count(*)::int AS n
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.prokind IN ('f','p')
         AND NOT p.prosecdef
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) x
                          WHERE x LIKE 'search_path=%')`)).rows[0].n

    const gates = (await c.query(`
      SELECT p.proname,
             (SELECT substring(x from 13) FROM unnest(coalesce(p.proconfig,'{}')) x
               WHERE x LIKE 'search_path=%') AS sp
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
         AND p.proname = ANY($1::text[])`, [GATES])).rows

    const baseline = (await c.query(`
      SELECT (SELECT count(*) FROM pg_proc
               WHERE pronamespace='public'::regnamespace AND proname=$1)::int AS n,
             (SELECT count(*) FROM information_schema.routine_privileges
               WHERE routine_schema='public' AND routine_name=$1
                 AND grantee IN ('PUBLIC','anon','authenticated'))::int AS open_`, [BASELINE])).rows[0]

    return { definers, invokerUnset, gates, baseline }
  })

  const bad = data.definers
    .map((r) => ({ ...r, why: judgeSearchPath(r.sp) }))
    .filter((r) => r.why !== "ok")

  const gateProblems = judgeGates(data.gates, GATES)
  const vInvoker = judgePin(data.invokerUnset, PINNED_INVOKER_UNSET)

  console.log("  دوالُّ بصلاحيّاتٍ كاملةٍ فى public: " + data.definers.length +
    "   ·   يسبقُها مخطَّطُ المُنادى: " + bad.length + " (المطلوبُ صفر)" +
    "   ·   بوّاباتُ هويّةٍ مقيسةٌ بأعيانِها: " + GATES.length)
  console.log("  وبصلاحيّاتِ مُنادِيها بلا مسارِ بحث: " + data.invokerUnset +
    "   (المُثبَّت " + PINNED_INVOKER_UNSET + " — لحمُ امتدادَين، معدودٌ لا مسكوتٌ عنه)")

  const problems = []
  if (bad.length) {
    problems.push(["دالّةٌ بصلاحيّاتٍ كاملةٍ يسبقُها مخطَّطٌ يملكُه المُنادى — **ومُنادٍ يُنشئُ جدولاً مؤقّتاً يُقرَأُ بدلَ جدولِ الشركة**",
      bad.slice(0, 40).map((r) => r.sig + "   [" + r.why + "]" +
        "   ⇐ ALTER FUNCTION " + r.sig + " SET search_path = " + (r.sp || "public, pg_catalog") + ", pg_temp;")])
  }
  if (gateProblems.length) {
    problems.push(["بوّابةُ هويّةٍ يسبقُها مخطَّطُ المُنادى — **والعضويّةُ تُزوَّرُ بجدولٍ مؤقّت**", gateProblems])
  }
  if (vInvoker === "grew") {
    problems.push(["زادَ من بصلاحيّاتِ مُنادِيها بلا مسارِ بحث: " + data.invokerUnset + " والمُثبَّتُ " + PINNED_INVOKER_UNSET, [
      "دالّةٌ **لنا** وُلدت بلا مسارِ بحث — ومخطَّطُ المُنادى يسبقُ بيتَها. ويُسمّيها بعينِها حارسُ v3.75.60.",
    ]])
  }
  if (vInvoker === "shrank") {
    problems.push(["نقصَ العددُ ولم يُثبَّتْ — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**", [
      "أنزِلِ الرقمَ فى الدفعةِ التى كسبَتْه: const PINNED_INVOKER_UNSET = " + data.invokerUnset,
    ]])
  }
  if (!Number(data.baseline.n)) problems.push(["الفحصُ المرجعىُّ " + BASELINE + " غائب", []])
  else if (Number(data.baseline.open_)) problems.push(["الفحصُ المرجعىُّ يبلغُه زائرٌ أو مستخدِم — **وحارسٌ يُفتَحُ بابُه ليس حارساً**", []])

  if (problems.length) {
    for (const [title, lines] of problems) {
      console.error("\nX " + title + (lines.length ? " (" + lines.length + "):" : ":"))
      lines.forEach((x) => console.error("   " + x))
    }
    process.exit(1)
  }

  console.log("+ لا دالّةَ بصلاحيّاتٍ كاملةٍ يسبقُها مخطَّطٌ يملكُه المُنادى، وبوّاباتُ الهويّةِ الثمانى محصَّنةٌ بأعيانِها (الحكمُ على الأثر: غيابُ المسارِ وضبطُه الناقصُ سواءٌ).")
  if (verbose) {
    for (const g of data.gates) console.log("      - " + g.proname + "   [" + (g.sp || "(بلا ضبط)") + "]")
  }
  console.log("  ! ومعدودٌ لا مسكوتٌ عنه — " + data.invokerUnset +
    " بصلاحيّاتِ مُنادِيها بلا مسارِ بحث، **وكلُّها لحمُ امتدادَين بلغةِ C** لا يمرُّ حلُّ أسمائِها بمسارِ بحث فلا تُزوَّرُ أصلاً — ودَينُنا نحن سُدِّدَ فى v3.75.60 (٤٩١ ← ٠).")
  process.exit(0)
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
