#!/usr/bin/env node
/**
 * check-ledger-integrity.js
 * ---------------------------------------------------------------------------
 * v3.74.860 — ترابط الدفاتر يُقاس مرةً واحدة صحيحاً، فلا يُعاد اجتهاده.
 *
 * **لماذا وُجد هذا الملف؟**
 *
 * لأننى حسبتُ فجوة المخزون يدوياً **مرّتين فى جلسةٍ واحدة**، وأخطأتُ المرّتين
 * بنفس الخطأ: نسيان استبعاد القيود **المحذوفة منطقياً** (`is_deleted`).
 * وفى المرّتين ظهر نفس الرقم الكاذب: **٢٢.٦٩**.
 *
 * ⇒ ما دام الترابط يُحسب باجتهادٍ جديد فى كل مرة، فسيُحسب خطأً فى كل مرة —
 *   **بمن فيهم كاتب هذا السطر**. فليُكتب مرةً واحدة، ولْيُشغَّل مع كل نشر.
 *
 * **وما كشفه أول تشغيلٍ له**: ٧٣٣ سطر قيدٍ بلا قيدٍ أب **وبلا حساب** — تخالف
 * مفتاحين أجنبيين مُتحقَّقٍ منهما معاً، بقايا حذفٍ جماعى لشركة. لم تكن تؤثر
 * على أى رقمٍ ظاهر (كل تقرير يربط السطر بقيده)، لكنها فخٌّ لأى استعلامٍ قادم
 * يجمع السطور دون ربط. أُرشفت فى ٨٦٠ بقرار المالك، ولم تُحذف.
 *
 * الفحوص السبعة كلها بخط أساس **صفر**، ولا يُرفع أبداً.
 *
 * Usage: node scripts/check-ledger-integrity.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot verify ledger integrity."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * 🔴 الشرط المفروض فى **كل** استعلام هنا:
 *      e.status = 'posted' AND coalesce(e.is_deleted,false) = false
 * إغفال الشوط الثانى هو بالضبط الخطأ الذى وقعتُ فيه مرّتين.
 */
const POSTED = `e.status = 'posted' AND coalesce(e.is_deleted, false) = false`

/**
 * مستنداتٌ يجوز أن تكون بلا قيدٍ محاسبى — كلٌّ بسببه، وقد تُحقِّق من كلٍّ منها
 * على الإنتاج يوم ٢٧ يوليو ٢٠٢٦. الإضافة إلى هنا **قرارٌ لا إجراء**.
 */
const NO_ENTRY_IS_LEGITIMATE = [
  {
    table: "accounting_periods",
    where: `status = 'open'`,
    why: "القيد يُنشأ عند إقفال الفترة لا عند فتحها",
  },
  {
    table: "payments",
    where: `status = 'rejected'`,
    why: "الدفعة المرفوضة لا تُقيَّد أصلاً",
  },
  {
    table: "inventory_transactions",
    where: `transaction_type IN ('production_issue','production_receipt',
                                'booking_custody_out','booking_custody_return')
            OR (transaction_type IN ('transfer_in','transfer_out')
                AND (SELECT count(DISTINCT t2.branch_id)
                       FROM public.inventory_transactions t2
                      WHERE t2.reference_id = inventory_transactions.reference_id
                        AND t2.product_id   = inventory_transactions.product_id
                        AND t2.transaction_type IN ('transfer_in','transfer_out')) = 1)`,
    why:
      "حركات التصنيع تُقيَّد على مستوى أمر الإنتاج لا الحركة، وحركات العهدة " +
      "لا تنقل ملكية. والدليل أن رصيد الأستاذ يطابق FIFO. " +
      "و**v3.74.918**: النقل بين الفروع يُقيَّد الآن تلقائياً (محفِّز " +
      "trg_inventory_transfer_post_journal)، فالاستثناء الوحيد الباقى هو " +
      "النقل داخل الفرع الواحد بين مخزنين — لا يتغيّر به بُعد الدفتر فلا " +
      "قيد له. والشرط مكتوبٌ بالقياس (عدد فروع ساقَى النقل = 1) لا بالاسم، " +
      "فلا يتسع لنقلٍ بين فرعين نسى قيدَه.",
  },
]

const CHECKS = [
  {
    // v3.74.918 — لا يكفى أن يوجد قيدٌ للنقل: يجب أن يساوى ما تحرّك فعلاً.
    // أول نقلٍ فى تاريخ النظام كشف أن النقل بلا قيدٍ أصلاً، فترك ٤٣٢٫٥٠
    // فى غير فرعها. وقيدٌ بمبلغٍ خاطئ يفعل الشىء نفسه بهدوءٍ أكبر.
    name: "قيمة قيد النقل تساوى قيمة الحركة",
    en: "every inventory-transfer entry equals the movement it posts",
    sql: `SELECT count(*)::int AS n
            FROM public.inventory_transactions t
            JOIN public.journal_entries e ON e.id = t.journal_entry_id
           WHERE t.transaction_type = 'transfer_in'
             AND e.reference_type = 'inventory_transfer'
             AND coalesce(e.is_deleted, false) = false
             AND abs(coalesce(t.total_cost, 0)
                     - (SELECT coalesce(sum(l.debit_amount), 0)
                          FROM public.journal_entry_lines l
                         WHERE l.journal_entry_id = e.id)) > 0.01`,
    detail: `SELECT string_agg(t.id::text, ', ') AS info
               FROM public.inventory_transactions t
               JOIN public.journal_entries e ON e.id = t.journal_entry_id
              WHERE t.transaction_type = 'transfer_in'
                AND e.reference_type = 'inventory_transfer'
                AND coalesce(e.is_deleted, false) = false
                AND abs(coalesce(t.total_cost, 0)
                        - (SELECT coalesce(sum(l.debit_amount), 0)
                             FROM public.journal_entry_lines l
                            WHERE l.journal_entry_id = e.id)) > 0.01`,
  },
  {
    name: "ميزان المراجعة (مدين − دائن)",
    en: "trial balance is zero",
    sql: `SELECT count(*)::int AS n FROM (
            SELECT round(sum(l.debit_amount - l.credit_amount), 4) AS d
              FROM public.journal_entry_lines l
              JOIN public.journal_entries e ON e.id = l.journal_entry_id
             WHERE ${POSTED}
            HAVING round(sum(l.debit_amount - l.credit_amount), 4) <> 0
          ) x`,
    detail: `SELECT round(sum(l.debit_amount - l.credit_amount), 4)::text AS info
               FROM public.journal_entry_lines l
               JOIN public.journal_entries e ON e.id = l.journal_entry_id
              WHERE ${POSTED}`,
  },
  {
    name: "قيود غير متوازنة (كلٌّ على حدة)",
    en: "every entry balances on its own",
    sql: `SELECT count(*)::int AS n FROM (
            SELECT l.journal_entry_id
              FROM public.journal_entry_lines l
              JOIN public.journal_entries e ON e.id = l.journal_entry_id
             WHERE ${POSTED}
             GROUP BY 1
            HAVING round(sum(l.debit_amount - l.credit_amount), 4) <> 0
          ) x`,
    detail: `SELECT string_agg(e.entry_number, ', ') AS info FROM (
               SELECT l.journal_entry_id AS jid
                 FROM public.journal_entry_lines l
                 JOIN public.journal_entries e ON e.id = l.journal_entry_id
                WHERE ${POSTED}
                GROUP BY 1
               HAVING round(sum(l.debit_amount - l.credit_amount), 4) <> 0
               LIMIT 10
             ) b JOIN public.journal_entries e ON e.id = b.jid`,
  },
  {
    name: "سطور بلا قيدٍ أب",
    en: "no journal line without its entry",
    sql: `SELECT count(*)::int AS n FROM public.journal_entry_lines l
           WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = l.journal_entry_id)`,
    detail: `SELECT count(DISTINCT l.journal_entry_id)::text || ' قيداً مفقوداً' AS info
               FROM public.journal_entry_lines l
              WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = l.journal_entry_id)`,
  },
  {
    name: "سطور تشير إلى حسابٍ غير موجود",
    en: "no journal line pointing at a missing account",
    sql: `SELECT count(*)::int AS n FROM public.journal_entry_lines l
           WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a WHERE a.id = l.account_id)`,
    detail: `SELECT count(DISTINCT l.account_id)::text || ' حساباً مفقوداً' AS info
               FROM public.journal_entry_lines l
              WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a WHERE a.id = l.account_id)`,
  },
  {
    name: "مستندات تشير إلى قيدٍ محذوف أو غير موجود",
    en: "no document pointing at a deleted entry",
    sql: `SELECT (
            (SELECT count(*) FROM public.payments p
              WHERE p.journal_entry_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.journal_entries e
                                 WHERE e.id = p.journal_entry_id
                                   AND coalesce(e.is_deleted,false) = false))
          + (SELECT count(*) FROM public.inventory_transactions t
              WHERE t.journal_entry_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.journal_entries e
                                 WHERE e.id = t.journal_entry_id
                                   AND coalesce(e.is_deleted,false) = false))
          )::int AS n`,
    detail: `SELECT 'راجع payments و inventory_transactions' AS info`,
  },
  {
    name: "المخزون: دفتر الأستاذ مقابل FIFO",
    en: "inventory in the ledger matches FIFO",
    // فرقٌ أقل من قرش مقبول: الأستاذ يُخزَّن برقمين عشريين وFIFO يُحسب بدقةٍ أعلى.
    sql: `SELECT (CASE WHEN abs(coalesce(gl.v,0) - coalesce(f.v,0)) < 0.01 THEN 0 ELSE 1 END)::int AS n
            FROM (SELECT sum(l.debit_amount - l.credit_amount) AS v
                    FROM public.journal_entry_lines l
                    JOIN public.journal_entries e ON e.id = l.journal_entry_id
                    JOIN public.chart_of_accounts a ON a.id = l.account_id
                   WHERE ${POSTED} AND a.account_type = 'asset' AND a.sub_type = 'inventory') gl,
                 (SELECT sum(remaining_quantity * unit_cost) AS v
                    FROM public.fifo_cost_lots WHERE remaining_quantity > 0) f`,
    detail: `SELECT 'الأستاذ ' || to_char(coalesce(gl.v,0),'FM999999990.0000')
                 || ' · FIFO ' || to_char(coalesce(f.v,0),'FM999999990.0000') AS info
               FROM (SELECT sum(l.debit_amount - l.credit_amount) AS v
                       FROM public.journal_entry_lines l
                       JOIN public.journal_entries e ON e.id = l.journal_entry_id
                       JOIN public.chart_of_accounts a ON a.id = l.account_id
                      WHERE ${POSTED} AND a.account_type = 'asset' AND a.sub_type = 'inventory') gl,
                    (SELECT sum(remaining_quantity * unit_cost) AS v
                       FROM public.fifo_cost_lots WHERE remaining_quantity > 0) f`,
  },
]

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const failures = []
  const passed = []

  try {
    for (const c of CHECKS) {
      const { rows } = await client.query(c.sql)
      const n = Number(rows[0].n || 0)
      if (n > 0) {
        let info = ""
        try { const d = await client.query(c.detail); info = d.rows[0]?.info ?? "" } catch { /* تفصيلٌ اختيارى */ }
        failures.push({ name: c.name, en: c.en, n, info })
      } else {
        let info = ""
        if (verbose) { try { const d = await client.query(c.detail); info = d.rows[0]?.info ?? "" } catch {} }
        passed.push({ name: c.name, info })
      }
    }

    // مستندات مُرحَّلة بلا قيد — كل ما هو خارج قائمة الاستثناءات الموثَّقة
    for (const ex of NO_ENTRY_IS_LEGITIMATE) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM public.${ex.table}
          WHERE journal_entry_id IS NULL AND NOT (${ex.where})`
      )
      const n = Number(rows[0].n || 0)
      if (n > 0) {
        failures.push({
          name: `${ex.table}: صفوف بلا قيد خارج الاستثناء الموثَّق`,
          en: `${ex.table} has rows with no journal entry outside the documented exception`,
          n,
          info: `الاستثناء المسموح: ${ex.where.replace(/\s+/g, " ")} — سببه: ${ex.why}`,
        })
      } else {
        passed.push({ name: `${ex.table} ضمن استثنائه الموثَّق`, info: verbose ? ex.why : "" })
      }
    }
  } finally {
    await client.end()
  }

  if (verbose) for (const p of passed) console.log(`  + ${p.name}${p.info ? ` — ${p.info}` : ""}`)

  if (failures.length > 0) {
    console.error(`X ${failures.length} ledger-integrity check(s) failed:\n`)
    for (const f of failures) {
      console.error(`  - ${f.name} (${f.en})\n      عدد: ${f.n}${f.info ? `\n      ${f.info}` : ""}`)
    }
    console.error(
      `\n  Note for whoever re-computes any of these by hand: every query MUST exclude\n` +
        `  soft-deleted entries (coalesce(is_deleted,false) = false) as well as filtering\n` +
        `  status='posted'. Forgetting the first produced a phantom 22.69 inventory gap\n` +
        `  twice in one session. That is exactly why this file exists.`
    )
    process.exit(1)
  }

  console.log(`+ ledger integrity holds (${passed.length} checks: balance, per-entry balance, orphan lines, missing accounts, deleted-entry links, inventory vs FIFO, documented no-entry exceptions).`)
})().catch((e) => {
  console.error(`X check-ledger-integrity failed: ${e.message}`)
  process.exit(1)
})
