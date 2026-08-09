#!/usr/bin/env node
/**
 * check-db-role-name-can-be-held.js — القاعدةُ أيضاً لا تسأل عن وظيفةٍ لا يشغلها أحد.
 * ---------------------------------------------------------------------------
 *   node scripts/check-db-role-name-can-be-held.js [--require-db]
 *   node scripts/check-db-role-name-can-be-held.js --selftest
 *
 * ═══ لماذا وُلد ═══
 *
 * فى ٩٩٣ رُفع اسمُ وظيفةٍ لا يشغلها أحدٌ من **الشيفرة**، وحرسه
 * `check-role-name-can-be-held`. وبقى الاسمُ فى **القاعدة**: ثمانٍ وثمانون
 * دالّةً وستٌّ وعشرون سياسةَ رؤية. **ولا واحدةَ منها تُغلق باباً** — كلٌّ
 * تسمّى `admin` معها — لكنّ البيتَ الثانى بلا حارس.
 *
 * > **وحارسٌ على بيتٍ واحدٍ من بيتَين ليس حارساً.**
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **اسمُ وظيفةٍ فى دالّةٍ أو سياسةِ رؤيةٍ لا تقبله مفرداتُ العضويّة.**
 *
 * والمفرداتُ تُقرأ من `erp_membership_roles()` — البيتِ الواحد الذى يقرأ القيدَ
 * المُنفَّذ نفسَه — لا من قائمةٍ مكتوبةٍ هنا.
 *
 * ═══ وخطُّ الأساس ═══
 *
 * الدَّينُ القديمُ **معدودٌ لا مخفىّ**: يمرّ ما دام لا يزيد، ويسقط البناءُ إن
 * زاد موضعٌ واحد. **وصمتٌ عن دَينٍ أسوأُ من دَين.**
 * ---------------------------------------------------------------------------
 */
"use strict"

/** تهجئاتٌ معلَنة: اسمٌ لا تقبله المفردات لكنّه يُذكر بجانب اسمٍ حىّ. */
const ALIASES = {
  gm: "admin",
  generalmanager: "admin",
  general_manager: "admin",
  superadmin: "admin",
  super_admin: "admin",
  finance: "accountant",
  warehouse_manager: "store_manager",
  branch_manager: "manager",
  sales: "staff",
  employee: "staff",
  supervisor: "manager",
}

/** الدَّينُ القائمُ وقتَ كتابة الحارس. الهدفُ تصفيرُه، والبناءُ يسقط إن زاد. */
const BASELINE = Number(process.env.DB_ROLE_NAME_BASELINE ?? 79)

/**
 * مواضعُ الاسم فى نصٍّ واحد: كلُّ سلسلةِ حروفٍ بين علامتَى اقتباس مفردتين
 * تُشبه اسمَ وظيفة، ويقع فى جوارها اسمُ وظيفةٍ حقيقىّ — فتُقرأ دوراً لا نصّاً.
 * **والجوارُ هنا شرطٌ لا حكم**: من غير اسمٍ حىٍّ بجانبه لا يُعدّ الموضعُ باباً.
 */
function roleLiterals(text, vocabulary) {
  const lines = String(text || "").split("\n")
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith("--")) continue
    const toks = [...line.matchAll(/'([a-z][a-z0-9_]*)'/g)].map((m) => m[1])
    if (toks.length === 0) continue
    const near = lines.slice(Math.max(0, i - 5), i + 6).join("\n")
    const nearHasReal = vocabulary.some((r) => near.includes("'" + r + "'"))
    if (!nearHasReal) continue
    for (const t of toks) {
      if (vocabulary.includes(t)) continue
      if (!Object.prototype.hasOwnProperty.call(ALIASES, t)) continue
      out.push({ line: i + 1, token: t, text: line.trim().slice(0, 100) })
    }
  }
  return out
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const V = ["owner", "admin", "manager", "accountant", "staff"]
  const cases = [
    ["يرى اسماً محذوفاً بجانب اسمٍ حىّ",
     "IF v_role IN ('owner','admin','general_manager') THEN", 1],
    ["ولا يحكم على اسمٍ حىٍّ وحدَه",
     "IF v_role IN ('owner','admin') THEN", 0],
    ["ولا يحكم على نصٍّ ليس دوراً — لا اسمَ حيّاً بجانبه",
     "v_status := 'pending_director';", 0],
    ["ولا يحكم على ذكرٍ داخل تعليق",
     "-- v_role IN ('owner','general_manager')", 0],
    ["ويرى التهجئةَ القصيرة أيضاً",
     "IF v_role = ANY(ARRAY['admin','gm']) THEN", 1],
    ["ويعدّ موضعين على سطرٍ واحد موضعين",
     "IF v_role IN ('owner','gm','generalmanager') THEN", 2],
    ["ولا يخدعه اسمٌ حىٌّ فى سطرٍ بعيد",
     "x := 'general_manager';\n\n\n\n\n\n\n\ny := 'owner';", 0],
  ]
  let fail = 0
  for (const [name, src, expected] of cases) {
    const got = roleLiterals(src, V).length
    const ok = got === expected
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + expected + " فجاء " + got + ")")
  }
  if (fail > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاتٍ، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا تُقرأ المفردات."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let vocabulary, fns, pols
  try {
    const v = await client.query("SELECT public.erp_membership_roles() AS v")
    vocabulary = v.rows[0] && v.rows[0].v
    if (!Array.isArray(vocabulary) || vocabulary.length === 0) {
      console.error("X المفرداتُ فارغة - لا أحكم على شىءٍ بلا مقياس.")
      process.exit(1)
    }
    fns = (await client.query(`
      SELECT p.proname AS name, pg_get_functiondef(p.oid) AS body
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind = 'f'`)).rows
    pols = (await client.query(`
      SELECT tablename || ' :: ' || policyname AS name,
             coalesce(qual,'') || E'\\n' || coalesce(with_check,'') AS body
        FROM pg_policies WHERE schemaname = 'public'`)).rows
  } finally {
    await client.end()
  }

  const found = []
  const byToken = {}
  for (const row of [...fns, ...pols]) {
    for (const hit of roleLiterals(row.body, vocabulary)) {
      found.push({ where: row.name, ...hit })
      byToken[hit.token] = (byToken[hit.token] || 0) + 1
    }
  }

  console.log("  المفرداتُ الرسميّةُ فى القاعدة: " + vocabulary.length +
              "   ·   مواضعُ أسماءٍ لا تقبلها: " + found.length + "   (خطُّ الأساس " + BASELINE + ")")
  const parts = Object.entries(byToken).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n)
  if (parts.length > 0) console.log("     " + parts.join(" · "))

  if (found.length > BASELINE) {
    console.error("")
    console.error("X زاد الدَّين: بابٌ جديدٌ فى القاعدة يسأل عن وظيفةٍ لا يستطيع أحدٌ أن يشغلها.")
    for (const f of found.slice(0, 20)) {
      console.error("   " + f.where + ":" + f.line + "   «" + f.token + "»   " + f.text)
    }
    console.error("")
    console.error("   العلاج: اكتب الاسمَ الذى تقبله المفردات، أو أزِل الاسمَ الميّت.")
    process.exit(1)
  }

  if (found.length === 0) {
    console.log("  ok  لا اسمَ فى القاعدة يسأل عن وظيفةٍ لا يشغلها أحد.")
  } else {
    console.log("  ok  لم يزد الدَّين. " + found.length + " موضعاً قديماً باقياً - **معدودٌ لا مُوافَقٌ عليه**،")
    console.log("      وكلٌّ منها يسمّى وظيفةً حيّةً بجانبه فلا يُغلق باباً على أحد. يُكنس فى دفعةٍ تخصّه.")
  }
})().catch((e) => {
  console.error("X فشل: " + ((e && e.message) || e))
  process.exit(1)
})
