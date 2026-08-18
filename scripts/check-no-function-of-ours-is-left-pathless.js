#!/usr/bin/env node
/**
 * check-no-function-of-ours-is-left-pathless.js
 * ---------------------------------------------------------------------------
 * v3.75.60 — **ودالّتُنا تحملُ مسارَها، ولحمُ غيرِنا لا يُمَسّ.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * أعلنّا فى v3.75.59 دَيناً قوامُه «٥٨٨ دالّةً بلا مسارِ بحث» — **نقلاً عن
 * بلاغِ المستشارِ لا عن قياس**. فلمّا قِيسَ الرقمُ انكسرَ فى الاتّجاهَين معاً:
 *
 *   · **١٤٩ منه ليست لنا أصلاً**: لحمُ امتدادَين (`vector` · `pg_trgm`)
 *     مكتوبٌ بلغةِ C. **ولا حلَّ أسماءٍ فى جسدٍ لا يُقرَأ**، فلا تُزوَّرُ
 *     أصلاً — وضبطُها يمسُّ امتداداً لا نملكُه.
 *   · **و٤٨ خارجَه كانت دَيناً ولم يرَها البلاغ**: مسارُها **مضبوطٌ** لكنّه
 *     `public` أو `public, pg_catalog` — فيبدو أنّها مُعالَجة **وهى مفتوحةٌ
 *     تماماً كالتى بلا ضبط**.
 *
 * **فشكلُ الضبطِ ليس ضبطاً.** والحكمُ الوحيدُ الذى يصمدُ هو الأثر: **هل يسبقُ
 * مخطَّطُ المُنادى بيتَنا أم لا؟** والغيابُ والضبطُ الناقصُ سواءٌ فى الأثر.
 *
 * ═══ والبرهانُ حىٌّ ومعه شاهدُه — على الإنتاجِ نفسِه، بغرسٍ أُلغى ═══
 *
 *     calculate_invoice_net_amount(<معرّفٌ لا صفَّ له>)
 *       قبلَ التزوير ...........................        ٠
 *       بعدَ CREATE TEMP TABLE invoices ........  ٩٩٩٬٩٩٩   ← قرأتِ المزوَّر
 *       بعدَ ALTER ... SET search_path ..........        ٠   ← عادتِ الحقيقة
 *
 * **والخطوةُ الوسطى هى الشاهد**: بلا «٩٩٩٬٩٩٩» لكان «٠ ثمّ ٠» يُقرَأُ حصانةً
 * وهو قد يكونُ عجزَ التزوير. **والطمأنينةُ الكاذبةُ أسوأُ من الغياب.**
 *
 * ═══ ما يفحصه — بالأثرِ لا بالاسم ═══
 *
 *   (١) **صفرٌ مُثبَّت**: لا دالّةَ من دوالِّنا يسبقُها مخطَّطُ المُنادى —
 *       سواءٌ أكان مسارُها غائباً أم مضبوطاً لا يذكرُ `pg_temp`.
 *   (٢) **ودوالُّنا تُعرَّفُ بالخاصّيّةِ لا بقائمة**: فى `public` · دالّة ·
 *       بصلاحيّاتِ مُنادِيها · `plpgsql` أو `sql` · **وليست عضوَ امتداد**
 *       (`pg_depend.deptype = 'e'`). **وقائمةٌ مكتوبةٌ بيدٍ تصيرُ كاذبةً يومَ
 *       يختلفُ البيتان** — وقد قِيسَ أنّهما يختلفانِ اليوم (٤٩٦ · ٤٩٧).
 *   (٣) **ولحمُ غيرِنا معدودٌ لا مسكوتٌ عنه**: ١٤٩ مُثبَّتةٌ **ويُرفَضُ أن
 *       ينالَ واحدٌ منها ضبطاً من يدِنا** — فذاك عبثٌ بامتدادٍ لا نملكُه.
 *   (٤) **ومكسبُ v3.75.59 لا يُنقَض**: صفرٌ بصلاحيّاتٍ كاملةٍ بلا `pg_temp`.
 *   (٥) والفحصُ المرجعىُّ `assert_baseline_v3_75_60_check` قائمٌ ومغلَق —
 *       **وحارسٌ يُفتَحُ بابُه ليس حارساً**.
 *
 * **ولا يُبنى بيتٌ ثانٍ**: الاتّصالُ من `scripts/lib/live-db.js`.
 *
 * Usage: node scripts/check-no-function-of-ours-is-left-pathless.js [--require-db] [--list]
 *        node scripts/check-no-function-of-ours-is-left-pathless.js --selftest
 * ---------------------------------------------------------------------------
 */
"use strict"

/**
 * لحمُ الامتداداتِ فى `public` — قِيسَ يومَ v3.75.60 على البيتَين معاً فكان
 * الرقمُ واحداً: ١٤٥ دالّةً بلغةِ C من `vector` و`pg_trgm` + ٤ تجميعات.
 * **ويُرفَضُ فى الاتّجاهَين**: زيادةٌ امتدادٌ جديدٌ لم يُدرَس، ونقصانٌ امتدادٌ
 * اختفى — وكلاهما يُقرَأُ ولا يُسكَتُ عنه.
 */
const PINNED_FOREIGN = 149

const BASELINE = "assert_baseline_v3_75_60_check"

// ═══════════════════════════════════════════════════════════════════════════
// الأحكامُ الخالصة — تُقاسُ فى الفخِّ الذاتىِّ بلا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/**
 * **والحكمُ بالأثرِ لا بالشكل**: المسارُ الذى لا يذكرُ `pg_temp` **يُقدِّمُ**
 * مخطَّطَ المُنادى، سواءٌ أكان غائباً أم مضبوطاً ناقصاً — والحالتانِ سواءٌ فى
 * الأثر، فتُسمَّيانِ باسمَيهما ويُرفَضانِ معاً.
 */
function judgeSearchPath(sp) {
  if (sp === null || sp === undefined || sp === "") return "غائبٌ — ومخطَّطُ المُنادى يسبق"
  if (!/(^|[,\s])pg_temp([,\s]|$)/.test(sp)) return "مضبوطٌ ولا يذكرُ pg_temp — ومخطَّطُ المُنادى يسبق"
  return "ok"
}

/**
 * **ودالّتُنا تُعرَّفُ بالخاصّيّةِ لا بالاسم**: عضوُ الامتدادِ ليس لنا مهما
 * كان اسمُه، ولغةُ C لا تُقرَأُ أسماؤها بمسارِ بحثٍ أصلاً. **ولا يُعالَجُ
 * لحمُ غيرِنا.**
 */
function judgeOwnership(row) {
  if (!row) return "لا صفَّ يُحكَمُ عليه"
  if (row.is_extension_member) return "لحمُ امتدادٍ — ليس لنا"
  if (row.lang !== "plpgsql" && row.lang !== "sql") return "لغةٌ لا يُقرَأُ جسدُها — ليست لنا"
  if (row.is_definer) return "بصلاحيّاتٍ كاملةٍ — حكمُها فى حارسِ v3.75.59"
  return "ours"
}

/** **ويرفضُ فى الاتّجاهَين**: زيادةٌ عطبٌ جديد، ونقصانٌ مكسبٌ لم يُثبَّت. */
function judgePin(found, pinned) {
  if (found > pinned) return "grew"
  if (found < pinned) return "shrank"
  return "ok"
}

/**
 * **ولا يُخلَطُ عطبٌ بعطب**: يُفرَزُ الصفُّ إلى «لنا ومعطوب» و«لنا وسليم»
 * و«ليس لنا» — ويُسمَّى كلٌّ باسمِه.
 */
function classify(rows) {
  const out = { ours: [], oursBad: [], foreign: [], foreignSet: [] }
  for (const r of rows || []) {
    const own = judgeOwnership(r)
    if (own !== "ours") {
      if (r && r.is_extension_member) {
        out.foreign.push(r)
        if (r.sp !== null && r.sp !== undefined && r.sp !== "") out.foreignSet.push(r)
      }
      continue
    }
    out.ours.push(r)
    const why = judgeSearchPath(r.sp)
    if (why !== "ok") out.oursBad.push({ ...r, why })
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
  const OURS = (sp) => ({ sig: "f()", lang: "plpgsql", is_definer: false, is_extension_member: false, sp })

  // ── الحكمُ على المسار ────────────────────────────────────────────────────
  t("يقبلُ مساراً يذكرُ pg_temp", judgeSearchPath("public, extensions, pg_temp"), "ok")
  t("ويقبلُه ولو كان أوّلَ الذكر", judgeSearchPath("pg_temp, public"), "ok")
  t("ويقبلُه بلا فراغ", judgeSearchPath("public,pg_temp"), "ok")
  t("ويرفضُ مساراً ناقصاً", judgeSearchPath("public, extensions").indexOf("لا يذكرُ") > 0, true)
  t("ويرفضُ غيابَ المسارِ أصلاً", judgeSearchPath(null).indexOf("غائبٌ") === 0, true)
  t("ويرفضُ الفراغ", judgeSearchPath("").indexOf("غائبٌ") === 0, true)
  // **وشكلُ النصِّ ليس خاصّيّة**
  t("ولا يخدعه اسمٌ يشبهُه", judgeSearchPath("public, my_pg_temp_schema").indexOf("لا يذكرُ") > 0, true)
  t("ولا لاحقةٌ تشبهُه", judgeSearchPath("public, pg_temporary").indexOf("لا يذكرُ") > 0, true)
  t("ولا رقمٌ يلحقُه", judgeSearchPath("public, pg_temp2").indexOf("لا يذكرُ") > 0, true)

  // ── الملكيّةُ بالخاصّيّةِ لا بالاسم ──────────────────────────────────────
  t("دالّتُنا هى لنا", judgeOwnership(OURS(null)), "ours")
  t("ولحمُ الامتدادِ ليس لنا", judgeOwnership({ ...OURS(null), is_extension_member: true }), "لحمُ امتدادٍ — ليس لنا")
  t("ولغةُ C ليست لنا", judgeOwnership({ ...OURS(null), lang: "c" }), "لغةٌ لا يُقرَأُ جسدُها — ليست لنا")
  t("والتجميعُ الداخلىُّ ليس لنا", judgeOwnership({ ...OURS(null), lang: "internal" }), "لغةٌ لا يُقرَأُ جسدُها — ليست لنا")
  t("وذاتُ الصلاحيّاتِ الكاملةِ حكمُها هناك", judgeOwnership({ ...OURS(null), is_definer: true }).indexOf("v3.75.59") > 0, true)
  t("ولا يُحكَمُ على صفٍّ غائب", judgeOwnership(null), "لا صفَّ يُحكَمُ عليه")
  // **ولا ينجو لحمُ امتدادٍ لأنّه plpgsql**: العضويّةُ تسبقُ اللغةَ فى الحكم
  t("والعضويّةُ تسبقُ اللغةَ فى الحكم",
    judgeOwnership({ ...OURS(null), lang: "plpgsql", is_extension_member: true }), "لحمُ امتدادٍ — ليس لنا")

  // ── الفرزُ لا يخلطُ عطباً بعطب ───────────────────────────────────────────
  const rows = [
    OURS("public, extensions, pg_temp"),
    OURS(null),
    OURS("public"),
    { sig: "v()", lang: "c", is_definer: false, is_extension_member: true, sp: null },
    { sig: "w()", lang: "c", is_definer: false, is_extension_member: true, sp: "public" },
  ]
  const c = classify(rows)
  t("يعُدُّ دوالَّنا وحدَها", c.ours.length, 3)
  t("ويُمسكُ المعطوبَ منها — الغائبَ والناقصَ معاً", c.oursBad.length, 2)
  t("ويعُدُّ لحمَ الامتدادِ على حِدَة", c.foreign.length, 2)
  t("ويصرخُ إن نالَ لحمُ الامتدادِ ضبطاً من يدِنا", c.foreignSet.length, 1)
  t("ولا يخلطُ الأسبابَ فى اسمٍ واحد",
    [c.oursBad[0].why.indexOf("غائبٌ") === 0, c.oursBad[1].why.indexOf("مضبوطٌ") === 0], [true, true])
  t("ولا صفَّ أصلاً لا يُفزِعُه", classify([]).oursBad.length, 0)

  // ── التثبيتُ يرفضُ فى الاتّجاهَين ────────────────────────────────────────
  t("يمرُّ حين يُطابقُ الرقمُ المُثبَّت", judgePin(149, 149), "ok")
  t("ويرفضُ زيادةً — امتدادٌ جديدٌ لم يُدرَس", judgePin(150, 149), "grew")
  t("ويرفضُ نقصاً — امتدادٌ اختفى", judgePin(148, 149), "shrank")

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
    const rows = (await c.query(`
      SELECT p.oid::regprocedure::text AS sig,
             l.lanname AS lang,
             p.prosecdef AS is_definer,
             EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid
                        AND d.classid = 'pg_proc'::regclass
                        AND d.deptype = 'e') AS is_extension_member,
             (SELECT substring(x from 13) FROM unnest(coalesce(p.proconfig,'{}')) x
               WHERE x LIKE 'search_path=%') AS sp
        FROM pg_proc p
        JOIN pg_language l ON l.oid = p.prolang
       WHERE p.pronamespace = 'public'::regnamespace
       ORDER BY p.oid::regprocedure::text`)).rows

    const definerBad = (await c.query(`
      SELECT count(*)::int AS n
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.prokind = 'f'
         AND p.prosecdef
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) x
                          WHERE x LIKE 'search_path=%' AND x LIKE '%pg_temp%')`)).rows[0].n

    const baseline = (await c.query(`
      SELECT (SELECT count(*) FROM pg_proc
               WHERE pronamespace='public'::regnamespace AND proname=$1)::int AS n,
             (SELECT count(*) FROM information_schema.routine_privileges
               WHERE routine_schema='public' AND routine_name=$1
                 AND grantee IN ('PUBLIC','anon','authenticated'))::int AS open_`, [BASELINE])).rows[0]

    return { rows, definerBad, baseline }
  })

  const c = classify(data.rows)
  const vForeign = judgePin(c.foreign.length, PINNED_FOREIGN)

  console.log("  دوالُّنا فى public (بصلاحيّاتِ مُنادِيها، لا لحمَ امتدادٍ فيها): " + c.ours.length +
    "   ·   يسبقُها مخطَّطُ المُنادى: " + c.oursBad.length + " (المطلوبُ صفر)")
  console.log("  ولحمُ الامتداداتِ فى public: " + c.foreign.length +
    " (المُثبَّت " + PINNED_FOREIGN + ")   ·   نالَ ضبطاً من يدِنا: " + c.foreignSet.length + " (المطلوبُ صفر)")

  const problems = []
  if (c.oursBad.length) {
    problems.push(["دالّةٌ لنا يسبقُها مخطَّطٌ يملكُه المُنادى — **ومُنادٍ يُنشئُ جدولاً مؤقّتاً يُقرَأُ بدلَ جدولِنا**",
      c.oursBad.slice(0, 40).map((r) => r.sig + "   [" + r.why + "]" +
        "   ⇐ ALTER FUNCTION " + r.sig + " SET search_path = " + (r.sp || "public, extensions") + ", pg_temp;")])
  }
  if (c.foreignSet.length) {
    problems.push(["لحمُ امتدادٍ نالَ مسارَ بحثٍ من يدِنا — **ولا يُعالَجُ لحمُ غيرِنا**",
      c.foreignSet.slice(0, 20).map((r) => r.sig + "   [" + r.sp + "]")])
  }
  if (vForeign === "grew") {
    problems.push(["زادَ لحمُ الامتداداتِ فى public: " + c.foreign.length + " والمُثبَّتُ " + PINNED_FOREIGN, [
      "امتدادٌ جديدٌ حلَّ فى بيتِنا ولم يُدرَسْ أثرُه — يُقرَأُ ثمّ يُثبَّتُ رقمُه.",
    ]])
  }
  if (vForeign === "shrank") {
    problems.push(["نقصَ لحمُ الامتداداتِ ولم يُثبَّتْ — **ومعدودٌ لا مسكوتٌ عنه**", [
      "أنزِلِ الرقمَ فى الدفعةِ التى أزالَتْه: const PINNED_FOREIGN = " + c.foreign.length,
    ]])
  }
  if (Number(data.definerBad)) {
    problems.push(["دالّةٌ بصلاحيّاتٍ كاملةٍ بلا pg_temp — **ومكسبُ v3.75.59 يُنقَض**: " + data.definerBad, []])
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

  console.log("+ لا دالّةَ من دوالِّنا يسبقُها مخطَّطٌ يملكُه المُنادى (الحكمُ على الأثر: غيابُ المسارِ وضبطُه الناقصُ سواء)، ولحمُ الامتداداتِ معدودٌ لم يُمَسّ.")
  if (verbose) {
    for (const r of c.foreign.slice(0, 10)) console.log("      - لحمُ امتداد: " + r.sig)
  }
  process.exit(0)
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
