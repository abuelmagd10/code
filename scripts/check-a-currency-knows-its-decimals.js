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
 *   (٥) **والقانونُ يقرأُ سعةَ الدفترِ ويحكمُ بها**: العملةُ غيرُ مخدومةٍ
 *       إذا كانت خاناتُها **أكثرَ ممّا يحفظُه عمودُ المدين**، وتُعرَضُ
 *       حينَها مقفولةً على شاشةِ التسجيل. ويُحرَسُ معها أنَّ ثابتَ
 *       `LEDGER_DECIMAL_PLACES` فى الشيفرةِ يقولُ ما تقولُه القاعدةُ بالضبط
 *       — فالقفلُ يرتفعُ وينزلُ من نفسِه، ولا يُنتظَرُ قرارٌ يُكتَبُ باليد.
 *
 * سجلُّ تعديلِ القانون — يُضافُ إليه ولا يُجمَّلُ ما مضى:
 *
 *   • v3.75.75 (2026-08-20): القانونُ (٥) كان «كلُّ عملةٍ خاناتُها ليست
 *     اثنتين تُقفَل، وتُلزَمُ القائمةُ بأن تفرغَ فورَ اتّساعِ الدفتر».
 *   • v3.75.76 (2026-08-21): اتّسعَ الدفترُ إلى أربعِ خانات، فظهرَ أنَّ
 *     الصياغةَ الأولى خلطت مسألتين: الينُّ اليابانىُّ **بلا خانات** كان
 *     يُقفَلُ بلا سبب، ودفترٌ بخانتين يحفظُ الصفرَ بلا أىِّ فقد. فصارَ
 *     الحكمُ بالمقارنةِ الصحيحةِ وحدَها: `خاناتُ العملة > سعةُ الدفتر`.
 *     ولم يعُدْ ثمَّةَ «قفلٌ يُرفَعُ» أصلاً، بل قائمةٌ تفرغُ من نفسِها —
 *     ومكانُ النسيانِ الوحيدُ الباقى (ثابتُ السعةِ فى الشيفرة) صارَ مقيساً.
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

/** سعةُ الدفترِ كما تُعلنُها الشيفرة (ثابتُ LEDGER_DECIMAL_PLACES). */
function parseLedgerConstant(src) {
  const m = /export const LEDGER_DECIMAL_PLACES\s*=\s*(\d+)/.exec(src)
  return m ? Number(m[1]) : null
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

/** (٤)+(٥) القائمةُ مشتقّة، وتُقاسُ بسعةِ الدفترِ لا برقمٍ ثابت. */
function judgeLockMatchesLedger(ledgerScale, vocabSrc, signupSrc, vocab) {
  const problems = []
  if (ledgerScale === null) return ["تعذّرت قراءةُ سعةِ عمودِ المدينِ من لقطةِ القاعدة"]

  // (٤) القائمةُ مشتقّةٌ من الجردِ لا مكتوبةٌ بيد
  if (!/CURRENCIES_NOT_YET_SERVICEABLE[\s\S]{0,600}Object\.entries\(CURRENCIES\)/.test(vocabSrc)) {
    problems.push("قائمةُ غيرِ المخدومةِ ليست مشتقّةً من الجرد — جردٌ ثالثٌ يُنسى تحديثُه")
  }

  // (٥أ) سعةُ الدفترِ فى الشيفرةِ هى سعتُه فى القاعدةِ بالضبط
  const declared = parseLedgerConstant(vocabSrc)
  if (declared === null) {
    problems.push("لا ثابتَ LEDGER_DECIMAL_PLACES فى جردِ الشيفرة — سعةُ الدفترِ بلا بيتٍ واحدٍ يُقرَأ")
  } else if (declared !== ledgerScale) {
    problems.push(
      `الشيفرةُ تقولُ إنَّ الدفترَ يحفظُ ${declared} خانةً والقاعدةُ تحفظُ ${ledgerScale} — ` +
        "رقمانِ لسعةٍ واحدة، وأحدُهما كاذب"
    )
  }

  // (٥ب) والقائمةُ تُقاسُ بتلك السعةِ لا برقمٍ ثابتٍ يُنسى
  if (!/decimals\s*>\s*LEDGER_DECIMAL_PLACES/.test(vocabSrc)) {
    problems.push("القائمةُ لا تُقاسُ بسعةِ الدفترِ — قفلٌ يُرفَعُ باليدِ هو قفلٌ يُنسى")
  }

  // (٥ج) والآليّةُ تبقى حيّةً على الشاشةِ وإن فرغت القائمةُ اليوم
  const usesDerived = /CURRENCIES_NOT_YET_SERVICEABLE/.test(signupSrc)
  const disables = /disabled=\{\s*notYet\s*\}/.test(signupSrc)
  if (!usesDerived) {
    problems.push("شاشةُ التسجيلِ لا تقرأُ قائمةَ غيرِ المخدومةِ أصلاً")
  }
  if (!disables) {
    problems.push(
      "شاشةُ التسجيلِ لا تقفلُ ما لا يتّسعُ له الدفتر — والقائمةُ فارغةٌ اليومَ، " +
        "لكنَّ نزعَ الآليّةِ يعنى أنَّ عملةً أوسعَ تُعرَضُ غداً بلا قفل"
    )
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

  const VOCAB_SRC = (n) =>
    `export const LEDGER_DECIMAL_PLACES = ${n}\n` +
    "export const CURRENCIES_NOT_YET_SERVICEABLE = Object.entries(CURRENCIES)\n" +
    "  .filter(([, v]) => v.decimals > LEDGER_DECIMAL_PLACES)\n"
  const SIGNUP_OK = "CURRENCIES_NOT_YET_SERVICEABLE disabled={notYet}"

  t("دفترٌ ضيّقٌ وشاشةٌ لا تقفلُ → يُرفَض", () =>
    judgeLockMatchesLedger(2, VOCAB_SRC(2), "no lock here", VOCAB_OK).length > 0)

  t("دفترٌ ضيّقٌ وشاشةٌ تقفلُ بالمشتقّ → يُبرَّأ", () =>
    judgeLockMatchesLedger(2, VOCAB_SRC(2), SIGNUP_OK, VOCAB_OK).length === 0)

  t("دفترٌ واسعٌ والقائمةُ تُقاسُ بسعتِه → يُبرَّأ", () =>
    judgeLockMatchesLedger(4, VOCAB_SRC(4), SIGNUP_OK, VOCAB_OK).length === 0)

  t("قائمةٌ مكتوبةٌ بيدٍ لا مشتقّة → تُرفَض", () =>
    judgeLockMatchesLedger(2, "export const LEDGER_DECIMAL_PLACES = 2\nconst CURRENCIES_NOT_YET_SERVICEABLE = ['KWD']",
      SIGNUP_OK, VOCAB_OK).length > 0)

  t("**الشيفرةُ تدّعى سعةً غيرَ سعةِ القاعدة → تُرفَض** — رقمانِ لسعةٍ واحدة", () =>
    judgeLockMatchesLedger(4, VOCAB_SRC(2), SIGNUP_OK, VOCAB_OK)
      .some((p) => p.includes("وأحدُهما كاذب")))

  t("**لا ثابتَ للسعةِ أصلاً → يُرفَض**", () =>
    judgeLockMatchesLedger(4, "export const CURRENCIES_NOT_YET_SERVICEABLE = Object.entries(CURRENCIES)\n  .filter(([, v]) => v.decimals > LEDGER_DECIMAL_PLACES)",
      SIGNUP_OK, VOCAB_OK).some((p) => p.includes("LEDGER_DECIMAL_PLACES")))

  t("**قائمةٌ تُقاسُ برقمٍ ثابتٍ لا بالسعة → تُرفَض**", () =>
    judgeLockMatchesLedger(4,
      "export const LEDGER_DECIMAL_PLACES = 4\nexport const CURRENCIES_NOT_YET_SERVICEABLE = Object.entries(CURRENCIES).filter(([, v]) => v.decimals !== 2)",
      SIGNUP_OK, VOCAB_OK).some((p) => p.includes("قفلٌ يُرفَعُ باليد")))

  t("ويرى ثابتَ السعةِ فى الشيفرة", () =>
    parseLedgerConstant("export const LEDGER_DECIMAL_PLACES = 4\n") === 4 &&
    parseLedgerConstant("nothing here") === null)

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

const beyond = Object.entries(vocab).filter(([, d]) => d > ledgerScale).map(([c]) => c).sort()
const widest = Math.max(...Object.values(vocab))
console.log(
  `+ العملةُ تعرفُ خاناتِها: ${Object.keys(vocab).length} عملةً فى الجرد، و${Object.keys(seed).length} فى بذرةِ القاعدة، ` +
    `كلُّها تُطابقُ ISO 4217 · الدفترُ يحفظُ ${ledgerScale} خانةً وأوسعُ عملةٍ تحتاجُ ${widest} · ` +
    (beyond.length === 0
      ? "ولا عملةَ مقفولة"
      : `${beyond.length} عملةً مقفولةً لأنَّ الدفترَ لا يتّسعُ لها (${beyond.join("، ")})`) +
    ` · ${trapCount} فخّاً ذاتيّاً.`
)
