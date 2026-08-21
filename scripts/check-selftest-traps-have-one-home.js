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
 * ═══ وما أضافته v3.75.81 — لأنَّ العدَّ وحدَه لم يكفِ ═══
 *
 * عدَّت v3.75.80 الفخاخَ وأصلحَتْ حكمَها، **ولم تسألْ من يُشغِّلُها**. فقِيسَ
 * بعدَها بيومٍ فإذا **سبعةَ عشرَ فخّاً من الستّةِ والعشرينَ لا يُناديها شىء**.
 * وثلاثةٌ منها ساقطةٌ فعلاً: واحدٌ مكسورٌ منذ v3.75.59، وواحدٌ **لم يكنْ أخضرَ
 * قطُّ** منذ v3.75.4، وواحدٌ يرفضُ بحقٍّ لردمٍ لم يُطبَّق.
 *
 *   **(٥) ولكلِّ فخٍّ مُنادٍ** — بابٌ واحدٌ اسمُه `check-*` (فتُشغِّلُه بوّابةُ
 *       الدفعِ بحكمِ إحصائِها) **يُحصِى المجلَّدَ ولا يحفظُ اسماً**. ولو حفظَ
 *       الأسماءَ لعادَ الفخُّ الجديدُ يتيماً من يومِه. **وفخٌّ يعطبُ فى صمتٍ
 *       أسوأُ من فخٍّ لا يوجد**: الأوّلُ يُوهمُ صاحبَه أنَّ حارسَه مُبرهَن.
 *
 *   **(٦) والزرعُ يُثبَتُ قبلَ الحُكم** — فخٌّ يزرعُ بمطابقةِ نصٍّ محفوظٍ عندَه
 *       لنصٍّ حىٍّ يتغيَّر، فإن لم يُوجَدِ الموضعُ **لم يُزرعْ شىءٌ أصلاً**،
 *       فيقولُ «الحارسُ لم يرفض» — وهى جملةٌ تحتملُ نقيضَين، أى **بيتَين**.
 *       فالزرعُ من `lib/selftest-plant.js` يصيحُ فى موضعِه، والرَّوسَةُ مُثبَّتة.
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

// ── v3.75.81 — المُنادى ─────────────────────────────────────────────────────
// اسمُه `check-*` عن قصد: بوّابةُ الدفعِ تُشغِّلُ كلَّ `check-*.js`، فصارَ له
// مُنادٍ قائمٌ بلا سطرٍ جديدٍ فى سكربتٍ لا يعيشُ فى المستودع.
const CALLER_REL = "check-every-selftest-trap-is-run.js"

// ── v3.75.81 — رَوسَةُ الزرعِ بالنصّ ────────────────────────────────────────
// **معدودٌ لا مسكوتٌ عنه**: كلُّ فخٍّ يزرعُ بمطابقةِ نصٍّ مذكورٌ هنا بعددِ
// زراعاتِه. فإن زادَ زرعٌ ولم يُثبَّتْ، رُفض.
const PINNED_PLANTERS = {
  "selftest-purchase-return-priced-by-the-bill": 3,
  "selftest-product-management-one-door": 1,
  "selftest-line-endings-are-one-way": 1,
}

// وما فيه `.replace(` وليسَ زرعاً يُعلَنُ بسببِه، فلا يُحاكَمُ ولا يُسكَتُ عنه.
const DECLARED_NOT_A_PLANT = {
  "selftest-products-select-star": {
    why:
      "يُثبتُ زرعَه بنفسِه ولا يخرجُ بخطأٍ بل يُسمّى العطبَ ويُكمِلُ التنظيف، " +
      "وبديلُه يستعملُ مجموعةَ التقاطٍ ($1) لا نصّاً ثابتاً — فنقلُه إلى البيتِ " +
      "يُغيّرُ سلوكَه عندَ الفشلِ بلا مكسب.",
  },
  "selftest-schema-snapshot-matches-db": {
    why:
      "موضعُ الزرعِ عندَه **مقتطَعٌ من النصِّ نفسِه** قبلَ الاستبدال، فلا يمكنُ " +
      "أن يغيبَ الموضعُ أصلاً — والعلّةُ التى وُلدَ لها البيتُ غيرُ قائمةٍ هنا.",
  },
  "selftest-trigger-silently-cancels-delete": {
    why:
      "استبدالُه الوحيدُ حجبُ رابطِ القاعدةِ من نصِّ خطأٍ قبلَ طباعتِه — " +
      "تنظيفُ ناتجٍ لا زرعُ عطب، ولا حكمَ يُبنى عليه.",
  },
  "selftest-subtype-tenant-divergence": {
    why:
      "استبدالُه الوحيدُ حجبُ رابطِ القاعدةِ من نصِّ خطأٍ قبلَ طباعتِه — " +
      "تنظيفُ ناتجٍ لا زرعُ عطب، ولا حكمَ يُبنى عليه.",
  },
  "selftest-ledger-integrity": {
    why:
      "استبدالُه تشذيبُ سطرٍ عندَ قراءةِ قائمةٍ مكتوبةٍ (نزعُ شَرطةٍ بادئة)، " +
      "لا زرعَ فيه ولا يُبنى عليه حكمُ رفضٍ أو تبرئة.",
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

// ── v3.75.81 — (٥) ولكلِّ فخٍّ مُنادٍ ────────────────────────────────────────

/**
 * **المُنادى يُحصِى ولا يحفظ.** يُحكَمُ على نصِّه هو، لا على نيّتِه.
 * @param {string} src نصُّ المُنادى
 * @param {string[]} trapNames أسماءُ الفخاخِ الحقيقيّةِ بلا امتداد
 */
function judgeCaller(src, trapNames) {
  const out = []
  const masked = maskComments(src)
  if (!/readdirSync/.test(masked)) {
    out.push("المُنادى لا يُحصِى المجلَّد — فقائمةٌ مكتوبةٌ تجعلُ الفخَّ الجديدَ يتيماً من يومِه.")
  }
  if (!/["']selftest-["']|startsWith\(\s*["']selftest-/.test(masked) && !/\^selftest-/.test(masked)) {
    out.push("المُنادى لا يُرشِّحُ الفخاخَ بسابقتِها — فما يُحصِيه ليس الفخاخ.")
  }
  if (!/spawnSync|execFileSync|spawn\(/.test(masked)) {
    out.push("المُنادى لا يُشغِّلُ شيئاً — **ولا زينةَ على بابٍ لا يُفتَح**.")
  }
  // **والوسمُ يُقرَأُ من بيتِه لا يُكتَبُ ثانيةً**: لو كتبَه المُنادى بيدِه لصارَ
  // للوسمِ بيتان، فيُغيَّرُ فى أحدِهما ويبقى الآخرُ يقيسُ وسماً لا يُطبَعُ أبداً.
  if (new RegExp(`["'\`]${SKIP_TAG}`).test(masked)) {
    out.push(`المُنادى يكتبُ وسمَ «لم أَقِسْ» (${SKIP_TAG}) بيدِه — والوسمُ بيتُه lib/selftest-db.`)
  } else if (!/\bSKIP_TAG\b/.test(masked) || !/require\(\s*["'][^"']*lib\/selftest-db["']\s*\)/.test(masked)) {
    out.push("المُنادى لا يقرأُ وسمَ «لم أَقِسْ» من بيتِه — فسيَعُدُّ الصامتَ ناجحاً.")
  }
  // **ولا يُكتَبُ اسمُ فخٍّ حقيقىٍّ فيه**: بيتُ الأسماءِ هو المجلَّد.
  for (const n of trapNames) {
    if (masked.includes(n)) {
      out.push(`المُنادى يكتبُ اسمَ فخٍّ بعينِه (${n}) — فصارَ للأسماءِ بيتان، والمجلَّدُ هو البيت.`)
    }
  }
  return out
}

// ── v3.75.81 — (٦) والزرعُ يُثبَتُ قبلَ الحُكم ──────────────────────────────

/** نداءُ بيتِ الزرع، مع تعميةِ التعليقات. */
function usesThePlantHome(src) {
  return /require\(\s*["'][^"']*lib\/selftest-plant["']\s*\)/.test(maskComments(src))
}

/** عددُ الزراعاتِ المُثبَتةِ فى الفخّ. */
function countPlants(src) {
  const m = maskComments(src).match(/\b(?:plantedText|strippedText)\s*\(/g)
  return m ? m.length : 0
}

/** أفيه استبدالُ نصٍّ أصلاً؟ (فمن لا استبدالَ فيه لا يُسأَلُ عن زرع) */
function hasTextReplace(src) {
  return /\.replace\s*\(/.test(maskComments(src))
}

/**
 * حكمُ الزرعِ على فخٍّ واحد.
 * @param {{name:string, src:string, pinnedPlants:number|null, declaredNotAPlant:boolean}} t
 */
function judgePlanting(t) {
  const out = []
  const has = hasTextReplace(t.src)
  if (t.pinnedPlants !== null && t.declaredNotAPlant) {
    out.push(`${t.name}: مُثبَّتٌ زارعاً ومُعلَنٌ غيرَ زارعٍ معاً — **وحكمانِ على حالةٍ واحدةٍ بيتان**.`)
    return out
  }
  if (t.pinnedPlants !== null) {
    if (!usesThePlantHome(t.src)) {
      out.push(`${t.name}: مُثبَّتٌ زارعاً ولا ينادى lib/selftest-plant — فزرعُه قد لا يقعُ ولا يعلمُ أحد.`)
    }
    const got = countPlants(t.src)
    if (got !== t.pinnedPlants) {
      out.push(
        `${t.name}: زراعاتُه ${got} والمُثبَّتُ ${t.pinnedPlants} — ` +
        (got > t.pinnedPlants ? "زرعٌ زادَ ولم يُثبَّتْ." : "**ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**."))
    }
    return out
  }
  if (has && !t.declaredNotAPlant) {
    out.push(
      `${t.name}: فيه استبدالُ نصٍّ ولم يُثبَّتْ زارعاً ولم يُعلَنْ غيرَ زارع — ` +
      "إمّا أن يُنادىَ بيتُ الزرعِ ويُثبَّتَ عددُه، وإمّا أن يُكتَبَ سببُ استثنائِه.")
  }
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

  // ── (٧) v3.75.81 — ولكلِّ فخٍّ مُنادٍ ────────────────────────────────────
  const CALLER_SRC = fs.readFileSync(path.join(SCRIPTS_DIR, CALLER_REL), "utf8")
  const REAL_NAMES = fs.readdirSync(SCRIPTS_DIR)
    .filter((f) => /^selftest-.*\.js$/.test(f)).map((f) => f.replace(/\.js$/, ""))
  t("المُنادى الحقيقىُّ سليم", judgeCaller(CALLER_SRC, REAL_NAMES).length, 0)
  t("ويرفضُ مُنادياً لا يُحصِى المجلَّد",
    judgeCaller(CALLER_SRC.replace(/readdirSync/g, "xxx"), REAL_NAMES).length > 0, true)
  t("ويرفضُ مُنادياً لا يُشغِّلُ شيئاً — ولا زينةَ على بابٍ لا يُفتَح",
    judgeCaller(CALLER_SRC.replace(/spawnSync/g, "noop").replace(/execFileSync/g, "noop"), REAL_NAMES).length > 0, true)
  t("ويرفضُ مُنادياً يَعُدُّ «لم أَقِسْ» نجاحاً",
    judgeCaller(CALLER_SRC.replace(/\bSKIP_TAG\b/g, "XX"), REAL_NAMES).length > 0, true)
  t("ويرفضُ مُنادياً يكتبُ الوسمَ بيدِه — فيصيرُ للوسمِ بيتان",
    judgeCaller(`${CALLER_SRC}\nconst tag = "${SKIP_TAG}"\n`, REAL_NAMES).length > 0, true)
  t("ويرفضُ مُنادياً يكتبُ اسمَ فخٍّ حقيقىٍّ بيدِه — فالمجلَّدُ هو بيتُ الأسماء",
    judgeCaller(`${CALLER_SRC}\nconst list = ["${REAL_NAMES[0]}"]\n`, REAL_NAMES).length > 0, true)
  t("ويُسمّى الفخَّ المكتوبَ بعينِه",
    judgeCaller(`${CALLER_SRC}\nconst list = ["${REAL_NAMES[0]}"]\n`, REAL_NAMES)
      .some((p) => p.includes(REAL_NAMES[0])), true)
  t("ولا يخدعُه اسمُ فخٍّ فى تعليق — والتعليقُ ليس تعليمة",
    judgeCaller(`${CALLER_SRC}\n// ${REAL_NAMES[0]}\n`, REAL_NAMES).length, 0)

  // ── (٨) v3.75.81 — والزرعُ يُثبَتُ قبلَ الحُكم ───────────────────────────
  const PLANT_CALL = 'const { plantedText } = require("./lib/selftest-plant")\n'
  t("يرى نداءَ بيتِ الزرع", usesThePlantHome(PLANT_CALL), true)
  t("ولا يراه فى تعليق", usesThePlantHome('// require("./lib/selftest-plant")\n'), false)
  t("ويَعُدُّ الزراعاتِ عدّاً", countPlants(`${PLANT_CALL}plantedText(a,b,c,d)\nstrippedText(a,b,c)\n`), 2)
  t("ولا يَعُدُّ زرعاً فى تعليق", countPlants(`${PLANT_CALL}// plantedText(a,b,c,d)\n`), 0)
  t("ويرى استبدالَ النصِّ حيثُ كان", hasTextReplace("x.replace(/a/, 'b')"), true)
  t("ولا يراه فى تعليق", hasTextReplace("// x.replace(/a/, 'b')"), false)

  const PLANTER_OK = `${PLANT_CALL}q(plantedText(def, "a", "b", "س"))\n`
  t("يُبرِّئُ زارعاً ينادى البيتَ بعددٍ مطابق",
    judgePlanting({ name: "a", src: PLANTER_OK, pinnedPlants: 1, declaredNotAPlant: false }).length, 0)
  t("ويرفضُ زارعاً مُثبَّتاً لا ينادى البيت",
    judgePlanting({ name: "a", src: 'q(def.replace("a", "b"))\n', pinnedPlants: 1, declaredNotAPlant: false }).length, 2)
  t("ويرفضُ زرعاً زادَ ولم يُثبَّتْ",
    judgePlanting({ name: "a", src: `${PLANTER_OK}q(plantedText(x, "c", "d", "س"))\n`, pinnedPlants: 1, declaredNotAPlant: false }).length, 1)
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه",
    judgePlanting({ name: "a", src: PLANT_CALL, pinnedPlants: 1, declaredNotAPlant: false }).length, 1)
  t("ويرفضُ استبدالاً لم يُثبَّتْ ولم يُعلَنْ",
    judgePlanting({ name: "a", src: 'q(def.replace("a", "b"))\n', pinnedPlants: null, declaredNotAPlant: false }).length, 1)
  t("ولا يُحاكِمُ المُعلَنَ بسببٍ مكتوب",
    judgePlanting({ name: "a", src: 'q(def.replace("a", "b"))\n', pinnedPlants: null, declaredNotAPlant: true }).length, 0)
  t("ويُبرِّئُ فخّاً لا استبدالَ فيه أصلاً",
    judgePlanting({ name: "a", src: "const x = 1\n", pinnedPlants: null, declaredNotAPlant: false }).length, 0)
  t("ويرفضُ من ثُبِّتَ زارعاً وأُعلِنَ غيرَ زارعٍ معاً — وحكمانِ على حالةٍ واحدةٍ بيتان",
    judgePlanting({ name: "a", src: PLANTER_OK, pinnedPlants: 1, declaredNotAPlant: true }).length, 1)
  t("ولا إعلانَ «ليس زرعاً» بلا سببٍ مكتوب",
    Object.values(DECLARED_NOT_A_PLANT).every((d) => d.why && d.why.length > 40), true)

  // ── (٩) وبيتُ الزرعِ نفسُه يصيحُ حين لا يقعُ الزرع ────────────────────────
  const { plantedText: PT } = require("./lib/selftest-plant")
  t("بيتُ الزرعِ يزرعُ حين يجدُ الموضع", PT("a X b", "X", "Y", "س"), "a Y b")
  t("ولا يُفسِّرُ الدولارَ فى البديل — قانونُ أدواتِ الترقيع", PT("a X b", "X", "$&", "س"), "a $& b")
  let shouted = false
  try { PT("nothing here", "X", "Y", "س") } catch { shouted = true }
  t("ويصيحُ حين لا يقعُ الزرع — فلا يلتبسُ «لم يرفض» بـ«لم يُزرَعْ شىء»", shouted, true)

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
  // v3.75.81 — (٦) والزرعُ يُثبَتُ قبلَ الحُكم
  problems.push(...judgePlanting({
    name,
    src,
    pinnedPlants: Object.prototype.hasOwnProperty.call(PINNED_PLANTERS, name) ? PINNED_PLANTERS[name] : null,
    declaredNotAPlant: Boolean(DECLARED_NOT_A_PLANT[name]),
  }))
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

// (و) v3.75.81 — ولكلِّ فخٍّ مُنادٍ
const trapNames = files.map((f) => f.replace(/\.js$/, ""))
const callerPath = path.join(SCRIPTS_DIR, CALLER_REL)
if (!fs.existsSync(callerPath)) {
  problems.push(
    `المُنادى غائب: scripts/${CALLER_REL} — **وفخٌّ لا يُنادى ليس فخّاً**، ` +
    "ولا يعلمُ صاحبُه أنَّ حارسَه صارَ بلا برهان.")
} else {
  problems.push(...judgeCaller(fs.readFileSync(callerPath, "utf8"), trapNames))
}

// (ز) v3.75.81 — ولا إعلانَ ولا تثبيتَ لفخٍّ لا وجودَ له
for (const n of Object.keys(PINNED_PLANTERS)) {
  if (!files.includes(`${n}.js`)) {
    problems.push(`تثبيتُ زرعٍ لفخٍّ لا وجودَ له: ${n} — احذفْه فى دفعةِ من حذفَه.`)
  }
}
for (const n of Object.keys(DECLARED_NOT_A_PLANT)) {
  if (!files.includes(`${n}.js`)) {
    problems.push(`إعلانُ «ليس زرعاً» لفخٍّ لا وجودَ له: ${n} — **ولا زينةَ على بابٍ لا يُفتَح**.`)
  }
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
