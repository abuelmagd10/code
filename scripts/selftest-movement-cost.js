#!/usr/bin/env node
/**
 * selftest-movement-cost.js
 * ---------------------------------------------------------------------------
 * v3.74.861 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله.
 * وقد كلّفنا هذا الدرس ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣ و٨٥٧ و٨٥٨ و٨٥٩ و٨٦٠.
 *
 * 🔒 **وهذا السكربت لا يلمس بياناً واحداً — ولا يستطيع.**
 *
 * السبب طريف ومفيد: **المُشغِّل الجديد يجعل العطب غير قابلٍ للزرع أصلاً.**
 * فأى محاولةٍ لإدخال حركة شراءٍ بتكلفةٍ خاطئة تُصحَّح فوراً قبل أن تُكتب
 * (أُثبت على قاعدة الاختبار: أُرسلت ٩٩٩.٠٠ فسُجّلت ١٠.٠٠). ولإنشاء مخالفةٍ
 * حقيقية لا بدّ من تعطيل المُشغِّل — **وهذا إضعافُ حماية، ولن يُفعَل.**
 *
 * ⇒ فالفخّ يُبنى من **الحقيقة لا من الاصطناع**: تُزاح نافذةُ السريان إلى
 *   الوراء (`MOVEMENT_COST_ENFORCED_FROM`) حتى تدخل فيها السجلاتُ الثمانية
 *   التاريخية المعروفة — وهى مخالِفةٌ فعلاً وموثَّقة. فيجب أن يسقط الحارس.
 *   ثم تُعاد النافذة، فيجب أن يمرّ.
 *
 *   لا كتابة، لا حذف، لا تعطيل حماية، ولا حاجة لقاعدة اختبار منفصلة.
 *
 * Usage: node scripts/selftest-movement-cost.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const { requireDbOrSkip } = require("./lib/selftest-db")
requireDbOrSkip("PRODUCTION_SUPABASE_DB_URL", "أنَّ حارسَ تكلفةِ الحركةِ يرفضُ فرقاً مزروعاً بين الحركةِ والدفتر")

function runGuard(enforcedFrom) {
  const r = spawnSync(
    process.execPath,
    ["scripts/check-movement-cost-matches-ledger.js", "--require-db"],
    {
      encoding: "utf8",
      env: { ...process.env, MOVEMENT_COST_ENFORCED_FROM: enforcedFrom },
    }
  )
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

// (أ) نافذةٌ تشمل السجلات التاريخية المخالِفة ⇒ يجب أن يسقط
const withLegacy = runGuard("2020-01-01")
// (ب) النافذة الحقيقية ⇒ يجب أن يمرّ
const normal = runGuard(process.env.MOVEMENT_COST_ENFORCED_FROM || "2026-07-27")

let ok = true

if (!withLegacy.failed) {
  console.error(
    "X الحارس لم يرفض السجلات التاريخية المخالِفة رغم دخولها فى نافذة الفحص.\n" +
      "  حارسٌ لا يسقط أبداً زينةٌ لا حماية.\n" +
      "  ---- خرج الحارس ----\n" + withLegacy.output
  )
  ok = false
} else {
  console.log("+ الحارس رفض السجلات المخالِفة حين دخلت نافذته — رُئى وهو يرفض")
}

if (normal.failed) {
  console.error(
    "X الحارس يسقط على النافذة الحقيقية — أى أن حركةً جديدة خالفت الدفاتر،\n" +
      "  وهو ما يجب أن يمنعه المُشغِّل. اقرأ الخرج: العطب حقيقىٌّ لا فى الفخّ.\n" +
      "  ---- خرج الحارس ----\n" + normal.output
  )
  ok = false
} else {
  console.log("+ الحارس يمرّ على النافذة الحقيقية — لا مخالفة بعد سريان المُشغِّل")
}

if (!ok) process.exit(1)
console.log("+ movement-cost guard proven to refuse - and no data was touched to prove it.")
