#!/usr/bin/env node
/**
 * check-a-guard-is-a-law-not-a-diagnosis.js — v3.75.48
 *
 * «وحارسٌ يعرفُ اسمَ شركةٍ بعينِها ليس حارساً بل تشخيصاً»
 *
 * الحارسُ **قانون**: يحكمُ على كلِّ شركةٍ فى المشروع، القديمةِ منها والتى لم
 * تُسجَّلْ بعد. **ونحن نبنى مشروعاً للاستخدامِ العالمىِّ لا لتوافقٍ مع الشركاتِ
 * المتواجدةِ اليوم.** فإن سمّى ملفٌّ فى `scripts/check-*.js` شركةً بعينِها — أو
 * مستخدِماً بعينِه، أو رقماً ثابتاً لصفٍّ حىّ — فهو **تشخيصٌ لحالةٍ واحدة** لا
 * قانونٌ يُحاكَمُ به المشروع.
 *
 * وهذه ليست مسألةَ ذوق: الملفّاتُ من هذا الصنفِ **تطبعُ أخطاءً ثمّ تخرجُ
 * بنجاح** — لأنّ موضوعَها قد يختفى (يُحذَفُ المستخدِم، تُغلَقُ الشركة) فتصيرُ
 * تشتكى إلى الفراغ. **وحارسٌ لا يستطيعُ أن يرفضَ ليس حارساً، والطمأنينةُ
 * الكاذبةُ أسوأُ من الغياب.**
 *
 * ═══ ويُحكَمُ بالخاصّيّةِ لا بالعبارة ═══
 *
 * لا يُبحَثُ عن اسمِ شركةٍ بعينِها (فذلك يحرسُ عبارةً)، بل عن **شكلِ الانتقاء
 * بهويّةٍ ثابتة**: مساواةُ عمودِ اسمٍ أو بريدٍ أو معرِّفٍ بنصٍّ مكتوب، أو رقمٌ
 * كونىٌّ (UUID) مكتوبٌ حرفاً فى الملفّ. **والتعليقُ ليس تعليمة** — تُحجَبُ
 * التعليقاتُ وسلاسلُ الحروفِ داخلَ الرسائلِ قبلَ الحكم.
 *
 * ═══ ومعدودٌ لا مسكوتٌ عنه ═══
 *
 * لا يُهدَمُ شىءٌ اليوم: العددُ الحىُّ **يُثبَّتُ ولا يُسمَحُ له أن يزيد**،
 * ويُسمَّى أصحابُه واحداً واحداً ليُحوَّلوا على دفعاتٍ مقيسة. **ومكسبٌ لا
 * يُثبَّتُ يُلتَفُّ عليه**: كلُّ نقصانٍ يجبُ أن يُنزَّلَ هنا فى الدفعةِ التى
 * كسبته.
 */
"use strict"
const fs = require("fs")
const path = require("path")

const PINNED = 11
// **ونصُّ الفحصِ مواصفةٌ لا صنعة**: هذا الملفُّ يحملُ فى فخِّه الذاتىِّ أمثلةً
// مكتوبةً حرفاً (رقمٌ كونىٌّ واسمُ شركة) **ليُثبتَ أنّه يراها** — فلو عدَّ نفسَه
// لحاكمَ المواصفةَ بدلَ الصنعة. فيُستثنى بالاسم، ولا يُستثنى سواه.
const SELF = "check-a-guard-is-a-law-not-a-diagnosis.js"

// ───────────────────────────────────────────────────────────────────────────
// **والتعليقُ ليس تعليمة**: تُحجَبُ التعليقاتُ قبلَ أىِّ حكم.
// ───────────────────────────────────────────────────────────────────────────
function stripComments(src) {
  let out = "", i = 0, n = src.length
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i++ } continue }
    if (c === "/" && d === "*") {
      out += "  "; i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++ }
      out += "  "; i += 2; continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++
      while (i < n && src[i] !== q) { if (src[i] === "\\") { out += src[i]; i++; if (i < n) { out += src[i]; i++ } continue } out += src[i]; i++ }
      if (i < n) { out += src[i]; i++ }
      continue
    }
    out += c; i++
  }
  return out
}

const UUID_RE = /['"`][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}['"`]/
const IDENTITY_COLS = "name|company_name|full_name|username|user_name|login|email|slug|code|invoice_number|bill_number"
const EQ_LITERAL_RE = new RegExp(
  "\\.(?:eq|ilike|like|match)\\s*\\(\\s*['\"`](?:" + IDENTITY_COLS + ")['\"`]\\s*,\\s*['\"`][^'\"`]+['\"`]", "i")
const SQL_EQ_LITERAL_RE = new RegExp(
  "\\b(?:" + IDENTITY_COLS + ")\\s*=\\s*'[^']+'", "i")

/** يُرجعُ أسبابَ كونِ الملفِّ تشخيصاً لا قانوناً — فارغةً إن كان قانوناً. */
function whyItIsADiagnosis(src) {
  const code = stripComments(src)
  const why = []
  if (UUID_RE.test(code)) why.push("رقمٌ كونىٌّ مكتوبٌ حرفاً")
  if (EQ_LITERAL_RE.test(code)) why.push("انتقاءٌ بهويّةٍ مكتوبةٍ حرفاً")
  else if (SQL_EQ_LITERAL_RE.test(code)) why.push("انتقاءٌ بهويّةٍ مكتوبةٍ حرفاً فى نصِّ SQL")
  return why
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
  const has = (s) => whyItIsADiagnosis(s).length > 0

  t("يرى انتقاءً باسمٍ مكتوبٍ حرفاً", has(`supabase.from("companies").eq('name', 'تست')`), true)
  t("ويراه بعلامةٍ مزدوجة", has(`q.eq("name", "تست")`), true)
  t("ويرى الانتقاءَ ببريدٍ مكتوب", has(`x.eq('email', 'foodcana1976@gmail.com')`), true)
  t("ويرى ilike كما يرى eq", has(`x.ilike('company_name', 'تست%')`), true)
  t("ويرى رقماً كونيّاً مكتوباً حرفاً", has(`const CO = '8ef6338c-1713-4202-98ac-863633b76526'`), true)
  t("ويراه فى نصِّ SQL", has(`const q = "select * from companies where name = 'تست'"`), true)

  t("ولا يحكمُ على انتقاءٍ بمتغيّر — والقانونُ لا يعرفُ اسماً", has(`x.eq('name', companyName)`), false)
  t("ولا على انتقاءٍ برقمِ شركةٍ محسوب", has(`x.eq('company_id', co.id)`), false)
  t("ولا على عمودٍ ليس هويّة", has(`x.eq('status', 'posted')`), false)
  t("ولا على ذكرٍ داخل تعليقٍ سطرىّ — التعليقُ ليس تعليمة", has(`// x.eq('name', 'تست')`), false)
  t("ولا داخل تعليقٍ كتلىّ", has(`/* x.eq('name','تست') */ const a = 1`), false)
  t("ولا رقمٍ كونىٍّ داخل تعليق", has(`// 8ef6338c-1713-4202-98ac-863633b76526`), false)
  t("ولا نصٍّ يشبهُ الرقمَ الكونىَّ وليس كذلك", has(`const s = 'not-a-uuid-at-all'`), false)
  t("ويقبلُ ملفّاً فارغاً بلا صراخ", has(``), false)

  t("ويُسمّى السببَ لا يكتفى بالحكم", whyItIsADiagnosis(`x.eq('name','تست')`), ["انتقاءٌ بهويّةٍ مكتوبةٍ حرفاً"])
  t("ويجمعُ السببَين", whyItIsADiagnosis(`const C='8ef6338c-1713-4202-98ac-863633b76526'; x.eq('name','تست')`),
    ["رقمٌ كونىٌّ مكتوبٌ حرفاً", "انتقاءٌ بهويّةٍ مكتوبةٍ حرفاً"])

  // **ونصُّ الفحصِ مواصفةٌ لا صنعة** — ولولا هذا الاستثناءُ لعدَّ الفحصُ نفسَه.
  t("ويستثنى نفسَه بالاسم", SELF, "check-a-guard-is-a-law-not-a-diagnosis.js")
  t("ولا يستثنى سواه", ["check-x.js", SELF].filter((f) => f !== SELF), ["check-x.js"])

  console.log("  الفخُّ الذاتىّ: 18 اتّجاهاً، " + (bad ? bad + " منها خاطئ." : "كلُّها صحيحة."))
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

// ───────────────────────────────────────────────────────────────────────────
// الحكمُ على المستودع
// ───────────────────────────────────────────────────────────────────────────
const dir = path.join(process.cwd(), "scripts")
let files
try {
  files = fs.readdirSync(dir).filter((f) => /^check-.*\.js$/.test(f) && f !== SELF).sort()
} catch (e) {
  console.error("X تعذّرت قراءةُ مجلّدِ الحرّاس: " + e.message)
  process.exit(1)
}

// **وبحثٌ لا يجد ليس دليلَ غياب**: لو لم يُقرَأْ حارسٌ واحدٌ فلا طمأنينة.
if (files.length === 0) {
  console.error("X لا حارسَ واحدٌ فى المجلّد — ولا يُقالُ «سليم» لِما لم يُقرَأ.")
  process.exit(1)
}

const found = []
for (const f of files) {
  let src
  try { src = fs.readFileSync(path.join(dir, f), "utf8") }
  catch (e) { console.error("X تعذّرت قراءةُ " + f + ": " + e.message); process.exit(1) }
  const why = whyItIsADiagnosis(src)
  if (why.length) found.push({ f, why })
}

console.log("  حرّاسٌ فى المجلّد: " + files.length + "   ·   يُسمّون شركةً بعينِها: " + found.length + "   (المُثبَّت " + PINNED + ")")

if (found.length > PINNED) {
  console.error(
    "\nX وُلدَ حارسٌ يعرفُ اسمَ شركةٍ بعينِها: " + found.length + " والمُثبَّتُ " + PINNED +
    " — **وحارسٌ يعرفُ اسمَ شركةٍ ليس حارساً بل تشخيصاً**.\n" +
    "  الحارسُ قانونٌ يُحاكَمُ به كلُّ شركة، ونحن نبنى مشروعاً عالميّاً لا لتوافقِ الشركاتِ المتواجدة.\n" +
    "  اجعلْه يقرأُ موضوعَه من القاعدةِ لا من اسمٍ مكتوب، أو أخرِجْه من مجلّدِ الحرّاس."
  )
  for (const x of found) console.error("      - scripts/" + x.f + "   [" + x.why.join(" · ") + "]")
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
  "+ لا حارسَ جديدٌ يعرفُ اسمَ شركةٍ بعينِها (" + found.length + " مُثبَّتون عند " + PINNED +
  "؛ الحكمُ بشكلِ الانتقاءِ لا بالاسم: مساواةُ عمودِ هويّةٍ بنصٍّ مكتوب، أو رقمٌ كونىٌّ حرفىّ — والتعليقُ محجوب)."
)
if (found.length) {
  console.log("  ! ومعدودٌ لا مسكوتٌ عنه — يُحوَّلون على دفعاتٍ مقيسة:")
  for (const x of found) console.log("      - scripts/" + x.f + "   [" + x.why.join(" · ") + "]")
}
process.exit(0)
