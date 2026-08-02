#!/usr/bin/env node
/**
 * apply-migration-file.js
 * ---------------------------------------------------------------------------
 * v3.74.941 — **يُطبَّق الملفُّ نفسُه، لا نسخةٌ منه.**
 *
 * درسٌ وقعتُ فيه فى هذا الإصدار بالذات، وهو نفسُ ما يحذّر منه
 * `append-function-to-migration.js` بالنص:
 *
 *   «الهجرةُ سجلُّ ما طُبِّق. فإن أعدتُ كتابةَ جسدِ دالةٍ بيدى فى الملف،
 *    سجّل الملفُّ **ما كتبتُه** لا **ما يعمل**. وهما شىءٌ واحدٌ حتى يفترقا.»
 *
 * طبّقتُ الدوالَّ الست بيدى عبر لوحةِ التحكم، والملفُّ على القرص يحمل
 * تعليقاتٍ داخليةً لم أنقلها معها. فاختلفت البصماتُ الستُّ كلُّها، وكان
 * `check-migration-matches-db.js` سيرفض الدفعَ بحق. والعلاجُ ليس تجريدَ
 * الملفِّ من تعليقاته حتى يوافق القاعدة — **بل تطبيقُ الملفِّ كما هو**،
 * فيبقى الملفُّ هو المصدر.
 *
 * ولا يُصدَّق النجاحُ من رمز الخروج: بعد التطبيق يُعاد قراءةُ كلِّ دالةٍ من
 * القاعدة وتُقارَن **بنفس التطبيع** الذى يستعمله فاحصُ الهجرات، ويُرفض
 * التشغيلُ إن اختلف حرف.
 *
 * Usage:
 *   node scripts/apply-migration-file.js <migration-file> [--test] [--production]
 *
 * ولا يُطبَّق على الإنتاج إلا بذكرِه صراحةً.
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith("--"))
const wantTest = args.includes("--test")
const wantProd = args.includes("--production")

if (!file) {
  console.error("X usage: node scripts/apply-migration-file.js <migration-file> [--test] [--production]")
  process.exit(1)
}
if (!wantTest && !wantProd) {
  console.error("X name a target explicitly: --test and/or --production. Nothing is applied by accident.")
  process.exit(1)
}

const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file)
if (!fs.existsSync(abs)) { console.error(`X no such file: ${file}`); process.exit(1) }
const sql = fs.readFileSync(abs, "utf8")

// نفسُ التطبيع الذى يستعمله check-migration-matches-db.js — وإلا قِيس شىءٌ
// وحُكم على غيره (القاعدة الحادية عشرة).
const norm = (s) => String(s).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim()

function parseFunctions(src) {
  const out = []
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(/gi
  let m
  while ((m = re.exec(src)) !== null) {
    const rest = src.slice(m.index)
    const tagMatch = /\$([A-Za-z_]*)\$/.exec(rest)
    if (!tagMatch) continue
    const tag = tagMatch[0]
    const start = rest.indexOf(tag) + tag.length
    const end = rest.indexOf(tag, start)
    if (end <= start) continue
    out.push({ name: m[1], body: rest.slice(start, end) })
  }
  return out
}

function extractBody(text) {
  const m = /\$([A-Za-z_]*)\$/.exec(text)
  if (!m) return null
  const tag = m[0]
  const start = text.indexOf(tag) + tag.length
  const end = text.lastIndexOf(tag)
  if (end <= start) return null
  return text.slice(start, end)
}

const TARGETS = []
if (wantTest) TARGETS.push({ label: "TEST", url: process.env.TEST_SUPABASE_DB_URL })
if (wantProd) TARGETS.push({ label: "PRODUCTION", url: process.env.PRODUCTION_SUPABASE_DB_URL })

;(async () => {
  const wanted = parseFunctions(sql)
  console.log(`Applying ${path.basename(abs)} (${wanted.length} function(s)) to: ${TARGETS.map((t) => t.label).join(", ")}`)

  for (const target of TARGETS) {
    if (!target.url) { console.error(`X no database URL for ${target.label}`); process.exit(1) }
    const client = new Client({ connectionString: target.url, ssl: { rejectUnauthorized: false } })
    client.on("error", (e) => console.error(`! pg(${target.label}): ${e.message}`))
    await client.connect()
    try {
      await client.query(sql)
      console.log(`+ ${target.label}: applied`)

      // ولا يُصدَّق رمزُ الخروج: يُعاد قراءةُ ما يعمل ويُقارَن بالملف.
      const bad = []
      for (const fn of wanted) {
        const { rows } = await client.query(
          `SELECT pg_get_functiondef(p.oid) AS def
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = $1`, [fn.name])
        if (rows.length === 0) { bad.push(`${fn.name} does not exist after applying`); continue }
        const wantBody = norm(fn.body)
        if (!rows.some((r) => norm(extractBody(r.def) || "") === wantBody)) {
          bad.push(`${fn.name} runs a body that differs from the file`)
        }
      }
      if (bad.length > 0) {
        console.error(`X ${target.label}: the file was applied but does NOT match what is running:`)
        for (const b of bad) console.error(`  - ${b}`)
        process.exit(1)
      }
      console.log(`+ ${target.label}: every function in the file matches what is running (read back, not assumed)`)
    } catch (e) {
      console.error(`X ${target.label}: ${e.message}`)
      process.exit(1)
    } finally {
      try { await client.end() } catch {}
    }
  }

  console.log("+ the file is the record, and the record is what runs.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
