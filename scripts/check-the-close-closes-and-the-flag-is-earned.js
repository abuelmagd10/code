#!/usr/bin/env node
/**
 * check-the-close-closes-and-the-flag-is-earned.js
 * ---------------------------------------------------------------------------
 * v3.75.74 — أربعةُ قوانينَ وُلدت من ثلاثةِ ألغامٍ نائمة، لم ينفجرْ منها شىءٌ
 * فى الإنتاج يومَ القياس، وكان أوّلُ عميلٍ يفعلُ شيئاً طبيعيّاً يُفجِّرُها.
 *
 * القياسُ الذى أنجبَ هذا الحارس (2026-08-20، على الإنتاج):
 *   صفرُ فترةٍ مقفلة · صفرُ قيدٍ مُرحَّلٍ بلا سطور · صفرُ فاتورةٍ تحملُ أكثرَ
 *   من صفِّ إخراجٍ واحد. فالثلاثةُ كانت فخاخاً لم تُوطَأْ بعد.
 *
 * (١) «والخانةُ تُستحَقُّ ولا تُدَّعى»
 *     enforce_period_lock_header ينصرفُ عن قفلِ الفترةِ كلِّه إذا وجدَ
 *     is_closing_entry مرفوعة. وكانت الخانةُ عموداً عاديّاً يملكُ
 *     authenticated حقَّ كتابتِه ⇒ قفلُ الفترةِ يُلتَفُّ عليه بخطوةٍ واحدة.
 *     القانون: مُشغِّلٌ يمنعُ رفعَها إلّا لدورٍ لا يملكُه المتصفِّح.
 *
 * (٢) «ولا يُحسَبُ الربحُ مرّتين»
 *     get_retained_earnings_balance = رصيدُ الحساب + (إيراد − مصروف)، وقيدُ
 *     الإقفالِ الحىُّ لا يُصفِّرُ حساباتِ النشاط ⇒ الربحُ يُحسَبُ مرّتين بعدَ
 *     أوّلِ إقفال. وهى بوّابةُ توزيعِ الأرباح: مالٌ يخرجُ على رقمٍ مُضاعَف.
 *     القانون: شقُّ النشاطِ محكومٌ بآخرِ فترةٍ أُقفلت.
 *
 * (٣) «والقيدُ يُنسَبُ لفاتورتِه لا لسطرِها»
 *     auto_create_cogs_journal مُشغِّلُ صفٍّ يُنشئُ قيدَ تكلفةٍ لكلِّ صفِّ
 *     إخراج، وحارسُ التكرارِ يرفضُ الثانى ⇒ فاتورةٌ بصنفين تُلغى المعاملةَ
 *     كلَّها. القانون: بيتٌ واحدٌ لقيدِ تكلفةِ الفاتورة، تُضافُ إليه السطور.
 *
 * (٤) «ولا يُقالُ تمَّ إلّا بعدَ النظرِ فى الدفتر»
 *     ترحيلُ الفاتورةِ كان يعتبرُ رسالةَ DUPLICATE_JOURNAL_VIOLATION نجاحاً
 *     ساكناً بلا سؤالِ الدفتر — والرسالةُ تأتى أيضاً حين تُلغى المعاملةُ
 *     كلُّها ⇒ «تم الترحيل بنجاح» وفى الدفترِ لا شىء.
 *     القانون: لا نجاحَ ساكنٌ إلّا بعدَ قراءةِ journal_entries.
 *
 * المصدر: لقطةُ القاعدةِ فى المستودع (supabase/schema/*.sql) — وهى مولَّدةٌ
 * من الإنتاج، فلا يحتاجُ هذا الفحصُ قاعدةً ولا مفتاحاً.
 *
 * Usage: node scripts/check-the-close-closes-and-the-flag-is-earned.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")

// ─────────────────────────── الجزءُ الخالصُ من المنطق ───────────────────────
// يُختبَرُ بلا قرصٍ ولا قاعدة: نصٌّ يدخل، حكمٌ يخرج.

/** يقتطعُ جسدَ دالّةٍ من لقطةِ الدوالّ. */
function extractFunctionBody(functionsSql, name) {
  const head = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(`,
    "g"
  )
  const m = head.exec(functionsSql)
  if (!m) return null
  const rest = functionsSql.slice(m.index)
  const end = rest.indexOf("\n$function$")
  if (end === -1) return null
  return rest.slice(0, end)
}

/** (١) الخانةُ تُستحَقُّ: الحارسُ موجود، ويسمحُ بأدوارٍ لا يملكُها المتصفِّح. */
function judgeClosingFlagGuard(schemaSql, guardBody) {
  const problems = []
  const triggerPresent =
    /CREATE TRIGGER trg_closing_entry_flag_is_earned[\s\S]{0,200}?ON public\.journal_entries/.test(
      schemaSql
    )
  if (!triggerPresent) {
    problems.push(
      "المُشغِّلُ trg_closing_entry_flag_is_earned غيرُ معلَّقٍ على journal_entries فى لقطةِ القاعدة"
    )
  }
  if (!guardBody) {
    problems.push("الدالَّةُ enforce_closing_entry_flag_is_earned غيرُ موجودةٍ فى لقطةِ الدوالّ")
    return problems
  }
  if (!/current_user IN \(/.test(guardBody)) {
    problems.push("الحارسُ لا يحكمُ بالدور (current_user) — والخانةُ تُصدَّقُ من كاتبِها")
  }
  for (const untrusted of ["'authenticated'", "'anon'"]) {
    if (guardBody.includes(untrusted)) {
      problems.push(
        `الحارسُ يُدرِجُ ${untrusted} فى الأدوارِ المسموحِ لها برفعِ الخانة — وهذا هو الثقبُ نفسُه`
      )
    }
  }
  if (!/RAISE EXCEPTION[\s\S]{0,400}CLOSING_FLAG_NOT_EARNED/.test(guardBody)) {
    problems.push("الحارسُ لا يصرخُ CLOSING_FLAG_NOT_EARNED عندَ الادّعاء")
  }
  return problems
}

/** (٢) لا يُحسَبُ الربحُ مرّتين: شقُّ النشاطِ محكومٌ بآخرِ فترةٍ أُقفلت. */
function judgeRetainedEarnings(body) {
  const problems = []
  if (!body) return ["الدالَّةُ get_retained_earnings_balance غيرُ موجودةٍ فى لقطةِ الدوالّ"]
  if (!/v_closed_through/.test(body)) {
    problems.push(
      "لا أثرَ لآخرِ فترةٍ مُقفلة — الإيرادُ والمصروفُ يُجمعانِ فوقَ رصيدٍ رُحِّلا إليه من قبل"
    )
  }
  const gates = body.match(/v_closed_through IS NULL OR je\.entry_date > v_closed_through/g) || []
  if (gates.length < 2) {
    problems.push(
      `شقُّ النشاطِ محكومٌ فى ${gates.length} موضعٍ فقط — والمطلوبُ موضعان: الإيرادُ والمصروف`
    )
  }
  const closingExcluded =
    (body.match(/COALESCE\(je\.is_closing_entry, FALSE\) = FALSE/g) || []).length
  if (closingExcluded < 2) {
    problems.push(
      `قيدُ الإقفالِ نفسُه غيرُ مُستثنًى من شقِّ النشاطِ فى موضعين (وُجدَ ${closingExcluded})`
    )
  }
  return problems
}

/** (٣) بيتٌ واحدٌ لقيدِ تكلفةِ الفاتورة. */
function judgeCogsTrigger(body) {
  const problems = []
  if (!body) return ["الدالَّةُ auto_create_cogs_journal غيرُ موجودةٍ فى لقطةِ الدوالّ"]
  if (!body.includes("erp_cogs.je_")) {
    problems.push(
      "لا مفتاحَ محلىٌّ للمعاملة — فالمُشغِّلُ يُنشئُ قيدَ تكلفةٍ لكلِّ صفِّ إخراجٍ من جديد"
    )
  }
  if (!/INVOICE_ALREADY_COSTED/.test(body)) {
    problems.push(
      "لا رسالةَ صريحةً لفاتورةٍ كُلِّفتْ فى معاملةٍ سابقة — تعودُ الرسالةُ المُضلِّلةُ «قيدٌ مكرَّر»"
    )
  }
  const creates = (body.match(/INSERT INTO journal_entries\b/g) || []).length
  if (creates !== 1) {
    problems.push(
      `المُشغِّلُ يُنشئُ قيداً فى ${creates} موضعاً — والمطلوبُ موضعٌ واحدٌ لا يُبلَغُ إلّا مرّةً لكلِّ فاتورة`
    )
  }
  if (!/set_config\('app\.allow_direct_post', v_prev_direct_post, true\)/.test(body)) {
    problems.push(
      "رفعُ حارسِ سطورِ القيدِ المُرحَّلِ لا يُعادُ إلى ما كان — يتسرَّبُ الرفعُ إلى بقيّةِ المعاملة"
    )
  }
  return problems
}

/** (٤) لا نجاحَ ساكنٌ إلّا بعدَ قراءةِ الدفتر. */
function judgeIdempotentClaim(tsSource) {
  const problems = []
  const idx = tsSource.indexOf("DUPLICATE_JOURNAL_VIOLATION")
  if (idx === -1) return problems // لا ادّعاءَ أصلاً
  const branch = tsSource.slice(idx, idx + 2600)
  const successAt = branch.indexOf("success: true")
  if (successAt === -1) return problems // لا نجاحَ يُعلَنُ هنا
  const beforeSuccess = branch.slice(0, successAt)
  const looksUpLedger =
    /\.from\(\s*["']journal_entries["']\s*\)/.test(beforeSuccess) &&
    /reference_type/.test(beforeSuccess)
  if (!looksUpLedger) {
    problems.push(
      "يُعلَنُ النجاحُ الساكنُ بعدَ رسالةِ التكرارِ دونَ قراءةِ journal_entries — " +
        "وقد تكونُ المعاملةُ كلُّها أُلغيت فلا قيدَ فى الدفتر"
    )
  }
  return problems
}

// ─────────────────────────── الفخُّ الذاتىُّ ─────────────────────────────────
// الحارسُ لا يُصدَّقُ حتى يُرى يرفضُ المذنبَ ويُبرّئُ البرىء.

function selfTest() {
  const traps = []
  const t = (name, fn) => traps.push([name, fn])

  t("خانةٌ بلا مُشغِّل → يُرفَض", () =>
    judgeClosingFlagGuard("", "current_user IN ('postgres') CLOSING_FLAG_NOT_EXCEPTION").length > 0)

  t("حارسٌ يسمحُ لـ authenticated → يُرفَض", () =>
    judgeClosingFlagGuard(
      "CREATE TRIGGER trg_closing_entry_flag_is_earned BEFORE INSERT ON public.journal_entries",
      "IF current_user IN ('postgres', 'authenticated') THEN RETURN NEW; END IF; RAISE EXCEPTION 'CLOSING_FLAG_NOT_EARNED: x'"
    ).length > 0)

  t("أرباحٌ محتجزةٌ بلا حدِّ إقفال → يُرفَض", () =>
    judgeRetainedEarnings("RETURN v_re + (v_inc - v_exp);").length > 0)

  t("حدُّ إقفالٍ فى موضعٍ واحدٍ فقط → يُرفَض", () =>
    judgeRetainedEarnings(
      "v_closed_through ... (v_closed_through IS NULL OR je.entry_date > v_closed_through) " +
        "COALESCE(je.is_closing_entry, FALSE) = FALSE COALESCE(je.is_closing_entry, FALSE) = FALSE"
    ).length > 0)

  t("مُشغِّلُ تكلفةٍ بلا مفتاحِ معاملة → يُرفَض", () =>
    judgeCogsTrigger("INSERT INTO journal_entries (a) VALUES (b);").length > 0)

  t("مُشغِّلُ تكلفةٍ يُنشئُ قيدين → يُرفَض", () =>
    judgeCogsTrigger(
      "erp_cogs.je_ INVOICE_ALREADY_COSTED set_config('app.allow_direct_post', v_prev_direct_post, true) " +
        "INSERT INTO journal_entries (x) INSERT INTO journal_entries (y)"
    ).length > 0)

  t("رفعٌ لا يُعادُ → يُرفَض", () =>
    judgeCogsTrigger(
      "erp_cogs.je_ INVOICE_ALREADY_COSTED INSERT INTO journal_entries (x)"
    ).length > 0)

  t("نجاحٌ ساكنٌ بلا قراءةِ الدفتر → يُرفَض", () =>
    judgeIdempotentClaim(
      'if (err.includes("DUPLICATE_JOURNAL_VIOLATION")) { return { success: true, idempotent: true } }'
    ).length > 0)

  t("نجاحٌ ساكنٌ بعدَ قراءةِ الدفتر → يُبرَّأ", () =>
    judgeIdempotentClaim(
      'if (err.includes("DUPLICATE_JOURNAL_VIOLATION")) {' +
        ' const { data } = await s.from("journal_entries").select("id").eq("reference_type","invoice");' +
        ' if (data) return { success: true } }'
    ).length === 0)

  t("لا ذكرَ للتكرارِ أصلاً → يُبرَّأ", () =>
    judgeIdempotentClaim("const x = 1").length === 0)

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

const schemaPath = path.join(ROOT, "supabase", "schema", "schema.sql")
const functionsPath = path.join(ROOT, "supabase", "schema", "functions.sql")
const postingPath = path.join(
  ROOT, "lib", "services", "sales-invoice-posting-command.service.ts"
)

for (const p of [schemaPath, functionsPath, postingPath]) {
  if (!fs.existsSync(p)) {
    console.error(`X ملفٌّ لازمٌ للفحصِ غيرُ موجود: ${path.relative(ROOT, p)}`)
    process.exit(1)
  }
}

const schemaSql = fs.readFileSync(schemaPath, "utf8")
const functionsSql = fs.readFileSync(functionsPath, "utf8")
const postingTs = fs.readFileSync(postingPath, "utf8")

const findings = [
  ["(١) الخانةُ تُستحَقُّ ولا تُدَّعى", judgeClosingFlagGuard(
    schemaSql, extractFunctionBody(functionsSql, "enforce_closing_entry_flag_is_earned")
  )],
  ["(٢) لا يُحسَبُ الربحُ مرّتين", judgeRetainedEarnings(
    extractFunctionBody(functionsSql, "get_retained_earnings_balance")
  )],
  ["(٣) القيدُ يُنسَبُ لفاتورتِه لا لسطرِها", judgeCogsTrigger(
    extractFunctionBody(functionsSql, "auto_create_cogs_journal")
  )],
  ["(٤) لا يُقالُ تمَّ إلّا بعدَ النظرِ فى الدفتر", judgeIdempotentClaim(postingTs)],
]

const broken = findings.filter(([, p]) => p.length > 0)

if (broken.length > 0) {
  console.error("X قانونٌ محاسبىٌّ نُقِض:\n")
  for (const [law, problems] of broken) {
    console.error(`  ${law}`)
    for (const p of problems) console.error(`      - ${p}`)
  }
  console.error(
    "\n  هذه القوانينُ وُلدت من ألغامٍ نائمةٍ قِيست يومَ v3.75.74 ولم تنفجرْ بعد:\n" +
      "  قفلُ فترةٍ يُلتَفُّ عليه بخانة، وأرباحٌ محتجزةٌ تتضاعفُ فتُوزَّعُ مرّتين،\n" +
      "  وفاتورةٌ بصنفين تُلغى المعاملةَ كلَّها والشاشةُ تقول «تم بنجاح».\n" +
      "  إن كانت لقطةُ القاعدةِ قديمةً فأعدْ توليدَها قبلَ الحكمِ على هذا الفحص."
  )
  process.exit(1)
}

console.log(
  `+ الأربعةُ قائمة: الخانةُ تُستحَقُّ، والربحُ لا يُحسَبُ مرّتين، وقيدُ التكلفةِ ` +
    `لفاتورتِه لا لسطرِها، ولا نجاحَ ساكنٌ بلا دفتر · ${trapCount} فخّاً ذاتيّاً.`
)
