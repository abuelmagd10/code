#!/usr/bin/env node
/**
 * check-baseline-assertions-run.js — الفحصُ الذى لا يُشغَّل ليس فحصاً.
 * ---------------------------------------------------------------------------
 *   node scripts/check-baseline-assertions-run.js [--require-db]
 *   node scripts/check-baseline-assertions-run.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * فى قاعدة البيانات **سبعةَ عشرَ فحصاً مرجعيّاً** (`assert_baseline%`) كتبتها
 * إصداراتٌ سابقة. كلٌّ منها يقول: «هذا العقدُ يجب أن يظلّ قائماً». وهى تُنادَى
 * من داخل ملفّات الهجرة القديمة وحدَها — أى **لا يُنادِيها شىءٌ اليوم**، لأنّ
 * تلك الهجرات طُبّقت مرّةً ولن تُطبَّق ثانية.
 *
 * فلمّا قِستُها فى ٩٧٧ وجدتُ **ستّةً منها ساقطة**: أربعةٌ كسرتُها أنا بتوسيعٍ
 * صحيح، واثنان كانا ساقطَين من قبلُ ولا أحدَ يعلم. عقودٌ معلَنةٌ ومخروقةٌ
 * وصامتة، لأنّ **حارساً لا يُشغَّل ليس حارساً** — وهو درسُ ٩٧٢ نفسُه يعود.
 *
 * ═══ ماذا يفعل ═══
 *
 * يُنادى كلَّ دالّةِ فحصٍ مرجعىٍّ فى القاعدة، كلَّ واحدةٍ فى معاملةٍ تُلغى
 * بعدها، ويُسمّى ما يسقط بنصِّ سقوطه. ولا يعتمد على قائمةٍ مكتوبةٍ بيدى:
 * القائمةُ تُقرأ من القاعدة، فمن يكتب فحصاً مرجعيّاً غداً يُشغَّل تلقائيّاً.
 *
 * ═══ وشرطٌ يبدو زائداً وهو جوهر الحارس ═══
 *
 * **إن لم يجد فحصاً واحداً، يسقط.** لأنّ حارساً يقول «مرّ كلُّ شىء» بعد أن
 * لم يفحص شيئاً هو أسوأُ من غياب الحارس: يمنح طمأنينةً كاذبة. فحذفُ الفحوص
 * جميعاً — سهواً أو عمداً — يُوقف البناءَ بدل أن يُخضِّر الشاشة.
 * ---------------------------------------------------------------------------
 */
"use strict"

// ───────────────────────────── الحكم ─────────────────────────────
// مفصولٌ عن الاتّصال ليمكن اختبارُه بلا قاعدةِ بيانات.

function verdict(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { ok: false, reason: "لا فحصَ مرجعىٌّ واحدٌ فى القاعدة — حارسٌ لا يفحص شيئاً لا يقول «مرّ»", failed: [] }
  }
  const failed = results.filter((r) => !r.passed)
  if (failed.length > 0) {
    return { ok: false, reason: failed.length + " فحصاً مرجعيّاً ساقط", failed }
  }
  return { ok: true, reason: results.length + " فحصاً مرجعيّاً، كلُّها تمرّ", failed: [] }
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يمرّ حين تمرّ كلُّها",
     [{ name: "a", passed: true }, { name: "b", passed: true }], true],
    ["يرفض حين يسقط واحد",
     [{ name: "a", passed: true }, { name: "b", passed: false, error: "BASELINE FAIL: x" }], false],
    ["يرفض حين لا يجد فحصاً أصلاً — الطمأنينةُ الكاذبة أسوأُ من الغياب",
     [], false],
    ["يرفض حين تكون القائمةُ ليست قائمة",
     null, false],
    ["يرفض حين تسقط كلُّها",
     [{ name: "a", passed: false, error: "e" }], false],
  ]
  let bad = 0
  for (const [name, input, expected] of cases) {
    const got = verdict(input).ok
    const ok = got === expected
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + name)
  }
  if (bad > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + bad + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن تشغيل الفحوص المرجعية."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

let Client
try {
  ({ Client } = require("./lib/live-db"))
} catch {
  console.error("X npm install pg --save-dev")
  process.exit(1)
}

const LIST_SQL = `
  SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.pronargs = 0
     AND p.proname LIKE 'assert\\_baseline%'
   ORDER BY 1
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const results = []
  try {
    const { rows } = await client.query(LIST_SQL)
    for (const r of rows) {
      // كلٌّ فى معاملةٍ تُلغى: الفحوصُ قارئةٌ، والإلغاءُ يجعل ذلك مضموناً لا مأمولاً.
      try {
        await client.query("BEGIN")
        await client.query('SELECT public."' + r.proname + '"()')
        results.push({ name: r.proname, passed: true })
      } catch (e) {
        results.push({ name: r.proname, passed: false, error: String((e && e.message) || e).split("\n")[0] })
      } finally {
        try { await client.query("ROLLBACK") } catch { /* المعاملةُ انتهت أصلاً */ }
      }
    }
  } finally {
    await client.end()
  }

  const v = verdict(results)
  if (!v.ok) {
    console.error("")
    console.error("X عقدٌ معلَنٌ ومخروق: " + v.reason + ".")
    for (const f of v.failed) console.error("   " + f.name + "  →  " + f.error)
    console.error("")
    console.error("   هذه عقودٌ كتبتها إصداراتٌ سابقةٌ ولا يُنادِيها شىءٌ فى المشروع.")
    console.error("   وسقوطُها لا يعنى دائماً أنّ العقدَ خُرق: قد يكون الفحصُ نفسُه")
    console.error("   يحرس **شكلَ النصّ لا معناه** (درس ٩٧٧). اقرأ نصَّ السقوط قبل أن تُصلح.")
    process.exit(1)
  }

  console.log("+ " + v.reason + " (تُقرأ من القاعدة لا من قائمةٍ مكتوبةٍ هنا، وكلٌّ فى معاملةٍ أُلغيت).")
})().catch((e) => {
  console.error("X فشل: " + ((e && e.message) || e))
  process.exit(1)
})
