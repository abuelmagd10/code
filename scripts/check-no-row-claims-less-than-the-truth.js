#!/usr/bin/env node
/**
 * check-no-row-claims-less-than-the-truth.js
 * **والشاشةُ تقولُ الصدقَ عن صاحبِ البيت.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-no-row-claims-less-than-the-truth.js [--require-db]
 *   node scripts/check-no-row-claims-less-than-the-truth.js --selftest
 *
 * ═══ الحادثةُ التى وُلد منها ═══
 *
 * المالكُ والمديرُ العامُّ **يتجاوزانِ جدولَ الصلاحيّاتِ كلَّه**: دالّةُ الحكمِ
 * فى القاعدةِ ترجعُ «نعم» فورَ معرفةِ الدور، قبل أن تنظرَ إلى صفٍّ واحد. وقِيس
 * ذلك حيّاً: مالكٌ **بلا صفٍّ** للمصروفاتِ أُجيبَ بـ«نعم» للحذفِ والإنشاء —
 * **بل ولموردٍ لا وجودَ له أصلاً**.
 *
 * لكنّ شاشةَ «صلاحيّات الأدوار» تقرأُ الصفوف. وكان **أربعةَ عشرَ قسماً** بلا
 * صفٍّ لهما فى الشركاتِ الستِّ كلِّها، ومئةُ خانةٍ أخرى فارغةً لأفعالٍ أُضيفت
 * لاحقاً. فكانت الشاشةُ تعرضُ «وصولٌ وعرضٌ فقط» لمن يستطيعُ كلَّ شىء.
 *
 * ولا يُسمّى هذا تجميلاً: **ضغطةُ «حفظ» فوق خانةٍ فارغةٍ تكتبُ الجملةَ الكاذبةَ
 * فى البيانات**، فيقرؤها كلُّ من يأتى بعدُ ويبنى عليها.
 *
 * ═══ الخاصّيّةُ المحكومة ═══
 *
 * **لا يقولُ صفُّ المالكِ أو المديرِ العامِّ أقلَّ ممّا يستطيعُه صاحبُه.**
 * فلكلِّ شركةٍ، ولكلِّ قسمٍ فى الكتالوج، ولكلِّ فعلٍ من الخمسةِ المعرَّفةِ لذلك
 * القسم — يجبُ أن يوجدَ صفٌّ وأن يكونَ العلَمُ مرفوعاً.
 *
 * **وما لا فعلَ له فى الكتالوجِ لا يُطالَبُ به**: «أجور عمالة الإنتاج» لا حذفَ
 * لها أصلاً، **وسجلُّ أجرٍ مصروفٍ يُعكَسُ ولا يُمحى** — وهذا هو المعمولُ به
 * عالميّاً، فلا يشتكى الحارسُ من غيابِه.
 *
 * ═══ وما ليس من هذا الحكم ═══
 *
 * **الوظائفُ الأخرى لا تُحاكَمُ هنا إطلاقاً.** حكمُها يُقرأُ من صفوفِها فعلاً،
 * فنقصُ صفٍّ عندها قرارٌ لا عيب. وقد قِيس أنّ استدعاءَ ناسخِ القالبِ على
 * الشركاتِ القائمةِ كان سيضيفُ **١٠٣ صفوفٍ** لوظائفَ عاديّةٍ فى شركتَين — أى
 * يغيّرُ قدراتِ مستخدمين. **ولا يُغيَّرُ ما يستطيعُه إنسانٌ إلّا بقرارِ صاحبِ
 * المشروع.**
 * ---------------------------------------------------------------------------
 */
"use strict"

const { withLiveDatabase } = require("./lib/live-db")

/** الوظيفتانِ اللتانِ ثبتَ أنّ الحكمَ يتجاوزُهما، فصفُّهما عرضٌ لا حكم. */
const BYPASSING_ROLES = ["owner", "admin"]

/** الأفعالُ الخمسةُ التى تُعرَضُ خاناتٍ على الشاشة. */
const FLAG_VERBS = ["access", "read", "create", "update", "delete"]

/**
 * هل يقولُ هذا الصفُّ أقلَّ ممّا يستطيعُه صاحبُه؟
 * @param {object|null} row الصفُّ الموجود، أو null إن لم يوجد
 * @param {string[]} catalogueVerbs الأفعالُ التى يعرفُها الكتالوجُ لهذا القسم
 * @returns {string[]} الأفعالُ التى تنقصُ الصفَّ
 */
function judgeRow(row, catalogueVerbs) {
  const want = (catalogueVerbs || []).filter((v) => FLAG_VERBS.includes(v))
  if (!want.length) return [] // **ولا يُطالَبُ بفعلٍ لا وجودَ له**
  if (!row) return want.slice().sort() // لا صفَّ أصلاً — الشاشةُ فارغة
  const has = {
    access: row.can_access === true, read: row.can_read === true,
    create: row.can_write === true, update: row.can_update === true,
    delete: row.can_delete === true,
  }
  return want.filter((v) => !has[v]).sort()
}

/** **ولا يُحاكَمُ من يُحكَمُ بصفِّه**: الوظائفُ الأخرى خارجَ هذا الحكم. */
function isJudged(role) {
  return BYPASSING_ROLES.includes(String(role))
}

if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, got, exp])
  const R = (o) => Object.assign({ can_access: true, can_read: true, can_write: true, can_update: true, can_delete: true }, o)

  t("يرفض صفّاً ناقصَ الحذف", judgeRow(R({ can_delete: false }), ["access", "read", "delete"]).length, 1)
  t("ويُسمّى الفعلَ الناقص", judgeRow(R({ can_delete: false }), ["delete"])[0], "delete")
  t("ويعدُّ أكثرَ من نقص", judgeRow(R({ can_delete: false, can_update: false }), ["update", "delete"]).length, 2)
  t("ويرفضُ غيابَ الصفِّ كلِّه", judgeRow(null, ["access", "read", "create"]).length, 3)
  t("ويُرتّبُ ما ينقص", judgeRow(null, ["read", "access"])[0], "access")
  t("ولا يصرخُ على صفٍّ كامل", judgeRow(R({}), FLAG_VERBS).length, 0)
  t("ولا يطالبُ بفعلٍ لا يعرفُه الكتالوج", judgeRow(R({ can_delete: false }), ["access", "read"]).length, 0)
  t("ولا يطالبُ شيئاً حين لا فعلَ معرَّفاً", judgeRow(null, []).length, 0)
  t("ولا يخدعه فعلٌ خارجَ الخمسة", judgeRow(R({}), ["pay", "approve"]).length, 0)
  t("ويظلُّ يرى النقصَ بجوارِ فعلٍ خارجَ الخمسة", judgeRow(R({ can_read: false }), ["read", "pay"]).length, 1)
  t("ولا صفَّ فارغٌ يُعدُّ سليماً", judgeRow(null, ["read"]).length, 1)

  t("يحاكمُ المالك", isJudged("owner"), true)
  t("ويحاكمُ المديرَ العام", isJudged("admin"), true)
  t("ولا يحاكمُ المحاسب", isJudged("accountant"), false)
  t("ولا مديرَ الفرع", isJudged("manager"), false)
  t("ولا اسماً غريباً", isJudged("zz"), false)

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
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة الصفوف."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

;(async () => {
  const d = await withLiveDatabase(url, async (c) => {
    const rows = (await c.query(`
      SELECT c.name AS company, r.role, p.resource,
             coalesce(array_agg(DISTINCT split_part(p.action, ':', 2))
                      FILTER (WHERE split_part(p.action, ':', 2) = ANY($1::text[])), '{}')::text[] AS verbs,
             bool_or(x.company_id IS NOT NULL) AS row_exists,
             bool_or(x.can_access) AS can_access, bool_or(x.can_read)   AS can_read,
             bool_or(x.can_write)  AS can_write,  bool_or(x.can_update) AS can_update,
             bool_or(x.can_delete) AS can_delete
      FROM public.companies c
      CROSS JOIN unnest($2::text[]) AS r(role)
      CROSS JOIN public.permissions p
      LEFT JOIN public.company_role_permissions x
             ON x.company_id = c.id AND x.role = r.role AND x.resource = p.resource
      GROUP BY c.name, r.role, p.resource`, [FLAG_VERBS, BYPASSING_ROLES])).rows
    const totals = (await c.query(`
      SELECT (SELECT count(*) FROM public.companies)::int AS companies,
             (SELECT count(*) FROM public.permissions)::int AS catalogue,
             (SELECT count(*) FROM public.company_role_permissions)::int AS rows_all,
             (SELECT count(*) FROM public.company_role_permissions
               WHERE role <> ALL($1::text[]))::int AS rows_other_roles`, [BYPASSING_ROLES])).rows[0]
    return { rows, totals }
  })

  const { rows, totals } = d
  const problems = []
  // **ولا يُقرأُ فراغٌ ويُسمّى سلاماً**
  if (!totals.companies) problems.push(["لا شركةَ واحدةً — بحثٌ لا يجد ليس دليلَ غياب", []])
  if (!totals.catalogue) problems.push(["كتالوجُ الصلاحيّاتِ فارغ", []])
  if (!rows.length) problems.push(["لم يُقرأْ صفٌّ واحد — بحثٌ لا يجد ليس دليلَ غياب", []])

  const lying = []
  for (const r of rows) {
    if (!isJudged(r.role)) continue
    const missing = judgeRow(r.row_exists ? r : null, r.verbs)
    if (missing.length) lying.push(r.company + " · " + r.role + " · " + r.resource + " → ينقصُه: " + missing.join(", "))
  }
  if (lying.length) problems.push(["صفٌّ يقولُ أقلَّ ممّا يستطيعُه صاحبُه", lying.slice(0, 20)])

  console.log("  الشركات: " + totals.companies + "   ·   الكتالوج: " + totals.catalogue +
    " فعلاً   ·   أزواجٌ مفحوصة: " + rows.length)
  console.log("  صفوفُ الوظائفِ الأخرى: " + totals.rows_other_roles + " من " + totals.rows_all +
    "   —   **لا تُحاكَمُ هنا، فحكمُها يُقرأُ من صفِّها فعلاً**")

  if (problems.length) {
    for (const [title, lines] of problems) {
      console.error("\nX " + title + (lines.length ? " (" + lines.length + (lying.length > 20 ? "+" : "") + "):" : ":"))
      lines.forEach((x) => console.error("   " + x))
    }
    console.error("\n   العلاج: يُكمَلُ صفُّ الوظيفةِ ليطابقَ ما يعرفُه الكتالوجُ لهذا القسم — توسيعاً لا تضييقاً، وللوظيفتَين وحدَهما.")
    process.exit(1)
  }
  console.log("  ok  لا صفَّ يقولُ أقلَّ ممّا يستطيعُه صاحبُه — والشاشةُ تقولُ الصدقَ عن صاحبِ البيت.")
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
