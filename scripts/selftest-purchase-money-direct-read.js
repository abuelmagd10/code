#!/usr/bin/env node
/**
 * selftest-purchase-money-direct-read.js
 * ---------------------------------------------------------------------------
 * v3.74.936 — يُرى الحارس وهو يرفض، **وهو يُبقى البرىء** — والبرىءُ هنا
 * ليس فرضاً نظرياً: أولُ كتابةٍ للحارس رفضت جملةً فى تعليق.
 *
 * يبنى شجرةً مؤقتةً بملفٍ واحدٍ مذكورٍ فى قائمة المحوَّل، ويزرع فيها:
 *   (أ) قراءةٌ مباشرة `.from("bills").select(...)`      ⇒ يُرفض.
 *   (ب) تضمينٌ متداخل `bill_items(...)` بلا اسمٍ مستعار ⇒ يُرفض — وهذا
 *       أخبثُ الشكلين: الرأسُ مقنَّعٌ والسعرُ ظاهرٌ تحته.
 *   (ج) التضمينُ باسمٍ مستعارٍ إلى النافذة (معكوس)      ⇒ يصمت.
 *   (د) **تعليقٌ يذكر `bills (` ** (معكوس)               ⇒ يصمت. وهذه
 *       الحالةُ بعينها أوقعت الحارسَ قبل إصلاحه، ورابعُ مرةٍ يقع فيها هذا
 *       الشكلُ فى المشروع (930 · 932 · 934).
 *   (هـ) كتابةٌ على الجدول (معكوس)                       ⇒ يصمت — النافذةُ
 *       للقراءة، والكتابةُ تبقى على الجدول.
 *
 * Usage: node scripts/selftest-purchase-money-direct-read.js
 * ---------------------------------------------------------------------------
 */

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const GUARD = "scripts/check-purchase-money-direct-read.js"
const CONVERTED_FILE = "app/bills/page.tsx"

function runGuard(root) {
  const r = spawnSync(process.execPath, [GUARD], {
    encoding: "utf8",
    env: { ...process.env, PURCHASE_MONEY_SCAN_ROOT: root },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

function tree(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purchase-money-"))
  const p = path.join(root, CONVERTED_FILE)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
  // الملفُّ الثانى المذكور فى القائمة يجب أن يوجد وإلا اشتكى الحارس بحق.
  const q = path.join(root, "app/bills/[id]/edit/page.tsx")
  fs.mkdirSync(path.dirname(q), { recursive: true })
  fs.writeFileSync(q, 'const x = supabase.from("bills_masked").select("*")\n')
  return root
}

let ok = true
const stage = (title, body, mustFail, needle) => {
  if (!ok) return
  const root = tree(body)
  const r = runGuard(root)
  fs.rmSync(root, { recursive: true, force: true })
  if (mustFail) {
    if (!r.failed || (needle && !r.output.includes(needle))) {
      console.error(`X ${title}: the guard did NOT refuse${needle ? ` (looked for "${needle}")` : ""}.`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
      return
    }
  } else if (r.failed) {
    console.error(`X ${title}: the guard refused something innocent - it would be switched off in a week.`)
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    ok = false
    return
  }
  console.log(`+ ${title}: ${mustFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
}

stage("a converted screen reading the table directly",
  'const { data } = await supabase.from("bills").select("id, total_amount")\n',
  true, "reads bills directly")

stage("a nested embed with no alias to the masked view",
  'const { data } = await supabase.from("bills_masked").select("id, bill_items(id, unit_price)")\n',
  true, "without an alias")

stage("the same embed, aliased to the masked view",
  'const { data } = await supabase.from("bills_masked").select("id, bill_items:bill_items_masked(id, unit_price)")\n',
  false)

stage("a comment that merely mentions the table",
  '// stale amounts show wrong figures on every screen that reads them (bills list, supplier ledger)\n' +
  'const { data } = await supabase.from("bills_masked").select("*")\n',
  false)

stage("writes, which stay on the table",
  'await supabase.from("bills").update({ status: "paid" }).eq("id", id)\n' +
  'await supabase.from("bill_items").delete().eq("bill_id", id)\n' +
  'await supabase.from("bill_items").insert(rows)\n',
  false)

if (!ok) process.exit(1)
console.log("+ the direct-read guard is proven refusing a bare read and an unaliased nested embed,")
console.log("  and sparing an aliased embed, a comment that names the table, and every write.")
