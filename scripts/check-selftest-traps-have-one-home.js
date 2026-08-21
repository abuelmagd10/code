#!/usr/bin/env node
/**
 * check-selftest-traps-have-one-home.js
 * ---------------------------------------------------------------------------
 * v3.75.80 — **وفخٌّ بلا قاعدةٍ لا يقولُ «نجحتُ» ولا «سقطتُ» بل «لم أَقِسْ».**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * سُئل: لماذا لم يُنشَرْ v3.75.78 على Vercel؟ فكان حدثُ الدفعِ قد ضاعَ مرّةً.
 * لكنّ البحثَ كشفَ ما هو أخطرُ: وظيفةُ الحراسةِ على GitHub
 * (`AI Governance Audit`) **كانت حمراءَ فى كلِّ قيدٍ منذ شهور**، وسببُها **سطرٌ
 * واحدٌ فى فخٍّ ذاتىٍّ واحد**:
 *
 *     X PRODUCTION_SUPABASE_DB_URL is not set - cannot prove the guard refuses anything.
 *
 * ولأنَّ وظيفةَ النشرِ فى نفسِ الملفِّ مشروطةٌ بها (`needs:`) صارت **مُتخطّاةً
 * فى كلِّ قيد**. أى أنَّ نصفَ آلةِ الحراسةِ كان مُطفأً — **ولم يقلْ ذلك أحد**.
 *
 * ═══ والعطبُ ليس فى الفخِّ بل فى انقسامِ الحكم ═══
 *
 * قِيست الفخاخُ الستّةُ والعشرونَ كلُّها بلا رابطِ قاعدة، فإذا هى **فرقتان
 * متناقضتان على الحالةِ الواحدةِ بعينِها**: تسعةٌ تقولُ «! skipping» وتخرجُ
 * بصفر، وتسعةٌ تقولُ «X cannot prove» وتخرجُ بواحد، وثمانيةٌ لا تحتاجُ قاعدةً.
 *
 * **وحكمانِ متناقضانِ على حالةٍ واحدةٍ ليسا اجتهاداً بل بيتَين.**
 *
 * فصارَ الحكمُ فى بيتٍ واحد: `scripts/lib/selftest-db.js`. ولهذا الحارسُ
 * يحرسُ أربعةَ أشياء:
 *
 *   **(١) ولا يُبنى بيتٌ ثانٍ** — فخٌّ يُصدِرُ حكمَ خروجٍ بنفسِه على غيابِ
 *       رابطِ القاعدةِ مرفوض. البيتُ وحدَه يحكم.
 *
 *   **(٢) والمعدودُ لا يُنسى** — عددُ الفخاخِ التى تحتاجُ قاعدةً مُثبَّتٌ،
 *       وأىُّ متغيّرٍ يسألُه كلُّ فخٍّ مُثبَّتٌ كذلك. فلا ينامُ فخٌّ صامتاً،
 *       **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.
 *
 *   **(٣) والبيتُ حىٌّ بطريقَيه** — طريقُ التخطّى (وسمٌ يُعَدُّ، وخروجٌ بصفر)
 *       وطريقُ الإلزامِ (`--require-db`، وخروجٌ بواحد). لو ضاعَ أحدُهما صارَ
 *       التخطّى ثغرةً أو صارَ الغيابُ اتّهاماً — وكلاهما العطبُ الأوّل عائداً.
 *
 *   **(٤) ولا يُحاكَمُ من يُثبتُ بلا قاعدة** — فخٌّ يُشغِّلُ حالاتِه بلا قاعدةٍ
 *       ويُعلِنُ تخطّىَ حالةٍ واحدةٍ منها **بصوتٍ مسموعٍ بلا خروج** ليس مخالفاً.
 *       **وحارسٌ يصرخُ على البرىءِ يُطفَأ.**
 *
 * Usage: node scripts/check-selftest-traps-have-one-home.js [--selftest] [--list]
 * ---------------------------------------------------------------------------
 */
"use strict"

const fs = require("fs")
const path = require("path")

const SCRIPTS_DIR = __dirname
const HOME_REL = "lib/selftest-db.js"

/** أسماءُ روابطِ القواعدِ — تُقرَأُ من البيتِ نفسِه، **ولا تُكتَبُ ثانيةً هنا**. */
const { DB_URL_VARS, SKIP_TAG } = require("./lib/selftest-db")

// ═══════════════════════════════════════════════════════════════════════════
// الأرقامُ المُثبَّتة — قِيست يومَ وُلد البيت (v3.75.80)
// ═══════════════════════════════════════════════════════════════════════════

/** جملةُ الفخاخِ فى `scripts/selftest-*.js`. */
const PINNED_TRAPS = 26

/** الفخاخُ التى لا تُثبتُ شيئاً بلا قاعدةٍ فتنادى البيت. */
const PINNED_NEED_DB = 18

/**
 * **وأىُّ رابطٍ يسألُه كلُّ فخّ** — مُثبَّتٌ بالاسم، فنزعُ سؤالِ فخٍّ أو تحويلُه
 * من قاعدةِ الاختبارِ إلى الإنتاجِ تغييرٌ يُرى لا يُمرَّر.
 */
const PINNED_VAR_OF = {
  "selftest-anon-open-tables": "TEST_SUPABASE_DB_URL",
  "selftest-audit-trail-records": "TEST_SUPABASE_DB_URL",
  "selftest-branch-isolation-holes": "TEST_SUPABASE_DB_URL",
  "selftest-exposed-definer-functions": "TEST_SUPABASE_DB_URL",
  "selftest-ledger-integrity": "TEST_SUPABASE_DB_URL",
  "selftest-notifications-reach-a-person": "TEST_SUPABASE_DB_URL",
  "selftest-product-cost-grant": "TEST_SUPABASE_DB_URL",
  "selftest-product-management-one-door": "TEST_SUPABASE_DB_URL",
  "selftest-products-branch-policy": "TEST_SUPABASE_DB_URL",
  "selftest-purchase-cost-masked-path": "TEST_SUPABASE_DB_URL",
  "selftest-purchase-return-priced-by-the-bill": "TEST_SUPABASE_DB_URL",
  "selftest-transfer-journal": "TEST_SUPABASE_DB_URL",

  "selftest-custody-movements": "PRODUCTION_SUPABASE_DB_URL",
  "selftest-movement-cost": "PRODUCTION_SUPABASE_DB_URL",
  "selftest-phantom-columns": "PRODUCTION_SUPABASE_DB_URL",
  "selftest-schema-snapshot-matches-db": "PRODUCTION_SUPABASE_DB_URL",
  "selftest-subtype-tenant-divergence": "PRODUCTION_SUPABASE_DB_URL",
  "selftest-trigger-silently-cancels-delete": "PRODUCTION_SUPABASE_DB_URL",
}

/**
 * **مُعلَنٌ بسببٍ مكتوب** — فخٌّ يُثبتُ ما يُثبتُه بلا قاعدة، ويُعلِنُ تخطّىَ
 * حالةٍ واحدةٍ منها بصوتٍ مسموعٍ ولا يخرج. فلا يُحاكَمُ بقانونِ البيت.
 */
const DECLARED_PARTIAL = {
  "selftest-products-select-star": {
    why:
      "أربعٌ من حالاتِه الخمسِ تجرى بلا قاعدة (نجمةٌ صريحةٌ ومتخفّيةٌ ومعكوسان)، " +
      "والخامسةُ وحدَها تلزمُها القاعدةُ فتُعلَنُ متخطّاةً بلا خروج.",
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// الجزءُ الخالصُ من المنطق — يُختبَرُ بلا قرص
// ═══════════════════════════════════════════════════════════════════════════

/** **والتعليقُ ليس تعليمة.** */
function maskComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length))
}

/** هل يأخذُ هذا الفخُّ حكمَه من البيتِ الواحد؟ */
function usesTheOneHome(src) {
  return /require\(\s*["'][^"']*lib\/selftest-db["']\s*\)/.test(maskComments(src))
}

/** الرابطُ الذى يسألُه الفخُّ من البيت — أو `null` إن لم يسألْ. */
function askedVar(src) {
  const m = maskComments(src).match(/requireDbOrSkip\(\s*["']([A-Z_]+)["']/)
  return m ? m[1] : null
}

/**
 * الأسماءُ المحلّيّةُ التى تحملُ رابطَ القاعدة: `const x = process.env.<VAR>`.
 * **فالحكمُ على الاسمِ المستعارِ حكمٌ على الرابطِ نفسِه.**
 */
function dbAliases(masked) {
  const out = new Set(DB_URL_VARS.map((v) => `process.env.${v}`))
  for (const v of DB_URL_VARS) {
    const re = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*process\\.env\\.${v}\\b`, "g")
    let m
    while ((m = re.exec(masked))) out.add(m[1])
  }
  return [...out]
}

/**
 * **ولا يُبنى بيتٌ ثانٍ**: هل يُصدِرُ الفخُّ حكمَ خروجٍ بنفسِه على غيابِ الرابط؟
 * تُقرَأُ الكتلةُ التى شرطُها `!<رابط أو اسمه المستعار>` ويُبحَثُ فيها عن
 * `process.exit(…)`. **والخروجُ حكمٌ؛ والطباعةُ بلا خروجٍ ليست حكماً.**
 */
function handWrittenVerdict(src) {
  const masked = maskComments(src)
  const hits = []
  for (const alias of dbAliases(masked)) {
    const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`if\\s*\\(\\s*!\\s*${esc}\\s*\\)\\s*\\{`, "g")
    let m
    while ((m = re.exec(masked))) {
      // جسمُ الكتلةِ بموازنةِ الأقواسِ المعقوفة — لا بعدٍّ ثابتٍ للحروف.
      let i = m.index + m[0].length - 1
      let depth = 0
      let end = -1
      for (; i < masked.length; i++) {
        if (masked[i] === "{") depth++
        else if (masked[i] === "}") { depth--; if (depth === 0) { end = i; break } }
      }
      const body = masked.slice(m.index, end === -1 ? masked.length : end + 1)
      if (/process\.exit\s*\(/.test(body)) hits.push(alias)
    }
  }
  return [...new Set(hits)]
}

/**
 * حكمُ فخٍّ واحد. يُعيدُ قائمةَ مخالفاتٍ — فارغةً إن كان سليماً.
 * @param {{name:string, src:string, declaredPartial?:boolean, pinnedVar?:string|null}} t
 */
function judgeTrap(t) {
  const out = []
  const name = t.name
  const src = String(t.src || "")
  const hand = handWrittenVerdict(src)
  const home = usesTheOneHome(src)
  const asked = askedVar(src)

  if (hand.length) {
    out.push(
      `${name}: يُصدِرُ حكمَ خروجٍ بنفسِه على غيابِ الرابط (${hand.join(" · ")}) — ` +
        "ولا يُبنى بيتٌ ثانٍ."
    )
  }

  if (t.pinnedVar) {
    if (!home) out.push(`${name}: مُثبَّتٌ أنّه يحتاجُ قاعدةً ولا ينادى البيت.`)
    else if (asked !== t.pinnedVar) {
      out.push(
        `${name}: يسألُ «${asked || "(لا شىء)"}» والمُثبَّتُ «${t.pinnedVar}» — ` +
          "وتحويلُ فخٍّ من قاعدةِ الاختبارِ إلى الإنتاجِ لا يمرُّ صامتاً."
      )
    }
  } else if (home && !t.declaredPartial) {
    out.push(`${name}: ينادى البيتَ ولم يُثبَّتْ فى PINNED_VAR_OF — ${asked || "(بلا رابط)"}.`)
  }

  if (dotenvComesAfterTheHome(src)) {
    out.push(
      `${name}: يسألُ البيتَ **قبلَ** أن يقرأَ dotenv ملفَّ .env.local — ` +
        "فيتخطّى نفسَه على جهازٍ فيه الرابطُ فعلاً."
    )
  }

  return out
}

/**
 * **ولا يُسأَلُ عن رابطٍ قبلَ أن يُقرأَ الملفُّ الذى فيه.**
 *
 * رابطُ القاعدةِ عندَ صاحبِ المشروعِ يسكنُ `.env.local` لا بيئةَ الصَّدَفة. فلو
 * سألَ الفخُّ البيتَ **قبلَ** `dotenv` لقالَ البيتُ «لا رابط» فتخطّى الفخُّ نفسَه
 * **على جهازٍ فيه الرابطُ فعلاً** — وهذا تخطٍّ كاذبٌ لا يقولُ عنه أحدٌ شيئاً،
 * وهو العطبُ الأوّلُ عائداً من بابٍ آخر.
 *
 * @returns {boolean} `true` إن كان الترتيبُ معطوباً.
 */
function dotenvComesAfterTheHome(src) {
  const masked = maskComments(src)
  const home = masked.search(/requireDbOrSkip\s*\(/)
  if (home < 0) return false
  const env = masked.search(/require\(\s*["']dotenv["']\s*\)/)
  if (env < 0) return false
  return env > home
}

/** حكمُ الأرقامِ المُثبَّتة: `ok` أو `grew` أو `shrank`. */
function judgePin(got, pinned) {
  if (got === pinned) return "ok"
  return got > pinned ? "grew" : "shrank"
}

/**
 * **والبيتُ حىٌّ بطريقَيه**: يُحكَمُ على نصِّ البيتِ نفسِه.
 * @param {string} src نصُّ `lib/selftest-db.js`
 */
function judgeHome(src) {
  const out = []
  const masked = maskComments(src)
  if (!new RegExp(SKIP_TAG).test(masked)) out.push("البيتُ بلا وسمِ تخطٍّ يُعَدُّ به.")
  if (!/--require-db/.test(masked)) out.push("البيتُ بلا طريقِ إلزامٍ (--require-db) — فالتخطّى صارَ ثغرة.")
  if (!/process\.exit\(\s*0\s*\)/.test(masked)) out.push("البيتُ لا يخرجُ بصفرٍ عندَ التخطّى — فالغيابُ صارَ اتّهاماً.")
  if (!/process\.exit\(\s*1\s*\)/.test(masked)) out.push("البيتُ لا يخرجُ بواحدٍ عندَ الإلزام — فالإلزامُ زينة.")
  if (!/ERB_SELFTEST_REQUIRE_DB/.test(masked)) out.push("البيتُ لا يقرأُ الإلزامَ من البيئة — فالتشغيلُ الآلىُّ لا يستطيعُ إلزامَه.")
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ — **وفخٌّ لا يُشغَّل ليس فخّاً**
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, JSON.stringify(got), JSON.stringify(exp)])

  const HOME_CALL = 'const { requireDbOrSkip } = require("./lib/selftest-db")\n'

  // ── (١) البيتُ الواحدُ يُرى بالنداءِ لا بالاسم ───────────────────────────
  t("يرى نداءَ البيت", usesTheOneHome(HOME_CALL), true)
  t("ولا يراه فى تعليق — والتعليقُ ليس تعليمة",
    usesTheOneHome('// require("./lib/selftest-db")\n'), false)
  t("ولا يراه فى تعليقٍ كتلىّ",
    usesTheOneHome('/* require("./lib/selftest-db") */\n'), false)
  t("ويقرأُ الرابطَ المسؤول", askedVar(`${HOME_CALL}requireDbOrSkip("TEST_SUPABASE_DB_URL", "س")`), "TEST_SUPABASE_DB_URL")
  t("ويعيدُ لا شىءَ حين لا سؤال", askedVar("const a = 1\n"), null)

  // ── (٢) البيتُ الثانى يُمسَك ─────────────────────────────────────────────
  const OLD_HARD = 'if (!process.env.PRODUCTION_SUPABASE_DB_URL) {\n  console.error("X")\n  process.exit(1)\n}\n'
  const OLD_SOFT = 'const url = process.env.TEST_SUPABASE_DB_URL\nif (!url) {\n  console.log("!")\n  process.exit(0)\n}\n'
  t("يمسكُ الحكمَ المكتوبَ باليدِ مباشرةً", handWrittenVerdict(OLD_HARD).length, 1)
  t("ويمسكُه عبرَ اسمٍ مستعار", handWrittenVerdict(OLD_SOFT).length, 1)
  t("ويُسمّى الاسمَ المستعارَ بعينِه", handWrittenVerdict(OLD_SOFT)[0], "url")
  t("ويمسكُ الخروجَ بصفرٍ كما بواحد — والتخطّى حكمٌ أيضاً",
    handWrittenVerdict('const u = process.env.TEST_SUPABASE_DB_URL\nif (!u) { process.exit(0) }\n').length, 1)
  t("ولا يمسكُ طباعةً بلا خروج — وحارسٌ يصرخُ على البرىءِ يُطفَأ",
    handWrittenVerdict('if (!process.env.PRODUCTION_SUPABASE_DB_URL) {\n  console.log("! تُخطّى حالةٌ واحدة")\n}\n').length, 0)
  t("ولا يمسكُ حكماً على متغيّرٍ لا يحملُ رابطاً",
    handWrittenVerdict('const x = process.env.SOMETHING_ELSE\nif (!x) { process.exit(1) }\n').length, 0)
  t("ولا يخدعُه تعليقٌ فيه الحكم",
    handWrittenVerdict('// if (!process.env.TEST_SUPABASE_DB_URL) { process.exit(1) }\n').length, 0)
  t("ويوازنُ الأقواسَ فلا يبلغُ خروجاً خارجَ الكتلة",
    handWrittenVerdict('const u = process.env.TEST_SUPABASE_DB_URL\nif (!u) {\n  if (1) { console.log(1) }\n}\nprocess.exit(1)\n').length, 0)
  t("ويبلغُ خروجاً داخلَ كتلةٍ متداخلة",
    handWrittenVerdict('const u = process.env.TEST_SUPABASE_DB_URL\nif (!u) {\n  if (1) { process.exit(1) }\n}\n').length, 1)

  // ── (٣) حكمُ الفخِّ الواحد ───────────────────────────────────────────────
  const GOOD = `${HOME_CALL}const url = requireDbOrSkip("TEST_SUPABASE_DB_URL", "س")\n`
  t("يُبرِّئُ فخّاً ينادى البيتَ بالرابطِ المُثبَّت",
    judgeTrap({ name: "a", src: GOOD, pinnedVar: "TEST_SUPABASE_DB_URL" }).length, 0)
  t("ويرفضُ فخّاً مُثبَّتاً لا ينادى البيت",
    judgeTrap({ name: "a", src: OLD_HARD, pinnedVar: "PRODUCTION_SUPABASE_DB_URL" }).length, 2)
  t("ويرفضُ فخّاً حوَّلَ سؤالَه إلى الإنتاجِ خُفيةً",
    judgeTrap({ name: "a", src: `${HOME_CALL}requireDbOrSkip("PRODUCTION_SUPABASE_DB_URL", "س")\n`, pinnedVar: "TEST_SUPABASE_DB_URL" }).length, 1)
  t("ويُسمّى التحويلَ فى نصِّ الرفض",
    judgeTrap({ name: "a", src: `${HOME_CALL}requireDbOrSkip("PRODUCTION_SUPABASE_DB_URL", "س")\n`, pinnedVar: "TEST_SUPABASE_DB_URL" })[0].includes("PRODUCTION_SUPABASE_DB_URL"), true)
  t("ويرفضُ فخّاً ينادى البيتَ ولم يُثبَّتْ",
    judgeTrap({ name: "a", src: GOOD, pinnedVar: null }).length, 1)
  t("ولا يُحاكِمُ المُعلَنَ بسببٍ مكتوب",
    judgeTrap({ name: "a", src: GOOD, pinnedVar: null, declaredPartial: true }).length, 0)
  t("ويُبرِّئُ فخّاً لا يذكرُ قاعدةً أصلاً",
    judgeTrap({ name: "a", src: "const x = 1\n", pinnedVar: null }).length, 0)
  t("ويرفضُ من ينادى البيتَ **ويكتبُ** حكماً ثانياً",
    judgeTrap({ name: "a", src: GOOD + OLD_HARD, pinnedVar: "TEST_SUPABASE_DB_URL" }).length, 1)

  // ── (٣ب) ولا يُسأَلُ عن رابطٍ قبلَ أن يُقرأَ الملفُّ الذى فيه ─────────────
  const DOTENV = 'require("dotenv").config({ path: [".env.local"] })\n'
  t("يُبرِّئُ ترتيباً سليماً: dotenv ثمّ البيت", dotenvComesAfterTheHome(DOTENV + GOOD), false)
  t("ويرفضُ سؤالَ البيتِ قبلَ dotenv", dotenvComesAfterTheHome(GOOD + DOTENV), true)
  t("ولا يحكمُ على فخٍّ بلا dotenv أصلاً", dotenvComesAfterTheHome(GOOD), false)
  t("ولا يحكمُ على فخٍّ لا ينادى البيت", dotenvComesAfterTheHome(DOTENV), false)
  t("ولا يخدعُه dotenv فى تعليقٍ بعدَ البيت",
    dotenvComesAfterTheHome(DOTENV + GOOD + '// require("dotenv")\n'), false)
  t("ويُسمّى العطبَ فى حكمِ الفخّ",
    judgeTrap({ name: "a", src: GOOD + DOTENV, pinnedVar: "TEST_SUPABASE_DB_URL" }).length, 1)

  // ── (٤) الأرقامُ المُثبَّتةُ ترفضُ فى الاتّجاهَين ─────────────────────────
  t("يمرُّ حين يُطابقُ العددُ المُثبَّت", judgePin(26, 26), "ok")
  t("ويرفضُ فخّاً جديداً لم يُثبَّتْ", judgePin(27, 26), "grew")
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه", judgePin(25, 26), "shrank")
  t("ويرفضُ الصفرَ — وبحثٌ لا يجدُ ليس دليلَ سلامة", judgePin(0, 26), "shrank")

  // ── (٥) البيتُ حىٌّ بطريقَيه ─────────────────────────────────────────────
  const HOME_SRC = fs.readFileSync(path.join(SCRIPTS_DIR, HOME_REL), "utf8")
  t("البيتُ الحقيقىُّ سليمٌ بطريقَيه", judgeHome(HOME_SRC).length, 0)
  t("ويرفضُ بيتاً بلا وسمِ تخطٍّ",
    judgeHome(HOME_SRC.replace(new RegExp(SKIP_TAG, "g"), "XX")).length > 0, true)
  t("ويرفضُ بيتاً نُزِعَ منه طريقُ الإلزام",
    judgeHome(HOME_SRC.replace(/--require-db/g, "--x")).length > 0, true)
  t("ويرفضُ بيتاً لا يخرجُ بصفرٍ عندَ التخطّى",
    judgeHome(HOME_SRC.replace(/process\.exit\(0\)/g, "void 0")).length > 0, true)
  t("ويرفضُ بيتاً نُزِعَ منه الإلزامُ من البيئة",
    judgeHome(HOME_SRC.replace(/ERB_SELFTEST_REQUIRE_DB/g, "OTHER")).length > 0, true)

  // ── (٦) بيتُ الأسماءِ واحدٌ ولا يُكتَبُ هنا ثانيةً ───────────────────────
  t("أسماءُ الروابطِ تُقرَأُ من البيت", Array.isArray(DB_URL_VARS) && DB_URL_VARS.length >= 2, true)
  t("ولا إعلانَ جزئىٍّ بلا سببٍ مكتوب",
    Object.values(DECLARED_PARTIAL).every((d) => d.why && d.why.length > 40), true)

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

// ═══════════════════════════════════════════════════════════════════════════
// القياسُ الحقيقىّ — على القرص، بلا قاعدةِ بيانات
// ═══════════════════════════════════════════════════════════════════════════
const verbose = process.argv.includes("--list")

const files = fs
  .readdirSync(SCRIPTS_DIR)
  .filter((f) => /^selftest-.*\.js$/.test(f))
  .sort()

if (files.length === 0) {
  console.error("X لا فخاخَ فى مجلّدِ scripts — وبحثٌ لا يجدُ ليس دليلَ سلامة.")
  process.exit(1)
}

const problems = []

// (أ) جملةُ الفخاخِ مُثبَّتة
const pinTraps = judgePin(files.length, PINNED_TRAPS)
if (pinTraps === "grew") {
  problems.push(
    `جملةُ الفخاخِ ${files.length} والمُثبَّتُ ${PINNED_TRAPS} — ` +
      `فخٌّ جديدٌ لم يُثبَّتْ. أضِفْه إلى PINNED_VAR_OF إن كان يحتاجُ قاعدةً، وارفعِ PINNED_TRAPS.`
  )
} else if (pinTraps === "shrank") {
  problems.push(
    `جملةُ الفخاخِ ${files.length} والمُثبَّتُ ${PINNED_TRAPS} — ` +
      "**ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**: اخفضِ العددَ فى دفعةِ من خفضَه."
  )
}

// (ب) حكمُ كلِّ فخّ
let needDb = 0
const rows = []
for (const f of files) {
  const name = f.replace(/\.js$/, "")
  const src = fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf8")
  const pinnedVar = PINNED_VAR_OF[name] || null
  const declaredPartial = Boolean(DECLARED_PARTIAL[name])
  if (pinnedVar) needDb++
  problems.push(...judgeTrap({ name, src, pinnedVar, declaredPartial }))
  rows.push({ name, pinnedVar, home: usesTheOneHome(src), declaredPartial })
}

// (ج) عددُ المحتاجينَ للقاعدةِ مُثبَّت
const pinNeed = judgePin(needDb, PINNED_NEED_DB)
if (pinNeed !== "ok") {
  problems.push(
    `المحتاجونَ لقاعدةٍ ${needDb} والمُثبَّتُ ${PINNED_NEED_DB} — ` +
      (pinNeed === "grew" ? "زادوا فلم يُثبَّتوا." : "**ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.")
  )
}

// (د) وإعلانُ التخطّى الجزئىِّ لا يكونُ لفخٍّ لا وجودَ له
for (const n of Object.keys(DECLARED_PARTIAL)) {
  if (!files.includes(`${n}.js`)) {
    problems.push(`إعلانٌ جزئىٌّ لفخٍّ لا وجودَ له: ${n} — **ولا زينةَ على بابٍ لا يُفتَح**.`)
  }
}
for (const n of Object.keys(PINNED_VAR_OF)) {
  if (!files.includes(`${n}.js`)) {
    problems.push(`تثبيتٌ لفخٍّ لا وجودَ له: ${n} — احذفْه من PINNED_VAR_OF فى دفعةِ من حذفَه.`)
  }
}

// (هـ) والبيتُ حىٌّ بطريقَيه
const homePath = path.join(SCRIPTS_DIR, HOME_REL)
if (!fs.existsSync(homePath)) {
  problems.push(`البيتُ الواحدُ غائب: scripts/${HOME_REL} — **وبيتٌ لا يُسكَنُ ليس بيتاً**.`)
} else {
  problems.push(...judgeHome(fs.readFileSync(homePath, "utf8")))
}

const test = Object.values(PINNED_VAR_OF).filter((v) => v === "TEST_SUPABASE_DB_URL").length
const prod = Object.values(PINNED_VAR_OF).filter((v) => v === "PRODUCTION_SUPABASE_DB_URL").length

console.log(
  `  الفخاخ: ${files.length} (المُثبَّت ${PINNED_TRAPS})   ·   ` +
    `تحتاجُ قاعدةً: ${needDb} (${test} اختبار · ${prod} إنتاج)   ·   ` +
    `تُثبتُ بلا قاعدة: ${files.length - needDb}`
)
if (verbose) {
  for (const r of rows) {
    console.log(
      `    ${r.pinnedVar ? "قاعدة " : "بلا   "} ${r.name}` +
        (r.pinnedVar ? `  ← ${r.pinnedVar}` : "") +
        (r.declaredPartial ? "   (تخطٍّ جزئىٌّ مُعلَن)" : "")
    )
  }
}

if (problems.length) {
  console.error(`\nX ${problems.length} مخالفة:\n`)
  for (const p of problems) console.error(`    - ${p}`)
  console.error(
    "\n  العلاج: يُنادى البيتُ الواحدُ بدل الحكمِ المكتوبِ باليد:\n" +
      '         const { requireDbOrSkip } = require("./lib/selftest-db")\n' +
      '         const url = requireDbOrSkip("TEST_SUPABASE_DB_URL", "ماذا كان سيُثبت")\n' +
      "  فيقولُ الفخُّ الحقَّ: **لم أَقِسْ** — لا «نجحتُ» ولا «سقطتُ».\n"
  )
  process.exit(1)
}

console.log(
  `+ كلُّ فخٍّ ذاتىٍّ يأخذُ حكمَه على غيابِ رابطِ القاعدةِ من بيتٍ واحد ` +
    `(scripts/${HOME_REL}) بطريقَيه — تخطٍّ موسومٌ يُعَدُّ (${SKIP_TAG}) وإلزامٌ يُسقِط ` +
    `(--require-db) · ${files.length} فخّاً، ${needDb} منها يحتاجُ قاعدةً مُثبَّتاً بالاسمِ والرابط.`
)
process.exit(0)
