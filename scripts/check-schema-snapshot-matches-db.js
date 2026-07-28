#!/usr/bin/env node
/**
 * check-schema-snapshot-matches-db.js
 * ---------------------------------------------------------------------------
 * v3.74.867 — **الاتجاه الذى اعترف الحارس القائم بأنه لا يراه.**
 *
 * `check-schema-snapshot-fresh.js` يكتب عن نفسه حرفياً:
 *
 *     "It cannot detect a function ADDED to the database and missing from the
 *      snapshot — that needs a live connection."
 *
 * وهذا بالضبط ما وقع. فحين قِستُ اللقطة مقابل القاعدة الحيّة وجدتُ **أربعة
 * جداولٍ كاملة** تعيش فى الإنتاج ولا وجود لها فى الملف:
 *
 *     casual_workers
 *     production_labour_payments
 *     production_labour_payment_lines
 *     journal_entry_lines_orphan_archive   ← أنشأتُه أنا فى v3.74.860
 *
 * والأخير أبلغها: أنشأتُ جدولاً بيدى قبل يومين، وكتبتُ بعده بيومٍ قاعدةَ
 * «العمود الجديد يعيش فى موضعين لا واحد» — وكنتُ قد خالفتُها **بجدولٍ كامل**
 * قبل أن أكتبها. ⇒ **قاعدةٌ بلا حارسٍ ليست قاعدة، بل نيّة.**
 *
 * ولمَ يهمّ هذا؟ لأن اللقطة ليست وثيقة. هى تحمل ٧٩٤ سياسة أمان صفوف و٥٢٣
 * مُشغِّلاً و١٨٢٧ قيداً وكل صلاحيات الدوال. وجدولٌ غائبٌ عنها يعنى أن أى
 * قراءةٍ لها — مراجعةً أمنية كانت أو إعادةَ بناء — **تفوّت الجدول وسياساته
 * وقيوده كلها**، ولا يُبلَّغ أحد. وقد صيغ الدرس نفسه فى رأس الحارس الآخر:
 * «مرآةٌ متأخرة أخطر من لا مرآة، لأنها موثوقة».
 *
 * ما يفحصه
 * --------
 *   ١) كل جدولٍ حىّ له كتلة `CREATE TABLE` فى اللقطة.
 *   ٢) كل كتلةٍ فى اللقطة لها جدولٌ حىّ (وإلا فاللقطة تصف ما لم يعد قائماً).
 *   ٣) أعمدة كل جدول **بالاسم والترتيب** تطابق الحىّ — ببصمة md5.
 *
 * ولا يفحص الأنواع ولا القيم الافتراضية عمداً: فتلك يكتبها المولِّد نفسه،
 * ومقارنتها نصّاً تُنتج ضجيجاً من فروق الصياغة — **وحارسٌ تسعةُ أعشار
 * بلاغاته ضجيج أسوأ من لا حارس** (درس ٨٦٣). الاسم والترتيب يكفيان للإمساك
 * بالانحراف الذى يهمّ: جدولٌ أو عمودٌ موجودٌ هنا ومفقودٌ هناك.
 *
 * الإصلاح: `node scripts/dump-db-schema.js` — يقرأ القاعدة ويكتب الملف فقط.
 *
 * Usage: node scripts/check-schema-snapshot-matches-db.js [--require-db] [--list]
 * Env:   SCHEMA_SNAPSHOT_PATH — لتوجيهه إلى نسخةٍ مؤقتة (يستعمله الفخّ الذاتى
 *        كى لا يمسّ الملف الحقيقى إطلاقاً).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const root = path.resolve(__dirname, "..")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

const snapshotPath =
  process.env.SCHEMA_SNAPSHOT_PATH || path.join(root, "supabase", "schema", "schema.sql")

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot read the live schema."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

if (!fs.existsSync(snapshotPath)) {
  console.error(`X snapshot not found: ${snapshotPath}`)
  process.exit(1)
}

/**
 * أعمدة كل جدول من اللقطة، بترتيب ورودها — وهو ترتيب `ordinal_position`
 * لأن المولِّد يكتبها به.
 *
 * وتُستبعد أسطر القيود صراحةً: `CONSTRAINT`, `PRIMARY KEY`, `FOREIGN KEY`,
 * `UNIQUE`, `CHECK`, `EXCLUDE` — وإلا حُسبت كلمتها الأولى عموداً.
 */
function parseSnapshot(sql) {
  const tables = new Map()
  const re = /CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\);/gi
  for (const m of sql.matchAll(re)) {
    const cols = []
    for (const line of m[2].split("\n")) {
      const t = line.trim()
      if (!t) continue
      if (/^(CONSTRAINT|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(t)) continue
      const c = t.match(/^"?([a-z0-9_]+)"?\s+/i)
      if (c) cols.push(c[1])
    }
    if (cols.length) tables.set(m[1], cols)
  }
  return tables
}

const fingerprint = (cols) => crypto.createHash("md5").update(cols.join(",")).digest("hex")

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const live = new Map()
  try {
    const { rows } = await client.query(
      `SELECT c.table_name, c.column_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema
          AND t.table_name   = c.table_name
          AND t.table_type   = 'BASE TABLE'
        WHERE c.table_schema = 'public'
        ORDER BY c.table_name, c.ordinal_position`
    )
    for (const r of rows) {
      if (!live.has(r.table_name)) live.set(r.table_name, [])
      live.get(r.table_name).push(r.column_name)
    }
  } finally { await client.end() }

  const snap = parseSnapshot(fs.readFileSync(snapshotPath, "utf8"))

  const missingTables = []   // حىٌّ وغائبٌ عن اللقطة
  const staleTables = []     // فى اللقطة ولا وجود له حياً
  const columnDrift = []     // موجودٌ فى الاثنين والأعمدة تختلف

  for (const [t, cols] of live) {
    if (!snap.has(t)) { missingTables.push(t); continue }
    const a = fingerprint(cols)
    const b = fingerprint(snap.get(t))
    if (a !== b) {
      const s = new Set(snap.get(t))
      const l = new Set(cols)
      columnDrift.push({
        table: t,
        missingInSnapshot: cols.filter((c) => !s.has(c)),
        extraInSnapshot: snap.get(t).filter((c) => !l.has(c)),
        reordered:
          cols.filter((c) => s.has(c)).join(",") !==
          snap.get(t).filter((c) => l.has(c)).join(","),
      })
    }
  }
  for (const t of snap.keys()) if (!live.has(t)) staleTables.push(t)

  const total = missingTables.length + staleTables.length + columnDrift.length

  if (verbose) {
    for (const t of missingTables) console.log(`  - missing from snapshot: ${t}`)
    for (const t of staleTables) console.log(`  - in snapshot but not live: ${t}`)
    for (const d of columnDrift) console.log(`  - column drift: ${d.table}`)
  }

  console.log(`Live tables: ${live.size}   Snapshot tables: ${snap.size}   Drift: ${total}`)

  if (total === 0) {
    console.log("+ the schema snapshot matches the live database (tables and column order).")
    return
  }

  console.error(`\nX the snapshot disagrees with the database in ${total} place(s):\n`)

  for (const t of missingTables) {
    console.error(`    TABLE MISSING FROM SNAPSHOT: ${t}`)
    console.error(`      Its policies, constraints and indexes are absent too.`)
  }
  for (const t of staleTables) {
    console.error(`    SNAPSHOT DESCRIBES A TABLE THAT NO LONGER EXISTS: ${t}`)
    console.error(`      A rebuild from the repo would recreate it.`)
  }
  for (const d of columnDrift) {
    console.error(`    COLUMN DRIFT: ${d.table}`)
    if (d.missingInSnapshot.length) console.error(`      live only:     ${d.missingInSnapshot.join(", ")}`)
    if (d.extraInSnapshot.length) console.error(`      snapshot only: ${d.extraInSnapshot.join(", ")}`)
    if (d.reordered) console.error(`      column order differs`)
  }

  console.error(
    "\n  The snapshot is not documentation. It carries the RLS policies, the\n" +
      "  triggers, the constraints and every function grant. A table missing from\n" +
      "  it is a table whose entire security model is missing from the repository,\n" +
      "  and nothing else reports that.\n" +
      "\n  Fix:  node scripts/dump-db-schema.js   (reads the database, writes the file)"
  )
  process.exit(1)
})().catch((e) => {
  console.error(`X check-schema-snapshot-matches-db failed: ${e.message}`)
  process.exit(1)
})
