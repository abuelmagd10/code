#!/usr/bin/env node
/**
 * check-a-currency-knows-its-decimals.js
 * ---------------------------------------------------------------------------
 * v3.75.75 — «وعددُ الخاناتِ يُقرَأُ ولا يُفترَض، ولا يُعرَضُ على عميلٍ ما لا
 * يتّسعُ له الدفتر».
 *
 * القياسُ الذى أنجبَ هذا الحارس (2026-08-20):
 *   • جدولُ العملاتِ فى الإنتاج **فارغ** (صفرُ صفّ)، فالدالّةُ التى تسألُ عن
 *     عددِ الخاناتِ كانت ترتدُّ دائماً إلى اثنتين لكلِّ عملة.
 *   • الدالّةُ المحكومةُ للتقريب (roundToDecimals) لها **صفرُ مستدعٍ**، ومثلُها
 *     convertCurrency — بيتٌ مبنىٌّ ومهجور.
 *   • جردُ العملاتِ فى الشيفرةِ كان يحملُ 12 عملةً بينما شاشةُ التسجيلِ تعرضُ
 *     24 — والباقياتُ تُنسَّقُ بجردِ الجنيهِ المصرى. **وفيه خطأٌ مقيس**: الليرةُ
 *     اللبنانيّةُ بلا خانات، والمعيارُ الدولىُّ يقولُ خانتان.
 *   • وعمودا المدينِ والدائنِ فى الدفترِ بمقياسِ خانتين، فقيدٌ كويتىٌّ متوازنٌ
 *     (3.375 × 3 = 10.125) يُحفَظُ 10.13 مقابل 10.14 ويُرفَضُ ترحيلُه.
 *
 * القوانينُ الخمسةُ التى يحرسُها:
 *
 *   (١) للقاعدةِ بيتٌ واحدٌ يقولُ كم خانةً لكلِّ عملة: جدولُ
 *       `currency_minor_units` ودالّةُ `erp_currency_decimals`.
 *   (٢) جردُ الشيفرةِ يُغطّى كلَّ عملةٍ تعرضُها شاشةُ التسجيلِ على عميل — فلا
 *       عملةٌ تُعرَضُ ولا جردَ لها فتُنسَّقَ بجردِ غيرِها.
 *   (٣) جردُ الشيفرةِ وبذرةُ القاعدةِ يقولانِ **نفسَ الرقم**، وكلاهما يُطابقُ
 *       المعيارَ الدولىَّ ISO 4217 المكتوبَ فى هذا الحارس. جردانِ يتناقضانِ
 *       هو العطبُ الأصلىُّ الذى أنجبَ الدفعة.
 *   (٤) قائمةُ العملاتِ غيرِ المخدومةِ **تُشتَقُّ ولا تُكتَبُ بيد** — وإلّا
 *       صارَ جردٌ ثالثٌ يُنسى تحديثُه.
 *   (٥) **والقانونُ يقرأُ سعةَ الدفترِ ويحكمُ بها**: ما دامَ عمودُ المدينِ
 *       يحفظُ أقلَّ من ثلاثِ خانات، فكلُّ عملةٍ خاناتُها ليست اثنتين تُعرَضُ
 *       **مقفولةً** على شاشةِ التسجيل. وفورَ أن يتّسعَ الدفترُ ينقلبُ الحكمُ
 *       من نفسِه: تصيرُ القائمةُ **مُلزَمةً أن تفرغ** — فلا يُنسى فتحُ البابِ
 *       بعدَ أن صارَ يُفتَح.
 *
 * نقطةٌ عمياءُ معلومة: هذا الفحصُ يقرأُ الملفّاتِ ولقطةَ القاعدة، فيُطابقُ
 * بذرةَ الهجرةِ بجردِ الشيفرة. أمّا أنَّ صفوفَ القاعدةِ الحيّةَ تُطابقُ بذرةَ
 * الهجرةِ فيحرسُه أنَّ الهجرةَ تُطبَّقُ حرفيّاً — ولا يُقاسُ هنا.
 *
 * Usage: node scripts/check-a-currency-knows-its-decimals.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")

/**
 * المعيارُ الدولىُّ ISO 4217 — الوحدةُ الصغرى لكلِّ عملةٍ يعرضُها المشروع.
 * مكتوبٌ هنا عمداً: الحارسُ يحملُ الحقيقةَ التى يُحاكمُ بها، فلا يُطابقُ
 * جردَينِ ببعضِهما ويسكتُ لو أخطآ معاً.
 */
const ISO_4217 = {
  EGP: 2, USD: 2, EUR: 2, GBP: 2, SAR: 2, AED: 2, QAR: 2,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3,
  JPY: 0, LBP: 2,
  MAD: 2, DZD: 2, SYP: 2, YER: 2, SDG: 2, TRY: 2, INR: 2, CNY: 2,
}

// ─────────────────────────── الجزءُ الخالصُ من المنطق ───────────────────────

/** جردُ الشيفرة: code → decimals، من كتلةِ CURRENCIES فى lib/currency-utils.ts */
function parseCodeVocabulary(src) {
  const out = {}
  const start = src.indexOf("export const CURRENCIES")
  if (start === -1) return out
  const block = src.slice(start, src.indexOf("\n}", start))
  const re = /([A-Z]{3}):\s*\{[^}]*decimals:\s*(\d)\s*\}/g
  let m
  while ((m = re.exec(block))) out[m[1]] = Number(m[2])
  return out
}

/** أكوادُ العملاتِ التى تعرضُها شاشةُ التسجيل. */
function parseSignupCodes(src) {
  const out = []
  const start = src.indexOf("const CURRENCIES = [")
  if (start === -1) return out
  const block = src.slice(start, src.indexOf("\n]", start))
  const re = /code:\s*"([A-Z]{3})"/g
  let m
  while ((m = re.exec(block))) out.push(m[1])
  return out
}

/** بذرةُ الهجرة: code → decimals، من جملةِ INSERT. */
function parseMigrationSeed(src) {
  const out = {}
  const start = src.indexOf("INSERT INTO public.currency_minor_units")
  if (start === -1) return out
  const block = src.slice(start, src.indexOf("ON CONFLICT", start))
  const re = /\('([A-Z]{3})',\s*(\d)\)/g
  let m
  while ((m = re.exec(block))) out[m[1]] = Number(m[2])
  return out
}

/** سعةُ الدفتر: عددُ الخاناتِ التى يحفظُها عمودُ المدينِ فعلاً. */
function parseLedgerScale(schemaSql) {
  const m = /CREATE TABLE(?: IF NOT EXISTS)? public\.journal_entry_lines\s*\(([\s\S]*?)\n\);/.exec(schemaSql)
  if (!m) return null
  const col = /debit_amount\s+numeric\(\s*\d+\s*,\s*(\d+)\s*\)/.exec(m[1])
  return col ? Number(col[1]) : null
}

/** (١)+(٣) البيتُ قائمٌ، والجردانِ يقولانِ ما يقولُه المعيار. */
function judgeHomes(schemaSql, functionsSql, seed, vocab) {
  const problems = []
  if (!/CREATE TABLE(?: IF NOT EXISTS)? public\.currency_minor_units/.test(schemaSql)) {
    problems.push("جدولُ currency_minor_units غيرُ موجودٍ فى لقطةِ القاعدة — لا بيتَ يُسأل")
  }
  if (!/FUNCTION public\.erp_currency_decimals/.test(functionsSql)) {
    problems.push("دالّةُ erp_currency_decimals غيرُ موجودةٍ فى لقطةِ الدوالّ")
  }
  if (!/CURRENCY_DECIMALS_UNKNOWN/.test(functionsSql)) {
    problems.push("الدالّةُ لا تصرخُ عندَ عملةٍ لا تعرفُها — والصمتُ هنا اختراعُ رقم")
  }
  for (const [code, iso] of Object.entries(ISO_4217)) {
    if (seed[code] === undefined) problems.push(`بذرةُ الهجرةِ لا تعرفُ ${code}`)
    else if (seed[code] !== iso) problems.push(`بذرةُ الهجرةِ تقولُ ${code}=${seed[code]} والمعيارُ يقولُ ${iso}`)
    if (vocab[code] === undefined) problems.push(`جردُ الشيفرةِ لا يعرفُ ${code}`)
    else if (vocab[code] !== iso) problems.push(`جردُ الشيفرةِ يقولُ ${code}=${vocab[code]} والمعيارُ يقولُ ${iso}`)
  }
  return problems
}

/** (٢) لا عملةٌ تُعرَضُ على عميلٍ ولا جردَ لها. */
function judgeSignupCoverage(signupCodes, vocab) {
  const problems = []
  if (signupCodes.length === 0) return ["تعذّرت قراءةُ قائمةِ عملاتِ شاشةِ التسجيل"]
  for (const code of signupCodes) {
    if (vocab[code] === undefined) {
      problems.push(`${code} تُعرَضُ على شاشةِ التسجيلِ ولا جردَ لها — فتُنسَّقُ بجردِ عملةٍ أخرى`)
    }
  }
  return problems
}

/** (٤)+(٥) القائمةُ مشتقّة، والقفلُ يتبعُ سعةَ الدفترِ لا الذاكرة. */
function judgeLockMatchesLedger(ledgerScale, vocabSrc, signupSrc, vocab) {
  const problems = []
  if (ledgerScale === null) return ["تعذّرت قراءةُ سعةِ عمودِ المدينِ من لقطةِ القاعدة"]

  if (!/CURRENCIES_NOT_YET_SERVICEABLE[\s\S]{0,400}Object\.entries\(CURRENCIES\)/.test(vocabSrc)) {
    problems.push("قائمةُ غيرِ المخدومةِ ليست مشتقّةً من الجرد — جردٌ ثالثٌ يُنسى تحديثُه")
  }

  const derived = Object.entries(vocab).filter(([, d]) => d !== 2).map(([c]) => c).sort()
  const usesDerived = /CURRENCIES_NOT_YET_SERVICEABLE/.test(signupSrc)
  const disables = /disabled=\{\s*notYet\s*\}/.test(signupSrc)

  if (ledgerScale < 3) {
    if (derived.length === 0) {
      problems.push("لا عملةَ محسوبةٌ غيرَ مخدومةٍ رغمَ أنَّ الدفترَ ما زالَ بخانتين — الجردُ سقطَ منه شىء")
    }
    if (!usesDerived) {
      problems.push(`الدفترُ يحفظُ ${ledgerScale} خانةً، وشاشةُ التسجيلِ لا تقرأُ قائمةَ غيرِ المخدومةِ أصلاً`)
    }
    if (!disables) {
      problems.push("شاشةُ التسجيلِ تعرضُ العملاتِ غيرَ المخدومةِ **قابلةً للاختيار** — والدفترُ لا يتّسعُ لها")
    }
  } else {
    if (derived.length > 0 && usesDerived && disables) {
      problems.push(
        `الدفترُ صارَ يحفظُ ${ledgerScale} خاناتٍ ومع ذلك ما زالت ${derived.length} عملةً مقفولةً ` +
          `(${derived.join("، ")}) — يُرفَعُ القفلُ الآن، ولا يُنسى بابٌ صارَ يُفتَح`
      )
    }
  }
  return problems
}

// ─────────────────────────── الفخُّ الذاتىّ ─────────────────────────────────

function selfTest() {
  const traps = []
  const t = (name, fn) => traps.push([name, fn])
  const VOCAB_OK = { EGP: 2, KWD: 3, JPY: 0 }

  t("يقرأُ سعةَ الدفترِ من اللقطة", () =>
    parseLedgerScale("CREATE TABLE IF NOT EXISTS public.journal_entry_lines (\n  debit_amount numeric(15,2) DEFAULT 0,\n  x int\n);") === 2)

  t("ولا يخدعه جدولُ الأرشيفِ المشابهُ اسمُه", () =>
    parseLedgerScale("CREATE TABLE IF NOT EXISTS public.journal_entry_lines_orphan_archive (\n  debit_amount numeric(18,9)\n);") === null)

  t("ويرى الاتّساعَ حين يقع", () =>
    parseLedgerScale("CREATE TABLE public.journal_entry_lines (\n  debit_amount numeric(20,4) DEFAULT 0\n);") === 4)

  t("يقرأُ جردَ الشيفرة", () =>
    parseCodeVocabulary("export const CURRENCIES = {\n  KWD: { symbol: 'x', decimals: 3 },\n}\n") .KWD === 3)

  t("ويقرأُ بذرةَ الهجرة", () =>
    parseMigrationSeed("INSERT INTO public.currency_minor_units (code, decimals) VALUES\n ('KWD', 3), ('EGP', 2)\nON CONFLICT (code)").KWD === 3)

  t("ويقرأُ أكوادَ شاشةِ التسجيل", () =>
    parseSignupCodes('const CURRENCIES = [\n { code: "KWD", name: "x" },\n]\n').length === 1)

  t("جردٌ يخالفُ المعيار → يُرفَض", () =>
    judgeHomes("CREATE TABLE public.currency_minor_units", "FUNCTION public.erp_currency_decimals CURRENCY_DECIMALS_UNKNOWN",
      { ...ISO_4217 }, { ...ISO_4217, LBP: 0 }).some((p) => p.includes("LBP")))

  t("بذرةٌ تخالفُ المعيار → تُرفَض", () =>
    judgeHomes("CREATE TABLE public.currency_minor_units", "FUNCTION public.erp_currency_decimals CURRENCY_DECIMALS_UNKNOWN",
      { ...ISO_4217, KWD: 2 }, { ...ISO_4217 }).some((p) => p.includes("KWD")))

  t("بيتٌ غائبٌ → يُرفَض", () =>
    judgeHomes("", "", { ...ISO_4217 }, { ...ISO_4217 }).length >= 2)

  t("عملةٌ تُعرَضُ بلا جردٍ → تُرفَض", () =>
    judgeSignupCoverage(["KWD", "ZZZ"], VOCAB_OK).length === 1)

  t("وتُبرَّأُ حين يُغطّيها الجرد", () =>
    judgeSignupCoverage(["KWD", "EGP"], VOCAB_OK).length === 0)

  t("دفترٌ ضيّقٌ وشاشةٌ لا تقفلُ → يُرفَض", () =>
    judgeLockMatchesLedger(2, "CURRENCIES_NOT_YET_SERVICEABLE = Object.entries(CURRENCIES)", "no lock here", VOCAB_OK).length > 0)

  t("دفترٌ ضيّقٌ وشاشةٌ تقفلُ بالمشتقّ → يُبرَّأ", () =>
    judgeLockMatchesLedger(2, "CURRENCIES_NOT_YET_SERVICEABLE = Object.entries(CURRENCIES)",
      "CURRENCIES_NOT_YET_SERVICEABLE disabled={notYet}", VOCAB_OK).length === 0)

  t("قائمةٌ مكتوبةٌ بيدٍ لا مشتقّة → تُرفَض", () =>
    judgeLockMatchesLedger(2, "const CURRENCIES_NOT_YET_SERVICEABLE = ['KWD']",
      "CURRENCIES_NOT_YET_SERVICEABLE disabled={notYet}", VOCAB_OK).length > 0)

  t("**دفترٌ اتّسعَ والقفلُ باقٍ → يُرفَض** — ولا يُنسى بابٌ صارَ يُفتَح", () =>
    judgeLockMatchesLedger(4, "CURRENCIES_NOT_YET_SERVICEABLE = Object.entries(CURRENCIES)",
      "CURRENCIES_NOT_YET_SERVICEABLE disabled={notYet}", VOCAB_OK).length > 0)

  let failed = 0
  for (const [name, fn] of traps) {
    let ok = false
    try { ok = fn() === true } catch { ok = false }
    if (!ok) { console.error(`X فخٌّ ذاتىٌّ لم يُصِبْ: ${name}`); failed++ }
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
  schema: path.join(ROOT, "supabase", "schema", "schema.sql"),
  functions: path.join(ROOT, "supabase", "schema", "functions.sql"),
  vocab: path.join(ROOT, "lib", "currency-utils.ts"),
  signup: path.join(ROOT, "app", "auth", "sign-up", "page.tsx"),
  migration: path.join(ROOT, "supabase", "migrations",
    "20260820000026_v3_75_75_a_currency_knows_how_many_places_it_has.sql"),
}
for (const [k, p] of Object.entries(P)) {
  if (!fs.existsSync(p)) {
    console.error(`X ملفٌّ لازمٌ للفحصِ غيرُ موجود (${k}): ${path.relative(ROOT, p)}`)
    process.exit(1)
  }
}

const schemaSql = fs.readFileSync(P.schema, "utf8")
const functionsSql = fs.readFileSync(P.functions, "utf8")
const vocabSrc = fs.readFileSync(P.vocab, "utf8")
const signupSrc = fs.readFileSync(P.signup, "utf8")
const migrationSrc = fs.readFileSync(P.migration, "utf8")

const vocab = parseCodeVocabulary(vocabSrc)
const seed = parseMigrationSeed(migrationSrc)
const signupCodes = parseSignupCodes(signupSrc)
const ledgerScale = parseLedgerScale(schemaSql)

const findings = [
  ["(١)+(٣) البيتُ قائمٌ والجردانِ يقولانِ ما يقولُه المعيار", judgeHomes(schemaSql, functionsSql, seed, vocab)],
  ["(٢) لا عملةٌ تُعرَضُ على عميلٍ ولا جردَ لها", judgeSignupCoverage(signupCodes, vocab)],
  ["(٤)+(٥) القفلُ يتبعُ سعةَ الدفترِ لا الذاكرة", judgeLockMatchesLedger(ledgerScale, vocabSrc, signupSrc, vocab)],
]

const broken = findings.filter(([, p]) => p.length > 0)

if (broken.length > 0) {
  console.error("X قانونُ عملةٍ نُقِض:\n")
  for (const [law, problems] of broken) {
    console.error(`  ${law}`)
    for (const p of problems) console.error(`      - ${p}`)
  }
  console.error(
    "\n  إن كانت لقطةُ القاعدةِ قديمةً فأعدْ توليدَها قبلَ الحكمِ على هذا الفحص."
  )
  process.exit(1)
}

const nonTwo = Object.entries(vocab).filter(([, d]) => d !== 2).map(([c]) => c).sort()
console.log(
  `+ العملةُ تعرفُ خاناتِها: ${Object.keys(vocab).length} عملةً فى الجرد، و${Object.keys(seed).length} فى بذرةِ القاعدة، ` +
    `كلُّها تُطابقُ ISO 4217 · الدفترُ يحفظُ ${ledgerScale} خانةً · ` +
    `${nonTwo.length} عملةً مقفولةً حتى يتّسع (${nonTwo.join("، ")}) · ${trapCount} فخّاً ذاتيّاً.`
)
