#!/usr/bin/env node
/**
 * selftest-phantom-columns.js
 * ---------------------------------------------------------------------------
 * v3.74.863 — **يجب أن يُرى الحارس وهو يرفض** — وأن يُرى وهو **لا يرفض** الشكل
 * الذى كان يُخطئ فيه.
 *
 * فالأداة القديمة لم تكن نائمة، بل **كانت تصرخ فى غير موضعها**: ٥١ بلاغاً،
 * تسعة أعشارها كاذب. ولذلك لا يكفى هنا فخٌّ موجب؛ يلزم معه فخٌّ **معكوس**
 * يُثبت أن العيوب الثلاثة القديمة لم تعد تُنتج إنذاراً:
 *
 *   (أ) كتابةٌ على عمودٍ وهمى حقيقى            ← يجب أن يسقط
 *   (ب) قراءةُ جدولٍ ثم تحديثُ جدولٍ آخر       ← يجب ألّا يسقط  (عيب ١)
 *   (ج) مفاتيحُ داخل كائن jsonb متداخل         ← يجب ألّا يسقط  (عيب ٢)
 *
 * ويُزرع كلٌّ منها فى ملفٍ مؤقت داخل `lib/`، ويُحذف فى `finally`.
 * لا يمسّ قاعدة بيانات ولا ملفاً قائماً.
 *
 * Usage: node scripts/selftest-phantom-columns.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

if (!process.env.PRODUCTION_SUPABASE_DB_URL) {
  console.error(
    "X PRODUCTION_SUPABASE_DB_URL is not set - cannot prove the guard refuses anything."
  )
  process.exit(1)
}

const root = path.resolve(__dirname, "..")
const probeDir = path.join(root, "lib", "zz-probe-863")
const probeFile = path.join(probeDir, "probe.ts")

const PROBE_REAL = `
import { createClient } from "@/lib/supabase/server"
export async function run(supabase: any, id: string) {
  await supabase.from("commission_plans").update({ zz_column_that_never_existed: 1 }).eq("id", id)
}
`

// عيب ١ القديم: يقرأ جدولاً ثم يُحدِّث آخر. الأعمدة صحيحة على جدولها.
const PROBE_CROSS_TABLE = `
export async function run(supabase: any, id: string, uid: string) {
  const { data: member } = await supabase
    .from("company_members")
    .select("role")
    .eq("user_id", uid)
    .single()
  if (!member) return
  await supabase
    .from("accounting_periods")
    .update({ is_locked: true, status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id)
}
`

// عيب ٢ القديم: مفاتيح داخل عمود jsonb.
const PROBE_NESTED = `
export async function run(supabase: any, id: string) {
  await supabase.from("notification_outbox_events").update({
    delivery_status: "dispatched",
    last_dispatch_summary: { mode: "x", actor_id: null, notification_count: 3 },
  }).eq("event_id", id)
}
`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-phantom-columns.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PHANTOM_COLUMN_BASELINE: "0" },
    cwd: root,
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

const cases = [
  { name: "كتابة على عمودٍ وهمى", src: PROBE_REAL, expectFail: true },
  { name: "قراءة جدول ثم تحديث آخر (عيب ١)", src: PROBE_CROSS_TABLE, expectFail: false },
  { name: "مفاتيح داخل jsonb متداخل (عيب ٢)", src: PROBE_NESTED, expectFail: false },
]

let ok = true
try {
  fs.mkdirSync(probeDir, { recursive: true })
  for (const c of cases) {
    fs.writeFileSync(probeFile, c.src, "utf8")
    const r = runGuard()
    if (c.expectFail && !r.failed) {
      console.error(`X الحارس لم يرفض: ${c.name}\n  ---- خرج الحارس ----\n${r.output}`)
      ok = false
    } else if (!c.expectFail && r.failed) {
      console.error(
        `X الحارس سقط على «${c.name}» وكان يجب ألّا يسقط — عاد العيب القديم.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else {
      console.log(`+ ${c.name}: ${c.expectFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
    }
  }
} finally {
  try { fs.rmSync(probeDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

if (!ok) process.exit(1)
console.log("+ phantom-column guard proven to refuse the real defect and to ignore the two shapes it used to misread.")
