#!/usr/bin/env node
/**
 * selftest-branch-isolation-holes.js
 * ---------------------------------------------------------------------------
 * v3.74.917 — يُرى الحارس وهو يرفض الثغرة التى وقعت فعلاً.
 *
 * ولا يزرع هذا الفخّ عطباً متخيَّلاً: يزرع **العطب نفسه** الذى اكتشفه
 * المالك — السياسة المتساهلة بجوار العزل، والدالة التى تفتح البند لمن
 * أُغلق عنه المستند — ثم يرى الحارس يسمّيهما.
 *
 * ويعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`). ست حالات:
 *   (أ) `bills_select` المتساهلة تعود      ⇒ يُرفض ويُسمّى الجدول.
 *   (ب) `can_access_bill_items` تعود «عضو الشركة» ⇒ يُرفض ويُسمّى البند —
 *       وهذا هو الباب الخلفى الذى يُقرأ منه سعر الشراء.
 *   (ج) سياسةٌ متساهلةٌ على أوامر البيع (922)  ⇒ يُرفض ويُسمّى الجدول.
 *   (د) سياسةٌ متساهلةٌ على عروض الأسعار (923) ⇒ يُرفض ويُسمّى الجدول.
 *   (هـ) سياسةٌ متساهلةٌ على مرتجعات الشراء (924) ⇒ يُرفض ويُسمّى الجدول.
 *   (و) إعادة الحال                          ⇒ يصمت.
 *
 * والدالة المستعادة تُقرأ من **ملف الهجرة نفسه**، فلا يتباعد الفخّ عمّا
 * كُتب.
 *
 * Usage: node scripts/selftest-branch-isolation-holes.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const url = process.env.TEST_SUPABASE_DB_URL

if (!url) {
  console.log("! TEST_SUPABASE_DB_URL is not set - skipping (this selftest never runs against production).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const MIGRATION = path.join(
  ROOT, "supabase", "migrations", "20260731000007_v3_74_917_branch_isolation_actually_works.sql"
)

/** نصّ الدالة كما كُتب فى الهجرة — لا نسخةٌ ثانيةٌ منه هنا. */
function billItemsFnFromMigration() {
  const src = fs.readFileSync(MIGRATION, "utf8")
  const m = src.match(
    /CREATE OR REPLACE FUNCTION public\.can_access_bill_items\(p_bill_id uuid\)[\s\S]*?\n\$function\$;/
  )
  return m ? m[0] : null
}

/** الحال القديمة: تفتح البند لأى عضوٍ فى الشركة مهما كان فرعه. */
const CRIPPLED_BILL_ITEMS = `
CREATE OR REPLACE FUNCTION public.can_access_bill_items(p_bill_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $probe$
DECLARE v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM bills WHERE id = p_bill_id;
  RETURN is_company_member(v_company_id);
END;
$probe$;`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-branch-isolation-holes.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, BRANCH_ISOLATION_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const billItemsFn = billItemsFnFromMigration()
  if (!billItemsFn) {
    console.error(`X could not read can_access_bill_items back from ${path.relative(ROOT, MIGRATION)}`)
    console.error("  the selftest would restore nothing - refusing to plant anything.")
    process.exit(1)
  }

  const restore = async (client) => {
    await client.query("DROP POLICY IF EXISTS bills_select ON public.bills")
    await client.query("DROP POLICY IF EXISTS sales_orders_company_wide ON public.sales_orders")
    await client.query("DROP POLICY IF EXISTS estimates_company_wide ON public.estimates")
    await client.query("DROP POLICY IF EXISTS purchase_returns_company_wide ON public.purchase_returns")
    await client.query(billItemsFn)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  const stage = async (name, plant, expect) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    if (!r.failed || !expect.test(r.output)) {
      console.error(`X ${name} was accepted - the leak would be invisible.`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log(`+ ${name}: رُفض كما يجب`)
    }
    await restore(client)
  }

  try {
    await stage(
      "سياسةٌ متساهلةٌ تعود بجوار عزل الفواتير",
      () => client.query(
        "CREATE POLICY bills_select ON public.bills FOR SELECT USING (public.is_company_member(company_id))"
      ),
      /^\s+- bills:/m
    )

    await stage(
      "دالة بنود الفاتورة تعود «عضو الشركة» (باب السعر الخلفى)",
      () => client.query(CRIPPLED_BILL_ITEMS),
      /^\s+- bill_items:/m
    )

    // v3.74.922 — الرأس الجديد يُرى وهو يُقاس، لا يُدرَج فى قائمةٍ ويُصدَّق.
    // فجدولٌ يُضاف إلى HEADS وليس فى بياناته صفٌّ لفرعٍ آخر يمرّ صامتاً،
    // فيبدو محروساً وهو غير مقيس.
    await stage(
      "سياسةٌ متساهلةٌ تعود بجوار عزل أوامر البيع",
      () => client.query(
        "CREATE POLICY sales_orders_company_wide ON public.sales_orders FOR SELECT USING (public.is_company_member(company_id))"
      ),
      /^\s+- sales_orders:/m
    )

    await stage(
      "سياسةٌ متساهلةٌ تعود بجوار عزل عروض الأسعار",
      () => client.query(
        "CREATE POLICY estimates_company_wide ON public.estimates FOR SELECT USING (public.is_company_member(company_id))"
      ),
      /^\s+- estimates:/m
    )

    await stage(
      "سياسةٌ متساهلةٌ تعود بجوار عزل مرتجعات الشراء",
      () => client.query(
        "CREATE POLICY purchase_returns_company_wide ON public.purchase_returns FOR SELECT USING (public.is_company_member(company_id))"
      ),
      /^\s+- purchase_returns:/m
    )

    if (ok) {
      const r = runGuard()
      if (r.failed) {
        console.error("X the guard refuses the correct state - it would block every push.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ الحال الصحيحة: لم يُبلَّغ عنها كما يجب")
      }
    }
  } finally {
    try { await restore(client) } catch { /* ignore */ }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the branch-isolation guard is proven to catch every shape of the real leak: a permissive")
  console.log("  policy beside the isolation on FOUR different tables, and a child-row function that")
  console.log("  forgets the branch - and to stay silent on the correct state (test DB only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
