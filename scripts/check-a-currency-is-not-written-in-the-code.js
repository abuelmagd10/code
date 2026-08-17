#!/usr/bin/env node
/**
 * check-a-currency-is-not-written-in-the-code.js — v3.75.50
 *
 * «ولا تُسمّى عملةٌ بعينِها»
 *
 * **ورقمُ المالِ لا يُقرأُ إلّا بعُرْفِ صاحبِه**: «٩٨٦٫١٠» بالجنيهِ ليست
 * «986.10 $». فعملةُ الشركةِ **صفةٌ فى صفِّها لا نصٌّ فى شيفرتِنا** — ومشروعٌ
 * يُحاكَمُ بأنّه عالمىٌّ لا يجوزُ أن يقرِّرَ عملةَ عميلٍ لم يُسجَّلْ بعد.
 *
 * ═══ ويُحكَمُ بالخاصّيّةِ لا بالعبارة ═══
 *
 * لا يُبحَثُ عن اسمِ عملةٍ بعينِها (فذلك يحرسُ عبارةً يُلتَفُّ عليها بحرف)، بل عن
 * **موضعِ القرار**:
 *
 *   (أ) خيارُ عملةٍ مُثبَّتٌ بنصٍّ مكتوب:   `currency: 'EGP'`
 *   (ب) قيمةٌ افتراضيّةٌ تُثبِّتُ عملةً أو رمزَها:  `currency = "EGP"`
 *                                              `currencySymbol = '£'`
 *
 * **ولا يُحاكَمُ من يستقبلُها**: `{ style: 'currency', currency }` أو
 * `currency: currencyCode` قرارُهما عندَ المُنادِى لا هنا. **ولا يُحاكَمُ بيتُ
 * المفردات**: جدولٌ يقولُ إنّ رمزَ `EGP` هو `£` **يعرِّفُ ولا يقرِّر**، ومفتاحُه
 * `EGP:` لا `currency:`. **والتعليقُ ليس تعليمة** — يُحجَبُ قبلَ الحكم.
 *
 * ═══ ويُسمّى الأثرَ لا الشكلَ ═══
 *
 * الموضعُ الواقعُ داخلَ سياقِ تنسيقٍ (`Intl.NumberFormat` أو `style: 'currency'`)
 * **يُعرَضُ عليه أنّه تنسيقُ عرض**، وما عداه **قيمةٌ تُكتَبُ أو تُرسَل** — وهذه
 * أثقلُ، لأنّ عملةً تُكتَبُ فى صفٍّ تبقى فيه. **والحكمُ بالأثرِ لا بالاسم.**
 *
 * ═══ ومعدودٌ لا مسكوتٌ عنه ═══
 *
 * لا تُحوَّلُ اليومَ شاشة: تحويلُ كلِّ موضعٍ يحتاجُ قراءةَ عملةِ الشركةِ من
 * القاعدةِ فى موضعِه، **ونصفُ جراحةٍ أسوأُ من لا جراحة**. فيُثبَّتُ العددُ فلا
 * يزيد، ويُسمَّى أصحابُه واحداً واحداً ليُسدَّدوا على دفعاتٍ مقيسة. **ومكسبٌ لا
 * يُثبَّتُ يُلتَفُّ عليه**: كلُّ نقصانٍ يُنزَّلُ هنا فى الدفعةِ التى كسبته.
 *
 * ═══ ولا يُبنى بيتٌ ثانٍ ═══
 *
 * جردُ الشيفرةِ يُقرأُ من `scripts/lib/repo-code-files.js` — من المستودعِ لا من
 * القرص، فلا يختلفُ الحكمُ بين جهازٍ وجهاز.
 *
 * Usage: node scripts/check-a-currency-is-not-written-in-the-code.js [--selftest]
 */
"use strict"
const { projectCodeFiles, keepPath, NOT_SHIPPED } = require("./lib/repo-code-files")

const PINNED = 36
// **ونصُّ الفحصِ مواصفةٌ لا صنعة** — ولا يحتاجُ هذا الملفُّ استثناءً بالاسم:
// فخُّه الذاتىُّ يحملُ أمثلةً مكتوبةً حرفاً **ليُثبتَ أنّه يراها**، لكنّ جردَ
// البيتِ الواحدِ **لا يشملُ مجلّدَ `scripts` أصلاً** — وهذا مقيسٌ لا مُدَّعى:
// يُختبَرُ فى الفخِّ الذاتىِّ بنداءِ `keepPath` نفسِها. **واستثناءٌ لا يُشغَّلُ
// أبداً ليس استثناءً بل طمأنينةٌ كاذبة**، فلا يُكتَب.

// ───────────────────────────────────────────────────────────────────────────
// **والتعليقُ ليس تعليمة**: تُحجَبُ التعليقاتُ ويبقى طولُ النصِّ كما هو،
// فيبقى رقمُ السطرِ صادقاً.
// ───────────────────────────────────────────────────────────────────────────
function stripComments(src) {
  let out = "", i = 0
  const n = src.length
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i++ } continue }
    if (c === "/" && d === "*") {
      out += "  "; i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++ }
      if (i < n) { out += "  "; i += 2 }
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { out += src[i]; i++; if (i < n) { out += src[i]; i++ } continue }
        out += src[i]; i++
      }
      if (i < n) { out += src[i]; i++ }
      continue
    }
    out += c; i++
  }
  return out
}

// (أ) خيارُ عملةٍ مُثبَّتٌ بنصّ: currency: 'EGP' · base_currency: "USD" · charge_currency: `EGP`
// والبادئةُ واللاحقةُ اختياريّتان — **وسقوطُ ذلك أوّلَ مرّةٍ أمسكَه الفخُّ الذاتىّ**.
const OPTION_RE = /\b\w*currency\w*\s*:\s*(['"`])([^'"`\n]{1,4})\1/gi
// (ب) قيمةٌ افتراضيّةٌ أو إسنادٌ يُثبِّتُ عملةً أو رمزَها
const DEFAULT_RE = /\b\w*currency\w*\s*(?::\s*string\s*)?=\s*(['"`])([^'"`\n]{1,4})\1/gi

/** هل الموضعُ داخلَ سياقِ تنسيقٍ نقدىّ؟ (نافذةٌ قبلَه وبعدَه) */
function looksLikeFormatting(code, at) {
  const w = code.slice(Math.max(0, at - 240), Math.min(code.length, at + 240))
  return /Intl\.NumberFormat|style\s*:\s*['"`]currency['"`]|toLocaleString/.test(w)
}

function lineOf(src, at) {
  let n = 1
  for (let i = 0; i < at && i < src.length; i++) if (src[i] === "\n") n++
  return n
}

/** يُرجعُ مواضعَ العملةِ المكتوبةِ حرفاً فى ملفٍّ واحد. */
function currencyLiterals(src) {
  const code = stripComments(src)
  const out = []
  const seen = new Set()
  for (const re of [OPTION_RE, DEFAULT_RE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code)) !== null) {
      if (seen.has(m.index)) continue
      seen.add(m.index)
      out.push({
        line: lineOf(code, m.index),
        text: m[0].trim(),
        why: looksLikeFormatting(code, m.index) ? "تنسيقُ عرض" : "قيمةٌ تُكتَبُ أو تُرسَل",
      })
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

// ───────────────────────────────────────────────────────────────────────────
// **وفخٌّ لا يُشغَّل ليس فخّاً**
// ───────────────────────────────────────────────────────────────────────────
function selftest() {
  let bad = 0
  const t = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + label + "  (توقّعتُ " + JSON.stringify(want) + " فجاء " + JSON.stringify(got) + ")")
  }
  const n = (s) => currencyLiterals(s).length
  const why = (s) => currencyLiterals(s).map((x) => x.why)

  t("يرى خيارَ عملةٍ مكتوباً حرفاً", n(`new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })`), 1)
  t("ويراه بعلامةٍ مزدوجة", n(`{ currency: "USD" }`), 1)
  t("ويرى الاسمَ المركَّب base_currency", n(`{ base_currency: "EGP" }`), 1)
  t("ويرى charge_currency", n(`{ charge_currency: 'EGP' }`), 1)
  t("ويرى قيمةً افتراضيّةً تُثبِّتُ عملة", n(`function f(amount, currency = "EGP") {}`), 1)
  t("ويراها بنوعٍ معلَن", n(`function f(a: number, currency: string = "EGP") {}`), 1)
  t("ويرى رمزاً افتراضيّاً مكتوباً", n(`const g = (a, currencySymbol = '£') => a`), 1)

  t("ولا يحكمُ على عملةٍ مُستقبَلةٍ بالاختصار", n(`new Intl.NumberFormat(l, { style: 'currency', currency })`), 0)
  t("ولا على عملةٍ من متغيّر", n(`{ style: 'currency', currency: currencyCode }`), 0)
  t("ولا على بيتِ المفرداتِ — يعرِّفُ ولا يقرِّر", n(`const CURRENCIES = { EGP: { symbol: '£' }, USD: { symbol: '$' } }`), 0)
  t("ولا على قراءةٍ من صفّ", n(`const c = row.currency || fallbackFromCompany`), 0)
  t("ولا على ذكرٍ داخل تعليقٍ سطرىّ — التعليقُ ليس تعليمة", n(`// currency: 'USD'`), 0)
  t("ولا داخلَ تعليقٍ كتلىّ", n(`/* currency: "EGP" */ const a = 1`), 0)
  t("ولا على حقلٍ ليس عملة", n(`{ country: 'EGP' }`), 0)
  t("ويقبلُ ملفّاً فارغاً بلا صراخ", n(``), 0)

  t("ويُسمّى الأثرَ تنسيقاً حين يكونُ تنسيقاً", why(`new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })`), ["تنسيقُ عرض"])
  t("ويُسمّيه قيمةً تُكتَبُ حين لا تنسيقَ حولَه", why(`await supabase.from('bills').insert({ currency: 'EGP' })`), ["قيمةٌ تُكتَبُ أو تُرسَل"])
  t("ويقولُ رقمَ السطرِ صادقاً بعدَ تعليقٍ كتلىّ",
    currencyLiterals(`/* أوّل\nثانٍ */\nconst x = { currency: 'EGP' }`).map((v) => v.line), [3])
  t("ولا يعدُّ الموضعَ مرّتَين", n(`const currency = 'EGP'; const o = { currency: 'EGP' }`), 2)

  // **ونصُّ الفحصِ مواصفةٌ لا صنعة** — والجردُ لا يبلغُ مجلّدَ الحرّاسِ فلا يعدُّ نفسَه.
  // وهذا يُقاسُ بنداءِ البيتِ نفسِه، لا يُدَّعى.
  t("والجردُ لا يشملُ مجلّدَ الحرّاس — فلا يعدُّ الفحصُ نفسَه", keepPath("scripts/x.js", NOT_SHIPPED), false)
  t("ويشملُ شيفرةَ الشاشاتِ فعلاً — وبحثٌ لا يجد ليس دليلَ غياب", keepPath("app/page.tsx", NOT_SHIPPED), true)
  t("ويشملُ lib وcomponents وhooks", [keepPath("lib/u.ts", NOT_SHIPPED), keepPath("components/c.tsx", NOT_SHIPPED), keepPath("hooks/h.ts", NOT_SHIPPED)], [true, true, true])
  t("ولا يشملُ اختباراً لا يُشحَن", keepPath("tests/a.test.ts", NOT_SHIPPED), false)

  console.log("  الفخُّ الذاتىّ: 23 اتّجاهاً، " + (bad ? bad + " منها خاطئ." : "كلُّها صحيحة."))
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

// ───────────────────────────────────────────────────────────────────────────
// الحكمُ على المستودع
// ───────────────────────────────────────────────────────────────────────────
let census
try {
  census = projectCodeFiles()
} catch (e) {
  console.error("X " + ((e && e.message) || e))
  process.exit(1)
}

const found = []
for (const f of census.files) {
  for (const hit of currencyLiterals(f.src)) found.push({ rel: f.rel, ...hit })
}

console.log(
  "  ملفّاتُ شيفرةٍ من المستودع: " + census.files.length +
  "   ·   مواضعُ عملةٍ مكتوبةٍ حرفاً: " + found.length + "   (المُثبَّت " + PINNED + ")"
)

if (found.length > PINNED) {
  console.error(
    "\nX زادت العملةُ المكتوبةُ حرفاً: " + found.length + " والمُثبَّتُ " + PINNED +
    " — **ولا تُسمّى عملةٌ بعينِها**.\n" +
    "  عملةُ الشركةِ صفةٌ فى صفِّها لا نصٌّ فى الشيفرة، ونحن نبنى مشروعاً عالميّاً.\n" +
    "  اقرأْها من الشركةِ ومرِّرْها، أو استقبلْها وسيطاً — ولا تُثبِّتْها هنا."
  )
  for (const x of found) console.error("      - " + x.rel + ":" + x.line + "   [" + x.why + "]   " + x.text)
  process.exit(1)
}

if (found.length < PINNED) {
  console.error(
    "\nX نقصَ العددُ إلى " + found.length + " والمُثبَّتُ " + PINNED + " — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n" +
    "  أنزِلِ الرقمَ فى الدفعةِ التى كسبَتْه: const PINNED = " + found.length
  )
  process.exit(1)
}

console.log(
  "+ لا موضعَ جديدٌ يُسمّى عملةً بعينِها (" + found.length + " مُثبَّتون عند " + PINNED +
  "؛ الحكمُ بموضعِ القرارِ لا بالاسم: خيارُ عملةٍ مُثبَّتٌ بنصّ، أو قيمةٌ افتراضيّةٌ تُثبِّتُ عملةً أو رمزَها — " +
  "ولا يُحاكَمُ من يستقبلُها، ولا بيتُ المفردات، والتعليقُ محجوب)."
)
console.log("  ! ومعدودٌ لا مسكوتٌ عنه — يُسدَّدون على دفعاتٍ مقيسة:")
for (const x of found) console.log("      - " + x.rel + ":" + x.line + "   [" + x.why + "]   " + x.text)
process.exit(0)
