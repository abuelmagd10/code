#!/usr/bin/env node
/**
 * check-the-ledger-is-as-wide-as-the-currency.js
 * ---------------------------------------------------------------------------
 * v3.75.76 — «ولا عمودَ مالٍ أضيقُ من الدفتر».
 *
 * القياسُ الذى أنجبَ هذا الحارس (2026-08-21):
 *   • فاتورةٌ كويتيّةٌ من ثلاثةِ سطورٍ بـ3.375 د.ك — مجموعُها 10.125 متوازنٌ
 *     تماماً — كانت تُخزَّنُ مديناً 10.13 ودائناً 10.14، فيُرفَضُ ترحيلُها
 *     بفارقِ قرشٍ **اخترعَه نوعُ العمودِ نفسُه** لا سطرٌ فى الشيفرة.
 *   • وكان المشروعُ يناقضُ نفسَه: 111 عمودَ مالٍ يحفظُ أربعَ خاناتٍ بالفعل،
 *     و226 عموداً يحفظُ خانتَين — فى نفسِ القاعدة، ولنفسِ النوعِ من الأرقام.
 *
 * فوُسِّعت الأعمدةُ الـ226 إلى أربعِ خانات. وهذا الحارسُ يمنعُ عودةَ الضيق:
 *
 *   (١) **لا عمودَ مالٍ أضيقُ من الدفتر**: كلُّ عمودٍ يحملُ مبلغَ مالٍ يحفظُ
 *       من الخاناتِ العشريّةِ ما يحفظُه عمودُ المدينِ على الأقل. عمودٌ جديدٌ
 *       يُولَدُ بخانتَين يُوقِفُ البناء — فالمرضُ لا يعودُ من بابٍ خلفىّ.
 *   (٢) **والجردُ معدودٌ لا مسكوتٌ عنه**: عددُ أعمدةِ المالِ وغيرِها مُثبَّتٌ
 *       برقم، فأىُّ عمودٍ رقمىٍّ جديدٍ يظهرُ للعينِ ويُصنَّفُ عمداً، ولا
 *       يتسلّلُ إلى «المال» ولا يهربُ منه بالصمت.
 *   (٣) **والخاناتُ الصحيحةُ لا تضيقُ**: الدفترُ يحملُ أربعَ عشرةَ خانةً
 *       صحيحةً، وما دونَه من أعمدةِ المالِ **معدودٌ ومُسمّىً** لا مفتوح.
 *   (٤) **وعمودا الدفترِ نفسُهما بمقياسِ الدفتر**: المدينُ والدائنُ فى
 *       `journal_entry_lines` يحفظانِ نفسَ العددِ الذى يُقاسُ به الباقون.
 *
 * ولماذا «اسمُ العمود» هو القاعدة؟ لأنَّ PostgreSQL لا يعرفُ أنَّ رقماً مالٌ.
 * فالتمييزُ يُكتَبُ هنا شرطاً واحداً يُقرَأُ ويُراجَع، ومعه **قائمةُ ما
 * استُثنىَ بأسبابِه** — نِسَبٌ ومعدّلاتٌ وكمّيّاتٌ وأوقاتٌ وإحداثيّاتٌ وأوزان.
 * وأىُّ استثناءٍ جديدٍ يُغيِّرُ العددَ المُثبَّتَ فيُرى.
 *
 * نقطةٌ عمياءُ معلومة: هذا الفحصُ يقرأُ لقطةَ المخطَّطِ لا القاعدةَ الحيّة.
 * فإن كانت اللقطةُ قديمةً كانَ حكمُه على ماضٍ — ولذلك يُعيدُ سكربتُ الدفعِ
 * توليدَها من الإنتاجِ قبلَ تشغيلِ الحرّاس.
 *
 * Usage: node scripts/check-the-ledger-is-as-wide-as-the-currency.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")

/**
 * ما ليس مالاً — ولكلِّ استثناءٍ سببُه، لا حذفَ بلا بيان.
 *
 *   percent   نِسَبٌ مئويّة (discount_percent، efficiency_percent، percentage)
 *   rate      معدّلاتٌ وأسعارُ صرف (tax_rate، exchange_rate_used، rate_used)
 *   quantity  كمّيّات (quantity_received، total_quantity_accepted)
 *   hours     أوقاتٌ بالساعات (working_hours، available_hours_per_day)
 *   minutes   أوقاتٌ بالدقائق (setup_time_minutes)
 *   weight    أوزان (shipments.weight)
 *   gps_lat   إحداثيّاتٌ جغرافيّة
 *   gps_lng   إحداثيّاتٌ جغرافيّة
 *
 * وواحدٌ بالاسمِ الكامل: `bonus_points_per_value` — نقاطُ مكافآتٍ لا نقود.
 */
const NOT_MONEY = /percent|rate|quantity|hours|minutes|weight|gps_lat|gps_lng/
const NOT_MONEY_EXACT = new Set(["bonus_points_per_value"])

/**
 * الجردُ المُثبَّت — سجلٌّ مؤرَّخ، يُضافُ إليه ولا يُجمَّلُ ما مضى:
 *
 *   • v3.75.76 (2026-08-21): 337 عمودَ مالٍ و151 عموداً رقميّاً ليس بمال،
 *     وأربعةُ أعمدةِ مالٍ خاناتُها الصحيحةُ أقلُّ من أربعَ عشرةَ (وهى سابقةٌ
 *     على هذه الدفعةِ ولم تُصنعْ فيها).
 */
const PINNED_MONEY = 337
const PINNED_NOT_MONEY = 151
const PINNED_NARROW_INTEGER = 4

/** الخاناتُ الصحيحةُ التى يحملُها الدفترُ الرئيسُ بعدَ التوسيع. */
const LEDGER_INTEGER_DIGITS = 14

// ─────────────────────────── الجزءُ الخالصُ من المنطق ───────────────────────

function isMoneyName(name) {
  if (NOT_MONEY_EXACT.has(name)) return false
  return !NOT_MONEY.test(name)
}

/** كلُّ أعمدةِ numeric(P,S) فى لقطةِ المخطَّط. */
function parseNumericColumns(schemaSql) {
  const out = []
  const re = /CREATE TABLE(?: IF NOT EXISTS)? public\.(\w+) \(([\s\S]*?)\n\);/g
  let m
  while ((m = re.exec(schemaSql))) {
    const table = m[1]
    for (const line of m[2].split("\n")) {
      const c = /^\s*(\w+)\s+numeric\((\d+),(\d+)\)/.exec(line)
      if (c) out.push({ table, column: c[1], precision: Number(c[2]), scale: Number(c[3]) })
    }
  }
  return out
}

/** سعةُ الدفتر: خاناتُ عمودِ المدينِ فى journal_entry_lines. */
function parseLedgerScale(schemaSql) {
  const m = /CREATE TABLE(?: IF NOT EXISTS)? public\.journal_entry_lines\s*\(([\s\S]*?)\n\);/.exec(schemaSql)
  if (!m) return null
  const col = /debit_amount\s+numeric\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(m[1])
  return col ? { precision: Number(col[1]), scale: Number(col[2]) } : null
}

/** (١) لا عمودَ مالٍ أضيقُ من الدفتر. */
function judgeNoNarrowMoney(cols, ledgerScale) {
  if (ledgerScale === null) return ["تعذّرت قراءةُ سعةِ عمودِ المدينِ من لقطةِ المخطَّط"]
  const narrow = cols
    .filter((c) => isMoneyName(c.column) && c.scale < ledgerScale)
    .map((c) => `${c.table}.${c.column} numeric(${c.precision},${c.scale})`)
  if (narrow.length === 0) return []
  return [
    `${narrow.length} عمودَ مالٍ يحفظُ أقلَّ من ${ledgerScale} خانات، والدفترُ يحفظُ ${ledgerScale}: ` +
      narrow.slice(0, 12).join("، ") +
      (narrow.length > 12 ? ` … و${narrow.length - 12} غيرُها` : ""),
  ]
}

/** (٢) الجردُ معدودٌ: لا عمودٌ رقمىٌّ جديدٌ يمرُّ بلا تصنيفٍ مقصود. */
function judgeInventoryPinned(cols) {
  const problems = []
  const money = cols.filter((c) => isMoneyName(c.column)).length
  const notMoney = cols.length - money
  if (money !== PINNED_MONEY) {
    problems.push(
      `أعمدةُ المالِ ${money} والمُثبَّتُ ${PINNED_MONEY} — ` +
        `عمودٌ رقمىٌّ ${money > PINNED_MONEY ? "دخلَ" : "خرجَ"}؛ يُراجَعُ تصنيفُه ثمَّ يُحدَّثُ الرقمُ بسطرٍ مؤرَّخ`
    )
  }
  if (notMoney !== PINNED_NOT_MONEY) {
    problems.push(
      `الأعمدةُ الرقميّةُ التى ليست مالاً ${notMoney} والمُثبَّتُ ${PINNED_NOT_MONEY} — ` +
        "يُراجَعُ الاستثناءُ وسببُه ثمَّ يُحدَّثُ الرقمُ بسطرٍ مؤرَّخ"
    )
  }
  return problems
}

/** (٣) الخاناتُ الصحيحةُ لا تضيق، وما دونَ الدفترِ معدودٌ لا مفتوح. */
function judgeIntegerDigits(cols) {
  const narrow = cols.filter(
    (c) => isMoneyName(c.column) && c.precision - c.scale < LEDGER_INTEGER_DIGITS
  )
  if (narrow.length === PINNED_NARROW_INTEGER) return []
  const shown = narrow
    .map((c) => `${c.table}.${c.column} numeric(${c.precision},${c.scale})`)
    .slice(0, 12)
  return [
    `أعمدةُ المالِ الأضيقُ من ${LEDGER_INTEGER_DIGITS} خانةً صحيحةً ${narrow.length} والمُثبَّتُ ${PINNED_NARROW_INTEGER}` +
      (narrow.length > PINNED_NARROW_INTEGER
        ? ` — عمودٌ صارَ أضيقَ من الدفتر: ${shown.join("، ")}`
        : " — نقصَ العددُ (وهذا خير)؛ يُحدَّثُ المُثبَّتُ بسطرٍ مؤرَّخ"),
  ]
}

/** (٤) عمودا الدفترِ نفسُهما بمقياسِ الدفتر. */
function judgeLedgerItself(cols, ledger) {
  if (ledger === null) return ["تعذّرت قراءةُ عمودِ المدينِ من لقطةِ المخطَّط"]
  const problems = []
  const credit = cols.find(
    (c) => c.table === "journal_entry_lines" && c.column === "credit_amount"
  )
  if (!credit) {
    problems.push("عمودُ الدائنِ غيرُ موجودٍ فى لقطةِ المخطَّط")
  } else if (credit.scale !== ledger.scale || credit.precision !== ledger.precision) {
    problems.push(
      `المدينُ numeric(${ledger.precision},${ledger.scale}) والدائنُ numeric(${credit.precision},${credit.scale}) — ` +
        "طرفا القيدِ لا يُقاسانِ بمقياسٍ واحد"
    )
  }
  if (ledger.precision - ledger.scale < LEDGER_INTEGER_DIGITS) {
    problems.push(
      `الدفترُ يحملُ ${ledger.precision - ledger.scale} خانةً صحيحةً والمنتظَرُ ${LEDGER_INTEGER_DIGITS} على الأقل`
    )
  }
  return problems
}

// ─────────────────────────── الفخُّ الذاتىّ ─────────────────────────────────

function selfTest() {
  const traps = []
  const t = (name, fn) => traps.push([name, fn])

  const SCHEMA_OK =
    "CREATE TABLE IF NOT EXISTS public.journal_entry_lines (\n" +
    "  debit_amount numeric(18,4) DEFAULT 0,\n" +
    "  credit_amount numeric(18,4) DEFAULT 0,\n" +
    "  tax_rate numeric(5,2)\n);\n"

  t("يقرأُ أعمدةَ numeric من اللقطة", () => parseNumericColumns(SCHEMA_OK).length === 3)

  t("ويقرأُ سعةَ الدفترِ ودقّتَه", () => {
    const l = parseLedgerScale(SCHEMA_OK)
    return l.scale === 4 && l.precision === 18
  })

  t("ولا يخدعُه جدولُ الأرشيفِ المشابهُ اسمُه", () =>
    parseLedgerScale("CREATE TABLE IF NOT EXISTS public.journal_entry_lines_orphan_archive (\n  debit_amount numeric(18,9)\n);\n") === null)

  t("يُصنِّفُ المالَ وغيرَه", () =>
    isMoneyName("total_amount") &&
    isMoneyName("debit_amount") &&
    !isMoneyName("tax_rate") &&
    !isMoneyName("exchange_rate_used") &&
    !isMoneyName("discount_percent") &&
    !isMoneyName("quantity_received") &&
    !isMoneyName("working_hours") &&
    !isMoneyName("setup_time_minutes") &&
    !isMoneyName("weight") &&
    !isMoneyName("gps_lat") &&
    !isMoneyName("bonus_points_per_value"))

  t("**عمودُ مالٍ بخانتَينِ → يُرفَض**", () =>
    judgeNoNarrowMoney(
      [{ table: "invoices", column: "total_amount", precision: 15, scale: 2 }],
      4
    ).length === 1)

  t("ويُبرَّأُ حينَ يتّسع", () =>
    judgeNoNarrowMoney(
      [{ table: "invoices", column: "total_amount", precision: 18, scale: 4 }],
      4
    ).length === 0)

  t("ونسبةٌ مئويّةٌ بخانتَينِ لا تُحاكَم", () =>
    judgeNoNarrowMoney(
      [{ table: "invoice_items", column: "discount_percent", precision: 5, scale: 2 }],
      4
    ).length === 0)

  t("**عمودٌ رقمىٌّ جديدٌ يُغيِّرُ العددَ المُثبَّتَ → يُرفَض**", () =>
    judgeInventoryPinned([{ table: "x", column: "amount", precision: 18, scale: 4 }]).length > 0)

  t("**خاناتٌ صحيحةٌ أضيقُ من الدفترِ فوقَ المُثبَّت → تُرفَض**", () => {
    const cols = []
    for (let i = 0; i < PINNED_NARROW_INTEGER + 1; i++) {
      cols.push({ table: `t${i}`, column: "unit_price", precision: 15, scale: 4 })
    }
    return judgeIntegerDigits(cols).length === 1
  })

  t("وتُبرَّأُ عندَ العددِ المُثبَّتِ بالضبط", () => {
    const cols = []
    for (let i = 0; i < PINNED_NARROW_INTEGER; i++) {
      cols.push({ table: `t${i}`, column: "unit_price", precision: 15, scale: 4 })
    }
    return judgeIntegerDigits(cols).length === 0
  })

  t("**دائنٌ بمقياسٍ يخالفُ المدينَ → يُرفَض**", () =>
    judgeLedgerItself(
      [{ table: "journal_entry_lines", column: "credit_amount", precision: 15, scale: 2 }],
      { precision: 18, scale: 4 }
    ).some((p) => p.includes("مقياسٍ واحد")))

  t("ويُبرَّأُ حينَ يتطابقانِ", () =>
    judgeLedgerItself(
      [{ table: "journal_entry_lines", column: "credit_amount", precision: 18, scale: 4 }],
      { precision: 18, scale: 4 }
    ).length === 0)

  t("**دفترٌ بخاناتٍ صحيحةٍ أقلَّ من أربعَ عشرةَ → يُرفَض**", () =>
    judgeLedgerItself(
      [{ table: "journal_entry_lines", column: "credit_amount", precision: 15, scale: 4 }],
      { precision: 15, scale: 4 }
    ).some((p) => p.includes("خانةً صحيحةً")))

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

const SCHEMA = path.join(ROOT, "supabase", "schema", "schema.sql")
if (!fs.existsSync(SCHEMA)) {
  console.error(`X لقطةُ المخطَّطِ غيرُ موجودة: ${path.relative(ROOT, SCHEMA)}`)
  process.exit(1)
}

const schemaSql = fs.readFileSync(SCHEMA, "utf8")
const cols = parseNumericColumns(schemaSql)
const ledger = parseLedgerScale(schemaSql)
const ledgerScale = ledger ? ledger.scale : null

const findings = [
  ["(١) لا عمودَ مالٍ أضيقُ من الدفتر", judgeNoNarrowMoney(cols, ledgerScale)],
  ["(٢) الجردُ معدودٌ لا مسكوتٌ عنه", judgeInventoryPinned(cols)],
  ["(٣) الخاناتُ الصحيحةُ لا تضيق", judgeIntegerDigits(cols)],
  ["(٤) طرفا القيدِ بمقياسٍ واحد", judgeLedgerItself(cols, ledger)],
]

const broken = findings.filter(([, p]) => p.length > 0)

if (broken.length > 0) {
  console.error("X قانونُ سعةِ الدفترِ نُقِض:\n")
  for (const [law, problems] of broken) {
    console.error(`  ${law}`)
    for (const p of problems) console.error(`      - ${p}`)
  }
  console.error(
    "\n  إن كانت لقطةُ المخطَّطِ قديمةً فأعدْ توليدَها (node scripts/dump-db-schema.js) قبلَ الحكمِ على هذا الفحص."
  )
  process.exit(1)
}

const moneyCount = cols.filter((c) => isMoneyName(c.column)).length
console.log(
  `+ الدفترُ يتّسعُ لما تحملُه العملة: ${moneyCount} عمودَ مالٍ كلُّها بـ${ledgerScale} خانات، ` +
    `و${cols.length - moneyCount} عموداً رقميّاً ليس بمالٍ لا يُحاكَم · ` +
    `الدفترُ numeric(${ledger.precision},${ledger.scale}) والدائنُ مثلُه · ` +
    `${trapCount} فخّاً ذاتيّاً.`
)
