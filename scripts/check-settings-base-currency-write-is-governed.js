#!/usr/bin/env node
/**
 * check-settings-base-currency-write-is-governed.js — v3.75.69
 *
 * «فالعملةُ الأساسيّةُ لا تُكتَبُ إلا من بابِها المُسمّى»
 *
 * ═══ العطبُ الذى صدَّه هذا الحارس ═══
 *
 * فى `app/settings/page.tsx` متغيّرٌ واحدٌ اسمُه `currency` يحملُ معنيَين:
 * «عملةُ العرض» (شكلُ الأرقامِ على الشاشةِ فقط، لا تلمسُ القاعدة — تتغيّرُ
 * بزرِّ «عرضٌ فقط» المتاحِ للمالكِ وغيرِ المالكِ معاً)، و«العملةُ الأساسيّةُ»
 * الحقيقيّةُ للشركة (لا تتغيّرُ إلا عبرَ الإجراءِ المحكومِ
 * `change_base_currency`، الذى يتحقّقُ من الملكيّةِ ويُعيدُ حسابَ الدفاترِ
 * داخلَ القاعدة).
 *
 * وكان زرُّ «حفظ» العامُّ (اسمٌ، عنوانٌ، هاتفٌ...) يكتبُ
 * `base_currency: currency` مباشرةً فى تحديثٍ عادىٍّ على جدولِ `companies`
 * — فلو اختارَ أىُّ عضوٍ (لا حجبَ بالملكيّةِ على هذا الزر، وصلاحيةُ القاعدةِ
 * `companies_member_access` تسمحُ لأىِّ عضوٍ بالتحديث) «عرضٌ فقط» ثم ضغطَ
 * «حفظ» لأىِّ سببٍ آخَر، تسرَّبَت عملةُ العرضِ لتصيرَ العملةَ الأساسيّةَ فى
 * القاعدةِ فعلاً — بلا تحويلِ مبلغٍ واحد، وبلا مرورٍ بالحارسِ الحقيقىِّ
 * (`is_owner_or_admin` داخلَ `change_base_currency` نفسِها).
 *
 * ═══ والعلاجُ حذفٌ لا حجب ═══
 *
 * لا يُصلَحُ بإضافةِ تحقّقِ ملكيّةٍ فى الشاشةِ (مسكِّنٌ يُلتَفُّ عليه بمسارٍ
 * آخَر) بل بحذفِ `base_currency` من استعلامِ الحفظِ العامِّ نهائياً: العملةُ
 * الأساسيّةُ **لا بابَ لها سوى** `applyCurrencyWithConversion` (الذى ينادى
 * `change_base_currency`)، حيث الحارسُ فى القاعدةِ نفسِها لا فى المتصفّح.
 *
 * والاستثناءُ الوحيدُ المشروع: إنشاءُ شركةٍ جديدةٍ (`insert`) — لا عملةَ
 * أساسيّةً محفوظةً لها بعدُ، فلا شىءَ يُحوَّل ولا دفترَ يُخالِف؛ تثبيتُ
 * العملةِ المختارةِ هناك بذرةٌ لا تسريب.
 *
 * ═══ فالحارسُ يفحصُ السياق لا مجرَّدَ الاسم ═══
 *
 * يُبحَثُ عن `base_currency:` (مفتاحُ كتابةٍ فى كائن) بعدَ حجبِ التعليقاتِ،
 * ولكلِّ موضعٍ يُنظَرُ إلى أقربِ نداءٍ سابقٍ: `.update(` أم `.insert(`؟
 * فالمثبَّتُ صفرٌ داخلَ `update` وواحدٌ داخلَ `insert` — لا يزيدانِ ولا
 * ينقصانِ إلا بدفعةٍ تُقرِّرُ ذلك صراحةً (نفسُ نهجِ PINNED فى حارسِ العملةِ
 * الأكبر: `check-a-currency-is-not-written-in-the-code.js`).
 *
 * Usage: node scripts/check-settings-base-currency-write-is-governed.js [--selftest]
 */
"use strict"
const fs = require("fs")
const path = require("path")

const TARGET_REL = "app/settings/page.tsx"
const ROOT = process.env.BASE_CURRENCY_GOVERNED_SCAN_ROOT || process.cwd()

// **والتعليقُ ليس تعليمة** — نفسُ حاجبِ التعليقاتِ المستعملِ فى حارسِ
// العملةِ الأكبر، بحرفِه.
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

const WRITE_KEY_RE = /\bbase_currency\s*:\s*/g

/** كلُّ موضعٍ يكتبُ base_currency (مفتاحاً فى كائن)، مصنَّفاً بأقربِ .update( أو .insert( قبلَه. */
function classifyWrites(src) {
  const code = stripComments(src)
  const out = []
  WRITE_KEY_RE.lastIndex = 0
  let m
  while ((m = WRITE_KEY_RE.exec(code)) !== null) {
    const before = code.slice(0, m.index)
    const lastUpdate = before.lastIndexOf(".update(")
    const lastInsert = before.lastIndexOf(".insert(")
    let op = "سياقٌ غيرُ معروف (لا update ولا insert)"
    if (lastInsert === -1 && lastUpdate === -1) op = op
    else if (lastInsert > lastUpdate) op = "insert"
    else op = "update"
    const line = (code.slice(0, m.index).match(/\n/g) || []).length + 1
    out.push({ line, op })
  }
  return out
}

const PINNED_UPDATE = 0
const PINNED_INSERT = 1

// ───────────────────────────────────────────────────────────────────────────
// **وفخٌّ لا يُشغَّل ليس فخّاً**
// ───────────────────────────────────────────────────────────────────────────
function selftest() {
  let bad = 0, cases = 0
  const t = (label, got, want) => {
    cases++
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + label + "  (توقّعتُ " + JSON.stringify(want) + " فجاء " + JSON.stringify(got) + ")")
  }

  t("يرى كتابةً داخلَ update ويُصنِّفُها update",
    classifyWrites(`await supabase.from("companies").update({ name, base_currency: currency }).eq("id", cid)`).map(x => x.op),
    ["update"])

  t("يرى كتابةً داخلَ insert ويُصنِّفُها insert",
    classifyWrites(`await supabase.from("companies").insert({ name, base_currency: currency })`).map(x => x.op),
    ["insert"])

  t("يرى الاثنَين معاً بالترتيبِ الصحيح",
    classifyWrites(`
      const a = await supabase.from("companies").update({ base_currency: x }).eq("id", cid)
      const b = await supabase.from("companies").insert({ base_currency: y })
    `).map(x => x.op),
    ["update", "insert"])

  t("لا يحكمُ على قائمةِ select بلا نقطتَين — قراءةٌ لا كتابة",
    classifyWrites(`.select("id, name, base_currency, fiscal_year_start")`).length, 0)

  t("لا يحكمُ على ذكرٍ داخلَ تعليقٍ سطرىّ — التعليقُ ليس تعليمة",
    classifyWrites(`// base_currency: currency`).length, 0)

  t("لا يحكمُ على ذكرٍ داخلَ تعليقٍ كتلىّ",
    classifyWrites(`/* base_currency: currency */`).length, 0)

  t("لا يلتبسُ باسمِ الإجراء change_base_currency — لا نقطتَين بعدَه هناك",
    classifyWrites(`supabase.rpc('change_base_currency', { p_company_id: cid, p_new_currency: v })`).length, 0)

  t("يُسمّيه سياقاً غيرَ معروفٍ إن غابَ update وinsert معاً",
    classifyWrites(`const o = { base_currency: currency }`).map(x => x.op),
    ["سياقٌ غيرُ معروف (لا update ولا insert)"])

  console.log("  الفخُّ الذاتىّ: " + cases + " اتّجاهاً، " + (bad ? bad + " منها خاطئ." : "كلُّها صحيحة."))
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

// ───────────────────────────────────────────────────────────────────────────
// الحكمُ على الملفّ
// ───────────────────────────────────────────────────────────────────────────
const filePath = path.join(ROOT, TARGET_REL)
if (!fs.existsSync(filePath)) {
  console.error("X " + TARGET_REL + " غيرُ موجودٍ فى " + ROOT)
  process.exit(1)
}
const src = fs.readFileSync(filePath, "utf8")
const writes = classifyWrites(src)
const updates = writes.filter((w) => w.op === "update")
const inserts = writes.filter((w) => w.op === "insert")
const unknown = writes.filter((w) => w.op !== "update" && w.op !== "insert")

let bad = 0
if (updates.length !== PINNED_UPDATE) {
  console.error(
    "\nX عدد كتاباتِ base_currency داخلَ update() على companies = " + updates.length +
    " والمُثبَّتُ " + PINNED_UPDATE + " — " +
    (updates.length > PINNED_UPDATE
      ? "عادت ثغرةُ تسريبِ عملةِ العرضِ إلى العملةِ الأساسيّة (v3.75.69)."
      : "لا يُفترَضُ نقصانٌ هنا أصلاً؛ إن حدثَ فحدِّثِ المُثبَّت.")
  )
  for (const w of updates) console.error("   - " + TARGET_REL + ":" + w.line)
  bad = 1
}
if (inserts.length !== PINNED_INSERT) {
  console.error(
    "\nX عدد كتاباتِ base_currency داخلَ insert() على companies = " + inserts.length +
    " والمُثبَّتُ " + PINNED_INSERT + " — بذرةُ عملةِ الشركةِ الجديدةِ فُقدت أو تكرَّرت."
  )
  for (const w of inserts) console.error("   - " + TARGET_REL + ":" + w.line)
  bad = 1
}
if (unknown.length) {
  console.error("\nX عدد كتاباتِ base_currency فى سياقٍ غيرِ معروفٍ (لا update ولا insert) = " + unknown.length)
  for (const w of unknown) console.error("   - " + TARGET_REL + ":" + w.line)
  bad = 1
}

if (bad) process.exit(1)

console.log(
  "+ " + TARGET_REL + " — base_currency لا تُكتَبُ إلا فى إنشاءِ شركةٍ جديدة (insert × " +
  inserts.length + ")، وصفرٌ داخلَ الحفظِ العام (update) — التسريبُ إلى العملةِ الأساسيّةِ مسدود."
)
process.exit(0)
