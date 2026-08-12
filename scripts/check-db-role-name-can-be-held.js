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
 * ═══ وخطُّ الأساسِ صفر (v3.75.17) ═══
 *
 * وُلد الحارسُ بدَينٍ قدرُه عشرون موضعاً، فنزل إلى أحدَ عشرَ فى v3.75.16، ثمّ
 * إلى **صفرٍ** فى v3.75.17. فأىُّ موضعٍ جديدٍ **يُسقط البناءَ فوراً** — لا
 * «لم يزد الدَّين» بعد اليوم.
 *
 * **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.**
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

/**
 * ═══ والبابُ ما يُقارِن، لا ما يُمرَّر ═══
 *
 * الحارسُ يسألُ عن **بابٍ** يشترطُ اسماً لا يشغلُه أحد. وقيمةٌ تُمرَّرُ وسيطةً
 * إلى دالّةٍ ليست باباً — لا تُقارَنُ بوظيفةٍ ولا تمنعُ أحداً من شىء.
 *
 * وهذا **إعلانٌ ضيّقٌ يحملُ برهانَه**، لا استثناءٌ بالشكل:
 *   • مربوطٌ باسمِ الدالّةِ والرمزِ معاً، لا بنمطِ نصّ؛
 *   • ولا يُعفى الموضعُ إلّا إذا **بقىَ البرهانُ قائماً** وقتَ الفحص — فلو
 *     نُقل الرمزُ إلى موضعِ مقارنةٍ عُدَّ باباً وسقطَ البناء؛
 *   • ولو **اختفى الموضعُ** سقطَ البناءُ أيضاً، لأنّ الإعلانَ صار غطاءً بلا
 *     سبب. **وإعلانٌ يبقى بعد موتِ سببِه يصيرُ غطاءً.**
 */
const NOT_A_DOOR = {
  "resync_booking_invoice::sales": {
    why: "'sales' هنا تصنيفُ إشعارٍ يُمرَّرُ إلى create_notification بين 'warning' و'action' — قيمةٌ لا تُقارَنُ بوظيفة.",
    proof: { kind: "argument-of", callee: "create_notification" },
  },
}

/** الدَّينُ القائم. صفرٌ منذ v3.75.17 — ولا يُرفَعُ إلّا بقرارِ صاحبِ المشروع. */
const BASELINE = Number(process.env.DB_ROLE_NAME_BASELINE ?? 0)

/**
 * مواضعُ الاسم فى نصٍّ واحد: كلُّ سلسلةِ حروفٍ بين علامتَى اقتباس مفردتين
 * تُشبه اسمَ وظيفة، ويقع فى جوارها اسمُ وظيفةٍ حقيقىّ — فتُقرأ دوراً لا نصّاً.
 * **والجوارُ هنا شرطٌ لا حكم**: من غير اسمٍ حىٍّ بجانبه لا يُعدّ الموضعُ باباً.
 */
function roleLiterals(text, vocabulary) {
  const body = String(text || "")
  const lines = body.split("\n")
  const out = []
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineStart = offset
    offset += line.length + 1
    if (line.trim().startsWith("--")) continue
    const matches = [...line.matchAll(/'([a-z][a-z0-9_]*)'/g)]
    if (matches.length === 0) continue
    const near = lines.slice(Math.max(0, i - 5), i + 6).join("\n")
    const nearHasReal = vocabulary.some((r) => near.includes("'" + r + "'"))
    if (!nearHasReal) continue
    for (const m of matches) {
      const t = m[1]
      if (vocabulary.includes(t)) continue
      if (!Object.prototype.hasOwnProperty.call(ALIASES, t)) continue
      out.push({ line: i + 1, token: t, at: lineStart + m.index, text: line.trim().slice(0, 100) })
    }
  }
  return out
}

/**
 * هل الرمزُ وسيطةٌ مُمرَّرةٌ إلى الدالّةِ المُعلَنة؟
 * يُقاسُ بالنصِّ قبلَه: آخِرُ `callee(` بعدَ آخِرِ فاصلةٍ منقوطة — أى أنّنا ما
 * زلنا داخلَ نداءِ تلك الدالّة، لم تنتهِ جملةٌ بيننا وبينه.
 */
function isArgumentOf(body, at, callee) {
  const before = String(body).slice(0, at)
  return before.lastIndexOf(callee + "(") > before.lastIndexOf(";")
}

/**
 * يفصلُ المواضعَ ثلاثاً: مُعفاةٌ ببرهانٍ قائم، ومحسوبةٌ أبواباً، وإعفاءٌ
 * انكسرَ برهانُه — والأخيرُ يُصرَخُ عليه باسمِه لا يُبتلَع.
 */
function judgeDoors(hits, bodyOf) {
  const doors = []
  const exempt = []
  const broken = []
  const usedKeys = new Set()
  for (const h of hits) {
    const key = h.where + "::" + h.token
    const rule = NOT_A_DOOR[key]
    if (!rule) { doors.push(h); continue }
    usedKeys.add(key)
    const ok = rule.proof.kind === "argument-of"
      ? isArgumentOf(bodyOf(h.where), h.at, rule.proof.callee)
      : false
    if (ok) exempt.push({ ...h, key })
    else broken.push({ ...h, key, expected: rule.proof })
  }
  return { doors, exempt, broken, usedKeys }
}

/** إعلانٌ لم يجدْ موضعَه: سببُه مات، فالغطاءُ يُرفَع. */
function judgeDeadDeclarations(usedKeys) {
  return Object.keys(NOT_A_DOOR).filter((k) => !usedKeys.has(k))
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const V = ["owner", "admin", "manager", "accountant", "staff"]
  let fail = 0
  const say = (ok, name, extra) => {
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + (extra ? "  (" + extra + ")" : ""))
  }

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
  for (const [name, src, expected] of cases) {
    const got = roleLiterals(src, V).length
    say(got === expected, name, "توقّعتُ " + expected + " فجاء " + got)
  }

  // ── ويعرفُ الموقعَ لا السطرَ وحدَه ──
  {
    const src = "a := 'owner';\nb := 'general_manager';"
    const h = roleLiterals(src, V)[0]
    say(h && src.slice(h.at, h.at + 17) === "'general_manager'",
        "ويشيرُ إلى موضعِ الحرفِ لا إلى السطرِ فقط")
  }

  // ── والبابُ ما يُقارِن، لا ما يُمرَّر ──
  {
    const body = "PERFORM create_notification(\n  'x', 'admin',\n  'warning', 'sales', 'action');"
    say(isArgumentOf(body, body.indexOf("'sales'"), "create_notification"),
        "ويعرفُ الوسيطةَ المُمرَّرةَ إلى دالّةٍ مُعلَنة")

    const after = "PERFORM create_notification('x', 'admin');\nIF v_role = 'sales' THEN"
    say(!isArgumentOf(after, after.indexOf("'sales' THEN"), "create_notification"),
        "ولا يمتدُّ الإعفاءُ عبرَ فاصلةٍ منقوطة")

    const other = "PERFORM check_permission(\n  'admin', 'sales');"
    say(!isArgumentOf(other, other.indexOf("'sales'"), "create_notification"),
        "ولا يُعفى نداءُ دالّةٍ أخرى")
  }

  // ── والإعفاءُ مربوطٌ بالاسمِ والرمزِ معاً ──
  {
    const body = "PERFORM create_notification(\n  'x', 'admin',\n  'warning', 'sales', 'action');"
    const hits = roleLiterals(body, V).map((h) => ({ ...h, where: "resync_booking_invoice" }))
    const j = judgeDoors(hits, () => body)
    say(j.doors.length === 0 && j.exempt.length === 1,
        "فيُعفى الموضعُ المُعلَنُ ببرهانٍ قائم",
        "أبواب " + j.doors.length + " · معفاة " + j.exempt.length)

    const elsewhere = hits.map((h) => ({ ...h, where: "some_other_function" }))
    const j2 = judgeDoors(elsewhere, () => body)
    say(j2.doors.length === 1, "ولا يُعفى الرمزُ نفسُه فى دالّةٍ أخرى")
  }

  // ── وبرهانٌ انكسرَ يُصرَخُ عليه لا يُبتلَع ──
  {
    const moved = "PERFORM create_notification('x', 'admin');\nIF v_role = 'sales' THEN"
    const hits = roleLiterals(moved, V).map((h) => ({ ...h, where: "resync_booking_invoice" }))
    const j = judgeDoors(hits, () => moved)
    say(hits.length === 1 && j.broken.length === 1 && j.exempt.length === 0,
        "ولو نُقل الرمزُ إلى موضعِ مقارنةٍ انكسرَ البرهانُ وسقط",
        "مواضع " + hits.length + " · مكسورة " + j.broken.length)
  }

  // ── وإعلانٌ بلا موضعٍ غطاءٌ يُرفَع ──
  {
    say(judgeDeadDeclarations(new Set()).length === Object.keys(NOT_A_DOOR).length,
        "ويكشفُ إعلاناً لم يعُدْ له موضع")
    say(judgeDeadDeclarations(new Set(Object.keys(NOT_A_DOOR))).length === 0,
        "ولا يصرخُ على إعلانٍ موضعُه قائم")
  }

  // ── وخطُّ الأساسِ صفر ──
  say(BASELINE === 0 || process.env.DB_ROLE_NAME_BASELINE !== undefined,
      "وخطُّ الأساسِ صفرٌ ما لم يُرفَعْ صراحةً")

  if (fail > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + (cases.length + 10) + " اتّجاهاتٍ، كلُّها صحيحة.")
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
try { ({ Client } = require("./lib/live-db")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

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

  const bodies = new Map()
  const found = []
  for (const row of [...fns, ...pols]) {
    bodies.set(row.name, row.body)
    for (const hit of roleLiterals(row.body, vocabulary)) found.push({ where: row.name, ...hit })
  }

  const { doors, exempt, broken, usedKeys } = judgeDoors(found, (n) => bodies.get(n) || "")
  const orphanDecls = judgeDeadDeclarations(usedKeys)

  const byToken = {}
  for (const d of doors) byToken[d.token] = (byToken[d.token] || 0) + 1

  console.log("  المفرداتُ الرسميّةُ فى القاعدة: " + vocabulary.length +
              "   ·   أبوابٌ تسألُ عن اسمٍ لا يُشغَل: " + doors.length +
              "   (خطُّ الأساس " + BASELINE + ")")
  const parts = Object.entries(byToken).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n)
  if (parts.length > 0) console.log("     " + parts.join(" · "))
  if (exempt.length > 0) {
    console.log("     ومُعفىً ببرهانٍ قائم: " + exempt.length +
                " (" + [...new Set(exempt.map((e) => e.key))].join(" · ") + ")")
  }

  let bad = false

  if (broken.length > 0) {
    bad = true
    console.error("")
    console.error("X انكسرَ برهانُ إعفاء: رمزٌ كان قيمةً تُمرَّرُ صار فى موضعِ مقارنة.")
    for (const b of broken) {
      console.error("   " + b.where + ":" + b.line + "   «" + b.token + "»   " + b.text)
      console.error("      البرهانُ المُعلَن: " + JSON.stringify(b.expected))
    }
    console.error("   العلاج: أزِل الاسمَ الميّت، أو أزِل الإعلانَ من NOT_A_DOOR.")
  }

  if (orphanDecls.length > 0) {
    bad = true
    console.error("")
    console.error("X إعلانٌ بقىَ بعد موتِ سببِه — لم يعُدْ له موضعٌ فى القاعدة:")
    for (const k of orphanDecls) console.error("   " + k + "   « " + NOT_A_DOOR[k].why + " »")
    console.error("   العلاج: احذفِ الإعلانَ من NOT_A_DOOR — وإعلانٌ يبقى بعد موتِ سببِه يصيرُ غطاءً.")
  }

  if (doors.length > BASELINE) {
    bad = true
    console.error("")
    console.error("X بابٌ فى القاعدة يسأل عن وظيفةٍ لا يستطيع أحدٌ أن يشغلها.")
    for (const f of doors.slice(0, 20)) {
      console.error("   " + f.where + ":" + f.line + "   «" + f.token + "»   " + f.text)
    }
    console.error("")
    console.error("   العلاج: اكتب الاسمَ الذى تقبله المفردات، أو أزِل الاسمَ الميّت.")
  }

  if (bad) process.exit(1)

  console.log("  ok  لا بابَ فى القاعدة يسأل عن وظيفةٍ لا يشغلها أحد.")
})().catch((e) => {
  console.error("X فشل: " + ((e && e.message) || e))
  process.exit(1)
})
