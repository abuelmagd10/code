#!/usr/bin/env node
/**
 * check-report-screens-read-from-the-one-home.js
 * **ولا مسارَ بديلٍ لرقمٍ له بيت.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-report-screens-read-from-the-one-home.js [--list] [--selftest]
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس — v3.75.39 ═══
 *
 * شاشةُ `/reports/dashboard` كانت تنادى `get_financial_summary` — دالّةٌ فى
 * القاعدةِ تُعيدُ حسابَ الإيراداتِ والمصروفاتِ والأصولِ والالتزاماتِ وحقوقِ
 * الملكيّةِ **من الصفر**. وهذا يكسرُ قاعدةً مكتوبةً فى المشروعِ منذ زمن، فى
 * `docs/ACCOUNTING_REPORTS_ARCHITECTURE.md`:
 *
 *     «لا حساب مكرر: لا يُسمح بحساب نفس الرقم بطريقتين مختلفتين.»
 *     «لا مسار بديل: جميع التقارير تستخدم نفس الـ API/Function.»
 *
 * **ولم يكتشفْه أحدٌ لأنّ المسارَ البديلَ كان مكسوراً فيصمت**: كان يقارنُ
 * `account_type` بحروفٍ كبيرة (`'Revenue'`) والقيمُ الحيّةُ صغيرة، فيعودُ صفرٌ
 * فى كلِّ خانة. فكانت الشاشةُ تعرضُ أصفاراً **وتبدو سليمة**. ولو أنّ المسارَ
 * البديلَ كان يعملُ لَكانت الشاشةُ تعرضُ رقماً يخالفُ قائمةَ الدخلِ ولا أحدَ
 * يدرى أيُّهما الصادق. **والقاعدةُ ليست عن الصحّة بل عن وحدةِ المصدر.**
 *
 * ═══ ما يقيسه — بالخاصّيّةِ لا بالنيّة ═══
 *
 * **شاشةُ تقريرٍ** (تحت `app/reports/` أو `app/dashboard/`) **تقرأُ سطورَ
 * اليوميّةِ بنفسِها** (`journal_entry_lines`) **ولا تمرُّ ببيتٍ معتمَد**.
 *
 * والبيوتُ المعتمَدةُ مُسمّاةٌ فى الوثيقةِ نفسِها ومكتوبةٌ هنا نقلاً عنها لا
 * اختراعاً: `/api/income-statement` · `/api/account-balances` ·
 * `/api/trial-balance` · `/api/general-ledger` · `/api/account-statement` ·
 * و`@/lib/ledger`.
 *
 * ═══ ولا يُحاكَمُ من يكتبُ القيدَ ═══
 *
 * محرِّكاتُ الترحيلِ تكتبُ فى `journal_entry_lines` بحكمِ عملِها، وليست
 * تقارير. فالمحكومُ هنا **شاشاتُ التقاريرِ وحدَها** — ومن يقرأُ رقماً محاسبيّاً
 * ليعرضَه، لا من يُنشئُ القيد.
 *
 * ═══ ومعدودٌ لا مسكوتٌ عنه ═══
 *
 * تسعُ شاشاتٍ ما زالت تقرأُ بنفسِها (أعمارُ الديونِ والبنوكُ وفروقُ العملة).
 * **لا تزيد**، وكلُّ نقصٍ يُثبَّتُ فى الدفعةِ التى كسبَتْه — **ومكسبٌ لا
 * يُثبَّتُ يُلتَفُّ عليه**.
 * ---------------------------------------------------------------------------
 */
"use strict"

const { projectCodeFiles } = require("./lib/repo-code-files")

/** الدَّينُ المقيسُ يومَ v3.75.39 — لا يزيد. */
const PINNED = 9

/** البيوتُ المعتمَدةُ للأرقامِ المحاسبيّة — منقولةٌ من وثيقةِ المعمار. */
const HOME_API = /\/api\/(income-statement|account-balances|trial-balance|general-ledger|account-statement)/
const HOME_LIB = /from\s+["']@\/lib\/ledger["']/

/** شاشةُ تقرير: تحت app/reports أو app/dashboard. */
function isReportScreen(rel) {
  return /^app[/\\](reports|dashboard)[/\\]/.test(String(rel || ""))
}

/** تقرأُ سطورَ اليوميّةِ بنفسِها. */
function readsLedgerDirectly(src) {
  return /journal_entry_lines/.test(String(src || ""))
}

/** تمرُّ ببيتٍ معتمَد. */
function goesThroughAHome(src) {
  const s = String(src || "")
  return HOME_API.test(s) || HOME_LIB.test(s)
}

/** الشاشاتُ التى تحسبُ لنفسِها، مرتَّبةً بالاسم. */
function screensWithASecondPath(files) {
  return (files || [])
    .filter((f) => isReportScreen(f.rel) && readsLedgerDirectly(f.src) && !goesThroughAHome(f.src))
    .map((f) => f.rel)
    .sort()
}

// ═══════════════════════════════ الفخُّ الذاتىّ ═══════════════════════════════
if (process.argv.includes("--selftest")) {
  let bad = 0
  const t = (label, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) console.log(`  ok  ${label}  (توقّعتُ ${w} فجاء ${g})`)
    else { console.error(`X   ${label}  (توقّعتُ ${w} فجاء ${g})`); bad++ }
  }
  const F = (rel, src) => ({ rel, src })

  t("يرى شاشةَ تقريرٍ تحت reports", isReportScreen("app/reports/x/page.tsx"), true)
  t("ويراها تحت dashboard", isReportScreen("app/dashboard/_widgets/w.tsx"), true)
  t("ويقبلُ الفاصلَ الخلفىَّ كما تكتبُه ويندوز", isReportScreen("app\\reports\\x\\page.tsx"), true)
  t("ولا يحاكمُ مسارَ خادمٍ ليس شاشة", isReportScreen("app/api/income-statement/route.ts"), false)
  t("ولا محرِّكَ ترحيلٍ فى lib — فمن يكتبُ القيدَ ليس تقريراً", isReportScreen("lib/accrual-ledger.ts"), false)
  t("ولا شاشةً ليست تقريراً", isReportScreen("app/invoices/page.tsx"), false)

  t("ويرى القراءةَ المباشرةَ لسطورِ اليوميّة", readsLedgerDirectly("from('journal_entry_lines')"), true)
  t("ولا يخدعه اسمُ جدولٍ آخر", readsLedgerDirectly("from('journal_entries')"), false)

  t("ويرى المرورَ ببيتِ قائمةِ الدخل", goesThroughAHome("fetch('/api/income-statement?from=a')"), true)
  t("ويرى المرورَ ببيتِ الأرصدة", goesThroughAHome("fetch(`/api/account-balances?companyId=${x}`)"), true)
  t("ويرى استيرادَ بيتِ الدفتر", goesThroughAHome("import { computeBalanceSheetTotalsFromBalances } from \"@/lib/ledger\""), true)
  t("ولا يخدعه بيتٌ يشبهُ اسمَه", goesThroughAHome("fetch('/api/account-balances-legacy')"), true)
  t("ولا مسارٌ ليس بيتاً", goesThroughAHome("fetch('/api/my-own-summary')"), false)
  t("ولا استيرادٌ من مكانٍ آخر", goesThroughAHome("import { x } from '@/lib/ledger-helpers'"), false)

  t("فتسقطُ شاشةٌ تحسبُ لنفسِها",
    screensWithASecondPath([F("app/reports/a/page.tsx", "supabase.from('journal_entry_lines')")]),
    ["app/reports/a/page.tsx"])
  t("وتمرُّ شاشةٌ تنادى البيت",
    screensWithASecondPath([F("app/reports/b/page.tsx", "fetch('/api/income-statement'); journal_entry_lines")]),
    [])
  t("وتمرُّ شاشةٌ لا تقرأُ الدفترَ أصلاً",
    screensWithASecondPath([F("app/reports/c/page.tsx", "fetch('/api/products')")]),
    [])
  t("ولا يُحاكَمُ محرِّكُ الترحيل",
    screensWithASecondPath([F("lib/accrual-ledger.ts", "insert into journal_entry_lines")]),
    [])
  t("ويُسمّى كلَّ مخالفةٍ مرتَّبين",
    screensWithASecondPath([F("app/reports/z/page.tsx", "journal_entry_lines"), F("app/reports/a/page.tsx", "journal_entry_lines")]),
    ["app/reports/a/page.tsx", "app/reports/z/page.tsx"])
  t("ويقبلُ الفراغَ بلا صراخ", screensWithASecondPath([]), [])

  console.log(`  الفخُّ الذاتىّ: 20 اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة" : `منها ${bad} سقط`}.`)
  process.exit(bad === 0 ? 0 : 1)
}

// ═══════════════════════════════ القياسُ الحىّ ═══════════════════════════════
let files
try {
  ;({ files } = projectCodeFiles({ cwd: process.cwd() }))
} catch (e) {
  console.error("X " + (e && e.message ? e.message : String(e)))
  process.exit(1)
}

// **وبحثٌ لا يجد ليس دليلَ غياب.**
const screens = files.filter((f) => isReportScreen(f.rel))
if (screens.length === 0) {
  console.error("X لا شاشةَ تقريرٍ واحدةٍ فى الجرد — هذا ليس براءةً بل قياسٌ فاشل.")
  process.exit(1)
}

const offenders = screensWithASecondPath(files)

console.log(`  شاشاتُ التقارير: ${screens.length}   ·   تقرأُ الدفترَ بنفسِها: ${offenders.length}   (المُثبَّت ${PINNED})`)

if (offenders.length > PINNED) {
  console.error(`X شاشةٌ جديدةٌ تحسبُ رقماً محاسبيّاً بنفسِها — ولا مسارَ بديلٍ لرقمٍ له بيت.`)
  for (const o of offenders) console.error(`      - ${o}`)
  process.exit(1)
}
if (offenders.length < PINNED) {
  console.error(
    `X تقرأُ الدفترَ بنفسِها ${offenders.length} والمُثبَّتُ ${PINNED} — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n` +
    `      أنزِلِ الرقمَ فى الدفعةِ التى كسبَتْه: const PINNED = ${offenders.length}`
  )
  process.exit(1)
}

if (process.argv.includes("--list")) for (const o of offenders) console.log(`      - ${o}`)

console.log(
  "+ لا شاشةَ تقريرٍ تحسبُ رقماً محاسبيّاً بنفسِها فوقَ الدَّينِ المُثبَّت " +
  `(${offenders.length} باقية، مُثبَّتةٌ عند ${PINNED}؛ البيوتُ المعتمَدة: income-statement · account-balances · trial-balance · general-ledger · account-statement · @/lib/ledger).`
)
console.log("  ! ومعدودٌ لا مسكوتٌ عنه — يُحوَّلْنَ على دفعاتٍ مقيسة:")
for (const o of offenders) console.log(`      - ${o}`)
