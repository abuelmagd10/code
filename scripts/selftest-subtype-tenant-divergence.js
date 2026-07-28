#!/usr/bin/env node
/**
 * selftest-subtype-tenant-divergence.js
 * ---------------------------------------------------------------------------
 * v3.74.879 — يجب أن يُرى الحارس وهو يرفض، **وأن يُسمّى ما زُرع**.
 *
 * الطُّعم يُزرع فى شجرةٍ مؤقّتة (`SUBTYPE_SCAN_ROOT`) لا فى المشروع، فلا يمسّ
 * ملفاً قائماً ولا يُخاطر بأن يُلتقط فى commit (درس ٨٧٢).
 *
 *   (أ) ملفٌ يبحث بتصنيفٍ **موجودٍ فى بعض الشركات** ⇒ يجب أن يسقط، وأن يُسمّى
 *       التصنيفَ نفسه فى المخرجات. والطُّعم **يُكتشف من الإنتاج وقت التشغيل**
 *       لا يُكتب هنا بالاسم: فالاسم الثابت يشيخ، ويوم يُوحَّد فى الخمس يصير
 *       الفخّ صامتاً ونحن نحسبه يعمل.
 *   (ب) ملفٌ يبحث بتصنيفٍ موجودٍ فى **كلّها**  ⇒ يجب ألّا يسقط.
 *   (ج) ملفٌ يبحث بتصنيفٍ **لا وجود له**       ⇒ يجب ألّا يسقط.
 *       (الغياب التام ليس تبايناً: البحث يفشل بالتساوى فى الخمس، فيُرى.)
 *   (د) الحكم نفسه على صفوفٍ مُصطنعة — **بلا شبكة ولا بيانات**، فيبقى قائماً
 *       يوم لا يوجد فى الإنتاج تصنيفٌ جزئىٌّ يصلح طُعماً.
 *
 * فـ(أ) يُثبت السلك كاملاً حتى القاعدة، و(د) يُثبت الحكم وحده. وحين يتعذّر (أ)
 * **يُقال ذلك صراحةً** ولا يُحسب الحارس مُثبَتاً — فلا يُكتب فى دليل حسابات
 * الإنتاج صفٌّ لأجل اختبار.
 *
 * Usage: node scripts/selftest-subtype-tenant-divergence.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const root = path.resolve(__dirname, "..")
const checker = path.join(root, "scripts", "check-subtype-tenant-divergence.js")
const { findDivergences } = require(checker)

const NOWHERE = "zz_probe_879_no_such_sub_type"

let failed = false
const fail = (msg) => { console.error(`X ${msg}`); failed = true }

// ── (د) الحكم وحده — يعمل دائماً، بلا شبكة ─────────────────────────────
{
  const used = new Map([["zz_bait", ["app/zz/page.tsx"]]])
  const partial = findDivergences([{ sub_type: "zz_bait", present: 2, total: 5 }], used)
  const absent = findDivergences([{ sub_type: "zz_bait", present: 0, total: 5 }], used)
  const uniform = findDivergences([{ sub_type: "zz_bait", present: 5, total: 5 }], used)

  if (partial.length !== 1 || !partial[0].includes("zz_bait") || !partial[0].includes("2 of 5")) {
    fail("the rule did not refuse a sub_type present in 2 of 5 companies, or did not name it")
  } else if (absent.length !== 0) {
    fail("the rule cried wolf on a sub_type present in NO company - uniform absence is visible, not divergent")
  } else if (uniform.length !== 0) {
    fail("the rule cried wolf on a sub_type present in EVERY company")
  } else {
    console.log("+ (d) the rule refuses partial presence, and spares both 0/N and N/N")
  }
}

// ── (أ)(ب)(ج) السلك كاملاً حتى قاعدة الإنتاج ───────────────────────────
function plant(dir, subType) {
  const appDir = path.join(dir, "app", "zz-probe-879")
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(
    path.join(appDir, "page.tsx"),
    `export async function load(supabase: any) {\n` +
    `  const { data } = await supabase.from("chart_of_accounts")\n` +
    `    .select("id").eq("sub_type", "${subType}").maybeSingle()\n` +
    `  return data\n}\n`,
    "utf8"
  )
}

function run(dir) {
  return spawnSync(process.execPath, [checker, "--require-db"], {
    cwd: root,
    env: { ...process.env, SUBTYPE_SCAN_ROOT: dir },
    encoding: "utf8",
  })
}

/** يسأل الإنتاج عن طُعمٍ حقيقى: تصنيفٌ فى بعض الشركات لا كلّها. */
async function discover() {
  const { Client } = require("pg")
  const client = new Client({
    connectionString: process.env.PRODUCTION_SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const { rows } = await client.query(`
      WITH co AS (SELECT DISTINCT company_id FROM public.chart_of_accounts),
           st AS (SELECT DISTINCT sub_type FROM public.chart_of_accounts
                   WHERE sub_type IS NOT NULL AND sub_type <> '')
      SELECT s.sub_type,
             (SELECT count(*) FROM co)::int AS total,
             (SELECT count(*) FROM co c WHERE EXISTS (
                SELECT 1 FROM public.chart_of_accounts a
                 WHERE a.company_id = c.company_id AND a.sub_type = s.sub_type))::int AS present
        FROM st s ORDER BY s.sub_type
    `)
    return {
      partial: rows.find((r) => r.present > 0 && r.present < r.total),
      everywhere: rows.find((r) => r.present === r.total && r.total > 0),
    }
  } finally { await client.end() }
}

;(async () => {
  if (!process.env.PRODUCTION_SUPABASE_DB_URL) {
    console.error("X PRODUCTION_SUPABASE_DB_URL is not set - the wired half of this self-test proves nothing")
    process.exit(1)
  }

  const { partial, everywhere } = await discover()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "subtype-selftest-"))
  try {
    // (أ) موجب
    if (!partial) {
      console.log(
        "! (a) no partially-present sub_type exists in production today, so the\n" +
        "      positive trap cannot be planted without writing a row into a real\n" +
        "      chart of accounts - which is not done for a test. The rule is proven\n" +
        "      by (d); its wiring to the database is NOT proven this run."
      )
    } else {
      const a = path.join(tmp, "partial"); plant(a, partial.sub_type)
      const ra = run(a)
      const outA = `${ra.stdout || ""}${ra.stderr || ""}`
      if (ra.status === 0) {
        fail(`"${partial.sub_type}" is in ${partial.present} of ${partial.total} companies yet the guard passed`)
      } else if (!outA.includes(partial.sub_type)) {
        fail(`the guard refused but never named "${partial.sub_type}" - it may be failing for another reason:\n${outA}`)
      } else {
        console.log(
          `+ (a) "${partial.sub_type}" (${partial.present}/${partial.total}) is refused, and named`
        )
      }
    }

    // (ب) عكسى — موجودٌ فى الكل
    if (everywhere) {
      const b = path.join(tmp, "everywhere"); plant(b, everywhere.sub_type)
      const rb = run(b)
      if (rb.status !== 0) {
        fail(`"${everywhere.sub_type}" is in every company yet the guard refused:\n${rb.stdout}${rb.stderr}`)
      } else {
        console.log(`+ (b) "${everywhere.sub_type}" (${everywhere.total}/${everywhere.total}) passes`)
      }
    } else {
      fail("no sub_type is present in every company - the chart of accounts itself needs looking at")
    }

    // (ج) عكسى — لا وجود له
    const c = path.join(tmp, "nowhere"); plant(c, NOWHERE)
    const rc = run(c)
    if (rc.status !== 0) {
      fail(`a sub_type present in NO company is not a divergence, yet the guard refused:\n${rc.stdout}${rc.stderr}`)
    } else {
      console.log("+ (c) a sub_type present in no company passes - uniform absence is visible, divergence is not")
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  if (failed) process.exit(1)
  console.log("+ the sub_type divergence guard was seen refusing, and seen staying silent")
})().catch((err) => {
  console.error(
    "X self-test failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})
