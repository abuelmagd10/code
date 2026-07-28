#!/usr/bin/env node
/**
 * selftest-custody-movements.js
 * ---------------------------------------------------------------------------
 * v3.74.862 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله.
 * وقد كلّفنا هذا الدرس ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣ و٨٥٧ و٨٥٨ و٨٥٩ و٨٦٠.
 *
 * 🔒 **ولا يلمس هذا السكربت بياناً واحداً.**
 *
 * لأن الإصلاح — كسابقه فى ٨٦١ — **جعل العطب غير قابلٍ للزرع**: الدالتان
 * تكتبان التكلفة وتربطان القيد فى نفس النداء، فلا سبيل لإنتاج حركةٍ ناقصة
 * إلا بتعطيل الدالة نفسها، وهذا إضعافُ حماية لن يُفعَل.
 *
 * ⇒ فالفخّ يُبنى من **الحقيقة**: تُزاح نافذةُ السريان إلى الوراء
 *   (`CUSTODY_LINK_ENFORCED_FROM`) حتى تدخل فيها الحركاتُ التاريخية العشر —
 *   وهى ناقصةٌ فعلاً وموثَّقة. فيجب أن يسقط الحارس. ثم تُعاد النافذة فيمرّ.
 *
 * Usage: node scripts/selftest-custody-movements.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

if (!process.env.PRODUCTION_SUPABASE_DB_URL) {
  console.error(
    "X PRODUCTION_SUPABASE_DB_URL is not set - cannot prove the guard refuses anything.\n" +
      "  Refusing to ship a guard that has never been seen failing."
  )
  process.exit(1)
}

function runGuard(enforcedFrom) {
  const r = spawnSync(
    process.execPath,
    ["scripts/check-custody-movements-costed-and-linked.js", "--require-db"],
    { encoding: "utf8", env: { ...process.env, CUSTODY_LINK_ENFORCED_FROM: enforcedFrom } }
  )
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

const withLegacy = runGuard("2020-01-01")
const normal = runGuard(process.env.CUSTODY_LINK_ENFORCED_FROM || "2026-07-28")

let ok = true

if (!withLegacy.failed) {
  console.error(
    "X الحارس لم يرفض الحركات التاريخية الناقصة رغم دخولها فى نافذة الفحص.\n" +
      "  حارسٌ لا يسقط أبداً زينةٌ لا حماية.\n" +
      "  ---- خرج الحارس ----\n" + withLegacy.output
  )
  ok = false
} else {
  console.log("+ الحارس رفض الحركات الناقصة حين دخلت نافذته — رُئى وهو يرفض")
}

if (normal.failed) {
  console.error(
    "X الحارس يسقط على النافذة الحقيقية — أى أن حركة عهدةٍ جديدة خرجت ناقصة،\n" +
      "  وهو ما يمنعه الإصلاح. اقرأ الخرج: العطب حقيقىٌّ لا فى الفخّ.\n" +
      "  ---- خرج الحارس ----\n" + normal.output
  )
  ok = false
} else {
  console.log("+ الحارس يمرّ على النافذة الحقيقية — لا حركة ناقصة بعد الإصلاح")
}

if (!ok) process.exit(1)
console.log("+ custody-movement guard proven to refuse - and no data was touched to prove it.")
