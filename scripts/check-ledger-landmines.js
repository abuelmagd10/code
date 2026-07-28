#!/usr/bin/env node
/**
 * check-ledger-landmines.js
 * ---------------------------------------------------------------------------
 * v3.74.869 — **كودٌ يكتب فى الدفاتر ولا يصله أحد: لغمٌ لا راحة.**
 *
 * وحدةٌ غير موصولة من أى صفحةٍ أو مسار لا تُسبّب عطباً اليوم — ولهذا تمرّ
 * من كل الحرّاس. لكنها **لا تُختبر ولا تُراجع ولا تُصلَح مع بقية النظام**،
 * ثم يصلها أحدهم بعد شهورٍ فتنفجر بما تراكم فيها.
 *
 * والمثال قائمٌ فى هذا المشروع: `processReturnAccounting` فى
 * `lib/sales-returns.ts` تُنشئ قيداً بلا `branch_id` — **وهو عمود NOT NULL**.
 * أى أن الدالة تفشل حتماً لحظة استدعائها. ولأنها غير مستدعاة، لم يلاحظها
 * أحدٌ ولم تكسر بناءً قط.
 *
 * ولمَ حارسٌ مستقل بدل «احذف الكود الميت»؟ لأن الحذف قرارُ مالكٍ لا قرارُ
 * أداة: قد تكون الوحدة عملاً مؤجَّلاً مقصوداً. فالحارس **لا يحذف ولا يمنع
 * الوجود** — يمنع **الزيادة**، ويُبقى الثلاثة القائمة مرئيةً حتى تُحسم.
 *
 * ⚠️ حدود القياس، مصرَّحٌ بها:
 *   • القياس **على مستوى الوحدة لا الدالة**. فملفٌّ يُستورد يُعدّ موصولاً
 *     ولو كان التصدير المكسور فيه غير مستدعىً — وهذا حال `sales-returns.ts`.
 *   • ⇒ النتيجة **متحفِّظة**: قد تُفوّت لغماً داخل وحدةٍ موصولة، ولا تُنذر
 *     كذباً عن وحدةٍ حيّة. وهو الاتجاه الصحيح للخطأ فى قياسٍ مالى.
 *
 * Usage: node scripts/check-ledger-landmines.js [--list]
 * Env:   LEDGER_LANDMINE_BASELINE — للاختبار الذاتى فقط.
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")
const { analyse } = require("./lib-reachability")

const root = path.resolve(__dirname, "..")
const verbose = process.argv.includes("--list")

/**
 * خط الأساس — يُشدّ ولا يُرخى.
 *
 * كان ٣ عند إنشاء الحارس فى ٨٦٩، وصار **١** فى ٨٧٠ بعد قرار المالك. وكلٌّ
 * مُسجَّلٌ باسمه لا برقمٍ مجرَّد (درس ٨٦٣: عددٌ ثابتٌ بلا تفصيل يُدرّب قارئه
 * على تجاهله).
 *
 * ── حُذفت (v3.74.870) ────────────────────────────────────────────────────
 *   lib/services/sales-invoice-edit-command.service.ts
 *       **نسخةٌ مكرّرة** من `sales-invoice-update-command.service.ts` الحيّة
 *       التى يستعملها `/api/invoices/[id]/update` من شاشة تعديل الفاتورة.
 *       وخطرها لم يكن فى وجودها بل فى **تشابهها**: خدمتان لنفس المهمة،
 *       فيوصّل أحدهم الخطأ منهما ظنّاً أنها الصحيحة.
 *   lib/api-security-governance.ts
 *       مكتوبةٌ بأسلوب Express ‏`(req, res)` — لا تعمل فى Next.js App Router
 *       أصلاً. أثرٌ من بناءٍ سابق.
 *
 * ── باقٍ عمداً (١) ──────────────────────────────────────────────────────
 *   lib/supplier-balance.ts
 *       journal_entries · journal_entry_lines · vendor_credits · bills
 *
 *       **وليست كوداً زائداً بل ميزةً ناقصة** — وهذا هو الفرق الذى أوقف
 *       حذفها. فنظيرتها `customer-balance.ts` **حيّة**: تُستدعى من
 *       `app/invoices/[id]/page.tsx` فتُنشئ رصيداً دائناً للعميل حين يدفع
 *       زيادةً عن فاتورته. ولا نظير لذلك عند الموردين:
 *
 *         • لا قيد ولا مُشغِّل يمنع `paid_amount > total_amount` على `bills`
 *           ⇒ زيادة الدفع للمورد **ممكنةٌ فعلاً**.
 *         • ولا مسارٌ حىٌّ يُنشئ إشعار دائنٍ عندها.
 *
 *       ⇒ فحذفها كان سيُخفى نقصاً بدل أن يُظهره. تبقى مرئيةً هنا حتى
 *         يُقرَّر: تُوصَل فتكتمل التماثلية مع جانب العملاء، أم تُحذف
 *         ويُسجَّل النقص صراحةً. (قرار المالك، ٢٦ يوليو ٢٠٢٦.)
 */
const BASELINE = Number(process.env.LEDGER_LANDMINE_BASELINE ?? 1)

/** الجداول التى يعنى الخطأ فيها مالاً أو دفاتر. */
const LEDGER_TABLES = [
  "journal_entries", "journal_entry_lines",
  "inventory_transactions", "fifo_cost_lots", "fifo_lot_consumptions",
  "cogs_transactions",
  "payments", "payment_allocations",
  "customer_credits", "customer_credit_ledger", "vendor_credits",
  "advance_applications",
  "invoices", "bills",
]

/**
 * ملفات لا يُنتظر أن تكون موصولة بطبيعتها — وليست ألغاماً.
 * تُدرج بالاسم مع السبب، لا بنمطٍ عام.
 */
const NOT_A_LANDMINE = new Map([
  ["lib/currency-service.test.ts", "ملف اختبار"],
  ["lib/utils.test.ts", "ملف اختبار"],
  ["app/api/sales-orders/route.example.ts", "مثالٌ توضيحى لا مسار"],
])

const WRITE_RE = /\.(insert|update|upsert|delete)\s*\(/

function writesTo(src, table) {
  return src.includes(`.from("${table}")`) || src.includes(`.from('${table}')`)
}

const { reachable, all, sources } = analyse(root, ["app", "lib"])
const findings = []

for (const file of all) {
  if (reachable.has(file)) continue
  const rel = path.relative(root, file).replace(/\\/g, "/")
  if (NOT_A_LANDMINE.has(rel)) continue

  const src = sources.get(file) ?? fs.readFileSync(file, "utf8")
  if (!WRITE_RE.test(src)) continue

  const tables = LEDGER_TABLES.filter((t) => writesTo(src, t))
  if (tables.length === 0) continue

  findings.push({ file: rel, tables })
}

if (verbose) {
  for (const f of findings) console.log(`  - ${f.file}\n      ${f.tables.join(", ")}`)
}

console.log(
  `Unreachable modules writing to the ledger: ${findings.length}   Baseline: ${BASELINE}   ` +
  `(${all.length} files, ${reachable.size} reachable)`
)

if (findings.length > BASELINE) {
  console.error(`\nX ${findings.length - BASELINE} NEW ledger landmine(s):\n`)
  for (const f of findings) console.error(`    ${f.file}\n      writes: ${f.tables.join(", ")}`)
  console.error(
    "\n  A module no route can reach still gets read as if it worked. It is never\n" +
      "  exercised, never reviewed, never fixed alongside the rest - and then someone\n" +
      "  wires it up months later and it fails on everything that accumulated.\n" +
      "\n  Either connect it, or delete it. Leaving it is the only option that is not\n" +
      "  a decision."
  )
  process.exit(1)
}

if (findings.length < BASELINE) {
  console.log(`\n+ ${BASELINE - findings.length} fewer than the baseline.`)
  console.log(`  Lower BASELINE to ${findings.length} so the ground won cannot be given back.`)
  process.exit(0)
}

console.log(`\n+ No new ledger landmines. ${BASELINE} pre-existing one(s) remain - tracked, not approved.`)
