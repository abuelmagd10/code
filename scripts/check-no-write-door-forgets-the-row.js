#!/usr/bin/env node
/**
 * check-no-write-door-forgets-the-row.js
 * **ومن لا يُسأل عن صفِّه يكتبُ فى صفِّ غيرِه.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-no-write-door-forgets-the-row.js [--require-db]
 *   node scripts/check-no-write-door-forgets-the-row.js --selftest
 *
 * ═══ الحادثةُ التى وُلد منها ═══
 *
 * أربعُ سياساتِ إدخالٍ فى القاعدةِ الحيّةِ كان حارسُها:
 *
 *     cm.company_id = cm.company_id
 *
 * وهو **صحيحٌ دائماً**. المقصودُ كان `cm.company_id = <الجدول>.company_id`،
 * فسقطتْ كلمةٌ فصارَ البابُ يسألُ «هل أنتَ عضوٌ؟» ولا يسألُ «أهذا صفُّك؟».
 *
 * وقِيس أثرُه حيّاً ثمّ أُلغى: موظّفٌ (`staff`) عضوٌ فى شركةٍ واحدةٍ فقط كتبَ
 * فى شركةٍ أخرى إعداداتِ مصروفاتِها ومسحوباتِها وحدودَ تنبيهاتِها، ومساهماً
 * فيها، **ومستندَ إهلاكِ مخزونٍ فى دفاترِها**. خمسةٌ من خمسة.
 *
 * ومعها بابٌ من عائلةٍ أخرى: جدولٌ فيه سياستا إدخال، إحداهما محروسةٌ والأخرى
 * شرطُها `true`. وسياساتُ الصفوفِ **تُجمَعُ بـ«أو» لا بـ«و»** — فالمفتوحةُ
 * تُبطلُ المحروسة. **وبابٌ ثانٍ بجوارِ البابِ المحروسِ يُبطلُ الحراسة.**
 *
 * ═══ الخاصّيّةُ المحكومة ═══
 *
 * **(أ)** لا شرطَ يُقارنُ الشىءَ بنفسِه فى أىِّ سياسة — لا فى `public` ولا فى
 *        `storage`. **وشرطٌ يُقارنُ الشىءَ بنفسِه ليس شرطاً.**
 *
 * **(ب)** وكلُّ سياسةِ كتابةٍ **يبلغُها المستخدمُ النهائىّ** يجب أن تمسَّ عموداً
 *        من أعمدةِ جدولِها. والمقياسُ **اعتمادٌ مسجَّلٌ فى القاعدة** (`pg_depend`)
 *        لا شكلُ نصّ: سياسةٌ لا تمسُّ عمودَ صفِّها تسألُ عن الشخصِ ولا تسألُ عن
 *        الصفّ، فتفتحُ صفوفَ الناسِ كلِّهم.
 *
 * **(ج)** والكتالوجاتُ العالميّةُ — جداولُ بلا عمودِ شركةٍ يقرأُ منها مسارُ بذرِ
 *        الشركاتِ — لا يكتبُ فيها مستخدمٌ نهائىٌّ أبداً.
 *
 * ═══ وما لا يُحاكَم ═══
 *
 *   • منعٌ صريح (`false`) — ليس ثغرةً بل بابٌ مغلق.
 *   • ما لا يبلغُه إلّا مفتاحُ الخدمة.
 *   • سياساتُ القراءة — شأنُها حارسٌ آخر.
 *   • **واستثناءٌ واحدٌ معلَنٌ بالاسم**: التسجيلُ يقعُ قبل أن يكونَ للطالبِ
 *     حسابٌ أصلاً، فلا صفَّ يُربَطُ به. **معدودٌ لا مسكوتٌ عنه.**
 *
 * ⚠️ **وشكلُ ما يردُّه السائقُ ليس شكلَ ما فى القاعدة.** سقطَ هذا الحارسُ فى
 * أوّلِ تشغيلٍ له على برىءَين: سياستانِ ممنوحتانِ لمفتاحِ الخدمةِ وحدَه. والسببُ
 * أنّ `pg_roles.rolname` نوعُه `name`، و`name[]` **لا يفكّه سائقُ `pg`** بل
 * يردُّه نصّاً خاماً `{service_role}` — بينما يفكُّ `text[]` إلى قائمة. فسقطَ
 * شرطُ الاستثناءِ صامتاً. فصارَ الحكمُ **لا يثقُ بشكلٍ واحد**: يُحوَّلُ النوعُ
 * فى الاستعلام، **ويُطبَّعُ الشكلُ فى الحكمِ أيضاً**، وفى الفخِّ الذاتىِّ
 * اتّجاهانِ للشكلين. **وحارسٌ يصرخ على البرىء يُطفأ ثمّ لا يحرس شيئاً.**
 * ---------------------------------------------------------------------------
 */
"use strict"

// **ولا يُنادى اسمٌ يسكنُه غيرُه** — حكمُ الاتّصالِ وإعادتُه فى بيتٍ واحد.
const { withLiveDatabase } = require("./lib/live-db")

/** جداولُ لها إذنٌ معلَنٌ بألّا تربطَ الصفَّ — ومعها سببُها. */
const DECLARED = {
  pending_companies: "التسجيل يقع قبل وجود حساب للطالب، فلا صفَّ يُربَطُ به",
}

/** (أ) «س = س»: شرطٌ يُقارنُ الشىءَ بنفسِه فهو صحيحٌ دائماً. */
function findTautologies(expr) {
  const out = []
  const re = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*\1\.\2\b/g
  let m
  while ((m = re.exec(String(expr || "")))) out.push(m[0])
  return out
}

/**
 * يُطبَّعُ شكلُ قائمةِ المُخوَّلين: قائمةً كانت أو نصَّ مصفوفةٍ خاماً `{a,b}`.
 * **ولا يُبنى حكمٌ على شكلٍ واحدٍ يملكُه غيرُنا.**
 */
function normaliseRoles(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  const s = String(v == null ? "" : v).trim()
  if (!s) return []
  const inner = s.startsWith("{") && s.endsWith("}") ? s.slice(1, -1) : s
  return inner.split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean)
}

/**
 * (ب) هل تنسى هذه السياسةُ أن تسألَ عن الصفّ؟
 * @returns {string|null} سببُ الرفض، أو null إن كانت سليمةً أو خارجَ الحكم.
 */
function judgeWritePolicy(p) {
  if (p.cmd === "SELECT") return null // شأنُ القراءةِ حارسٌ آخر
  if (p.permissive === false) return null // القيدُ يُضيّق ولا يُوسّع
  const qual = String(p.qual || "")
  const check = String(p.withCheck || "")
  if (qual.trim() === "false" || check.trim() === "false") return null // بابٌ مغلق
  const both = qual + " " + check
  if (/service_role/.test(both)) return null // لا يبلغُه مستخدم
  const roles = normaliseRoles(p.roles)
  if (roles.length === 1 && roles[0] === "service_role") return null
  if (Object.prototype.hasOwnProperty.call(DECLARED, p.table)) return null
  if ((p.ownCols || 0) > 0) return null // تسألُ عن الصفّ — سليمة
  return p.table + "." + p.name + " (" + p.cmd + ") لا تمسُّ عموداً من صفِّها"
}

if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, got, exp])
  const P = (o) => Object.assign({ table: "t", name: "p", cmd: "INSERT", permissive: true, roles: ["public"], ownCols: 0 }, o)

  // ── (أ) المقارنةُ بالنفس، فى الاتّجاهين ──────────────────────────────
  t("يرى المقارنةَ بالنفس", findTautologies("(cm.company_id = cm.company_id)").length, 1)
  t("ويُسمّيها بنصِّها", findTautologies("(cm.company_id = cm.company_id)")[0], "cm.company_id = cm.company_id")
  t("ويراها فى الفرع أيضاً", findTautologies("cm.branch_id = cm.branch_id").length, 1)
  t("ويعدّ اثنتين على سطرٍ واحد اثنتين", findTautologies("a.b = a.b and c.d = c.d").length, 2)
  t("ولا يحكم على مقارنةٍ سليمة", findTautologies("cm.company_id = shareholders.company_id").length, 0)
  t("ولا على عمودين مختلفين لنفس الاسم", findTautologies("cm.company_id = cm.branch_id").length, 0)
  t("ولا على اسمين متشابهين", findTautologies("cma.id = cm.id").length, 0)
  t("ويقبل الفراغ بلا صراخ", findTautologies("").length, 0)
  t("ويرى المقارنةَ بلا اقواس", findTautologies("where cm.x = cm.x and y").length, 1)

  // ── تطبيعُ شكلِ المُخوَّلين — الحادثةُ التى أسقطتِ الحارسَ أوّلَ مرّة ──
  t("يفكّ القائمة", normaliseRoles(["service_role"]).length, 1)
  t("ويفكّ نصَّ المصفوفةِ الخام", normaliseRoles("{service_role}")[0], "service_role")
  t("ويفكّ نصّاً بعدّةِ أسماء", normaliseRoles("{anon,authenticated}").length, 2)
  t("ويقبل الفراغ", normaliseRoles(null).length, 0)

  // ── (ب) نسيانُ الصفّ، فى الاتّجاهين ─────────────────────────────────
  t("يرفض سياسةً لا تمسُّ صفَّها", judgeWritePolicy(P({ qual: "", withCheck: "exists(...)" })) !== null, true)
  t("ويُسمّى الجدولَ والسياسة", /^t\.p /.test(judgeWritePolicy(P({ withCheck: "x" })) || ""), true)
  t("ويقبل سياسةً تمسُّ صفَّها", judgeWritePolicy(P({ ownCols: 1, withCheck: "x" })), null)
  t("ولا يحاكم منعاً صريحاً", judgeWritePolicy(P({ withCheck: "false" })), null)
  t("ولا منعاً بصيغة using", judgeWritePolicy(P({ cmd: "UPDATE", qual: "false" })), null)
  t("ولا ما لا يبلغه الا مفتاح الخدمة", judgeWritePolicy(P({ qual: "(auth.role() = 'service_role')" })), null)
  t("ولا سياسةً ممنوحةً لمفتاح الخدمة وحده", judgeWritePolicy(P({ roles: ["service_role"], withCheck: "true" })), null)
  t("ولا يخدعه شكلُ النصِّ الخام لنفسِ المنحة", judgeWritePolicy(P({ roles: "{service_role}", withCheck: "true" })), null)
  t("ويظلّ يرفض منحةً للمستخدم بنصٍّ خام", judgeWritePolicy(P({ roles: "{authenticated}", withCheck: "true" })) !== null, true)
  t("ولا سياسةَ قراءة", judgeWritePolicy(P({ cmd: "SELECT", withCheck: "" })), null)
  t("ولا سياسةً مقيِّدة", judgeWritePolicy(P({ permissive: false, withCheck: "true" })), null)
  t("ويعفو عن الاستثناء المعلَن باسمه", judgeWritePolicy(P({ table: "pending_companies", withCheck: "true" })), null)
  t("ولا يعفو عن جدولٍ غيرِه", judgeWritePolicy(P({ table: "shareholders", withCheck: "true" })) !== null, true)
  t("ويرفض true الممنوحة للمستخدم", judgeWritePolicy(P({ roles: ["authenticated"], withCheck: "true" })) !== null, true)

  let fail = 0
  for (const [name, got, exp] of cases) {
    const ok = got === exp
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة سياسات الكتابة."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

const CATALOGUES = ["roles", "permissions", "role_default_permissions"]

;(async () => {
  const rows = await withLiveDatabase(url, async (c) => {
    const policies = (await c.query(`
      SELECT c.relname AS table_, pol.polname AS name,
             CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                             WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
             pol.polpermissive AS permissive,
             coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS qual,
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS with_check,
             -- **ويُحوَّلُ النوعُ صراحةً**: name[] لا يفكّه السائقُ فيردُّه نصّاً خاماً.
             coalesce((SELECT array_agg(r.rolname::text) FROM pg_roles r WHERE r.oid = ANY(pol.polroles)),
                      ARRAY['public']::text[]) AS roles,
             (SELECT count(*) FROM pg_depend d
               WHERE d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
                 AND d.refobjid = c.oid AND d.refobjsubid > 0) AS own_cols,
             n.nspname AS schema_
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'storage')`)).rows
    const cat = (await c.query(`
      SELECT c.relname AS table_
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        AND (has_table_privilege('authenticated', c.oid, 'INSERT')
          OR has_table_privilege('authenticated', c.oid, 'UPDATE')
          OR has_table_privilege('authenticated', c.oid, 'DELETE')
          OR has_table_privilege('anon', c.oid, 'INSERT'))`, [CATALOGUES])).rows
    return { policies, cat }
  })

  const { policies, cat } = rows
  if (!policies.length) {
    console.error("X لا سياسةَ واحدةٌ فى القاعدة — **بحثٌ لا يجد ليس دليلَ غياب.**")
    process.exit(1)
  }

  const taut = []
  for (const p of policies) {
    for (const hit of findTautologies(p.qual + " ~ " + p.with_check)) {
      taut.push(p.schema_ + "." + p.table_ + "." + p.name + " → " + hit)
    }
  }

  const writes = policies.filter((p) => p.schema_ === "public" && p.cmd !== "SELECT")
  const forgot = []
  let serviceOnly = 0
  for (const p of writes) {
    const roles = normaliseRoles(p.roles)
    if (roles.length === 1 && roles[0] === "service_role") serviceOnly++
    const why = judgeWritePolicy({
      table: p.table_, name: p.name, cmd: p.cmd, permissive: p.permissive,
      qual: p.qual, withCheck: p.with_check, roles: p.roles, ownCols: Number(p.own_cols),
    })
    if (why) forgot.push(why)
  }
  const tied = writes.filter((p) => Number(p.own_cols) > 0).length

  console.log("  سياساتٌ مفحوصة: " + policies.length + "   ·   منها كتابةٌ فى public: " + writes.length)
  console.log("  تربطُ الصفَّ بمن يكتبُه: " + tied + " من " + writes.length +
    "   ·   لمفتاحِ الخدمةِ وحدَه: " + serviceOnly +
    "   ·   استثناءٌ معلَن: " + Object.keys(DECLARED).length)

  let bad = 0
  if (taut.length) {
    bad++
    console.error("\nX شرطٌ يقارنُ الشىءَ بنفسِه فهو صحيحٌ دائماً (" + taut.length + "):")
    taut.forEach((x) => console.error("   " + x))
  }
  if (forgot.length) {
    bad++
    console.error("\nX سياسةُ كتابةٍ تسألُ عن الشخصِ ولا تسألُ عن الصفّ (" + forgot.length + "):")
    forgot.forEach((x) => console.error("   " + x))
    console.error("   — والعضوُ فى شركةٍ يكتبُ فى شركةِ غيرِه.")
  }
  if (cat.length) {
    bad++
    console.error("\nX كتالوجٌ عالمىٌّ (بلا عمودِ شركة) يكتبُ فيه المستخدمُ النهائىّ (" + cat.length + "):")
    cat.forEach((r) => console.error("   " + r.table_))
  }
  if (bad) {
    console.error("\n   العلاج: يُربَطُ الشرطُ بعمودِ الجدولِ نفسِه — والصياغةُ الصحيحةُ غالباً فى سياسةِ القراءةِ المجاورة.")
    process.exit(1)
  }
  Object.entries(DECLARED).forEach(([k, v]) => console.log("  -   استثناءٌ معلَن: " + k + " — " + v))
  console.log("  ok  كلُّ بابِ كتابةٍ يسألُ عن الصفِّ لا عن الشخصِ وحدَه، ولا شرطَ يقارنُ الشىءَ بنفسِه.")
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
