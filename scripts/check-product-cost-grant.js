#!/usr/bin/env node
/**
 * check-product-cost-grant.js
 * ---------------------------------------------------------------------------
 * v3.74.911 — الحجب واقعٌ فى القاعدة، لا فى النيّة.
 *
 * بعد أن سُحبت قراءة أعمدة التكلفة من `authenticated`، يبقى سؤالٌ واحد:
 * **هل هى مسحوبةٌ الآن، فعلاً، على القاعدة الحيّة؟** وهذا ما يقيسه هذا
 * الحارس فى كل دفعة — لا الملف، بل الصلاحية نفسها.
 *
 * ولماذا لا يكفى وجود سطر `REVOKE` فى هجرة؟ لثلاثة أسباب قِيست، لا خُشيت:
 *
 *   ١) **صلاحية الجدول تبتلع سحب العمود**: منحُ `SELECT ON products` مرةً
 *      واحدة — بهجرةٍ لاحقة أو بيدٍ فى لوحة التحكم — يُبطل الحجب كله بلا
 *      أن يتغيّر حرفٌ فى الكود. القاعدة لا تشتكى، والشاشات تعمل، والتكلفة
 *      تُقرأ. حارسٌ يقرأ الملفات وحدها لا يرى هذا أبداً.
 *   ٢) **عمودٌ جديد يُضاف إلى `products`** لا يُمنح لأحد، فيختفى من كل
 *      الشاشات صامتاً (وهو نفس عطب 908 من الجهة المقابلة).
 *   ٣) `service_role` لو فقد صلاحيته توقفت المهام الخلفية والهجرات.
 *
 * والمقياس الثالث هو الأدق: قائمة الأعمدة الممنوحة يجب أن تساوى
 * `PRODUCT_COLUMNS_NO_COST` فى `lib/products-columns.ts` **تماماً** — لا
 * أكثر (فيُسرَّب) ولا أقل (فيختفى عمودٌ من الشاشات).
 *
 * Usage: node scripts/check-product-cost-grant.js [--require-db] [--list]
 * Env:   PRODUCT_GRANT_DB_URL — قاعدةٌ بديلة (يستعملها الفخّ الذاتى على
 *        قاعدة الاختبار، فلا يمسّ الإنتاج).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const ROOT = process.cwd()
const COLUMNS_FILE = path.join(ROOT, "lib", "products-columns.ts")
const COST = ["cost_price", "original_cost_price", "display_cost_price"]
const HIDDEN_FROM = ["authenticated", "anon"]

const url = process.env.PRODUCT_GRANT_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot read the live grants."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/** القائمة المسمّاة كما يراها الكود (نصٌّ حرفىٌّ واحد منذ 908). */
function namedColumns() {
  const src = fs.readFileSync(COLUMNS_FILE, "utf8")
  const literal = src.match(/PRODUCT_COLUMNS_NO_COST\s*=\s*['"]([^'"]+)['"]/)
  if (!literal) return []
  return literal[1].split(",").map((c) => c.trim()).filter(Boolean)
}

;(async () => {
  const expected = namedColumns()
  if (expected.length === 0) {
    console.error("X could not read PRODUCT_COLUMNS_NO_COST from lib/products-columns.ts")
    process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let tableGrants, columnGrants
  try {
    ;({ rows: tableGrants } = await client.query(
      `SELECT grantee, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'products'`
    ))
    ;({ rows: columnGrants } = await client.query(
      `SELECT grantee, column_name
         FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND table_name = 'products'
          AND privilege_type = 'SELECT'`
    ))
  } finally { await client.end() }

  const problems = []

  const hasTableSelect = (role) =>
    tableGrants.some((g) => g.grantee === role && g.privilege_type === "SELECT")
  const columnsOf = (role) =>
    new Set(columnGrants.filter((g) => g.grantee === role).map((g) => g.column_name))

  for (const role of HIDDEN_FROM) {
    // (١) لا صلاحية جدولٍ كاملة — وإلا فالسحب على العمود بلا أثر.
    if (hasTableSelect(role)) {
      problems.push(
        `${role} holds table-wide SELECT on products - that swallows every column revoke, ` +
        `and the cost is readable again`
      )
      continue
    }

    const granted = columnsOf(role)

    // (٢) ولا عمود تكلفةٍ ممنوح.
    for (const c of COST) {
      if (granted.has(c)) problems.push(`${role} can read products.${c} again - the hide is off`)
    }

    // (٣) والممنوح يساوى المسمّى فى الكود: لا أقل فيختفى عمود، ولا أكثر فيُسرَّب.
    const missing = expected.filter((c) => !granted.has(c))
    const extra = [...granted].filter((c) => !expected.includes(c) && !COST.includes(c))
    if (missing.length) {
      problems.push(`${role} lost SELECT on: ${missing.join(", ")} - those columns vanish from every screen`)
    }
    if (extra.length) {
      problems.push(`${role} is granted columns the code does not name: ${extra.join(", ")}`)
    }
  }

  // (٤) ومفتاح الخدمة يبقى كاملاً: به تعمل الهجرات والمهام الخلفية.
  if (!hasTableSelect("service_role")) {
    problems.push("service_role lost SELECT on products - migrations and background jobs would break")
  }

  if (problems.length > 0) {
    console.error(`X the product-cost hide is not what the code assumes (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  Fix with supabase/migrations/20260731000003_v3_74_911_revoke_product_cost_select.sql")
    process.exit(1)
  }

  if (verbose) {
    for (const role of HIDDEN_FROM) console.log(`  ${role}: ${columnsOf(role).size} column(s) granted`)
  }
  console.log(
    `+ purchase cost is revoked on the live database (${HIDDEN_FROM.join(", ")}: ` +
    `${expected.length} columns granted, ${COST.length} cost columns withheld; service_role intact).`
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
