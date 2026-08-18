#!/usr/bin/env node
/**
 * check-no-visitor-reaches-a-writer.js
 * ---------------------------------------------------------------------------
 * v3.75.58 — **ومن لا هويّةَ له لا يطرقُ بابَ كاتب.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * فى v3.75.57 كُتبَ شرطٌ يقولُ «لا يبلغُ هؤلاءِ الكُتّابَ الأربعةَ زائرٌ ولا
 * عمومُ الأدوار»، **فرفضَ عندَ أوّلِ تشغيل**. والسبب: الأربعةُ كانوا يبلغُهم
 * `anon` — **الزائرُ غيرُ المسجَّلِ الدخول** — وذلك قائمٌ من قبلِ تلك الدفعة.
 *
 * **ولم يكن حارسٌ واحدٌ فى المشروعِ يراهم.** الحرّاسُ الذين يحاكمون ما يبلغُه
 * الزائرُ (`check-exposed-definer-functions`، `check-authenticated-reachable-definers`)
 * يحاكمون **دوالَّ الصلاحيّاتِ الكاملةِ وحدَها** — لأنّ تلك تتجاوزُ حمايةَ
 * الصفوف. وهؤلاءِ **بصلاحيّاتِ مُنادِيهم**، فسقطوا من كلِّ شبكة.
 * **وبحثٌ لا يجد ليس دليلَ غياب.**
 *
 * ═══ ولم يُثبَتْ بابٌ مفتوح — ومع ذلك يُحرَس ═══
 *
 * الدالّةُ بصلاحيّاتِ مُنادِيها تجرى بحقِّ الزائر، والزائرُ بلا هويّة، فحمايةُ
 * الصفوفِ تردُّه عندَ الجدول. **فهذه ليست ثغرةً مُثبَتة، لكنّها منحةٌ لا داعىَ
 * لها على كاتب**، وسطحُ هجومٍ يتّسع، **وحمايةُ صفوفٍ تُرفَعُ عن جدولٍ يوماً
 * تجعلُها ثغرةً فى لحظة**. فتُثبَّتُ اليومَ فلا تزيد، ويُسمَّى أصحابُها واحداً
 * واحداً ليُسدَّدوا على دفعاتٍ مقيسة — **ومعدودٌ لا مسكوتٌ عنه**.
 *
 * ═══ ما يفحصه — بالأثرِ لا بالاسم ═══
 *
 *   (١) **العددُ مُثبَّت**: كم دالّةً فى `public` **تكتبُ** (INSERT/UPDATE/DELETE
 *       فى جسدِها بعدَ حجبِ التعليقات) **ويملكُ `anon` تنفيذَها**. مقيسٌ يومَ
 *       v3.75.58 على البيتَين فكان **٢٨** على كلَيهما.
 *   (٢) **والاسمُ مُثبَّتٌ لا العددُ وحدَه**: قائمةٌ بأسمائِهم. فبابٌ يُغلَقُ
 *       وآخَرُ يُفتَحُ يُبقى العددَ ٢٨ **ويمرُّ على حارسٍ يعدُّ وحدَه**.
 *   (٣) **وبصلاحيّاتٍ كاملةٍ صفرٌ ولا يُثبَّتُ صفرٌ آخَر**: كاتبةٌ بصلاحيّاتٍ
 *       كاملةٍ يبلغُها الزائرُ **تتجاوزُ حمايةَ الصفوفِ فعلاً** — فهذه تُرفَضُ
 *       عندَ أوّلِ ظهورٍ مهما كان الرقمُ المُثبَّت.
 *   (٤) **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**: من سدَّدَ يُنزِّلُ الرقمَ والاسمَ
 *       فى الدفعةِ التى سدَّدت، وإلّا رفضَ الحارسُ كذلك.
 *
 * **ولا يُبنى بيتٌ ثانٍ**: الاتّصالُ من `scripts/lib/live-db.js`، والحكمُ على
 * الانقطاعِ هناك لا هنا.
 *
 * Usage: node scripts/check-no-visitor-reaches-a-writer.js [--require-db] [--list]
 *        node scripts/check-no-visitor-reaches-a-writer.js --selftest
 * ---------------------------------------------------------------------------
 */
"use strict"

/** قِيسَ يومَ v3.75.58 على الإنتاجِ وعلى بيتِ الاختبارِ فتطابقا. */
const PINNED = 28

/**
 * **والاسمُ مُثبَّتٌ لا العددُ وحدَه.** هؤلاءِ كُتّابٌ **بصلاحيّاتِ مُنادِيهم**
 * يملكُ الزائرُ تنفيذَهم اليوم. وليس فى القائمةِ حكمٌ بأنّهم صوابٌ — بل أنّهم
 * **معلومون ومعدودون**، وكلُّ زيادةٍ عليهم تُوقِفُ الشجرة.
 */
const DECLARED = [
  "apply_customer_debit_note",
  "approve_customer_debit_note",
  "bkg_sync_payment_status",
  "claim_next_job",
  "close_accounting_period",
  "create_cogs_journal_for_invoice",
  "create_missing_invoice_journals_safe",
  "create_opening_stock_fifo_lots",
  "create_vendor_credit_from_bill_return",
  "delete_empty_journal_entries_safe",
  "fix_unbalanced_journal_entries_safe",
  "fn_recalc_bill_paid_status",
  "fn_recalc_invoice_paid_status",
  "generate_depreciation_schedule",
  "ir_refresh_allocation_from_consumptions",
  "ir_refresh_header_totals",
  "ir_refresh_line_totals",
  "migrate_existing_purchases_to_fifo",
  "mpoe_refresh_open_reservation_status",
  "next_lot_number",
  "post_purchase_transaction",
  "register_asset_addition",
  "reject_customer_debit_note",
  "revalue_asset",
  "reverse_cogs_journal_for_return",
  "seed_default_asset_categories",
  "submit_debit_note_for_approval",
  "sync_company_chart_of_accounts",
]

// ═══════════════════════════════════════════════════════════════════════════
// الأحكامُ الخالصة — تُقاسُ فى الفخِّ الذاتىِّ بلا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/** **ويرفضُ فى الاتّجاهَين**: زيادةٌ عطبٌ جديد، ونقصانٌ مكسبٌ لم يُثبَّت. */
function judgePin(found, pinned) {
  if (found > pinned) return "grew"
  if (found < pinned) return "shrank"
  return "ok"
}

/**
 * **والاسمُ مُثبَّتٌ لا العددُ وحدَه**: بابٌ يُغلَقُ وآخَرُ يُفتَحُ يُبقى العددَ
 * كما هو. فيُقارَنُ الاسمُ بالاسم.
 */
function judgeRoster(liveNames, declared) {
  const live = new Set(liveNames || [])
  const dec = new Set(declared || [])
  return {
    added: [...live].filter((x) => !dec.has(x)).sort(),
    gone: [...dec].filter((x) => !live.has(x)).sort(),
  }
}

/**
 * **وبصلاحيّاتٍ كاملةٍ لا يُثبَّتُ صفرٌ بل يُرفَضُ عندَ أوّلِ ظهور**: تلك
 * تتجاوزُ حمايةَ الصفوفِ فعلاً، فلا تُعامَلُ معاملةَ الدَّينِ المعدود.
 */
function judgeDefiners(rows) {
  return (rows || []).filter((r) => Number(r.prosecdef)).map((r) => r.proname).sort()
}

/**
 * **ويُسمّى الأثرُ لا الشكل**: الكاتبةُ التى يبلغُها الزائرُ **ولا تسألُ عن
 * هويّةٍ أصلاً** أثقلُ من التى تسأل — لأنّ الزائرَ بلا هويّة، فسؤالُها يردُّه
 * قبلَ الجدول. **ولا يعرفُ هذا الحكمُ أهىَ صوابٌ أم خطأ** — يُرتِّبُ الدَّينَ
 * ليُسدَّدَ الأثقلُ أوّلاً. **ويُسمّى ما يُقاسُ لا أكثرَ منه.**
 */
function classifyWriter(row) {
  return Number(row && row.asks_identity) ? "يسألُ عن هويّةِ مُنادِيه" : "لا يسألُ عن هويّة"
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

  t("يمرُّ حين يُطابقُ الرقمُ المُثبَّت", judgePin(28, 28), "ok")
  t("ويرفضُ باباً جديداً للزائر", judgePin(29, 28), "grew")
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه", judgePin(27, 28), "shrank")
  t("ويرفضُ الصفرَ غيرَ المُثبَّت", judgePin(0, 28), "shrank")

  t("والقائمةُ تُطابقُ نفسَها", judgeRoster(DECLARED, DECLARED), { added: [], gone: [] })
  t("ويمسكُ اسماً جديداً", judgeRoster(DECLARED.concat(["drop_the_world"]), DECLARED).added, ["drop_the_world"])
  t("ويمسكُ اسماً سُدِّدَ ولم يُنزَّلْ من القائمة", judgeRoster(DECLARED.slice(1), DECLARED).gone, [DECLARED[0]])
  // **والعددُ وحدَه يُخدَع**: بابٌ أُغلقَ وآخَرُ فُتِح — العددُ ٢٨ كما هو
  const swapped = DECLARED.slice(1).concat(["a_new_open_writer"])
  t("والعددُ وحدَه لا يرى التبديل", judgePin(swapped.length, PINNED), "ok")
  t("والاسمُ يراه", judgeRoster(swapped, DECLARED), { added: ["a_new_open_writer"], gone: [DECLARED[0]] })

  t("ولا كاتبةَ بصلاحيّاتٍ كاملةٍ اليوم", judgeDefiners([{ proname: "x", prosecdef: 0 }]), [])
  t("ويرفضُ كاتبةً بصلاحيّاتٍ كاملةٍ يبلغُها الزائر",
    judgeDefiners([{ proname: "x", prosecdef: 0 }, { proname: "danger", prosecdef: 1 }]), ["danger"])
  t("ويقبلُ قائمةً فارغةً بلا صراخ", judgeDefiners([]), [])

  t("ويُسمّى من لا يسألُ عن هويّة", classifyWriter({ asks_identity: 0 }), "لا يسألُ عن هويّة")
  t("ويُسمّى من يسأل", classifyWriter({ asks_identity: 1 }), "يسألُ عن هويّةِ مُنادِيه")
  t("ولا يسقطُ على صفٍّ فارغ", classifyWriter(null), "لا يسألُ عن هويّة")

  t("والقائمةُ بلا تَكرار", DECLARED.length, new Set(DECLARED).size)
  t("وطولُها هو الرقمُ المُثبَّت — فلا يقولُ الحارسُ رقمَين", DECLARED.length, PINNED)

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
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قياسُ ما يبلغُه الزائر."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

// **والتعليقُ ليس تعليمة**: يُحجَبُ الكتلىُّ والسطرىُّ قبلَ الحكم، فلا يُعَدُّ
// كاتباً من كتبَ كلمةَ INSERT فى شرحٍ لنفسِه.
const BLANK = "lower(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', ' ', 'gs'), '--[^\\n]*', ' ', 'g'))"

;(async () => {
  const rows = await withLiveDatabase(url, async (c) => (await c.query(`
    WITH src AS (
      SELECT p.oid, p.proname, p.prosecdef, ${BLANK} AS body
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')
    )
    SELECT proname,
           pg_get_function_identity_arguments(oid) AS args,
           prosecdef::int AS prosecdef,
           (body LIKE '%assert_company_access%' OR body LIKE '%user_has_company_access%'
            OR body LIKE '%company_members%' OR body LIKE '%auth.uid()%'
            OR body LIKE '%assert_is_self%')::int AS asks_identity
    FROM src
    WHERE has_function_privilege('anon', oid, 'EXECUTE')
      AND (body LIKE '%insert into%' OR body LIKE '%update %' OR body LIKE '%delete from%')
    ORDER BY proname`)).rows)

  const names = [...new Set(rows.map((r) => r.proname))].sort()
  const verdict = judgePin(names.length, PINNED)
  const roster = judgeRoster(names, DECLARED)
  const definers = judgeDefiners(rows)

  console.log("  كُتّابٌ يبلغُهم الزائرُ (anon): " + names.length + " اسماً فى " + rows.length +
    " نسخةً   (المُثبَّت " + PINNED + ")   ·   بصلاحيّاتٍ كاملة: " + definers.length + " (المطلوبُ صفر)")

  const problems = []
  if (definers.length) {
    problems.push(["كاتبةٌ بصلاحيّاتٍ كاملةٍ يبلغُها الزائرُ — **وهذه تتجاوزُ حمايةَ الصفوفِ فعلاً، فتُرفَضُ عندَ أوّلِ ظهورٍ لا تُعَدُّ**", definers])
  }
  if (roster.added.length) {
    problems.push(["كاتبٌ جديدٌ صارَ يبلغُه الزائرُ — **ومن لا هويّةَ له لا يطرقُ بابَ كاتب**", roster.added.map((n) =>
      n + "   ⇐ إمّا يُنزَعُ المنحُ: REVOKE ALL ON FUNCTION public." + n + "(...) FROM PUBLIC, anon; " +
      "وإمّا يُعلَنُ هنا بسببٍ مكتوبٍ فى الدفعةِ التى فتحَتْه")])
  }
  if (roster.gone.length) {
    problems.push(["اسمٌ سُدِّدَ ولم يُنزَّلْ من القائمة — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**", roster.gone.map((n) =>
      n + "   ⇐ يُحذَفُ من DECLARED ويصيرُ PINNED = " + names.length + " فى الدفعةِ التى سدَّدت")])
  }
  if (!problems.length && verdict !== "ok") {
    // **ولا يمرُّ رقمٌ خالفَ ولم تُخالِفْه القائمة** — حارسٌ يقولُ قولَين لا يُصدَّق.
    problems.push(["العددُ " + names.length + " والمُثبَّتُ " + PINNED + " والقائمةُ متطابقة — **وهذا تناقضٌ فى الحارسِ نفسِه، فيُقرَأُ بالعينِ ولا يُمَرَّر**", []])
  }

  if (problems.length) {
    for (const [title, lines] of problems) {
      console.error("\nX " + title + (lines.length ? " (" + lines.length + "):" : ":"))
      lines.forEach((x) => console.error("   " + x))
    }
    process.exit(1)
  }

  console.log("+ لا كاتبَ جديدٌ يبلغُه الزائرُ، ولا كاتبةَ بصلاحيّاتٍ كاملةٍ يبلغُها (الاسمُ مُثبَّتٌ لا العددُ وحدَه، والتعليقُ محجوبٌ قبلَ الحكم).")
  console.log("  ! ومعدودٌ لا مسكوتٌ عنه — دَينٌ يُسدَّدُ على دفعاتٍ مقيسة، والأثقلُ أوّلاً:")
  const rank = (r) => (Number(r.asks_identity) ? 1 : 0)
  const shown = [...rows].sort((a, b) => rank(a) - rank(b) || a.proname.localeCompare(b.proname))
  const list = verbose ? shown : shown.filter((r) => !Number(r.asks_identity))
  for (const r of list) console.log("      - " + r.proname + "(" + String(r.args || "").slice(0, 60) + ")   [" + classifyWriter(r) + "]")
  if (!verbose && list.length < shown.length) {
    console.log("      … و" + (shown.length - list.length) + " ممّن يسألون عن الهويّةِ — تُعرَضُ كلُّها بـ--list")
  }
  process.exit(0)
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
