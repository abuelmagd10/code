#!/usr/bin/env node
/**
 * selftest-transfer-journal.js
 * ---------------------------------------------------------------------------
 * v3.74.918 — يُرى فاحص الدفاتر وهو يرفض نقلاً بلا قيد، وتُرى الآلية وهى
 * تُقيّده تلقائياً.
 *
 * يزرع **العطب الذى وقع فعلاً**: أول نقلٍ حقيقى فى تاريخ النظام
 * (TRF-0001) حرّك بضاعةً بين فرعين بلا قيدٍ يومية، فبقيت ٤٣٢٫٥٠ فى دفتر
 * الفرع الخطأ. وإجمالى الشركة صحيحٌ طول الوقت — ولهذا لم يصرخ أى فاحصٍ
 * يقيس الإجمالى. الخلل فى البُعد لا فى المجموع.
 *
 * ⚠️ ودرسٌ من محاولةٍ أولى فاشلة، مكتوبٌ هنا كى لا يُعاد: كانت النسخة
 *    الأولى تزرع **صنفاً جديداً وطبقة تكلفة وحركة تسوية** لتوفّر رصيداً
 *    للنقل. فأسقطت فحصين آخرين لا علاقة لهما بالمُختبَر: طبقةُ تكلفةٍ بلا
 *    قيدٍ مقابل ⇒ «الأستاذ ≠ FIFO»، وحركةُ تسويةٍ بلا قيد ⇒ «صفوفٌ بلا
 *    قيد». أى أن **السقالة نفسها كسرت الفحص**، فبدا الفشل من الآلية وهو
 *    منها. والقاعدة: يُزرع أقلُّ ما يكفى، ويُستعمل ما هو قائمٌ بالفعل.
 *
 * فهنا: **لا صنفَ جديد ولا طبقةَ تكلفة ولا تسوية**. يُختار صنفٌ له طبقات
 * قائمة، ويُعطَّل حارس الرصيد السالب مؤقتاً كى تُدرَج ساقا النقل وحدهما —
 * فلا يتغيّر شىءٌ فى الأستاذ ولا فى FIFO، ولا يبقى أمام الفاحص إلا العطب
 * المقصود.
 *
 * ثلاث حالات، على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`):
 *   (أ) نقلٌ بين فرعين والمحفِّز معطَّل ⇒ الفاحص يرفض ويسمّى الجدول.
 *   (ب) تُمحى السقالة              ⇒ يصمت الفاحص (فلا يُتَّهم بضجيج).
 *   (ج) نقلٌ والمحفِّز قائم         ⇒ يُقيَّد **بلا تدخّل**: سطران على
 *       فرعين، مدين = دائن = الكمية × متوسط FIFO. ثم يُلغى بـ ROLLBACK.
 *
 * Usage: node scripts/selftest-transfer-journal.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const url = process.env.TEST_SUPABASE_DB_URL
if (!url) {
  console.log("! TEST_SUPABASE_DB_URL is not set - skipping (this selftest never runs against production).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * تُطلب المحفِّزات **بدوالّها** لا بأسمائها: المحاولة الأولى عطّلت
 * "prevent_negative_branch_inventory" وهو اسم الدالة، واسم المحفِّز
 * "trg_prevent_negative_branch_inventory" — فلم يُعطَّل شىء، وسقط الزرع
 * على حارس الرصيد السالب. تُقرأ الأسماء من الكتالوج فلا تتقادم.
 */
const NEGATIVE_FN = "prevent_negative_branch_inventory"
const JOURNAL_FN  = "inventory_transfer_post_journal_trg"

/**
 * الفاحص يقرأ `PRODUCTION_SUPABASE_DB_URL` وحدها. ويُوجَّه إلى قاعدة
 * الاختبار **للعملية الابنة فقط** — لا يُكتب شىءٌ فى بيئة هذه العملية،
 * ولا يمسّ الإنتاج بحال.
 */
function runLedgerGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-ledger-integrity.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PRODUCTION_SUPABASE_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const q = (sql, p) => client.query(sql, p)
  let ok = true
  let planted = null

  const triggerNameOf = async (fn) => {
    const { rows } = await q(`
      SELECT t.tgname FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_proc  p ON p.oid = t.tgfoid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'inventory_transactions'
         AND NOT t.tgisinternal AND p.proname = $1
       LIMIT 1`, [fn])
    return rows[0]?.tgname || null
  }

  const setTrigger = async (name, state) => {
    if (!name) return
    await q(`ALTER TABLE public.inventory_transactions ${state} TRIGGER ${name}`)
  }

  const plant = async () => {
    const { rows } = await q(`
      SELECT f.company_id, f.product_id,
             round(sum(f.remaining_quantity * f.unit_cost) / sum(f.remaining_quantity), 4) AS avg_cost,
             (SELECT w.id             FROM warehouses w WHERE w.company_id = f.company_id AND w.branch_id IS NOT NULL AND w.cost_center_id IS NOT NULL ORDER BY w.id LIMIT 1) AS wh_a,
             (SELECT w.branch_id      FROM warehouses w WHERE w.company_id = f.company_id AND w.branch_id IS NOT NULL AND w.cost_center_id IS NOT NULL ORDER BY w.id LIMIT 1) AS br_a,
             (SELECT w.cost_center_id FROM warehouses w WHERE w.company_id = f.company_id AND w.branch_id IS NOT NULL AND w.cost_center_id IS NOT NULL ORDER BY w.id LIMIT 1) AS cc_a,
             (SELECT w.id             FROM warehouses w WHERE w.company_id = f.company_id AND w.branch_id IS NOT NULL AND w.cost_center_id IS NOT NULL ORDER BY w.id DESC LIMIT 1) AS wh_b,
             (SELECT w.branch_id      FROM warehouses w WHERE w.company_id = f.company_id AND w.branch_id IS NOT NULL AND w.cost_center_id IS NOT NULL ORDER BY w.id DESC LIMIT 1) AS br_b,
             (SELECT w.cost_center_id FROM warehouses w WHERE w.company_id = f.company_id AND w.branch_id IS NOT NULL AND w.cost_center_id IS NOT NULL ORDER BY w.id DESC LIMIT 1) AS cc_b,
             (SELECT m.user_id FROM company_members m WHERE m.company_id = f.company_id LIMIT 1) AS actor
        FROM fifo_cost_lots f
       WHERE f.remaining_quantity > 0
       GROUP BY f.company_id, f.product_id
      HAVING sum(f.remaining_quantity) > 0
       LIMIT 20
    `)
    const c = rows.find((r) => r.br_a && r.br_b && r.br_a !== r.br_b && r.actor)
    if (!c) return null

    const { rows: tr } = await q(
      `INSERT INTO inventory_transfers (company_id, transfer_number, source_warehouse_id, source_branch_id,
                                        destination_warehouse_id, destination_branch_id, status,
                                        transfer_date, created_by)
       VALUES ($1, 'ZZ-PROBE-918', $2, $3, $4, $5, 'received', current_date, $6) RETURNING id`,
      [c.company_id, c.wh_a, c.br_a, c.wh_b, c.br_b, c.actor])
    const transfer = tr[0].id

    await q(
      `INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_change,
                                           branch_id, cost_center_id, warehouse_id, reference_type, reference_id)
       VALUES ($1, $2, 'transfer_out', -1, $3, $4, $5, 'transfer', $6)`,
      [c.company_id, c.product_id, c.br_a, c.cc_a, c.wh_a, transfer])
    const { rows: inRow } = await q(
      `INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_change,
                                           branch_id, cost_center_id, warehouse_id, reference_type, reference_id)
       VALUES ($1, $2, 'transfer_in', 1, $3, $4, $5, 'transfer', $6) RETURNING id`,
      [c.company_id, c.product_id, c.br_b, c.cc_b, c.wh_b, transfer])

    return { ...c, transfer, in_id: inRow[0].id }
  }

  const uproot = async () => {
    await q(`DELETE FROM inventory_transactions
              WHERE reference_id IN (SELECT id FROM inventory_transfers WHERE transfer_number = 'ZZ-PROBE-918')`)
    await q("DELETE FROM inventory_transfers WHERE transfer_number = 'ZZ-PROBE-918'")
  }

  let negTrg = null
  let jrnTrg = null

  try {
    negTrg = await triggerNameOf(NEGATIVE_FN)
    jrnTrg = await triggerNameOf(JOURNAL_FN)
    if (!jrnTrg) {
      console.error(`X no trigger runs ${JOURNAL_FN} on inventory_transactions - there is nothing to prove.`)
      await client.end(); process.exit(1)
    }

    // ═══ (أ) نقلٌ بين فرعين بلا قيد ═══
    await setTrigger(negTrg, "DISABLE")
    await setTrigger(jrnTrg, "DISABLE")
    planted = await plant()
    await setTrigger(jrnTrg, "ENABLE")

    if (!planted) {
      await uproot()
      console.log("! no two-branch company with a costed product - nothing to plant.")
      await client.end()
      process.exit(0)
    }

    let r = runLedgerGuard()
    if (!r.failed || !/inventory_transactions/.test(r.output)) {
      console.error("X a cross-branch transfer with NO journal entry was accepted - the 432.50 could sit in the wrong branch again.")
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log("+ نقلٌ بين فرعين بلا قيد: رُفض كما يجب")
    }

    // ═══ (ب) تُمحى السقالة فيصمت الفاحص ═══
    await uproot()
    if (ok) {
      r = runLedgerGuard()
      if (r.failed) {
        console.error("X the guard still complains after the probe is gone - it would block every push.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ الحال الصحيحة: لم يُبلَّغ عنها كما يجب")
      }
    }

    // ═══ (ج) والمحفِّز قائم: يُقيَّد بلا تدخّل — ثم يُلغى كل شىء ═══
    if (ok) {
      await q("BEGIN")
      const p2 = await plant()          // محفِّز القيد مفعَّل، وحارس الرصيد وحده معطَّل
      const { rows: got } = await q(
        `SELECT t.journal_entry_id, t.unit_cost, t.total_cost,
                (SELECT count(*)::int FROM journal_entry_lines l WHERE l.journal_entry_id = t.journal_entry_id) AS lines,
                (SELECT count(DISTINCT l.branch_id)::int FROM journal_entry_lines l WHERE l.journal_entry_id = t.journal_entry_id) AS branches,
                (SELECT round(sum(l.debit_amount), 2) FROM journal_entry_lines l WHERE l.journal_entry_id = t.journal_entry_id) AS dr,
                (SELECT round(sum(l.credit_amount), 2) FROM journal_entry_lines l WHERE l.journal_entry_id = t.journal_entry_id) AS cr
           FROM inventory_transactions t WHERE t.id = $1`, [p2.in_id])
      const g = got[0]
      const expected = Math.round(Number(p2.avg_cost) * 100) / 100
      await q("ROLLBACK")

      if (!g.journal_entry_id || g.lines !== 2 || g.branches !== 2 ||
          Number(g.dr) !== Number(g.cr) || Math.abs(Number(g.dr) - expected) > 0.01 ||
          Math.abs(Number(g.total_cost) - expected) > 0.01) {
        console.error(`X the trigger did not post a correct entry by itself ` +
          `(entry=${!!g.journal_entry_id} lines=${g.lines} branches=${g.branches} dr=${g.dr} cr=${g.cr} ` +
          `movement_cost=${g.total_cost} expected=${expected}).`)
        ok = false
      } else {
        console.log(`+ المحفِّز قيّد النقل وحده: سطران على فرعين، ${g.dr} مدين = دائن، والحركة تحمل قيمتها`)
      }
    }
  } finally {
    try { await q("ROLLBACK") } catch { /* لا معاملة مفتوحة */ }
    try {
      await setTrigger(negTrg, "ENABLE")
      await setTrigger(jrnTrg, "ENABLE")
      await uproot()
    } catch (e) { console.error(`! cleanup: ${e.message}`) }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the transfer-journal mechanism is proven: the ledger guard refuses an unposted cross-branch")
  console.log("  transfer, stays silent when clean, and the trigger posts a balanced two-branch entry unaided.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
