#!/usr/bin/env node
/**
 * selftest-impossible-rollback.js
 * ---------------------------------------------------------------------------
 * v3.74.880 — يجب أن يُرى الحارس وهو يرفض، **وأن يُسمّى ما زُرع**، وألّا
 * يُنذر عن الأشكال التى ضُيِّق ليتجاوزها.
 *
 * والفخّ هنا يحمل عبئاً خاصاً: القاعدة الأولى أنذرت **٥٢** موضعاً وجُلّها
 * صواب، فضُيِّقت إلى **٦**. ⇒ فلا يكفى أن يُرى رافضاً؛ **يجب أن يُرى ساكتاً
 * عن الثلاثة التى ضُيِّق لأجلها**، وإلا عاد إلى الصياح كذباً من حيث لا نرى.
 *
 *   (أ) حذفٌ تعويضى داخل فرع خطأ، على جدولٍ محروس ⇒ يجب أن يسقط ويُسمّى
 *   (ب) حذفٌ يبدأه المستخدم على نفس الجدول المحروس ⇒ **يجب ألّا يسقط**
 *       (وهذا هو الشكل الذى كان يُنذر عنه ٥٢ مرة)
 *   (ج) حذفٌ تعويضى على جدولٍ **غير محروس**        ⇒ يجب ألّا يسقط
 *   (د) حذفٌ فى فرع خطأ بلا إدراجٍ سابق فى نفس الجدول ⇒ ليس تعويضاً
 *
 * ويُزرع كله فى شجرةٍ مؤقّتة (`ROLLBACK_SCAN_ROOT`) لا فى المشروع.
 *
 * Usage: node scripts/selftest-impossible-rollback.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const os = require("os")
const path = require("path")

const root = path.resolve(__dirname, "..")
const checker = path.join(root, "scripts", "check-impossible-rollback.js")
const { collectCompensatingDeletes, findImpossibleRollbacks } = require(checker)

const GUARDED = [
  { table: "vendor_credits", trigger: "trigger_prevent_vendor_credit_deletion", fn: "prevent_vendor_credit_deletion" },
]

let failed = false
const fail = (msg) => { console.error(`X ${msg}`); failed = true }

const CASES = {
  // (أ) الشكل الذى وقع فعلاً فى ٨٨٠
  compensating: `
export async function create(supabase: any) {
  const { data: vc, error: vcErr } = await supabase.from("vendor_credits").insert({ a: 1 }).select("id").single()
  if (vcErr) throw vcErr
  const { error: itemsError } = await supabase.from("vendor_credit_items").insert([{ vendor_credit_id: vc.id }])
  if (itemsError) {
    await supabase.from("vendor_credits").delete().eq("id", vc.id)
    return { success: false }
  }
}
`,
  // (ب) حذفٌ يبدأه المستخدم — الرفض هنا هو الصواب، فلا يُنذَر عنه
  userInitiated: `
export async function removeCredit(supabase: any, id: string) {
  const { error } = await supabase.from("vendor_credits").delete().eq("id", id)
  if (error) throw error
}
`,
  // (ج) تعويضٌ على جدولٍ لا يحرسه مُشغِّل
  unguarded: `
export async function create(supabase: any) {
  const { data: n, error: e1 } = await supabase.from("zz_notes").insert({ a: 1 }).select("id").single()
  if (e1) throw e1
  const { error: e2 } = await supabase.from("zz_note_lines").insert([{ note_id: n.id }])
  if (e2) {
    await supabase.from("zz_notes").delete().eq("id", n.id)
  }
}
`,
  // (د) فرعُ خطأ لكن بلا إدراجٍ سابق فى نفس الجدول: ليس تعويضاً
  noPriorInsert: `
export async function purge(supabase: any, id: string) {
  const { error } = await supabase.from("vendor_credit_items").insert([{ x: 1 }])
  if (error) {
    await supabase.from("vendor_credits").delete().eq("id", id)
  }
}
`,
}

function plant(dir, name, body) {
  const d = path.join(dir, "lib", "zz-probe-880")
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, `${name}.ts`), body, "utf8")
}

function scan(dir) {
  process.env.ROLLBACK_SCAN_ROOT = dir
  delete require.cache[require.resolve(checker)]
  const mod = require(checker)
  return findImpossibleRollbacks(GUARDED, mod.collectCompensatingDeletes())
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-selftest-"))
try {
  for (const [name, body] of Object.entries(CASES)) {
    const d = path.join(tmp, name)
    plant(d, name, body)
  }

  const a = scan(path.join(tmp, "compensating"))
  if (a.length !== 1) {
    fail(`a compensating delete on a guarded table was not refused (got ${a.length})`)
  } else if (!a[0].includes("vendor_credits") || !a[0].includes("compensating.ts")) {
    fail(`the guard refused but never named the planted file/table:\n${a[0]}`)
  } else {
    console.log("+ (a) a compensating delete on a guarded table is refused, and named")
  }

  const b = scan(path.join(tmp, "userInitiated"))
  if (b.length !== 0) {
    fail(`a user-initiated delete was reported - this is the shape the 52-alarm rule got wrong:\n${b.join("\n")}`)
  } else {
    console.log("+ (b) a user-initiated delete on the same guarded table stays silent")
  }

  const c = scan(path.join(tmp, "unguarded"))
  if (c.length !== 0) {
    fail(`a compensating delete on an UNguarded table was reported:\n${c.join("\n")}`)
  } else {
    console.log("+ (c) a compensating delete on an unguarded table stays silent")
  }

  const d = scan(path.join(tmp, "noPriorInsert"))
  if (d.length !== 0) {
    fail(`an error-branch delete with no prior insert into that table was reported:\n${d.join("\n")}`)
  } else {
    console.log("+ (d) an error-branch delete that undoes nothing is not a rollback")
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
  delete process.env.ROLLBACK_SCAN_ROOT
}

if (failed) process.exit(1)
console.log("+ the impossible-rollback guard was seen refusing, and seen staying silent on all three narrowed shapes")
