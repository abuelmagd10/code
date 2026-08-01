#!/usr/bin/env node
/**
 * check-branch-isolation-holes.js
 * ---------------------------------------------------------------------------
 * v3.74.917 — عزل الفروع يُقاس بأثره، لا بنصّه.
 *
 * وُلد هذا الحارس من ثغرةٍ اكتشفها المالك بنفسه: إشعارٌ وصل إلى محاسب
 * الفرع الرئيسى عن فاتورة فرع مدينة نصر، ففتحها وقرأ **سعر الشراء**.
 * والسبب أن على الجدول سياستين متساهلتين: واحدةٌ تقيّد بالفرع، وأخرى
 * تقول «أى عضوٍ فى الشركة» — والمتساهلة تُجمع بـ OR، فالثانية تبتلع
 * الأولى ويصير العزل حبراً.
 *
 * ═══ ولماذا يقيس هذا الحارس **الأثر** لا **النصّ**؟ ═══
 *
 * لأنى جرّبتُ النصّ ففشل. كتبتُ مسحاً يبحث عن السياسات المتساهلة بقراءة
 * تعريفها، فمرّ على `purchase_order_items_select` وأجازها: اسمُها يوحى
 * بأنها للمالك، وأولُ سطرٍ منها `companies.user_id = auth.uid()`. ثم
 * قِستُ الأثر فوجدتُ موظف الفرع ما زال يرى بنود أوامر الفرع الآخر —
 * وفى ذيلها المقطوع عن نظرى `UNION SELECT company_members.company_id`،
 * أى **كل عضو**.
 *
 * فالنصّ يُخادع: اسمٌ مطمئن، وسطرٌ أولُ صحيح، وذيلٌ يفتح كل شىء. والأثر
 * لا يُخادع: **ينتحل هذا الحارس هوية عضو فرعٍ حقيقى على القاعدة الحيّة،
 * ثم يعدّ كم صفاً من فرعٍ آخر يراه**. صفرٌ أو يسقط البناء.
 *
 * وكل ذلك داخل معاملةٍ تُلغى (`ROLLBACK`) — لا يكتب حرفاً.
 *
 * Usage: node scripts/check-branch-isolation-holes.js [--require-db] [--list]
 * Env:   BRANCH_ISOLATION_DB_URL — قاعدةٌ بديلة (يستعملها الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

const url = process.env.BRANCH_ISOLATION_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure branch isolation."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * الرؤوس: جداولٌ تحمل `branch_id` بنفسها.
 * v3.74.921 — أُضيف `purchase_orders`، و922 `sales_orders`، و923
 * `estimates`، و924 `purchase_returns` وجدولُ تخصيصات مخازنها، و925
 * `sales_return_requests` و`sales_returns`، و926 عائلةُ الحجوزات
 * الثمانية، و927 `suppliers`، و928 `third_party_inventory`، و929 جداولُ
 * الحركة الثلاثة: أُغلق عزلُ كلٍّ فى إصداره ويُقاس هنا كى لا يعود.
 * وكل جدولٍ يُغلق من قائمة التسعة عشر يُضاف إلى هذا السطر فى نفس
 * دفعته، ويُزرع له عطبٌ فى الفخّ فيُرى الحارس يسمّيه — وإلا فقد أُغلق
 * بلا حارس، أو حُرس بلا قياس.
 */
const HEADS = ["bills", "invoices", "journal_entries", "payments", "purchase_orders",
               "sales_orders", "estimates", "purchase_returns",
               "purchase_return_warehouse_allocations",
               "sales_return_requests", "sales_returns",
               "bookings", "booking_staff_assignments", "booking_stock_withdrawals",
               "suppliers", "third_party_inventory",
               "inventory_transactions", "fifo_cost_lots", "cogs_transactions"]

/** والأبناء: فرعُهم فرعُ أبيهم، وفيهم يعيش السعر. */
const CHILDREN = [
  { child: "bill_items",           parent: "bills",           fk: "bill_id" },
  { child: "invoice_items",        parent: "invoices",        fk: "invoice_id" },
  { child: "journal_entry_lines",  parent: "journal_entries", fk: "journal_entry_id" },
  { child: "purchase_order_items", parent: "purchase_orders", fk: "purchase_order_id" },
  { child: "sales_order_items",    parent: "sales_orders",    fk: "sales_order_id" },
  { child: "estimate_items",       parent: "estimates",       fk: "estimate_id" },
  { child: "purchase_return_items", parent: "purchase_returns", fk: "purchase_return_id" },
  { child: "sales_return_items",   parent: "sales_returns",   fk: "sales_return_id" },
  { child: "booking_notes",             parent: "bookings", fk: "booking_id" },
  { child: "booking_status_history",    parent: "bookings", fk: "booking_id" },
  { child: "booking_bundle_selections", parent: "bookings", fk: "booking_id" },
  { child: "booking_extra_items",       parent: "bookings", fk: "booking_id" },
]

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const problems = []
  let probe = null
  const seen = []

  try {
    await client.query("BEGIN")

    // عضوُ فرعٍ حقيقى: مرتبطٌ بفرع، وليس من الأدوار العامة، وفى شركةٍ لها
    // أكثر من فرعٍ واحد (وإلا فلا شىء ليُقاس).
    const { rows: probes } = await client.query(`
      SELECT cm.user_id, cm.company_id, cm.branch_id, cm.role
        FROM company_members cm
       WHERE cm.branch_id IS NOT NULL
         AND lower(btrim(cm.role)) NOT IN ('owner','admin','general_manager','gm','generalmanager')
         AND (SELECT count(DISTINCT b.id) FROM branches b WHERE b.company_id = cm.company_id) > 1
       ORDER BY cm.role
       LIMIT 1
    `)

    if (probes.length === 0) {
      console.log("! no branch-bound member in a multi-branch company - nothing to measure.")
      await client.query("ROLLBACK")
      await client.end()
      process.exit(0)
    }

    probe = probes[0]

    // ⚠️ تُجمع مفاتيح الأبناء **قبل** الانتحال، بصلاحيةٍ كاملة.
    // ولماذا؟ لأن أول صياغةٍ لهذا الحارس عدّت الأبناء بربطهم بآبائهم بعد
    // الانتحال — فحجبت سياسةُ الأب صفَّ الأب، فاختفى الابن معه، **فبدا
    // الابن سليماً وهو مفتوح**. وقد أمسك الفخُّ ذلك: زرع دالةَ بندٍ
    // مكسورة فلم يرها الحارس. فصار الابن يُقاس بمفتاحه لا بأبيه.
    const childKeys = {}
    for (const c of CHILDREN) {
      const { rows } = await client.query(
        `SELECT array_agg(p.id) AS ids FROM public.${c.parent} p
          WHERE p.company_id = $1 AND p.branch_id IS NOT NULL AND p.branch_id <> $2`,
        [probe.company_id, probe.branch_id]
      )
      childKeys[c.child] = rows[0].ids || []
    }

    await client.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: probe.user_id, role: "authenticated" })])
    await client.query("SET LOCAL ROLE authenticated")

    for (const t of HEADS) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM public.${t}
          WHERE company_id = $1 AND branch_id IS NOT NULL AND branch_id <> $2`,
        [probe.company_id, probe.branch_id]
      )
      seen.push(`${t}=${rows[0].n}`)
      if (rows[0].n > 0) {
        problems.push(
          `${t}: a ${probe.role} bound to one branch reads ${rows[0].n} row(s) of ANOTHER branch - ` +
          `branch isolation is not in force (a permissive policy beside it is OR-ed in)`
        )
      }
    }

    for (const c of CHILDREN) {
      const ids = childKeys[c.child]
      if (ids.length === 0) { seen.push(`${c.child}=n/a`); continue }
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM public.${c.child} ch WHERE ch.${c.fk} = ANY($1::uuid[])`,
        [ids]
      )
      seen.push(`${c.child}=${rows[0].n}`)
      if (rows[0].n > 0) {
        problems.push(
          `${c.child}: reads ${rows[0].n} line(s) belonging to another branch's ${c.parent} - ` +
          `and the purchase/sale PRICE lives in these lines, so the cost hide (906-916) is bypassed`
        )
      }
    }

    await client.query("RESET ROLE")
    await client.query("ROLLBACK")
  } catch (e) {
    try { await client.query("ROLLBACK") } catch { /* ignore */ }
    await client.end()
    console.error(`X ${e.message}`)
    process.exit(1)
  }
  await client.end()

  if (problems.length > 0) {
    console.error(`X branch isolation leaks (${problems.length}), measured by impersonation:`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  Fix with supabase/migrations/20260731000007_v3_74_917_branch_isolation_actually_works.sql")
    console.error("  NOTE: read the FULL policy text, not its name or first line - that is how")
    console.error("        purchase_order_items_select hid a UNION over company_members.")
    process.exit(1)
  }

  if (verbose) console.log(`  probe: ${probe.role} | ${seen.join(" ")}`)
  console.log(
    `+ branch isolation holds where it is claimed: a branch-bound ${probe.role} sees ZERO rows from ` +
    `another branch across ${HEADS.length} document tables and ${CHILDREN.length} line tables (measured live, rolled back).`
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
