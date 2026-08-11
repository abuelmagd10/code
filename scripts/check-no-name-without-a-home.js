#!/usr/bin/env node
/**
 * check-no-name-without-a-home.js
 * **ولا اسمَ بلا بيت.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-no-name-without-a-home.js [--require-db]
 *   node scripts/check-no-name-without-a-home.js --selftest
 *
 * ═══ الحادثةُ التى وُلد منها ═══
 *
 * ثلاثةُ أعمدةٍ تحملُ أسماءَ وظائفَ وصلاحيّات، وكلٌّ منها كان يُحرَسُ بطريقةٍ
 * أخرى — أو لا يُحرَسُ أصلاً:
 *
 *   • `company_role_permissions.role` : قيدٌ نصّىٌّ مكتوبٌ بيدٍ يقبل **١٢** اسماً،
 *     أحدُها (`general_manager`) **لا يسكنُه أحد**: صفرُ صفوفٍ وصفرُ أعضاء.
 *   • `role_default_permissions`      : **بلا قيدٍ إطلاقاً** — وهو قالبُ بذرِ
 *     الشركاتِ الجديدة، فخطأٌ مطبعىٌّ فيه يمرُّ صامتاً والشركةُ التاليةُ تُولدُ ناقصة.
 *
 * فالقائمةُ المكتوبةُ بيدٍ **تجمُدُ بينما البيتُ ينمو**، والعمودُ بلا قيدٍ يقبلُ
 * كلَّ شىءٍ ولا يشتكى أحد.
 *
 * ═══ الخاصّيّةُ المحكومة ═══
 *
 * **(أ)** البيوتُ الثلاثةُ للمفرداتِ تقولُ قولاً واحداً: جدولُ `roles`، ودالّةُ
 *        `erp_membership_roles()`، وقيدُ `company_invitations`. فلا يُضافُ اسمٌ
 *        إلى واحدٍ ويُنسى الآخَران.
 *
 * **(ب)** وكلُّ عمودٍ يحملُ مفردةً من بيتٍ إمّا **مربوطٌ برباطٍ حقيقىّ** (مفتاحٍ
 *        أجنبىّ) وإمّا **مُعلَنٌ باسمِه وسببِه**. والرباطُ يُقاسُ من `pg_constraint`
 *        و`pg_attribute` — **لا باسمِ القيد**؛ فاسمٌ يُغيَّر لا يُغيّرُ حقيقة.
 *
 * **(ج)** ولا اسمَ مكتوبٌ فى عمودٍ لا بيتَ له — **ولا فى المربوطِ ولا فى المُعلَن**.
 *        وهذه هى أسنانُ الحارسِ فى الأعمدةِ التى لم تُربَطْ بعد.
 *
 * **(د)** ولا تعودُ قائمةُ أسماءٍ مكتوبةٌ بيدٍ بجوارِ الرباط. **وبابٌ ثانٍ بجوارِ
 *        البابِ المحروسِ يُبطلُ الحراسة**، والقيدُ النصّىُّ يجمُدُ بينما البيتُ ينمو.
 *
 * **(ه)** والفحصُ المرجعىُّ موجودٌ ومُغلَقٌ على أهلِه — **وحارسٌ يُفتَحُ بابُه ليس حارساً**.
 *
 * ═══ فخُّ الاكتشافِ الذى كِيدَ له ═══
 *
 * ⚠️ الاكتشافُ بالبياناتِ وحدَها فخٌّ قاتل: لو عرّفنا «عمودَ مفردات» بأنّ **كلَّ**
 * قيمِه أسماءٌ لها بيوت، لخرجَ العمودُ من دائرةِ الفحصِ **فى اللحظةِ التى يُكتبُ
 * فيها اسمٌ غريب** — فيسكتُ الحارسُ بالضبطِ حين يقع العيب. **وبحثٌ لا يجد ليس
 * دليلَ غياب.**
 *
 * فالدائرةُ إذن **مُثبَّتة**: المربوطُ يُعرَفُ برباطِه، والمُعلَنُ يُعرَفُ باسمِه،
 * ولا يُخرِجُ عمودًا منها أنْ تتّسخَ بياناتُه. والاكتشافُ بالبياناتِ **يُضيفُ ولا
 * يَحذف**: عمودٌ جديدٌ كلُّ قيمِه مفرداتٌ يُطالَبُ ببيتٍ أو بإعلان.
 *
 * ═══ ولا إعلانَ ميّت ═══
 *
 * كلُّ استثناءٍ مُعلَنٍ يجب أن يظلَّ عموداً موجوداً فى القاعدة، ومعه **شرطُ
 * رفعِه**. فإن اختفى العمودُ سقطَ الإعلانُ معه — **وإعلانٌ يبقى بعد موتِ سببِه
 * يصيرُ غطاءً**.
 * ---------------------------------------------------------------------------
 */
"use strict"

// **ولا يُنادى اسمٌ يسكنُه غيرُه** — حكمُ الاتّصالِ وإعادتُه فى بيتٍ واحد.
const { withLiveDatabase } = require("./lib/live-db")

/** بيوتُ المفردات: جدولٌ وعمودُ مفتاحِه الفريد. */
const HOMES = [
  { table: "roles", key: "name" },
  { table: "permissions", key: "action" },
]

/**
 * أعمدةٌ تحملُ مفردةً ولا تُربَطُ — **معدودةٌ لا مسكوتٌ عنها**، ومع كلٍّ سببُه
 * وشرطُ رفعِه. وتظلُّ كلُّها تحت حكمِ (ج): لا اسمَ فيها بلا بيت.
 */
const DECLARED = {
  "company_members.role": {
    home: "roles",
    why: "هو **البيتُ المُعلَنُ للعضويّة** ومنه تقرأُ erp_membership_roles()، ويحرسُ (أ) أن يبقى مطابقاً لجدولِ الأسماء",
    lift: "لا يُرفَع: ربطُه بجدولِ الأسماءِ يجعلُ البيتَ يشيرُ إلى نفسِه",
  },
  "company_invitations.role": {
    home: "roles",
    why: "قيدُه أحدُ البيوتِ الثلاثةِ التى يُقاسُ تطابقُها فى (أ) — فهو محروسٌ بالمطابقةِ لا بالرباط",
    lift: "يُرفَع حين يُستبدَلُ قيدُه برباطٍ حقيقىّ إلى جدولِ الأسماء",
  },
  "notifications.assigned_to_role": {
    home: "roles",
    // قِيس حيّاً: كُتب فيه `warehouse_manager` (اسمٌ فى الكودِ لا بيتَ له)،
    // فأفرغَه الزنادُ فوراً ووجّه الإشعارَ إلى شخصٍ حقيقىٍّ وكتبَ فى نصِّه
    // تحذيراً مرئيّاً. **فالعمودُ محروسٌ بزنادٍ حىٍّ لا بالصدفة** — وربطُه
    // بمفتاحٍ أجنبىٍّ يُحوّلُ حالةً **مُعالَجةً** إلى فشلٍ عند الإدخال.
    why: "يحرسُه زنادٌ حىّ (`trg_notifications_route_to_a_person`, v3.74.939): وظيفةٌ لا يملكُها أحدٌ تُفرَّغُ ويُوجَّهُ الإشعارُ إلى شخص. **فربطُه يكسرُ مساراً مُعالَجاً بدل أن يُصلحَه**",
    lift: "يُرفَع فور أن يُحسَمَ اسمُ `warehouse_manager` فى الكود: إمّا يسكنُ البيتَ وإمّا يُرفَع",
    // **وإعلانٌ يبقى بعد موتِ سببِه يصيرُ غطاءً** — فيُقاسُ سببُه حيّاً.
    proof: { kind: "trigger", table: "notifications", name: "trg_notifications_route_to_a_person" },
  },
  "approval_history.actor_role": {
    home: "roles",
    why: "**سجلٌّ يحكى ما كان**، وربطُه بـRESTRICT يمنعُ تغييرَ اسمِ وظيفةٍ ذُكرت فى التاريخ",
    lift: "يُرفَع إن قُرِّر أنّ أسماءَ الوظائفِ لا تتغيّرُ أبداً",
  },
}

/** المفتاحُ المُوحَّدُ لعمودٍ فى جدول. */
function colKey(table, column) {
  return String(table) + "." + String(column)
}

/**
 * (ب) هل هذا العمودُ يحملُ مفردةً بلا بيتٍ يربطُه؟
 * @returns {string|null} سببُ الرفض، أو null إن كان مربوطاً أو مُعلَناً.
 */
function judgeTie(col) {
  if (col.tied) return null // له رباطٌ حقيقىّ
  const dec = DECLARED[colKey(col.table, col.column)]
  if (dec) return null // مُعلَنٌ باسمِه وسببِه
  return colKey(col.table, col.column) + " يحملُ مفردةً من «" + col.home + "» بلا رباطٍ ولا إعلان"
}

/**
 * (ج) أسماءٌ مكتوبةٌ فعلاً ولا بيتَ لها — تُحاكَمُ فى **كلِّ** عمودٍ فى الدائرة،
 * مربوطاً كان أو مُعلَناً. وهذه أسنانُ الحارسِ فى غيرِ المربوط.
 */
function judgeOrphans(col) {
  const n = Number(col.orphans || 0)
  if (!n) return null
  return colKey(col.table, col.column) + ": " + n + " صفّاً باسمٍ لا بيتَ له" +
    (col.orphanNames ? " (" + col.orphanNames + ")" : "")
}

/**
 * (د) قائمةُ أسماءٍ مكتوبةٌ بيدٍ بجوارِ رباط: قيدٌ نصّىٌّ **أغلبُ حروفِه** أسماءُ
 * البيتِ نفسِه. والمقياسُ أنّ حروفَه مجموعةٌ جزئيّةٌ من البيتِ وفيها اسمانِ فأكثر —
 * **لا شكلَ النصّ**؛ فقيدُ حالةٍ فيه 'draft' و'posted' لا يُحاكَم.
 */
function judgeHandwrittenList(literals, homeNames) {
  const lits = (Array.isArray(literals) ? literals : []).map((x) => String(x))
  if (lits.length < 2) return false
  const home = new Set((homeNames || []).map((x) => String(x)))
  let hits = 0
  for (const l of lits) {
    if (!home.has(l)) return false // ليس نسخةً من البيت
    hits++
  }
  return hits >= 2
}

/** **ولا إعلانَ ميّت**: كلُّ مُعلَنٍ يجب أن يكونَ عموداً موجوداً اليوم. */
function judgeDeadDeclarations(presentKeys) {
  const present = new Set(presentKeys || [])
  return Object.keys(DECLARED).filter((k) => !present.has(k))
}

/**
 * **وإعلانٌ يبقى بعد موتِ سببِه يصيرُ غطاءً**: إعلانٌ سببُه حراسةٌ أخرى حيّة
 * يجب أن تُقاسَ تلك الحراسةُ نفسُها. فإن ماتت، سقطَ الإعلانُ ولزمَ الرباط.
 * @param {string[]} liveProofs أسماءُ الحُرّاسِ الموجودين فعلاً فى القاعدة
 */
function judgeBrokenProofs(liveProofs) {
  const live = new Set(liveProofs || [])
  const out = []
  for (const [k, d] of Object.entries(DECLARED)) {
    if (!d.proof) continue
    if (!live.has(d.proof.name)) {
      out.push(k + " مُعلَنٌ لأنّ " + d.proof.kind + " «" + d.proof.name + "» يحرسُه — **وقد اختفى**")
    }
  }
  return out
}

if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, got, exp])
  const C = (o) => Object.assign({ table: "t", column: "c", home: "roles", tied: false, orphans: 0 }, o)

  // ── (ب) الرباطُ أو الإعلان، فى الاتّجاهين ───────────────────────────────
  t("يرفض عموداً بلا رباطٍ ولا إعلان", judgeTie(C({})) !== null, true)
  t("ويُسمّى الجدولَ والعمود", /^t\.c /.test(judgeTie(C({})) || ""), true)
  t("ويذكرُ بيتَه فى الشكوى", /roles/.test(judgeTie(C({})) || ""), true)
  t("ويقبل عموداً مربوطاً", judgeTie(C({ tied: true })), null)
  t("ويقبل عموداً مُعلَناً باسمِه", judgeTie(C({ table: "company_members", column: "role" })), null)
  t("ويقبل المُعلَنَ الثانى", judgeTie(C({ table: "company_invitations", column: "role" })), null)
  t("ويقبل المُعلَنَ الثالث", judgeTie(C({ table: "notifications", column: "assigned_to_role" })), null)
  t("ويقبل المُعلَنَ الرابع", judgeTie(C({ table: "approval_history", column: "actor_role" })), null)
  t("ولا يعفو عن جارٍ يشبهُ المُعلَن", judgeTie(C({ table: "company_members", column: "role_id" })) !== null, true)
  t("ولا عن جدولٍ يشبهُ اسمَ المُعلَن", judgeTie(C({ table: "company_members_old", column: "role" })) !== null, true)

  // ── (ج) الأسماءُ اليتيمةُ تُحاكَمُ فى المربوطِ والمُعلَنِ سواء ────────────
  t("يرفض صفّاً باسمٍ لا بيتَ له", judgeOrphans(C({ orphans: 1 })) !== null, true)
  t("ويرفضُه ولو كان العمودُ مُعلَناً", judgeOrphans(C({ table: "notifications", column: "assigned_to_role", orphans: 3 })) !== null, true)
  t("ويرفضُه ولو كان العمودُ مربوطاً", judgeOrphans(C({ tied: true, orphans: 2 })) !== null, true)
  t("ويعدُّ الصفوفَ لا يكتفى بوجودِها", /3 صفّاً/.test(judgeOrphans(C({ orphans: 3 })) || ""), true)
  t("ويُسمّى الاسمَ الغريبَ إن عُرف", /warehouse_manager/.test(judgeOrphans(C({ orphans: 1, orphanNames: "warehouse_manager" })) || ""), true)
  t("ولا يصرخُ على عمودٍ نظيف", judgeOrphans(C({ orphans: 0 })), null)
  t("ولا على نظيفٍ مربوط", judgeOrphans(C({ tied: true, orphans: 0 })), null)

  // ── (د) القائمةُ المكتوبةُ بيد، فى الاتّجاهين ───────────────────────────
  const HOME11 = ["owner", "admin", "manager", "accountant", "staff", "viewer"]
  t("يرى قائمةً مكتوبةً بيدٍ من أسماءِ البيت", judgeHandwrittenList(["owner", "admin"], HOME11), true)
  t("ويراها ولو طالت", judgeHandwrittenList(HOME11, HOME11), true)
  t("ولا يحكمُ على اسمٍ واحد", judgeHandwrittenList(["owner"], HOME11), false)
  t("ولا على قيدِ حالاتٍ ليس من البيت", judgeHandwrittenList(["draft", "posted"], HOME11), false)
  t("ولا على خليطٍ فيه غريب", judgeHandwrittenList(["owner", "draft"], HOME11), false)
  t("ولا على قيدٍ بلا حروف", judgeHandwrittenList([], HOME11), false)
  t("ولا يسقطُ على بيتٍ فارغ", judgeHandwrittenList(["owner", "admin"], []), false)

  // ── ولا إعلانَ ميّت، فى الاتّجاهين ──────────────────────────────────────
  const ALIVE = Object.keys(DECLARED)
  t("يقبلُ الإعلاناتِ كلَّها حيّة", judgeDeadDeclarations(ALIVE).length, 0)
  t("ويمسكُ إعلاناً مات عمودُه", judgeDeadDeclarations(ALIVE.slice(1)).length, 1)
  t("ويُسمّى الميّتَ بعينِه", judgeDeadDeclarations(ALIVE.slice(1))[0], ALIVE[0])
  t("ويمسكُ موتَ الجميع", judgeDeadDeclarations([]).length, ALIVE.length)

  // ── ولا إعلانٌ سببُه حارسٌ مات، فى الاتّجاهين ───────────────────────────
  const PROOFS = Object.values(DECLARED).filter((d) => d.proof).map((d) => d.proof.name)
  t("يقبلُ إعلاناً حارسُه حىّ", judgeBrokenProofs(PROOFS).length, 0)
  t("ويمسكُ إعلاناً مات حارسُه", judgeBrokenProofs([]).length, PROOFS.length)
  t("ويُسمّى الحارسَ الغائب", /trg_notifications_route_to_a_person/.test(judgeBrokenProofs([])[0] || ""), true)
  t("ولا يصرخُ على إعلانٍ بلا حارسٍ مُدَّعى", judgeBrokenProofs(PROOFS).length, 0)

  // ── وكلُّ إعلانٍ يحملُ سببَه وشرطَ رفعِه ────────────────────────────────
  t("ولا إعلانَ بلا سبب", Object.values(DECLARED).every((d) => d.why && d.why.length > 20), true)
  t("ولا إعلانَ بلا شرطِ رفع", Object.values(DECLARED).every((d) => d.lift && d.lift.length > 10), true)

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
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة بيوتِ الأسماء."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

;(async () => {
  const data = await withLiveDatabase(url, async (c) => {
    // ── (أ) البيوتُ الثلاثةُ للعضويّة ──────────────────────────────────────
    const homesAgree = (await c.query(`
      SELECT (SELECT array_agg(name ORDER BY name) FROM public.roles)::text[] AS home,
             (SELECT array_agg(x ORDER BY x) FROM unnest(public.erp_membership_roles()) x)::text[] AS live,
             (SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
                FROM pg_constraint k
                JOIN pg_class t ON t.oid = k.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(k.oid), '''([a-z_]+)''::text', 'g') m
               WHERE n.nspname = 'public' AND t.relname = 'company_invitations'
                 AND k.conname = 'company_invitations_role_check')::text[] AS invite`)).rows[0]

    // أسماءُ كلِّ بيت
    const homeNames = {}
    for (const h of HOMES) {
      homeNames[h.table] = (await c.query(
        `SELECT ${h.key}::text AS v FROM public.${h.table}`)).rows.map((r) => r.v)
    }

    // ── الدائرةُ المُثبَّتة والأسماءُ اليتيمة — فى ذهابٍ واحدٍ إلى القاعدة ───
    //
    // **الدائرةُ مُثبَّتة**: المربوطُ يُعرَفُ برباطِه، والمُعلَنُ باسمِه، ولا
    // يُخرِجُ عموداً منها أنْ تتّسخَ بياناتُه. والاكتشافُ بالبياناتِ **يُضيفُ
    // ولا يَحذف**.
    //
    // وألفُ عمودٍ نصّىٍّ فى القاعدة: لو سُئل كلٌّ منها فى ذهابٍ مستقلٍّ لصارَ
    // الحارسُ دقائقَ، **وحارسٌ بطىءٌ يُطفأ ثمّ لا يحرس شيئاً**. فيُسألُ كلُّه
    // داخلَ القاعدةِ نفسِها باستعلامٍ واحد، ويقفُ فحصُ كلِّ عمودٍ عند أوّلِ
    // قيمةٍ لا تسكنُ بيتاً (LIMIT 1) فلا يُقرأُ جدولٌ كاملاً بلا داعٍ.
    const decKeys = Object.keys(DECLARED)
    const circleRows = (await c.query(`
      WITH homes(h, k) AS (SELECT * FROM unnest($1::text[], $2::text[])),
      declared AS (SELECT * FROM unnest($3::text[], $4::text[], $5::text[]) AS d(tbl, col, h)),
      tied AS (
        SELECT src.relname AS tbl, a.attname AS col, tgt.relname AS h
        FROM pg_constraint k
        JOIN pg_class src ON src.oid = k.conrelid
        JOIN pg_class tgt ON tgt.oid = k.confrelid
        JOIN pg_namespace n ON n.oid = src.relnamespace
        JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = k.conkey[1]
        WHERE k.contype = 'f' AND n.nspname = 'public' AND array_length(k.conkey, 1) = 1
          AND tgt.relname IN (SELECT h FROM homes)
      ),
      cols AS (
        SELECT c.relname AS tbl, a.attname AS col
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND a.atttypid IN ('text'::regtype, 'varchar'::regtype, 'name'::regtype)
      ),
      probe AS (
        SELECT cols.tbl, cols.col, homes.h,
          (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM (SELECT 1 FROM public.%1$I t WHERE t.%2$I IS NOT NULL LIMIT 1) z',
            cols.tbl, cols.col), false, true, '')))[1]::text::int AS filled,
          (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM (SELECT 1 FROM public.%1$I t WHERE t.%2$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I hh WHERE hh.%4$I = t.%2$I) LIMIT 1) z',
            cols.tbl, cols.col, homes.h, homes.k), false, true, '')))[1]::text::int AS dirty
        FROM cols CROSS JOIN homes
        WHERE NOT (cols.tbl = homes.h AND cols.col = homes.k)
      ),
      -- **ولا يُقرأُ فراغٌ ويُسمّى بيتاً**: العمودُ الفارغُ لا يُكتشَف.
      discovered AS (SELECT tbl, col, h FROM probe WHERE filled > 0 AND dirty = 0),
      circle AS (
        SELECT tbl, col,
               coalesce(min(h) FILTER (WHERE src = 'tied'), min(h)) AS h,
               bool_or(src = 'tied') AS tied
        FROM (
          SELECT tbl, col, h, 'tied' AS src FROM tied
          UNION ALL SELECT tbl, col, h, 'declared' FROM declared
          UNION ALL SELECT tbl, col, h, 'found' FROM discovered
        ) u GROUP BY tbl, col
      ),
      live AS (
        SELECT c.*, EXISTS (SELECT 1 FROM cols x WHERE x.tbl = c.tbl AND x.col = c.col) AS col_exists,
               (SELECT k FROM homes WHERE h = c.h) AS hk
        FROM circle c
      )
      SELECT l.tbl, l.col, l.h, l.tied, l.col_exists,
        CASE WHEN l.col_exists THEN (xpath('/row/n/text()', query_to_xml(format(
          'SELECT count(*) AS n FROM public.%1$I t WHERE t.%2$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I hh WHERE hh.%4$I = t.%2$I)',
          l.tbl, l.col, l.h, l.hk), false, true, '')))[1]::text::int ELSE 0 END AS orphans,
        CASE WHEN l.col_exists THEN (xpath('/row/v/text()', query_to_xml(format(
          'SELECT string_agg(DISTINCT t.%2$I::text, %5$L) AS v FROM public.%1$I t WHERE t.%2$I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%3$I hh WHERE hh.%4$I = t.%2$I)',
          l.tbl, l.col, l.h, l.hk, ' · '), false, true, '')))[1]::text ELSE NULL END AS orphan_names
      FROM live l ORDER BY l.tbl, l.col`, [
      HOMES.map((h) => h.table),
      HOMES.map((h) => h.key),
      decKeys.map((k) => k.split(".")[0]),
      decKeys.map((k) => k.split(".").slice(1).join(".")),
      decKeys.map((k) => DECLARED[k].home),
    ])).rows

    const out = circleRows.map((r) => ({
      table: r.tbl, column: r.col, home: r.h, tied: Boolean(r.tied),
      missing: !r.col_exists, orphans: Number(r.orphans || 0), orphanNames: r.orphan_names,
    }))

    // ── (د) القوائمُ المكتوبةُ بيدٍ فى قيودِ الفحص ─────────────────────────
    const checks = (await c.query(`
      SELECT t.relname AS table_, k.conname AS name,
             coalesce((SELECT array_agg(m[1]) FROM regexp_matches(pg_get_constraintdef(k.oid), '''([a-z_]+)''::text', 'g') m),
                      ARRAY[]::text[]) AS literals
      FROM pg_constraint k
      JOIN pg_class t ON t.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND k.contype = 'c'`)).rows

    // ── (ه) الفحصُ المرجعىُّ موجودٌ ومُغلَقٌ على أهلِه ─────────────────────
    const baseline = (await c.query(`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
                                 OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))::int AS open_
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'assert_baseline_v3_75_13_check'`)).rows[0]

    // ── وحُرّاسُ الإعلاناتِ أنفسُهم: أحياءٌ هم أم ماتوا؟ ──────────────────
    const proofNames = Object.values(DECLARED).filter((d) => d.proof).map((d) => d.proof.name)
    const liveProofs = proofNames.length
      ? (await c.query(`
          SELECT t.tgname AS name FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
            AND t.tgenabled <> 'D'          -- **وزنادٌ مُعطَّلٌ ليس زناداً**
            AND t.tgname = ANY($1::text[])`, [proofNames])).rows.map((r) => r.name)
      : []

    return { homesAgree, homeNames, circle: out, checks, baseline, liveProofs }
  })

  const { homesAgree, homeNames, circle, checks, baseline, liveProofs } = data
  const problems = []

  // (أ)
  const eq = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null)
  if (!homesAgree.home || !homesAgree.home.length) {
    problems.push(["بيتُ الأسماءِ فارغ — **بحثٌ لا يجد ليس دليلَ غياب**", []])
  } else {
    if (!eq(homesAgree.home, homesAgree.live)) {
      problems.push(["بيتُ الأسماءِ يخالفُ المفرداتِ الحيّة",
        ["الجدول: " + (homesAgree.home || []).join(", "), "الدالّة: " + (homesAgree.live || []).join(", ")]])
    }
    if (!eq(homesAgree.home, homesAgree.invite)) {
      problems.push(["بيتُ الأسماءِ يخالفُ قيدَ الدعوات",
        ["الجدول: " + (homesAgree.home || []).join(", "), "القيد: " + (homesAgree.invite || []).join(", ")]])
    }
  }

  // **ولا إعلانَ ميّت**
  const alive = circle.filter((c) => !c.missing).map((c) => colKey(c.table, c.column))
  const dead = judgeDeadDeclarations(alive)
  if (dead.length) problems.push(["إعلانٌ بقى بعد موتِ عمودِه — **وإعلانٌ يبقى بعد موتِ سببِه يصيرُ غطاءً**", dead])

  const brokenProofs = judgeBrokenProofs(liveProofs)
  if (brokenProofs.length) problems.push(["إعلانٌ سببُه حارسٌ اختفى — فلزمَ الرباط", brokenProofs])

  // (ب)
  const untied = circle.filter((c) => !c.missing).map(judgeTie).filter(Boolean)
  if (untied.length) problems.push(["عمودٌ يحملُ مفردةً بلا رباطٍ ولا إعلان", untied])

  // (ج)
  const orphans = circle.filter((c) => !c.missing).map(judgeOrphans).filter(Boolean)
  if (orphans.length) problems.push(["اسمٌ مكتوبٌ لا بيتَ له", orphans])

  // (د)
  // **ولا يُنادى اسمٌ يسكنُه غيرُه**: جداولُ المُعلَنِ تُستثنى من بيتِ الإعلانِ
  // نفسِه، لا بقائمةٍ ثانيةٍ مكتوبةٍ هنا — فقيدُها **هو** حراستُها المُعلَنة.
  const declaredTables = new Set(Object.keys(DECLARED).map((k) => k.split(".")[0]))
  const handwritten = []
  for (const k of checks) {
    if (declaredTables.has(k.table_)) continue
    for (const h of HOMES) {
      if (judgeHandwrittenList(k.literals, homeNames[h.table])) {
        handwritten.push(k.table_ + "." + k.name + " → نسخةٌ يدويّةٌ من «" + h.table + "»")
      }
    }
  }
  if (handwritten.length) problems.push(["قائمةُ أسماءٍ مكتوبةٌ بيدٍ بجوارِ الرباط", handwritten])

  // (ه)
  if (!Number(baseline.n)) problems.push(["الفحصُ المرجعىُّ assert_baseline_v3_75_13_check غائب", []])
  else if (Number(baseline.open_)) problems.push(["الفحصُ المرجعىُّ يبلغُه زائرٌ أو مستخدم — **وحارسٌ يُفتَحُ بابُه ليس حارساً**", []])

  const tiedN = circle.filter((c) => c.tied && !c.missing).length
  const decN = circle.filter((c) => !c.tied && !c.missing && DECLARED[colKey(c.table, c.column)]).length
  console.log("  بيوتُ المفردات: " + HOMES.map((h) => h.table + " (" + (homeNames[h.table] || []).length + ")").join("  ·  "))
  console.log("  أعمدةٌ تحملُ مفردة: " + circle.filter((c) => !c.missing).length +
    "   ·   مربوطةٌ برباطٍ حقيقىّ: " + tiedN +
    "   ·   مُعلَنةٌ باسمِها: " + decN +
    "   ·   أسماءٌ يتيمة: " + circle.reduce((a, c) => a + Number(c.orphans || 0), 0))

  if (problems.length) {
    for (const [title, lines] of problems) {
      console.error("\nX " + title + (lines.length ? " (" + lines.length + "):" : ":"))
      lines.forEach((x) => console.error("   " + x))
    }
    console.error("\n   العلاج: يُربَطُ العمودُ ببيتِه بمفتاحٍ أجنبىّ، أو يُعلَنُ فى DECLARED باسمِه وسببِه وشرطِ رفعِه.")
    process.exit(1)
  }

  for (const [k, d] of Object.entries(DECLARED)) {
    console.log("  -   استثناءٌ معلَن: " + k + " — " + d.why)
    console.log("      يُرفَع حين: " + d.lift)
  }
  console.log("  ok  كلُّ اسمٍ له بيت، ولا قائمةَ أسماءٍ مكتوبةً بيدٍ بجوارِ الرباط.")
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
