#!/usr/bin/env node
/**
 * check-money-is-rounded-by-its-currency.js
 * ---------------------------------------------------------------------------
 * v3.75.77 — «والتقريبُ يسألُ العملةَ ولا يفترضُ خانتين».
 *
 * القياسُ الذى أنجبَ هذا الحارس (2026-08-21):
 *   • اتّسعَ الدفترُ إلى أربعِ خاناتٍ (v3.75.76)، لكنَّ **التقريبَ نفسَه** ظلَّ
 *     مكتوباً باليدِ فى مئاتِ المواضعِ يقولُ «خانتان» بلا سؤال. فعملةٌ ذاتُ
 *     ثلاثِ خاناتٍ يتّسعُ لها العمودُ ثمَّ **يقصُّها التقريبُ قبلَ أن تصلَه**.
 *   • 80 موضعَ ROUND(‎…, 2) فى 52 دالّةَ قاعدة.
 *   • 718 موضعَ toFixed(2) و42 موضعَ Math.round(x*100)/100 فى شيفرةِ التطبيق
 *     (المواضعُ لا الأسطر: سطرٌ واحدٌ قد يحملُ أكثرَ من موضع).
 *   • ودالّةُ الشيفرةِ التى **كان يُفترَضُ** أن تسألَ عن الخاناتِ كانت تقرأُ
 *     جدولَ `currencies` — الفارغَ فى الإنتاجِ (صفرُ صفّ) والمربوطَ بشركةٍ
 *     أصلاً — فترتدُّ إلى اثنتين لكلِّ عملة **وهى تظنُّ أنّها سألت**.
 *
 * القوانينُ الخمسةُ التى يحرسُها:
 *
 *   (١) **للتقريبِ بيتٌ فى كلِّ جانب**: `erp_round_money` فى القاعدة يسألُ
 *       `erp_currency_decimals`، و`roundMoney`/`moneyDecimals` فى الشيفرةِ
 *       يسألانِ الجردَ المحكوم. وكلاهما **يصرخُ ولا يخترعُ اثنتين**.
 *   (٢) **وللبيتِ مُنادٍ حقيقىّ**: بيتٌ لا يطرقُه أحدٌ زينةٌ على بابٍ لا
 *       يُفتَح (قانونُ v3.75.25/29/61). فيُقاسُ أنَّ مسارَ ترحيلٍ حقيقيّاً
 *       ينادِيه فعلاً.
 *   (٣) **ولا يُقرَّبُ أدقَّ ممّا يحفظُه الدفتر**: البيتُ يقرأُ سعةَ الدفترِ
 *       من العمودِ نفسِه، لا من رقمٍ مكتوبٍ فيه يتخلّفُ عن القاعدةِ حين تتّسع.
 *   (٤) **والتقريبُ اليدوىُّ معدودٌ لا مسكوتٌ عنه**: أربعةُ أرقامٍ مُثبَّتة،
 *       لا تنمو أبداً، وكلُّ نقصانٍ يُثبَّتُ فى الدفعةِ التى كسبَتْه —
 *       **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.
 *   (٥) **ولا بيتٌ ثالث**: لا أحدَ يعودُ يسألُ `currencies.decimals` عن عددِ
 *       خاناتِ عملة — فذلك الجدولُ يُجيبُ سؤالاً آخَرَ وهو فارغٌ أصلاً.
 *   (٦) **والوعاءُ لا يكونُ أضيقَ من العملة** (v3.75.78): متغيّرٌ محلّىٌّ
 *       مُعلَنٌ NUMERIC(‎…,2) يقصُّ المالَ إلى خانتين **بعدَ** أن يُقرِّبَه
 *       البيتُ صحيحاً، فيصيرُ التحويلُ زينةً ويصيرُ القيدُ غيرَ متوازنٍ إن
 *       حُوِّلَ طرفٌ دونَ طرف. معدودٌ ومُثبَّتٌ ولا ينمو.
 *
 * سجلُّ الأعدادِ المُثبَّتة — يُضافُ إليه ولا يُجمَّلُ ما مضى:
 *
 *   • v3.75.77 (2026-08-21): القاعدةُ 77 موضعاً فى 51 دالّة (كانت 80 فى 52،
 *     وحُوِّلَت ثلاثةٌ فى `post_expense_atomic`)، والشيفرةُ 718 toFixed(2)
 *     و42 Math.round(x*100)/100 — لم يُمَسَّ منها شىءٌ بعد.
 *
 *   • v3.75.78 (2026-08-21): القاعدةُ **68 موضعاً فى 46 دالّة** — حُوِّلَتْ
 *     تسعةُ مواضعَ فى خمسِ دوالٍّ تكتبُ فى الدفترِ وتعرفُ عملتَها:
 *     confirm_purchase_return_delivery_v2 (4)، process_purchase_return_multi_warehouse (2)،
 *     plw_pay_labour_payment، run_fx_revaluation، process_purchase_return_atomic.
 *     والشيفرةُ كما هى (718 و42) — لم تُمَسَّ فى هذه الدفعة.
 *     **ولم يُحوَّلْ post_payroll_atomic وفيه موضعان**: أوعيتُه NUMERIC(15,2)
 *     تقصُّ ما يُقرَّبُ، ولو حُوِّلَ طرفُ المَدينِ وحدَه لاختلَّ توازنُ القيدِ
 *     لعملةٍ ثلاثيّة — فنصفُ العلاجِ أذى. ومنه وُلِدَ القانونُ (٦): **18 وعاءً
 *     مُعلَناً بخانتين فى 8 دوالّ**، مُثبَّتةً اليومَ لتُحوَّلَ على دفعةٍ مقيسة.
 *
 * نقطةٌ عمياءُ معلومة: هذا الفحصُ يقرأُ الملفّاتِ ولقطةَ الدوالّ، فيقيسُ
 * **الشكلَ المكتوب** لا الأثرَ الحىّ. وأنَّ البيتَ يُعطى الرقمَ الصحيحَ
 * فعلاً يُثبتُه برهانُ الهجرةِ داخلَ معاملتِها — ولا يُقاسُ هنا.
 *
 * Usage: node scripts/check-money-is-rounded-by-its-currency.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")
// **ولا يُكتَبُ جردُ الشيفرةِ باليدِ هنا**: يُنادى البيتُ الواحد (v3.75.35)
// فيُقرَأُ الجردُ من المستودعِ لا من القرص، ويدخلُ فيه أىُّ مجلّدٍ جديدٍ تلقائيّاً.
const { projectCodeFiles } = require("./lib/repo-code-files")

const ROOT = path.resolve(__dirname, "..")

const PINNED_DB_SITES = 68
const PINNED_DB_FUNCTIONS = 46
const PINNED_TOFIXED2 = 718
const PINNED_MATHROUND100 = 42

/**
 * (v3.75.78) فئةُ العيبِ المكتشَفةُ حديثاً: **وعاءٌ أضيقُ من العملة**.
 * متغيّرٌ محلّىٌّ أو تحويلٌ مُعلَنٌ NUMERIC(‎…,2) يقصُّ المالَ إلى خانتين
 * **بعدَ** أن يُقرِّبَه البيتُ صحيحاً — فيصيرُ التحويلُ زينةً. معدودٌ ومُثبَّت.
 */
const PINNED_NARROW_CONTAINERS = 18
const PINNED_NARROW_FUNCTIONS = 8

/**
 * المساراتُ التى حُوِّلَتْ فعلاً — ويجبُ أن تبقى محوَّلة:
 * لكلٍّ عددُ نداءاتِ البيتِ الذى كسبَتْه، **وصفرُ تقريبٍ يدوىٍّ باقٍ فيها**.
 * الرجوعُ خطوةً هنا نقضٌ للقانون، لا «تعديلٌ صغير».
 */
const CONVERTED = [
  { name: "post_expense_atomic", calls: 3, since: "v3.75.77" },
  { name: "confirm_purchase_return_delivery_v2", calls: 4, since: "v3.75.78" },
  { name: "plw_pay_labour_payment", calls: 1, since: "v3.75.78" },
  { name: "run_fx_revaluation", calls: 1, since: "v3.75.78" },
  { name: "process_purchase_return_atomic", calls: 1, since: "v3.75.78" },
  { name: "process_purchase_return_multi_warehouse", calls: 2, since: "v3.75.78" },
]
const CONVERTED_CALLS_TOTAL = CONVERTED.reduce((a, c) => a + c.calls, 0)

// ─────────────────────────── الجزءُ الخالصُ من المنطق ───────────────────────

const ROUND2 = /round\s*\([^;]{0,120}?,\s*2\s*\)/gi
const TOFIXED2 = /toFixed\(2\)/g
const MATHROUND100 = /Math\.round\([^)]*\*\s*100\s*\)\s*\/\s*100/g
/** وعاءٌ مُعلَنٌ بخانتين — يقصُّ ما قرَّبَه البيتُ صحيحاً (v3.75.78). */
const NARROW_NUMERIC2 = /numeric\s*\(\s*\d+\s*,\s*2\s*\)/gi

/** عددُ مواضعِ ROUND(‎…, 2) فى نصٍّ ما. */
function countRound2(sql) {
  return (sql.match(ROUND2) || []).length
}

/** الدوالُّ التى تحملُ تقريباً يدويّاً، ومواضعُ كلٍّ منها. */
function scanFunctionRoundings(functionsSql) {
  const blocks = functionsSql.split(/(?=CREATE OR REPLACE FUNCTION )/)
  const out = []
  for (const b of blocks) {
    const m = /^CREATE OR REPLACE FUNCTION ([\w.]+)\(/.exec(b)
    if (!m) continue
    const n = countRound2(b)
    if (n > 0) out.push({ name: m[1], sites: n })
  }
  return out
}

/** هل ينادى نصُّ الدالّةِ بيتَ التقريب؟ */
function callsRoundHome(functionsSql, functionName) {
  const blocks = functionsSql.split(/(?=CREATE OR REPLACE FUNCTION )/)
  for (const b of blocks) {
    const m = /^CREATE OR REPLACE FUNCTION ([\w.]+)\(/.exec(b)
    if (!m) continue
    if (m[1] !== "public." + functionName && m[1] !== functionName) continue
    return (b.match(/public\.erp_round_money\s*\(/g) || []).length
  }
  return -1
}

/** كم موضعَ تقريبٍ يدوىٍّ بقىَ داخلَ دالّةٍ بعينِها؟ (‎-1 إن لم تُوجَد) */
function handRoundingIn(functionsSql, functionName) {
  const blocks = functionsSql.split(/(?=CREATE OR REPLACE FUNCTION )/)
  for (const b of blocks) {
    const m = /^CREATE OR REPLACE FUNCTION ([\w.]+)\(/.exec(b)
    if (!m) continue
    if (m[1] !== "public." + functionName && m[1] !== functionName) continue
    return countRound2(b)
  }
  return -1
}

/** الأوعيةُ المُعلَنةُ بخانتين، ومواضعُها فى كلِّ دالّة. */
function scanNarrowContainers(functionsSql) {
  const blocks = functionsSql.split(/(?=CREATE OR REPLACE FUNCTION )/)
  const out = []
  for (const b of blocks) {
    const m = /^CREATE OR REPLACE FUNCTION ([\w.]+)\(/.exec(b)
    if (!m) continue
    const n = (b.match(NARROW_NUMERIC2) || []).length
    if (n > 0) out.push({ name: m[1], sites: n })
  }
  return out
}

/** (١) البيوتُ قائمةٌ وتصرخُ ولا تخترع. */
function judgeHomes(functionsSql, utilsSrc) {
  const problems = []

  if (!/CREATE OR REPLACE FUNCTION public\.erp_round_money\s*\(/.test(functionsSql)) {
    problems.push("بيتُ التقريبِ فى القاعدة (erp_round_money) غيرُ موجودٍ فى لقطةِ الدوالّ")
  } else {
    if (!/erp_round_money[\s\S]{0,2000}erp_currency_decimals/.test(functionsSql)) {
      problems.push("بيتُ التقريبِ لا يسألُ erp_currency_decimals — فهو يفترضُ الخاناتِ لا يقرؤها")
    }
    if (!/erp_round_money[\s\S]{0,2000}LEDGER_SCALE_UNKNOWN/.test(functionsSql)) {
      problems.push("بيتُ التقريبِ لا يصرخُ حين تتعذّرُ قراءةُ سعةِ الدفتر")
    }
  }

  if (!/export function moneyDecimals\s*\(/.test(utilsSrc)) {
    problems.push("بيتُ الخاناتِ فى الشيفرة (moneyDecimals) غيرُ موجود")
  } else if (!/CURRENCY_DECIMALS_UNKNOWN/.test(utilsSrc)) {
    problems.push("moneyDecimals لا يصرخُ عندَ عملةٍ لا يعرفُها — والصمتُ هنا اختراعُ رقم")
  }

  if (!/export function roundMoney\s*\(/.test(utilsSrc)) {
    problems.push("بيتُ التقريبِ فى الشيفرة (roundMoney) غيرُ موجود")
  } else if (!/roundMoney[\s\S]{0,400}moneyDecimals\s*\(/.test(utilsSrc)) {
    problems.push("roundMoney لا يسألُ moneyDecimals — بيتانِ لا بيتٌ واحد")
  }

  return problems
}

/** (٢)+(٣) البيتُ مطروقٌ فعلاً، ولا يتجاوزُ سعةَ الدفتر. */
function judgeHomeIsKnocked(functionsSql, converted = CONVERTED) {
  const problems = []
  for (const c of converted) {
    const calls = callsRoundHome(functionsSql, c.name)
    if (calls === -1) {
      problems.push(`الدالّةُ المُحوَّلةُ ${c.name} (${c.since}) غيرُ موجودةٍ فى لقطةِ الدوالّ`)
      continue
    }
    if (calls < c.calls) {
      problems.push(
        `${c.name} تنادى بيتَ التقريبِ ${calls} مرّةً والمُثبَّتُ ${c.calls} (${c.since}) — ` +
          "إمّا عادَ التقريبُ اليدوىُّ وإمّا صارَ البيتُ زينةً على بابٍ لا يُفتَح"
      )
    }
    // ومسارٌ حُوِّلَ لا يعودُ: صفرُ تقريبٍ يدوىٍّ فيه، وإلّا فقد رجعْنا خطوة.
    const left = handRoundingIn(functionsSql, c.name)
    if (left > 0) {
      problems.push(
        `${c.name} عادَ فيها ${left} موضعَ ROUND(‎…,2) بعدَ أن حُوِّلَتْ فى ${c.since} — ` +
          "**والرجوعُ خطوةً نقضٌ للقانونِ لا تعديلٌ صغير**"
      )
    }
  }
  if (!/erp_round_money[\s\S]{0,2000}journal_entry_lines[\s\S]{0,400}debit_amount/.test(functionsSql)) {
    problems.push("بيتُ التقريبِ لا يقرأُ سعةَ الدفترِ من العمودِ نفسِه — رقمٌ مكتوبٌ يتخلّفُ عن القاعدة")
  }
  return problems
}

/** (٤) الأعدادُ المُثبَّتةُ لا تنمو، والنقصانُ يُثبَّت. */
function judgePinned(label, actual, pinned) {
  if (actual === pinned) return []
  if (actual > pinned) {
    return [`${label}: ${actual} والمُثبَّتُ ${pinned} — **زادَ التقريبُ اليدوىّ**؛ يُحوَّلُ الجديدُ إلى البيت`]
  }
  return [
    `${label}: ${actual} والمُثبَّتُ ${pinned} — نقصَ (وهذا خير)، ` +
      "ويُثبَّتُ الرقمُ الجديدُ فى الدفعةِ التى كسبَتْه؛ ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه",
  ]
}

/** (٥) ولا بيتٌ ثالث: لا أحدَ يسألُ جدولَ العملاتِ عن الخانات. */
function judgeNoThirdHome(files) {
  const problems = []
  for (const { rel, src } of files) {
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
    if (/from\s*\(\s*['"`]currencies['"`]\s*\)[\s\S]{0,200}decimals/.test(stripped)) {
      problems.push(`${rel} — يسألُ جدولَ currencies عن عددِ الخانات، وهو بيتٌ آخَرُ وفارغ`)
    }
  }
  return problems
}

// ─────────────────────────── الفخُّ الذاتىّ ─────────────────────────────────

function selfTest() {
  const traps = []
  const t = (name, fn) => traps.push([name, fn])

  t("يعُدُّ موضعَ تقريبٍ يدوىٍّ واحداً", () => countRound2("x := ROUND(a + b, 2);") === 1)
  t("ويعُدُّ حالةَ الحروفِ الصغيرة", () => countRound2("select round(sum(x), 2)") === 1)
  t("ولا يعدُّ تقريباً بثلاثِ خانات", () => countRound2("ROUND(x, 3)") === 0)
  t("ولا يعدُّ نداءَ البيتِ تقريباً يدويّاً", () =>
    countRound2("v := public.erp_round_money(a, v_cur);") === 0)

  t("يرى الدوالَّ التى تحملُ تقريباً يدويّاً", () => {
    const sql =
      "CREATE OR REPLACE FUNCTION public.a(x int)\nAS $$ ROUND(y,2) $$;\n" +
      "CREATE OR REPLACE FUNCTION public.b(x int)\nAS $$ nothing $$;\n"
    const r = scanFunctionRoundings(sql)
    return r.length === 1 && r[0].name === "public.a" && r[0].sites === 1
  })

  t("**بيتٌ غائبٌ → يُرفَض**", () =>
    judgeHomes("", "export function roundMoney(){}").length >= 2)

  t("وبيتٌ لا يسألُ الخاناتِ → يُرفَض", () =>
    judgeHomes(
      "CREATE OR REPLACE FUNCTION public.erp_round_money(a numeric, b text) AS $$ round(a,2) $$;",
      ""
    ).some((p) => p.includes("erp_currency_decimals")))

  t("وroundMoney لا يسألُ moneyDecimals → يُرفَض", () =>
    judgeHomes(
      "",
      "export function moneyDecimals(){ throw new Error('CURRENCY_DECIMALS_UNKNOWN') }\nexport function roundMoney(v){ return Math.round(v*100)/100 }"
    ).some((p) => p.includes("بيتانِ لا بيتٌ واحد")))

  const ONE = [{ name: "f_x", calls: 3, since: "vTEST" }]
  const LEDGER_READ =
    "CREATE OR REPLACE FUNCTION public.erp_round_money(a numeric, b text)\n" +
    "AS $$ journal_entry_lines ... debit_amount $$;\n"
  const THREE_CALLS =
    "CREATE OR REPLACE FUNCTION public.f_x(a uuid)\nAS $$ public.erp_round_money(1,'EGP');" +
    " public.erp_round_money(2,'EGP'); public.erp_round_money(3,'EGP'); $$;\n"

  t("**والبيتُ بلا مُنادٍ → يُرفَض** — زينةٌ على بابٍ لا يُفتَح", () =>
    judgeHomeIsKnocked(
      "CREATE OR REPLACE FUNCTION public.f_x(a uuid)\nAS $$ ROUND(x,2) $$;", ONE
    ).some((p) => p.includes("زينةً على بابٍ لا يُفتَح")))

  t("ويُبرَّأُ حين ينادِيه ثلاثاً ويقرأُ سعةَ الدفتر", () =>
    judgeHomeIsKnocked(LEDGER_READ + THREE_CALLS, ONE).length === 0)

  t("**ومسارٌ حُوِّلَ ثمَّ عادَ فيه تقريبٌ يدوىٌّ → يُرفَض**", () =>
    judgeHomeIsKnocked(
      LEDGER_READ +
        "CREATE OR REPLACE FUNCTION public.f_x(a uuid)\nAS $$ public.erp_round_money(1,'EGP');" +
        " public.erp_round_money(2,'EGP'); public.erp_round_money(3,'EGP'); ROUND(y,2); $$;\n",
      ONE
    ).some((p) => p.includes("الرجوعُ خطوةً نقضٌ للقانون")))

  t("ودالّةٌ مُحوَّلةٌ اختفت → يُرفَض", () =>
    judgeHomeIsKnocked(LEDGER_READ, ONE).some((p) => p.includes("غيرُ موجودةٍ")))

  t("**ويرى وعاءً مُعلَناً بخانتين**", () => {
    const r = scanNarrowContainers(
      "CREATE OR REPLACE FUNCTION public.a(x int)\nAS $$ DECLARE v NUMERIC(15,2); w numeric(18,4); $$;\n"
    )
    return r.length === 1 && r[0].sites === 1
  })

  t("ولا يعدُّ وعاءً واسعاً ضيّقاً", () =>
    scanNarrowContainers(
      "CREATE OR REPLACE FUNCTION public.a(x int)\nAS $$ DECLARE v NUMERIC(18,4); $$;\n"
    ).length === 0)

  t("والعددُ المُثبَّتُ يمرُّ حين يُطابق", () => judgePinned("x", 5, 5).length === 0)
  t("**ويرفضُ الزيادة**", () => judgePinned("x", 6, 5).some((p) => p.includes("زادَ")))
  t("ويرفضُ نقصاناً لم يُثبَّتْ", () => judgePinned("x", 4, 5).some((p) => p.includes("نقص")))

  t("**ويرى بيتاً ثالثاً يسألُ جدولَ العملات**", () =>
    judgeNoThirdHome([
      { rel: "x.ts", src: "const { data } = await supabase.from('currencies').select('decimals')" },
    ]).length === 1)

  t("ولا يخدعه ذكرٌ داخلَ تعليق", () =>
    judgeNoThirdHome([
      { rel: "x.ts", src: "// from('currencies').select('decimals') كان هنا وحُذف" },
    ]).length === 0)

  t("ولا قراءةٌ من جدولِ العملاتِ لغيرِ الخانات", () =>
    judgeNoThirdHome([{ rel: "x.ts", src: "supabase.from('currencies').select('code')" }]).length === 0)

  let failed = 0
  for (const [name, fn] of traps) {
    let ok = false
    try {
      ok = fn() === true
    } catch {
      ok = false
    }
    if (!ok) {
      console.error(`X فخٌّ ذاتىٌّ لم يُصِبْ: ${name}`)
      failed++
    }
  }
  if (failed > 0) {
    console.error(`X ${failed} من ${traps.length} فخّاً ذاتيّاً فشل — الحارسُ لا يُصدَّق.`)
    process.exit(1)
  }
  return traps.length
}

// ─────────────────────────── الحكم ─────────────────────────────────────────

const trapCount = selfTest()

const P = {
  functions: path.join(ROOT, "supabase", "schema", "functions.sql"),
  utils: path.join(ROOT, "lib", "currency-utils.ts"),
}
for (const [k, p] of Object.entries(P)) {
  if (!fs.existsSync(p)) {
    console.error(`X ملفٌّ لازمٌ للفحصِ غيرُ موجود (${k}): ${path.relative(ROOT, p)}`)
    process.exit(1)
  }
}

const functionsSql = fs.readFileSync(P.functions, "utf8")
const utilsSrc = fs.readFileSync(P.utils, "utf8")

const census = projectCodeFiles()
const files = census.files.filter((f) => /\.tsx?$/.test(f.rel) && !/\.test\.tsx?$/.test(f.rel))

const dbFns = scanFunctionRoundings(functionsSql)
const dbSites = dbFns.reduce((a, f) => a + f.sites, 0)

const narrowFns = scanNarrowContainers(functionsSql)
const narrowSites = narrowFns.reduce((a, f) => a + f.sites, 0)

let toFixed2 = 0
let mathRound100 = 0
for (const { src } of files) {
  toFixed2 += (src.match(TOFIXED2) || []).length
  mathRound100 += (src.match(MATHROUND100) || []).length
}

const findings = [
  ["(١) للتقريبِ بيتٌ فى كلِّ جانبٍ يصرخُ ولا يخترع", judgeHomes(functionsSql, utilsSrc)],
  ["(٢)+(٣) وللبيتِ مُنادٍ حقيقىّ ولا يتجاوزُ سعةَ الدفتر", judgeHomeIsKnocked(functionsSql)],
  ["(٤) والتقريبُ اليدوىُّ معدودٌ لا ينمو", [
    ...judgePinned("مواضعُ ROUND(‎…,2) فى دوالِّ القاعدة", dbSites, PINNED_DB_SITES),
    ...judgePinned("الدوالُّ التى تحملُها", dbFns.length, PINNED_DB_FUNCTIONS),
    ...judgePinned("toFixed(2) فى الشيفرة", toFixed2, PINNED_TOFIXED2),
    ...judgePinned("Math.round(x*100)/100 فى الشيفرة", mathRound100, PINNED_MATHROUND100),
  ]],
  ["(٥) ولا بيتٌ ثالثٌ يسألُ جدولَ العملاتِ عن الخانات", judgeNoThirdHome(files)],
  ["(٦) والوعاءُ الأضيقُ من العملةِ معدودٌ لا ينمو", [
    ...judgePinned("أوعيةٌ مُعلَنةٌ NUMERIC(‎…,2) فى دوالِّ القاعدة", narrowSites, PINNED_NARROW_CONTAINERS),
    ...judgePinned("الدوالُّ التى تحملُها", narrowFns.length, PINNED_NARROW_FUNCTIONS),
  ]],
]

const broken = findings.filter(([, p]) => p.length > 0)

if (broken.length > 0) {
  console.error("X قانونُ التقريبِ نُقِض:\n")
  for (const [law, problems] of broken) {
    console.error(`  ${law}`)
    for (const p of problems) console.error(`      - ${p}`)
  }
  console.error(
    "\n  إن كانت لقطةُ الدوالِّ قديمةً فأعدْ توليدَها (node scripts/dump-db-functions.js) قبلَ الحكمِ على هذا الفحص."
  )
  process.exit(1)
}

const worst = dbFns.slice().sort((a, b) => b.sites - a.sites).slice(0, 5)
console.log(
  `+ التقريبُ يسألُ العملة: بيتٌ فى القاعدة (erp_round_money) وبيتٌ فى الشيفرة (roundMoney)، ` +
    `و${CONVERTED.length} مساراتٍ مُحوَّلةٍ تنادِيه ${CONVERTED_CALLS_TOTAL} مرّة · ` +
    `وما زالَ يدويّاً: ${dbSites} موضعاً فى ${dbFns.length} دالّةً بالقاعدة، ` +
    `و${toFixed2} toFixed(2) و${mathRound100} Math.round(×100) فى ${files.length} ملفَّ شيفرة · ` +
    `و${narrowSites} وعاءً بخانتين فى ${narrowFns.length} دالّة · ` +
    `${trapCount} فخّاً ذاتيّاً.`
)
console.log("  ! ومعدودٌ لا مسكوتٌ عنه — يُحوَّلون على دفعاتٍ مقيسة، والأثقلُ أوّلاً:")
for (const f of worst) console.log(`      - ${f.name}   (${f.sites} موضعاً)`)
