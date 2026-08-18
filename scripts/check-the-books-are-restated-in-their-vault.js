#!/usr/bin/env node
/**
 * check-the-books-are-restated-in-their-vault.js — v3.75.62
 * «والدفترُ يُعادُ حسابُه فى خزانتِه لا فى يدِ زائرِه»
 * ---------------------------------------------------------------------------
 * كانت شاشةُ الإعداداتِ تُعيدُ كتابةَ الدفاترِ من المتصفّحِ أمراً أمراً بلا
 * معاملةٍ واحدة، بسعرٍ من موقعِ إنترنت خارجىٍّ أو «واحد»، وأصلٍ من ذاكرةِ
 * المتصفّح — ثم يُرَدُّ تبديلُ العملةِ عندَ حارسِ القاعدةِ فتبقى الشركةُ
 * ممزّقة. v3.75.62 بنت المسارَ فى القاعدةِ (change_base_currency: معاملةٌ
 * واحدةٌ، سعرٌ من جدولِ أسعارِ الشركةِ وحدَه، حقُّ المالكِ والمديرِ العامِّ
 * فقط) وسرّحت الكودَ القديمَ كلَّه.
 *
 * **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه** — فهذا الحارسُ يُثبِّتُ أربعةَ اتّجاهات:
 *   (١) الأسماءُ المُسرَّحةُ لا تعودُ — ولو فى تعليقٍ: عودتُها ولو ذكرى
 *       تعنى أنّ أحداً يستحضرُ الجثّة. **والاسمُ مُثبَّتٌ لا العددُ وحدَه.**
 *   (٢) ملفُّ المسارِ القديمِ lib/currency-conversion-system.ts لا يعود.
 *   (٣) الشاشةُ تنادى الخزانةَ مرّةً واحدةً بالضبط — صفرٌ يعنى أنّ الشاشةَ
 *       فقدت مسارَها، واثنتانِ تعنيانِ ازدواجاً. **ولا يُبنى بيتٌ ثانٍ.**
 *   (٤) لا موقعَ أسعارٍ خارجىَّ فى شاشةِ الإعدادات — السعرُ من جدولِ
 *       أسعارِ الشركةِ وحدَه، قرارُ صاحبِ المشروعِ يومَ v3.75.62.
 *
 * حارسُ شكلِ الكودِ هذا يُكمِّلُ الفحصَ المرجعىَّ الحىَّ فى القاعدةِ
 * (assert_baseline_v3_75_62_check يُثبِّتُ أهلَ البابِ الاثنى عشرَ بالاسم
 * على البيتَين) — **فشكلُ الضبطِ ليس ضبطاً**، والحكمُ الحىُّ هناك.
 * ---------------------------------------------------------------------------
 * --selftest : يُشغِّلُ الفخَّ الذاتىَّ ويخرج.
 */
"use strict"
const fs = require("fs")
const path = require("path")

// الأسماءُ المُسرَّحةُ بأعيانِها — قِيسَ يومَ v3.75.62 أنّ ورودَها صفرٌ فى
// جذورِ الكودِ كلِّها بعدَ التسريح.
const RETIRED = [
  "convertAllToDisplayCurrency",
  "performCurrencyRevaluation",
  "resetToOriginalCurrency",
  "currency-conversion-system",
]
const RETIRED_FILE = "lib/currency-conversion-system.ts"
const VAULT_CALL = "rpc('change_base_currency'"
const SCREEN = "app/settings/page.tsx"
const EXTERNAL_RATE_HOST = "exchangerate-api.com"

// ── الحكم — دوالُّ نقيّةٌ يختبرُها الفخُّ الذاتىّ ──────────────────────────
function judgeRetired(hitsByName) {
  // hitsByName: { name: [files...] } — أىُّ ورودٍ عودةُ جثّة.
  const back = Object.keys(hitsByName).filter((n) => hitsByName[n].length > 0)
  return { ok: back.length === 0, back }
}
function judgeModuleGone(exists) {
  return exists ? "returned" : "gone"
}
function judgeVaultCall(count) {
  if (count === 0) return "lost"
  if (count === 1) return "ok"
  return "doubled"
}
function judgeExternalRate(count) {
  return count === 0 ? "ok" : "leaks"
}
function classify(retiredVerdict, moduleVerdict, vaultVerdict, externalVerdict) {
  if (retiredVerdict.ok && moduleVerdict === "gone" && vaultVerdict === "ok" && externalVerdict === "ok") return "ok"
  return "fault"
}

// ── الفخُّ الذاتىّ — **وفخٌّ لا يُشغَّلُ ليس فخّاً** ────────────────────────
if (process.argv.includes("--selftest")) {
  let n = 0, bad = 0
  const t = (name, got, want) => {
    n++
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) return
    bad++
    console.error("  X " + name + "  got=" + g + "  want=" + w)
  }
  t("سِجلٌّ نظيفٌ يمرّ", judgeRetired({ a: [], b: [] }).ok, true)
  t("اسمٌ عادَ فى ملفٍّ يُمسَك", judgeRetired({ a: ["x.ts"], b: [] }).ok, false)
  t("ويُسمّى العائدُ باسمِه", judgeRetired({ a: ["x.ts"], b: [] }).back, ["a"])
  t("وعودتانِ تُسمَّيانِ معاً", judgeRetired({ a: ["x.ts"], b: ["y.ts"] }).back, ["a", "b"])
  t("والعودةُ فى تعليقٍ عودةٌ أيضاً — لا نفحصُ النيّةَ بل الأثر", judgeRetired({ c: ["z.tsx"] }).ok, false)
  t("ملفٌّ غائبٌ: gone", judgeModuleGone(false), "gone")
  t("ملفٌّ عائدٌ: returned", judgeModuleGone(true), "returned")
  t("نداءُ الخزانةِ مرّةً: ok", judgeVaultCall(1), "ok")
  t("صفرُ نداءٍ: الشاشةُ فقدت مسارَها", judgeVaultCall(0), "lost")
  t("نداءانِ: ازدواجٌ — ولا يُبنى بيتٌ ثانٍ", judgeVaultCall(2), "doubled")
  t("وثلاثةٌ ازدواجٌ كذلك", judgeVaultCall(3), "doubled")
  t("لا مصدرَ خارجىَّ: ok", judgeExternalRate(0), "ok")
  t("مصدرٌ خارجىٌّ واحدٌ يُمسَك", judgeExternalRate(1), "leaks")
  t("الحكمُ الجامعُ يمرُّ حين تمرُّ الأربعة", classify({ ok: true, back: [] }, "gone", "ok", "ok"), "ok")
  t("ويسقطُ بعودةِ اسمٍ وحدِها", classify({ ok: false, back: ["a"] }, "gone", "ok", "ok"), "fault")
  t("ويسقطُ بعودةِ الملفِّ وحدِها", classify({ ok: true, back: [] }, "returned", "ok", "ok"), "fault")
  t("ويسقطُ بفقدِ النداءِ وحدِه", classify({ ok: true, back: [] }, "gone", "lost", "ok"), "fault")
  t("ويسقطُ بازدواجِ النداءِ وحدِه", classify({ ok: true, back: [] }, "gone", "doubled", "ok"), "fault")
  t("ويسقطُ بالمصدرِ الخارجىِّ وحدِه", classify({ ok: true, back: [] }, "gone", "ok", "leaks"), "fault")
  t("والصفرُ المُثبَّتُ للأسماءِ يُختبَرُ بعينِه", judgeRetired(Object.fromEntries(RETIRED.map((r) => [r, []]))).ok, true)
  t("وقائمةُ المُسرَّحينَ أربعةٌ بالاسم", RETIRED.length, 4)
  t("والاسمُ الأوّلُ هو ناسخُ الدفاترِ القديم", RETIRED[0], "convertAllToDisplayCurrency")
  if (bad) { console.error("\nX الفخُّ الذاتىُّ سقط: " + bad + "/" + n); process.exit(1) }
  console.log("+ الفخُّ الذاتىُّ مرَّ (" + n + " اختباراً).")
  process.exit(0)
}

// ── الفحصُ الحىُّ — **والجردُ من البيتِ الواحدِ لا من قائمةٍ مكتوبةٍ باليد**
//    (scripts/lib/repo-code-files: git ls-files، فيدخلُ أىُّ مجلّدٍ جديدٍ
//     تلقائيّاً، والمحلىُّ غيرُ المرفوعِ لا يُحاكَمُ به المشروع) ─────────────
const { projectCodeFiles, repoRoot } = require("./lib/repo-code-files")
const { files } = projectCodeFiles()

const hitsByName = Object.fromEntries(RETIRED.map((r) => [r, []]))
let vaultCount = 0
let externalCount = 0
for (const f of files) {
  for (const name of RETIRED) {
    if (f.src.includes(name)) hitsByName[name].push(f.rel)
  }
  if (f.rel === SCREEN) {
    vaultCount = f.src.split(VAULT_CALL).length - 1
    externalCount = f.src.split(EXTERNAL_RATE_HOST).length - 1
  }
}
const moduleExists = fs.existsSync(path.join(repoRoot, RETIRED_FILE))

const rv = judgeRetired(hitsByName)
const mv = judgeModuleGone(moduleExists)
const vv = judgeVaultCall(vaultCount)
const ev = judgeExternalRate(externalCount)
const verdict = classify(rv, mv, vv, ev)

if (verdict !== "ok") {
  console.error("")
  console.error("X عقدُ v3.75.62 مخروق — «والدفترُ يُعادُ حسابُه فى خزانتِه»:")
  for (const n of rv.back) {
    console.error("   · الاسمُ المُسرَّحُ «" + n + "» عادَ فى: " + hitsByName[n].join("، "))
  }
  if (mv === "returned") console.error("   · ملفُّ المسارِ القديمِ عادَ: " + RETIRED_FILE)
  if (vv === "lost") console.error("   · " + SCREEN + " لا تنادى change_base_currency — الشاشةُ فقدت مسارَها.")
  if (vv === "doubled") console.error("   · " + SCREEN + " تنادى change_base_currency " + vaultCount + " مرّةً لا مرّةً واحدة.")
  if (ev === "leaks") console.error("   · " + SCREEN + " تجلبُ سعراً من " + EXTERNAL_RATE_HOST + " — والسعرُ من جدولِ أسعارِ الشركةِ وحدَه.")
  console.error("")
  console.error("   المسارُ الوحيدُ لتغييرِ العملةِ الأساسيّةِ هو دالّةُ الخزانةِ")
  console.error("   change_base_currency فى القاعدةِ — معاملةٌ واحدةٌ أو لا شىء.")
  process.exit(1)
}

console.log("+ الدفترُ يُعادُ حسابُه فى خزانتِه: المُسرَّحونَ الأربعةُ لم يعودوا، والملفُّ القديمُ غائبٌ، والشاشةُ تنادى الخزانةَ مرّةً واحدةً، ولا مصدرَ أسعارٍ خارجىَّ فيها.")
