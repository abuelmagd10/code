#!/usr/bin/env node
/**
 * check-no-door-the-visitor-does-not-need.js
 * ---------------------------------------------------------------------------
 * v3.75.61 — **وبابٌ لا يحتاجُه الزائرُ يُغلَق.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * أعلنتُ ثلاثَ دفعاتٍ أنّ **٢٨ كاتباً يبلغُهم الزائرُ** هم «أثقلُ ما تبقّى».
 * **والبرهانُ الحىُّ كذَّبَ ترتيبى**، وقد جُرِّبَ لا استُنتِج:
 *
 *     كتابةٌ بدورِ الزائرِ (anon) على كلِّ جدولٍ فى public:
 *       جداولُ جُرِّبت ................  ٢٥٦
 *       محاولاتٌ (إدراجٌ وحذفٌ لكلٍّ) ..  ٥١٢
 *       **رُفِضت بـ 42501** ...........  ٥١٢
 *       جداولُ يملكُ الزائرُ الكتابةَ فيها  ٠
 *
 * **فتلك أبوابٌ مفتوحةٌ على جدارٍ مصمَت.** والجذرُ كان أوسعَ ممّا لاحقت:
 * **٢٥٢ دالّةً يبلغُها الزائرُ ولا يحتاجُ إلّا ٣٩**، ومنحةُ **عمومِ الأدوارِ**
 * (`PUBLIC`) — لا منحةُ `anon` — هى التى تفتحُها، فنزعُ إحداهما وحدَها
 * **لا يُغلقُ شيئاً**. **ونصفُ جراحةٍ أسوأُ من لا جراحة.**
 *
 * ═══ ما يفحصه — بالأثرِ لا بالاسم ═══
 *
 *   (١) **لا بابَ للزائرِ خارجَ المُعلَنِ بالاسم**: ما يبلغُه `anon` من دوالِّنا
 *       هو هذه الـ٣٩ لا غير — **والاسمُ مُثبَّتٌ لا العددُ وحدَه**، فبابٌ يُغلَقُ
 *       وآخَرُ يُفتَحُ يُبقى العددَ ٣٩ ويمرُّ على حارسٍ يعدُّ وحدَه.
 *   (٢) **وغيابُ اسمٍ يُرفَضُ كما تُرفَضُ زيادة**: ٣٥ من الـ٣٩ **تنادِيها
 *       سياساتُ حمايةِ الصفوف**، فنزعُ منحةِ واحدةٍ منها **يُعطِّلُ السياسةَ
 *       التى تنادِيه** — والنقصانُ هنا عطبٌ لا مكسب.
 *   (٣) **ولا بابَ يُغلَقُ على أهلِه**: دالّةٌ لا يبلغُها المستخدِمُ المسجَّلُ
 *       ولا مفتاحُ الخدمةِ صارت يتيمةً — **ولا يُصلَحُ عطبٌ بعطبٍ آخَر**.
 *   (٤) **ولا كاتبَ يبلغُه الزائرُ**: صفرٌ يُثبَّتُ عندَ صفر.
 *   (٥) والفحصُ المرجعىُّ `assert_baseline_v3_75_61_check` قائمٌ ومغلَق.
 *
 * **ولحمُ الامتداداتِ مستثنًى بخاصّيّةِ العضويّةِ فى `pg_depend` لا باسم.**
 * **ولا يُبنى بيتٌ ثانٍ**: الاتّصالُ من `scripts/lib/live-db.js`.
 *
 * Usage: node scripts/check-no-door-the-visitor-does-not-need.js [--require-db] [--list]
 *        node scripts/check-no-door-the-visitor-does-not-need.js --selftest
 * ---------------------------------------------------------------------------
 */
"use strict"

/**
 * **المُعلَنُ بالاسم.** ٣٥ منها تنادِيها سياساتُ حمايةِ الصفوف، و٢ مُعلَنتانِ
 * لما قبلَ الدخول (`find_user_by_login` · `auth_email_state`)، والباقى فى
 * منظورٍ أو قيمةٍ افتراضيّة. قِيسَ على البيتَين يومَ v3.75.61 فتطابقا حرفاً بحرف.
 */
const KEEP = [
  "ai_current_user_allowed_resources",
  "ai_current_user_is_full_access",
  "ai_normalize_for_fts",
  "auth_email_state",
  "can_access_bank_rec_lines",
  "can_access_bill_items",
  "can_access_bill_row",
  "can_access_booking",
  "can_access_booking_row",
  "can_access_invoice_items",
  "can_access_journal_lines",
  "can_access_purchase_order_items",
  "can_access_purchase_order_row",
  "can_access_purchase_return_item_row",
  "can_access_purchase_return_row",
  "can_access_record_branch",
  "can_access_vc_items",
  "can_approve_discount",
  "can_delete_resource",
  "can_manage_supplier_row",
  "can_modify_data",
  "can_modify_invoice_items",
  "can_review_company_ai",
  "current_user_branch_id",
  "current_user_is_branch_unbounded",
  "current_user_resource_visibility",
  "find_user_by_login",
  "fn_user_company_access",
  "fn_user_company_ids",
  "get_inventory_reservation_balances",
  "get_user_company_ids",
  "has_shared_access",
  "ic_user_can_access_company",
  "ic_user_can_access_consolidation_group",
  "ic_user_can_access_legal_entity",
  "ic_user_can_manage_company",
  "is_company_member",
  "is_owner_or_admin",
  "supplier_is_active_in_my_branch",
]

const BASELINE = "assert_baseline_v3_75_61_check"

// ═══════════════════════════════════════════════════════════════════════════
// الأحكامُ الخالصة — تُقاسُ فى الفخِّ الذاتىِّ بلا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/**
 * **والقائمةُ تُقاسُ فى الاتّجاهَين**: اسمٌ زادَ بابٌ فُتِح، واسمٌ نقصَ حارسُ
 * حمايةِ صفوفٍ فقدَ منحتَه فتعطَّلت سياستُه. **ولا يُقرَأُ النقصانُ مكسباً هنا.**
 */
function judgeRoster(live, declared) {
  const L = new Set(live || [])
  const D = new Set(declared || [])
  return {
    added: [...L].filter((x) => !D.has(x)).sort(),
    gone: [...D].filter((x) => !L.has(x)).sort(),
  }
}

/** **ولا بابَ يُغلَقُ على أهلِه**: من لا يبلغُه المستخدِمُ ولا مفتاحُ الخدمة. */
function judgeOrphan(row) {
  if (!row) return false
  return !row.auth_can && !row.svc_can
}

/** **والحكمُ بالأثر**: كاتبٌ يبلغُه الزائرُ — يُرفَضُ عندَ أوّلِ ظهور. */
function judgeWriterReach(row) {
  if (!row) return false
  return Boolean(row.anon_can) && Boolean(row.writes)
}

/**
 * **ولحمُ غيرِنا ليس لنا**: عضوُ امتدادٍ لا يُحاكَمُ هنا مهما كان اسمُه،
 * ولغةٌ لا يُقرَأُ جسدُها ليست منّا. **والحكمُ بالخاصّيّةِ لا بالاسم.**
 */
function isOurs(row) {
  if (!row) return false
  if (row.is_extension_member) return false
  return row.lang === "plpgsql" || row.lang === "sql"
}

/** **ويُفرَزُ الصفُّ إلى أسبابِه ولا يُخلَطُ عطبٌ بعطب.** */
function classify(rows, keep) {
  const K = new Set(keep || KEEP)
  const out = { ours: [], anonDoors: [], outside: [], orphans: [], writers: [], foreign: [] }
  for (const r of rows || []) {
    if (!isOurs(r)) { if (r && r.is_extension_member) out.foreign.push(r); continue }
    out.ours.push(r)
    if (judgeOrphan(r)) out.orphans.push(r)
    if (judgeWriterReach(r)) out.writers.push(r)
    if (r.anon_can) {
      out.anonDoors.push(r)
      if (!K.has(r.proname)) out.outside.push(r)
    }
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
  const OURS = (o) => Object.assign(
    { proname: "f", lang: "plpgsql", is_extension_member: false, anon_can: 0, auth_can: 1, svc_can: 1, writes: 0 }, o)

  // ── القائمةُ فى الاتّجاهَين ──────────────────────────────────────────────
  const SAMPLE = ["a_gate", "b_gate", "c_gate"]
  t("القائمةُ تُطابقُ نفسَها", judgeRoster(SAMPLE, SAMPLE), { added: [], gone: [] })
  t("ويمسكُ باباً جديداً فُتِح", judgeRoster(SAMPLE.concat(["intruder"]), SAMPLE).added, ["intruder"])
  t("**ويمسكُ حارساً فقدَ منحتَه** — والنقصانُ هنا عطبٌ لا مكسب",
    judgeRoster(SAMPLE.slice(1), SAMPLE).gone, ["a_gate"])
  // **والعددُ وحدَه يُخدَع**: بابٌ أُغلقَ وآخَرُ فُتِح والعددُ كما هو
  const swapped = SAMPLE.slice(1).concat(["intruder"])
  t("والعددُ وحدَه لا يرى التبديل", swapped.length === SAMPLE.length, true)
  t("والاسمُ يراه", judgeRoster(swapped, SAMPLE), { added: ["intruder"], gone: ["a_gate"] })
  t("ولا يخدعه ترتيبٌ مختلف", judgeRoster(["c_gate", "a_gate", "b_gate"], SAMPLE), { added: [], gone: [] })
  t("ولا تَكرارٌ يُعدُّ زيادة", judgeRoster(SAMPLE.concat(["a_gate"]), SAMPLE), { added: [], gone: [] })
  t("وقائمةٌ حيّةٌ فارغةٌ تُسقِطُ الجميع", judgeRoster([], SAMPLE).gone, SAMPLE.slice().sort())

  // ── اليتيم ──────────────────────────────────────────────────────────────
  t("يمرُّ من يبلغُه المستخدِم", judgeOrphan(OURS({ auth_can: 1, svc_can: 0 })), false)
  t("ويمرُّ من يبلغُه مفتاحُ الخدمةِ وحدَه", judgeOrphan(OURS({ auth_can: 0, svc_can: 1 })), false)
  t("**ويمسكُ من لا يبلغُه أحد**", judgeOrphan(OURS({ auth_can: 0, svc_can: 0 })), true)
  t("ولا يسقطُ على صفٍّ غائب", judgeOrphan(null), false)

  // ── الكاتبُ الذى يبلغُه الزائر ──────────────────────────────────────────
  t("يرفضُ كاتباً يبلغُه الزائر", judgeWriterReach(OURS({ anon_can: 1, writes: 1 })), true)
  t("ولا يحاكمُ كاتباً لا يبلغُه", judgeWriterReach(OURS({ anon_can: 0, writes: 1 })), false)
  t("ولا قارئاً يبلغُه", judgeWriterReach(OURS({ anon_can: 1, writes: 0 })), false)

  // ── الملكيّةُ بالخاصّيّة ────────────────────────────────────────────────
  t("دالّتُنا هى لنا", isOurs(OURS({})), true)
  t("ولحمُ الامتدادِ ليس لنا", isOurs(OURS({ is_extension_member: true })), false)
  t("ولغةُ C ليست لنا", isOurs(OURS({ lang: "c" })), false)
  t("والعضويّةُ تسبقُ اللغةَ فى الحكم", isOurs(OURS({ lang: "plpgsql", is_extension_member: true })), false)

  // ── الفرزُ لا يخلطُ سبباً بسبب ──────────────────────────────────────────
  const rows = [
    OURS({ proname: "a_gate", anon_can: 1 }),
    OURS({ proname: "intruder", anon_can: 1 }),
    OURS({ proname: "writer", anon_can: 1, writes: 1 }),
    OURS({ proname: "lonely", auth_can: 0, svc_can: 0 }),
    OURS({ proname: "vec", lang: "c", is_extension_member: true, anon_can: 1 }),
  ]
  const c = classify(rows, ["a_gate"])
  t("يعُدُّ دوالَّنا وحدَها", c.ours.length, 4)
  t("ويعُدُّ لحمَ الامتدادِ على حِدَة — ولا يحاكمُه ولو بلغَه الزائر", c.foreign.length, 1)
  t("ويُمسكُ البابَ خارجَ المُعلَن", c.outside.map((x) => x.proname), ["intruder", "writer"])
  t("ويُمسكُ الكاتبَ الذى يبلغُه الزائر", c.writers.map((x) => x.proname), ["writer"])
  t("ويُمسكُ اليتيم", c.orphans.map((x) => x.proname), ["lonely"])
  t("ولا صفَّ أصلاً لا يُفزِعُه", classify([], KEEP).outside.length, 0)

  // ── القائمةُ المُعلَنةُ نفسُها ──────────────────────────────────────────
  t("والمُعلَنُ بلا تَكرار", KEEP.length, new Set(KEEP).size)
  t("وفيه بوّابتا ما قبلَ الدخولِ بأعيانِهما",
    ["find_user_by_login", "auth_email_state"].every((x) => KEEP.includes(x)), true)

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
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قياسُ أبوابِ الزائر."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

;(async () => {
  const data = await withLiveDatabase(url, async (c) => {
    const rows = (await c.query(`
      SELECT p.oid::regprocedure::text AS sig,
             p.proname,
             l.lanname AS lang,
             p.prosecdef AS is_definer,
             EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                        AND d.deptype = 'e') AS is_extension_member,
             has_function_privilege('anon', p.oid, 'EXECUTE')::int          AS anon_can,
             has_function_privilege('authenticated', p.oid, 'EXECUTE')::int AS auth_can,
             has_function_privilege('service_role', p.oid, 'EXECUTE')::int  AS svc_can,
             (CASE WHEN lower(regexp_replace(pg_get_functiondef(p.oid), chr(45) || chr(45) || '[^' || chr(10) || ']*', ' ', 'g')) LIKE '%insert into%'
                     OR lower(regexp_replace(pg_get_functiondef(p.oid), chr(45) || chr(45) || '[^' || chr(10) || ']*', ' ', 'g')) LIKE '%update %'
                     OR lower(regexp_replace(pg_get_functiondef(p.oid), chr(45) || chr(45) || '[^' || chr(10) || ']*', ' ', 'g')) LIKE '%delete from%'
                   THEN 1 ELSE 0 END) AS writes
        FROM pg_proc p
        JOIN pg_language l ON l.oid = p.prolang
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.prokind = 'f'
         AND l.lanname IN ('plpgsql','sql')
       ORDER BY p.oid::regprocedure::text`)).rows

    const baseline = (await c.query(`
      SELECT (SELECT count(*) FROM pg_proc
               WHERE pronamespace='public'::regnamespace AND proname=$1)::int AS n,
             (SELECT count(*) FROM information_schema.routine_privileges
               WHERE routine_schema='public' AND routine_name=$1
                 AND grantee IN ('PUBLIC','anon','authenticated'))::int AS open_`, [BASELINE])).rows[0]

    return { rows, baseline }
  })

  const c = classify(data.rows, KEEP)
  const roster = judgeRoster([...new Set(c.anonDoors.map((r) => r.proname))], KEEP)

  console.log("  دوالُّنا فى public: " + c.ours.length +
    "   ·   يبلغُها الزائرُ: " + c.anonDoors.length +
    "   ·   المُعلَنُ بالاسم: " + KEEP.length)
  console.log("  خارجَ المُعلَن: " + c.outside.length + " (المطلوبُ صفر)" +
    "   ·   مفقودٌ من المُعلَن: " + roster.gone.length + " (المطلوبُ صفر)" +
    "   ·   كُتّابٌ يبلغُهم الزائرُ: " + c.writers.length + " (المطلوبُ صفر)" +
    "   ·   يتامى: " + c.orphans.length + " (المطلوبُ صفر)")

  const problems = []
  if (c.outside.length) {
    problems.push(["بابٌ يبلغُه الزائرُ خارجَ المُعلَن — **ومنحةُ عمومِ الأدوارِ تفتحُه ولو لم يُمنَحْ anon**",
      c.outside.slice(0, 40).map((r) => r.sig +
        "   ⇐ REVOKE EXECUTE ON FUNCTION " + r.sig + " FROM PUBLIC, anon;")])
  }
  if (roster.gone.length) {
    problems.push(["**اسمٌ من المُعلَنِ لم يعُدْ يبلغُه الزائرُ** — وأكثرُها حرّاسُ حمايةِ صفوفٍ تنادِيها سياسات، فنزعُ منحتِها يُعطِّلُ السياسة",
      roster.gone.map((n) => n + "   ⇐ إن كان السدادُ مقصوداً فأنزِلْه من KEEP فى الدفعةِ التى سدَّدت")])
  }
  if (c.writers.length) {
    problems.push(["**كاتبٌ يبلغُه الزائرُ** — يُرفَضُ عندَ أوّلِ ظهور",
      c.writers.slice(0, 40).map((r) => r.sig)])
  }
  if (c.orphans.length) {
    problems.push(["**دالّةٌ لا يبلغُها المستخدِمُ ولا مفتاحُ الخدمة** — بابٌ أُغلقَ على أهلِه",
      c.orphans.slice(0, 40).map((r) => r.sig)])
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

  console.log("+ لا بابَ يبلغُه الزائرُ خارجَ المُعلَنِ بالاسم، ولا حارسَ حمايةِ صفوفٍ فقدَ منحتَه، ولا كاتبَ يبلغُه، ولا دالّةَ أُغلقَ بابُها على أهلِها.")
  if (verbose) {
    for (const r of c.anonDoors) console.log("      - " + r.sig)
  }
  process.exit(0)
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
