#!/usr/bin/env node
/**
 * selftest-request-body-written-raw.js
 * ---------------------------------------------------------------------------
 * v3.74.858 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله.
 * وهذا الدرس كلّفنا ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣ و٨٥٧.
 *
 * يزرع هذا الملف مساراً مؤقتاً يكتب جسم الطلب كما وصل — نفس شكل العطب —
 * ثم يشترط سقوط الحارس. والتنظيف فى `finally` فلا يبقى أثر.
 *
 * ⚠️ يزرع أيضاً الحالة الأخبث: مسارٌ يستعمل اسماً يشبه دالة الانتقاء
 *    (`pickFakeFields`) لكن بلا قائمة أعمدة حرفية — فلو مرّ، لأمكن تجاوز
 *    الحارس بدالةٍ فارغة تُعيد ما أخذته.
 *
 * Usage: node scripts/selftest-request-body-written-raw.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const PROBE_DIR = path.join(ROOT, "app", "api", "zz-probe-858")
const PROBE_FILE = path.join(PROBE_DIR, "route.ts")

const PROBE_RAW = `
import { createClient } from "@/lib/supabase/server"
export async function PUT(request: Request) {
  const body = await request.json()
  const supabase = await createClient()
  const payload = { ...body, updated_at: new Date().toISOString() }
  const { data } = await supabase.from("products").update(payload).eq("id", body.id)
  return Response.json({ data })
}
`

const PROBE_FAKE_PICK = `
import { createClient } from "@/lib/supabase/server"
function pickFakeFields(x: Record<string, any>) { return x }
export async function PUT(request: Request) {
  const body = await request.json()
  const supabase = await createClient()
  const { data } = await supabase.from("products").update({ ...pickFakeFields(body) }).eq("id", body.id)
  return Response.json({ data })
}
`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-request-body-written-raw.js"], {
    encoding: "utf8",
    env: process.env,
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

let ok = true
try {
  fs.mkdirSync(PROBE_DIR, { recursive: true })

  // (١) النشر الخام المباشر
  fs.writeFileSync(PROBE_FILE, PROBE_RAW, "utf8")
  let r = runGuard()
  if (!r.failed || !r.output.includes("zz-probe-858")) {
    console.error(
      "X the guard did NOT refuse a route that writes the request body straight through.\n" +
        "  ---- guard output ----\n" +
        r.output.split("\n").map((l) => `  ${l}`).join("\n")
    )
    ok = false
  } else {
    console.log("+ the guard refused a raw body write.")
  }

  // (٢) دالة انتقاءٍ بالاسم فقط، بلا قائمة أعمدة — يجب ألّا تُقبل
  if (ok) {
    fs.writeFileSync(PROBE_FILE, PROBE_FAKE_PICK, "utf8")
    r = runGuard()
    if (!r.failed || !r.output.includes("zz-probe-858")) {
      console.error(
        "X the guard accepted a pick-shaped function with no literal column list.\n" +
          "  A name is not an allow-list; the guard can be walked past.\n" +
          "  ---- guard output ----\n" +
          r.output.split("\n").map((l) => `  ${l}`).join("\n")
      )
      ok = false
    } else {
      console.log("+ the guard refused a pick-shaped function with no column list.")
    }
  }
} finally {
  try { fs.rmSync(PROBE_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
}

if (!ok) process.exit(1)
console.log("+ anti-raw-body guard proven to refuse (probes removed).")
