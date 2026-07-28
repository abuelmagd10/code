#!/usr/bin/env node
/**
 * check-impossible-rollback.js
 * ---------------------------------------------------------------------------
 * v3.74.880 — تراجُعٌ يدوىٌّ قد يُرفض ليس تراجُعاً، بل رجاء.
 *
 * **الحادثة**: `lib/purchase-returns-vendor-credits.ts` كان يُدرج رأس الإشعار
 * الدائن، ثم بنوده. وعند فشل البنود «ينظّف» بحذف الرأس:
 *
 *     await supabase.from('vendor_credits').delete().eq('id', vendorCredit.id)
 *
 * **وذلك الحذف لم يكن ممكناً أصلاً.** الإشعار يُنشأ بحالة `open`، ومُشغِّل
 * `prevent_vendor_credit_deletion` لا يسمح بالحذف إلا لـ`draft`/`cancelled`.
 * أُثبت على الإنتاج داخل معاملةٍ مُلغاة:
 *
 *     rollback DELETE (status=open) : *** REFUSED ***
 *     orphan header left behind : 1  (journal entry already posted)
 *
 * ⇒ مسارُ تراجُعٍ **يقينىُّ الفشل**، يُنتج بالضبط ما حذّر منه تعليقه.
 *
 * ── وقاعدةٌ أوسع صُمِّمت ثم ضُيِّقت، قبل الشحن ───────────────────────────
 * كان الحكم أولاً: «أى حذفٍ من جدولٍ يحرسه مُشغِّل». فقِسته على المشروع
 * فأنذر **٥٢ موضعاً**، وجُلّها حذفٌ يبدأه المستخدم — وهناك الرفض **هو
 * الصواب**: يحاول حذف فاتورة مُرحَّلة فيُمنع، ويرى رسالة، وذاك المقصود.
 *
 * ⇒ فليست المشكلة فى الحذف المحروس، بل فى الحذف **التعويضى**: حذفٌ يقع فى
 *   فرع الخطأ ليُلغى إدراجاً وقع قبله بسطور. ذاك وحده يُفترض فيه النجاح
 *   الصامت، وهو وحده الذى يترك نصف عملٍ إن رُفض.
 *
 * **فالحكم: `.delete()` داخل فرع خطأ، على جدولٍ أُدرج فيه فى نفس الملف،
 * وحذفُه يحرسه مُشغِّل قد يرفع استثناءً.** (٥٢ ⇒ ٦.)
 *
 * والعلاج ليس تحسين الرسالة عند الفشل: **ما لا يصحّ أن يوجد نصفه يُكتب فى
 * معاملةٍ واحدة تتراجع بنفسها**، فلا تستأذن مُشغِّلاً آخر.
 *
 * Usage: node scripts/check-impossible-rollback.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const requireDb = process.argv.includes("--require-db")
const root = process.env.ROLLBACK_SCAN_ROOT
  ? path.resolve(process.env.ROLLBACK_SCAN_ROOT)
  : path.resolve(__dirname, "..")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/**
 * ما هو موجودٌ اليوم، لا ما هو مقبول. يهبط ولا يصعد.
 * v3.74.882 — ٦ ⇒ ٤: مسارا الاسترداد (قيود اليومية) وُحِّدا فى
 * `create_journal_entry_atomic` فلم يعد فيهما حذفٌ تعويضى أصلاً.
 * الأربعة الباقية: sales_orders ×٢ · invoices · chart_of_accounts.
 */
const BASELINE = 4

const SCAN_DIRS = ["app", "lib", "components"]
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"])

const DELETE_RE = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.delete\(/g

/** فرعُ خطأ: `catch (…)` أو `if (…Error)` أو `if (…Err)` قبل الحذف بقليل. */
const ERROR_BRANCH_RE = /\bcatch\s*\(|if\s*\([^)]*[Ee]rror\s*\)|if\s*\([^)]*Err\s*\)/
const LOOKBACK = 700

function walk(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(path.join(dir, e.name), out)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(path.join(dir, e.name))
    }
  }
}

/** @returns {{table:string, rel:string, line:number}[]} الحذف التعويضى فقط */
function collectCompensatingDeletes() {
  const files = []
  for (const d of SCAN_DIRS) walk(path.join(root, d), files)

  const out = []
  for (const file of files) {
    let src
    try { src = fs.readFileSync(file, "utf8") } catch { continue }
    if (!src.includes(".delete(")) continue
    const rel = path.relative(root, file).replace(/\\/g, "/")

    DELETE_RE.lastIndex = 0
    for (const m of src.matchAll(DELETE_RE)) {
      const table = m[1]
      const before = src.slice(Math.max(0, m.index - LOOKBACK), m.index)
      if (!ERROR_BRANCH_RE.test(before)) continue

      // وأن يكون قد أُدرج فى نفس الجدول قبله: فبلا إدراجٍ سابق ليس تعويضاً.
      const insertedEarlier = new RegExp(
        `\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,200}?\\.insert\\(`
      ).test(src.slice(0, m.index))
      if (!insertedEarlier) continue

      out.push({ table, rel, line: src.slice(0, m.index).split("\n").length })
    }
  }
  return out
}

/**
 * الحكم، معزولاً عن القاعدة كى يُختبر بلا شبكة.
 * @param {{table:string,trigger:string,fn:string}[]} guarded
 * @param {{table:string,rel:string,line:number}[]} sites
 * @returns {string[]}
 */
function findImpossibleRollbacks(guarded, sites) {
  const byTable = new Map()
  for (const g of guarded) {
    if (!byTable.has(g.table)) byTable.set(g.table, [])
    byTable.get(g.table).push(`${g.fn} (${g.trigger})`)
  }
  const out = []
  for (const s of sites) {
    const guards = byTable.get(s.table)
    if (!guards) continue
    out.push(
      `  - ${s.rel}:${s.line} deletes from "${s.table}" inside an error branch,\n` +
      `      to undo an insert made just above. That delete is guarded by:\n` +
      guards.map((g) => `        ${g}`).join("\n") +
      `\n      => the rollback CAN be refused. If it is, half the work stays.`
    )
  }
  return out
}

const SQL_GUARDED = `
  SELECT c.relname AS table, t.tgname AS trigger, p.proname AS fn
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public'
     AND (t.tgtype & 8) <> 0          -- DELETE
     AND pg_get_functiondef(p.oid) ILIKE '%RAISE EXCEPTION%'
   ORDER BY c.relname, t.tgname
`

module.exports = { findImpossibleRollbacks, collectCompensatingDeletes, BASELINE }

if (require.main !== module) return

;(async () => {
  const sites = collectCompensatingDeletes()

  if (!url) {
    const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot list delete-guarding triggers."
    if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
    console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
    process.exit(0)
  }

  let Client
  try { ({ Client } = require("pg")) } catch {
    console.error("X npm install pg --save-dev"); process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let guarded = []
  try { ({ rows: guarded } = await client.query(SQL_GUARDED)) } finally { await client.end() }

  if (guarded.length === 0) {
    console.error("X no delete-guarding trigger found at all - the query is broken, not the schema")
    process.exit(1)
  }

  const failures = findImpossibleRollbacks(guarded, sites)

  if (failures.length > BASELINE) {
    console.error(`X ${failures.length} compensating delete(s) a trigger can refuse - baseline is ${BASELINE}:\n`)
    for (const f of failures) console.error(f)
    console.error(
      "\n  A manual rollback is only a rollback if it cannot be refused. Replace the\n" +
      "  two statements with ONE transactional function: a transaction rolls itself\n" +
      "  back and needs no permission from another trigger."
    )
    process.exit(1)
  }

  if (failures.length < BASELINE) {
    console.log(`+ ${failures.length} compensating delete(s) remain (was ${BASELINE}) - lower the BASELINE.`)
    process.exit(0)
  }

  console.log(`+ No new impossible rollbacks (${guarded.length} guarded table(s) checked).`)
  console.log(`! ${failures.length} pre-existing one(s) remain. Tracked, not approved:`)
  for (const f of failures) console.log(f)
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})
