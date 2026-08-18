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
 * ═══ وللاختيارِ بيتٌ قائمٌ فليُنادَ بالاسم ═══
 *
 * عملةُ الشركةِ **مُختارةٌ ومحفوظةٌ فعلاً**: `companies.base_currency`
 * (NOT NULL, DEFAULT 'EGP')، وصفحةُ الإعداداتِ تكتبُ الأسعارَ فى
 * `exchange_rates`، والمدفوعاتُ تحفظُ `base_currency_amount`.
 *
 * **والقارئُ الصحيحُ واحد**:
 *     lib/currency-service.ts::getBaseCurrency(supabase, companyId)
 *
 * **وثَمَّ بيتٌ ثانٍ يحملُ الاسمَ نفسَه ولا يُنادَى**:
 * `lib/exchange-rates.ts::getBaseCurrency()` يقرأُ من `localStorage` ويُعيدُ
 * `'EGP'`، **ويُعلِنُ عن نفسِه أنّه مهجور**. فمن أصلحَ موضعاً فلا يُصلحْه إليه —
 * **وقاعدةٌ لها بيتان تقولُ قولَين**، ولا يُصلَحُ عطبٌ بعطبٍ آخَر.
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
/**
 * v3.75.58 — **والارتدادُ اختراعٌ مؤجَّل.**
 *
 * النمطانِ أعلاه يشترطانِ أن تجىءَ العملةُ **مباشرةً** بعدَ `:` أو `=`. وكلُّ
 * ما كُتبَ خلفَ عاملٍ آخَرَ كان يسقطُ من كلِّ شبكةٍ فى المشروع:
 *
 *     const c = row.currency || 'EGP'        ← ارتدادٌ عن قيمةٍ صامتة
 *     p_currency_code: body.ccy ?? 'EGP'     ← ارتدادٌ كذلك
 *     baseCurrency === 'EGP' ? a : b         ← مقارنةٌ يتفرّعُ عليها سلوك
 *     x ? 'EGP' : 'USD'                      ← فرعُ شرطٍ
 *
 *     const [c, setC] = useState('EGP')      ← وسيطٌ يُمرَّرُ لدالّة
 *     return 'EGP'                           ← قيمةٌ تُعادُ من دالّة
 *
 * وكان الحارسُ يقولُ «٣٦ مُثبَّتون» **وهو صادقٌ فيما يقيس**، ويُقرَأُ على أنّه
 * حجمُ الدَّين — **وليس كذلك**.
 *
 * **ولا يُعدَّدُ العوامِلُ واحداً واحداً** — فحارسٌ يعدُّ الأشكالَ يُلتَفُّ
 * عليه بشكلٍ لم يُعَدَّ. فالحكمُ مقلوبٌ: **كلُّ رمزٍ ثلاثىٍّ كبيرٍ مكتوبٍ
 * فى سطرٍ يتكلّمُ عن عملة** يُعَدُّ، ثمّ يُصَنَّفُ بالعامِلِ الذى أدخلَه ليُقرَأَ
 * ثقلُه — والتصنيفُ للقراءة، والرقمُ للحكم.
 *
 * فقِيسَ الباقى فكان **٣١١ موضعاً**، وصُنَّفَ بالأثرِ قبلَ أن يُثبَّت.
 */
const PINNED_IMPLIED = 311
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

// ───────────────────────────────────────────────────────────────────────────
// **ويُحكَمُ بالخاصّيّةِ لا بقائمةِ عملات**: لا يُبحَثُ عن «EGP» ولا عن أخواتِها
// — فحارسٌ يحفظُ أسماءَ العملاتِ يُلتَفُّ عليه بعملةٍ لم تُكتَبْ فى قائمتِه —
// بل عن **رمزٍ ثلاثىٍّ كبيرٍ بشكلِ ISO-4217** يجىءُ خلفَ أحدِ تلك العوامل،
// **وعلى سطرِه اسمٌ يقولُ إنّه عملة**. فلا يصرخُ على `lang || 'ARA'` ولا على
// `row.code === 'ABC'` فى شيفرةٍ لا تتكلّمُ عن مال — **وحارسٌ يصرخُ على
// البرىءِ يُطفَأ**.
//
// **ويُسمّى ما يُقاسُ لا أكثرَ منه** — وهذان مُعلَنانِ لا مسكوتٌ عنهما:
//   · رمزٌ بحروفٍ صغيرة (`|| 'egp'`) لا يراه هذا الحكم. مقيسٌ اليوم: صفر.
//   · رمزٌ فى سطرٍ **لا يذكرُ عملةً بأىِّ اسم** لا يراه كذلك. مقيسٌ اليوم: صفر
//     — وهو ثمنُ ألّا يصرخَ الحارسُ على البرىء.
// ───────────────────────────────────────────────────────────────────────────
const ISO_RE = /(['"`])([A-Z]{3})\1/g
const NAMES_CCY = /\b\w*(?:currency|ccy)\w*\b/i

/** مقدّمةُ الموضعِ **على سطرِه هو** — ولا يُحكَمُ على سطرٍ بسطرِ غيرِه. */
function linePrefix(code, at) {
  const b = code.slice(Math.max(0, at - 120), at)
  const cut = b.lastIndexOf("\n")
  return cut >= 0 ? b.slice(cut + 1) : b
}

/**
 * العاملُ الذى أدخلَ العملةَ — **للقراءةِ لا للحكم**: الحكمُ على العددِ كلِّه،
 * والتصنيفُ يقولُ أينَ يثقُلُ الدَّين. والترتيبُ مقصود: `??` تنتهى بعلامةِ
 * استفهامٍ فتُقرأُ ارتداداً لا فرعَ شرط. **ولا يُعَدَّدُ الشكلُ فيُفلِتَ ما لم
 * يُعَدَّدْ** — فما لم يقعْ على عاملٍ معروفٍ يُسمّى «موضعاً آخَر» ويُعَدُّ.
 */
function operatorBefore(pre) {
  if (/(\|\||\?\?)\s*$/.test(pre)) return "ارتدادٌ عن قيمةٍ صامتة"
  if (/[=!]==?\s*$/.test(pre)) return "مقارنةٌ يتفرّعُ عليها سلوك"
  if (/[?:]\s*$/.test(pre)) return "فرعُ شرطٍ"
  if (/[(,[]\s*$/.test(pre)) return "وسيطٌ يُمرَّرُ لدالّة"
  if (/\breturn\s*$/.test(pre)) return "قيمةٌ تُعادُ من دالّة"
  return "موضعٌ آخَر"
}

/** **ويرفضُ فى الاتّجاهَين**: زيادةٌ عطبٌ جديد، ونقصانٌ مكسبٌ لم يُثبَّت. */
function judgePin(found, pinned) {
  if (found > pinned) return "grew"
  if (found < pinned) return "shrank"
  return "ok"
}

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
  const claimed = new Set()
  for (const re of [OPTION_RE, DEFAULT_RE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code)) !== null) {
      if (seen.has(m.index)) continue
      seen.add(m.index)
      // **ولا يُعَدُّ الموضعُ مرّتَين**: يُسجَّلُ موضعُ علامةِ الاقتباسِ نفسِها
      // ليُعرَفَ لاحقاً أنّه محكومٌ سلفاً بالنمطَينِ القائمَين.
      claimed.add(m.index + m[0].length - m[2].length - 2)
      out.push({
        line: lineOf(code, m.index),
        text: m[0].trim(),
        kind: "direct",
        why: looksLikeFormatting(code, m.index) ? "تنسيقُ عرض" : "قيمةٌ تُكتَبُ أو تُرسَل",
      })
    }
  }
  ISO_RE.lastIndex = 0
  let h
  while ((h = ISO_RE.exec(code)) !== null) {
    if (claimed.has(h.index)) continue
    const pre = linePrefix(code, h.index)
    if (!NAMES_CCY.test(pre)) continue
    const op = operatorBefore(pre)
    out.push({
      line: lineOf(code, h.index),
      text: (pre.trim().slice(-48) + h[0]).trim(),
      kind: "implied",
      why: op,
    })
  }
  return out.sort((a, b) => a.line - b.line)
}

// ───────────────────────────────────────────────────────────────────────────
// **وفخٌّ لا يُشغَّل ليس فخّاً**
// ───────────────────────────────────────────────────────────────────────────
function selftest() {
  let bad = 0
  let cases = 0
  const t = (label, got, want) => {
    cases++
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

  // ── v3.75.58 — **والارتدادُ اختراعٌ مؤجَّل** ─────────────────────────────
  t("ويرى ارتداداً يكتبُ عملةً حرفاً", n(`const c = row.currency || 'EGP'`), 1)
  t("ويراه بعاملِ الصمتِ ??", n(`{ p_currency_code: body.currency_code ?? 'EGP' }`), 1)
  t("ويرى مقارنةً يتفرّعُ عليها سلوك", n(`if (baseCurrency === 'EGP') { inBase() }`), 1)
  t("ويراها بالنفى", n(`const s = payCcy !== "EGP" ? a : b`), 1)
  t("ويرى فرعَ شرطٍ يكتبُ عملة", n(`const displayCurrency = isLocal ? 'EGP' : other`), 1)
  t("ويرى الموضعَينِ فى سطرِ الحارسِ الجانبىِّ للعرضِ الأوّل",
    n(`const c = typeof window !== 'undefined' ? (localStorage.getItem('app_currency') || 'EGP') : 'EGP'`), 2)
  t("ويُسمّى العاملَ الذى أدخلَها", why(`const c = row.currency || 'EGP'`), ["ارتدادٌ عن قيمةٍ صامتة"])
  t("ويُسمّى المقارنةَ مقارنةً — وهى أثقلُ", why(`if (baseCurrency === 'EGP') {}`), ["مقارنةٌ يتفرّعُ عليها سلوك"])

  // **وحارسٌ يصرخُ على البرىءِ يُطفَأ**
  t("ولا يصرخُ على ارتدادٍ ليس عملةً", n(`const lang = opts.lang || 'ARA'`), 0)
  t("ولا على مقارنةٍ لا تتكلّمُ عن مال", n(`if (row.code === 'ABC') {}`), 0)
  t("ولا على رمزٍ ثلاثىٍّ فى سطرٍ لا يُسمّى عملةً — وهو المُعلَنُ أعلاه", n(`const c = x || 'EGP'`), 0)
  t("ولا على رمزٍ صغيرِ الحروف — وهو المُعلَنُ الثانى", n(`const c = row.currency || 'egp'`), 0)

  // **ولا يُعَدَّدُ الشكلُ فيُفلِتَ ما لم يُعَدَّدْ**
  t("ويرى وسيطاً يُمرَّرُ لدالّة", n(`const [currency, setCurrency] = useState('EGP')`), 1)
  t("ويُسمّيه وسيطاً", why(`const [currency, setCurrency] = useState('EGP')`), ["وسيطٌ يُمرَّرُ لدالّة"])
  t("ويرى وسيطاً ثانياً بعدَ فاصلة", n(`formatCurrency(amount, 'SAR')`), 1)
  t("ويرى قيمةً تُعادُ من دالّة", n(`function baseCurrencyOf() { return 'EGP' }`), 1)
  t("ويُسمّيها كذلك", why(`function baseCurrencyOf() { return 'EGP' }`), ["قيمةٌ تُعادُ من دالّة"])
  t("ويرى ما لم يقعْ على عاملٍ معروف", n(`<Row label="Currency" value="USD" />`), 1)
  t("ولا يصرخُ على وسيطٍ فى سطرٍ لا يُسمّى عملة", n(`const [lang, setLang] = useState('ARA')`), 0)
  t("ولا يعدُّ خيارَ العملةِ مرّتَين — والمحكومُ سلفاً لا يُحاكَمُ ثانيةً", n(`{ currency: 'EGP' }`), 1)

  // **وفحصٌ يمكنُ تخطّيه ليس فحصاً**: حكمُ التثبيتِ نفسُه يُختبَرُ
  t("يمرُّ حين يُطابقُ الرقمُ المُثبَّت", judgePin(36, 36), "ok")
  t("ويرفضُ موضعاً جديداً", judgePin(37, 36), "grew")
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه", judgePin(35, 36), "shrank")

  // **ونصُّ الفحصِ مواصفةٌ لا صنعة** — والجردُ لا يبلغُ مجلّدَ الحرّاسِ فلا يعدُّ نفسَه.
  // وهذا يُقاسُ بنداءِ البيتِ نفسِه، لا يُدَّعى.
  t("والجردُ لا يشملُ مجلّدَ الحرّاس — فلا يعدُّ الفحصُ نفسَه", keepPath("scripts/x.js", NOT_SHIPPED), false)
  t("ويشملُ شيفرةَ الشاشاتِ فعلاً — وبحثٌ لا يجد ليس دليلَ غياب", keepPath("app/page.tsx", NOT_SHIPPED), true)
  t("ويشملُ lib وcomponents وhooks", [keepPath("lib/u.ts", NOT_SHIPPED), keepPath("components/c.tsx", NOT_SHIPPED), keepPath("hooks/h.ts", NOT_SHIPPED)], [true, true, true])
  t("ولا يشملُ اختباراً لا يُشحَن", keepPath("tests/a.test.ts", NOT_SHIPPED), false)

  console.log("  الفخُّ الذاتىّ: " + cases + " اتّجاهاً، " + (bad ? bad + " منها خاطئ." : "كلُّها صحيحة."))
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
const direct = found.filter((x) => x.kind === "direct")
const implied = found.filter((x) => x.kind === "implied")
const byOperator = {}
for (const x of implied) byOperator[x.why] = (byOperator[x.why] || 0) + 1

console.log(
  "  ملفّاتُ شيفرةٍ من المستودع: " + census.files.length +
  "   ·   عملةٌ مكتوبةٌ خياراً أو إسناداً: " + direct.length + " (المُثبَّت " + PINNED + ")" +
  "   ·   ومكتوبةٌ خلفَ عامل: " + implied.length + " (المُثبَّت " + PINNED_IMPLIED + ")"
)
for (const k of Object.keys(byOperator).sort()) console.log("      · " + k + ": " + byOperator[k])

const CURE =
  "  عملةُ الشركةِ صفةٌ فى صفِّها لا نصٌّ فى الشيفرة، ونحن نبنى مشروعاً عالميّاً.\n" +
  "  والاختيارُ محفوظٌ سلفاً فى companies.base_currency، وقارئُه الصحيحُ:\n" +
  "      lib/currency-service.ts::getBaseCurrency(supabase, companyId)\n" +
  "  فنادِه ومرِّرِ العملةَ، أو استقبلْها وسيطاً — ولا تُثبِّتْها هنا.\n" +
  "  ولا تُصلحْها إلى lib/exchange-rates.ts::getBaseCurrency() — فذلك بيتٌ مهجورٌ\n" +
  "  يقرأُ من localStorage ويُعيدُ 'EGP'، **ولا يُصلَحُ عطبٌ بعطبٍ آخَر**."

function verdict(label, rows, pinned, konst) {
  const j = judgePin(rows.length, pinned)
  if (j === "grew") {
    console.error("\nX زادت " + label + ": " + rows.length + " والمُثبَّتُ " + pinned + " — **ولا تُسمّى عملةٌ بعينِها**.\n" + CURE)
    for (const x of rows) console.error("      - " + x.rel + ":" + x.line + "   [" + x.why + "]   " + x.text)
    return 1
  }
  if (j === "shrank") {
    console.error(
      "\nX نقصت " + label + " إلى " + rows.length + " والمُثبَّتُ " + pinned +
      " — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n" +
      "  أنزِلِ الرقمَ فى الدفعةِ التى كسبَتْه: const " + konst + " = " + rows.length
    )
    return 1
  }
  return 0
}

let bad = 0
bad += verdict("العملةُ المكتوبةُ خياراً أو إسناداً", direct, PINNED, "PINNED")
bad += verdict("العملةُ المكتوبةُ خلفَ عامل", implied, PINNED_IMPLIED, "PINNED_IMPLIED")
if (bad) process.exit(1)

console.log(
  "+ لا موضعَ جديدٌ يُسمّى عملةً بعينِها (" + direct.length + " خياراً أو إسناداً، و" + implied.length +
  " خلفَ عامل؛ الحكمُ بموضعِ القرارِ لا بالاسم، ولا يُحاكَمُ من يستقبلُها، ولا بيتُ المفردات، والتعليقُ محجوب)."
)
console.log(
  "  ! ومعدودٌ لا مسكوتٌ عنه — يُسدَّدون على دفعاتٍ مقيسة، وعنوانُ السدادِ واحد:\n" +
  "      lib/currency-service.ts::getBaseCurrency(supabase, companyId)   (لا البيتُ المهجورُ فى lib/exchange-rates.ts)"
)
for (const x of found) console.log("      - " + x.rel + ":" + x.line + "   [" + x.why + "]   " + x.text)
process.exit(0)
