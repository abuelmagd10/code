#!/usr/bin/env node
/**
 * check-purchase-cost-masked-path.js
 * ---------------------------------------------------------------------------
 * v3.74.933 — المسارُ المقنَّع لأسعار الشراء: يُقاس أثرُه، لا نصُّه.
 *
 * قرّر المالك أن يُحجب **سعرُ بند الشراء وإجمالُ المستند معاً** عن غير
 * جمهور التكلفة. وسببُه حسابى: فاتورةٌ ببندٍ واحدٍ إجمالُها ١٠٠٠ لعشر
 * وحدات تقول سعرَ الشراء بالقسمة. فحجبُ السطر وحده حجبٌ يبدو تاماً وهو
 * مكشوف.
 *
 * والمنفذُ نافذةٌ لكل جدول (`..._masked`): نفسُ الأعمدة بنفس الأسماء
 * والترتيب، والمبالغُ فيها من دالةٍ مخوَّلة لا من الجدول. وهذا الحارس
 * يقيس أن النافذة ما زالت تفعل ما وُعدت به — **على القاعدة الحيّة**.
 *
 * ═══ وأربعةُ أشكالٍ تُبطل الحجب بلا أن يتغيّر حرفٌ فى الشاشات ═══
 *
 *  ١) **`security_invoker` يسقط** فتُقرأ النافذةُ بحقوق مالكها، فتلتفّ على
 *     كل عزل الفروع المبنىِّ من 917 إلى 932 فى ضربةٍ واحدة. النافذةُ حينها
 *     تعمل، والشاشاتُ تعمل، والفروعُ تتسرّب فى صمت.
 *  ٢) **النافذةُ تقرأ عمودَ المال من الجدول مباشرةً** (`b.unit_price` بدل
 *     `m.unit_price`) — فتُظهر الرقمَ للجميع، وتنكسر هى نفسُها يوم يُسحب
 *     العمود. ولا يُقاس هذا بقراءة النصّ: يُقاس بـ`pg_depend`، أى **بما
 *     تعتمد عليه النافذةُ فعلاً**.
 *  ٣) **الصلاحيةُ تعود إلى `anon` أو `PUBLIC`** — وكلُّ `CREATE VIEW` على
 *     هذه القاعدة يمنح `authenticated` كلَّ الصلاحيات بالافتراض (درس عائلة
 *     919/929، وقد وقع فعلاً عند كتابة 933).
 *  ٤) **الحكمُ ينفصل عن السياسة**: دالةُ المال تسأل «هل يرى هذا المستند؟»
 *     بـ`can_access_bill`، وسياسةُ الصف تسأل نفسَ السؤال. فإن عادت
 *     السياسةُ تكتب الشرطَ بيدها صار للحكم نسختان، وأولُ تعديلٍ على
 *     إحداهما يفتح ثغرةً صامتة فى الأخرى.
 *
 * ═══ وقياسٌ خامسٌ لا يُخادَع: الانتحال ═══
 *
 * ينتحل الحارسُ هوية كل عضوٍ فى كل شركة على القاعدة الحيّة، ثم يقيس:
 *   - **عددُ صفوف النافذة = عددُ صفوف الجدول** لكل عضو. فالقناعُ يحجب
 *     مبلغاً، ولا يحجب مستنداً ولا يُظهر مستنداً (وإلا لكان قد كسر العزل
 *     أو أخفى عمل الناس).
 *   - **ومن ليس من جمهور التكلفة لا يقرأ مبلغاً** إلا على مستندٍ كتبه هو
 *     (استثناءُ المنشئ الذى قرّره المالك).
 * وكلُّ ذلك داخل معاملةٍ تُلغى — لا يكتب حرفاً.
 *
 * Usage: node scripts/check-purchase-cost-masked-path.js [--require-db] [--list]
 * Env:   PURCHASE_MASK_DB_URL — قاعدةٌ بديلة (يستعملها الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

/**
 * الجداولُ الستة، وأعمدةُ المال فى كلٍّ منها، ودالةُ المسار المخوَّل.
 * ولم تُدرج النسبُ ولا أسعارُ الصرف ولا الكميات: نسبةٌ لا تقول مبلغاً.
 */
const TABLES = [
  { base: "bills", fn: "bill_money", money: [
      "subtotal", "tax_amount", "total_amount", "discount_value", "shipping", "adjustment",
      "paid_amount", "returned_amount", "base_currency_total", "original_total",
      "display_total", "display_subtotal", "original_subtotal", "original_tax_amount",
      "pre_receipt_refund_amount"], probe: "v.total_amount",
      from: "public.bills_masked v", company: "v.company_id",
      creator: "COALESCE(v.created_by_user_id, v.created_by)" },
  { base: "purchase_orders", fn: "purchase_order_money", money: [
      "subtotal", "tax_amount", "total_amount", "received_amount", "discount_value",
      "shipping", "total", "adjustment", "returned_amount"], probe: "v.total_amount",
      from: "public.purchase_orders_masked v", company: "v.company_id",
      creator: "v.created_by_user_id" },
  { base: "purchase_returns", fn: "purchase_return_money", money: [
      "subtotal", "tax_amount", "total_amount", "settlement_amount", "original_subtotal",
      "original_tax_amount", "original_total_amount"], probe: "v.total_amount",
      from: "public.purchase_returns_masked v", company: "v.company_id",
      creator: "v.created_by" },
  { base: "bill_items", fn: "bill_item_money", money: ["unit_price", "line_total"], probe: "v.unit_price",
      from: "public.bill_items_masked v JOIN public.bills h ON h.id = v.bill_id", company: "h.company_id",
      creator: "COALESCE(h.created_by_user_id, h.created_by)" },
  { base: "purchase_order_items", fn: "purchase_order_item_money", money: ["unit_price", "line_total"], probe: "v.unit_price",
      from: "public.purchase_order_items_masked v JOIN public.purchase_orders h ON h.id = v.purchase_order_id",
      company: "h.company_id", creator: "h.created_by_user_id" },
  { base: "purchase_return_items", fn: "purchase_return_item_money", money: ["unit_price", "line_total"], probe: "v.unit_price",
      from: "public.purchase_return_items_masked v JOIN public.purchase_returns h ON h.id = v.purchase_return_id",
      company: "h.company_id", creator: "h.created_by" },
]

/**
 * ⚠️ **ولماذا يُقيَّد العدُّ بشركة العضو؟** لأن أولَ كتابةٍ لهذا الحارس لم
 * تفعل، فاتّهم بريئاً: رجلٌ واحدٌ **موظفٌ فى شركةٍ ومسئولُ مشترياتٍ فى
 * أخرى**. فسُئل «أهو من جمهور التكلفة؟» عن شركةِ صفِّ العضوية (لا)، ثم
 * عُدَّت مبالغُه **فى كل الشركات** — فظهرت مبالغُ شركتِه الأخرى التى يحقُّ
 * له فيها، وقيل «الحجب مكسور» وهو سليم.
 *
 * **والقاعدة: السؤالُ والقياسُ يجب أن يقعا على نفس النطاق.** حكمٌ يُسأل
 * عن شركةٍ وعدٌّ يجرى على كلِّ الشركات إنذارٌ كاذبٌ بالبناء، وأخطرُ ما
 * فيه أنه يُعلِّم قارئَه ألّا يصدّق الحارس.
 */
const scopedMoneyCount = (t) =>
  `SELECT count(*) AS n FROM ${t.from} WHERE ${t.company} = $1 AND ${t.probe} IS NOT NULL`
const scopedNotMineCount = (t) =>
  `SELECT count(*) AS n FROM ${t.from} WHERE ${t.company} = $1 AND ${t.probe} IS NOT NULL
     AND ${t.creator} IS DISTINCT FROM auth.uid()`

/**
 * التضميناتُ الباقيةُ فوق النوافذ (مثبَّتةٌ بالاسم فى
 * `check-purchase-money-direct-read.js`) — **وهنا تُقاس سلامتُها**.
 *
 * ⚠️ v3.74.940: `goods_receipts (…)` فوق `bills_masked` أفرغ قائمةَ فواتير
 * الشراء، لأن بين الجدولين **علاقتين لا واحدة**: `bills.goods_receipt_id`
 * و`goods_receipts.bill_id`. فرفض PostgREST بـ`PGRST201` وردّ المسارُ 500.
 * والنصُّ لم يتغيّر: **مفتاحٌ فى جدولٍ آخر يكفى لكسر شاشة**.
 *
 * فيُعاد قياسُ كل زوجٍ باقٍ فى كل دفعة: أكثرُ من علاقةٍ بين الطرفين
 * (فى أى اتجاه) ⇒ يُرفض قبل أن يُفرغ شاشةً عند المستخدم.
 */
const PINNED_VIEW_EMBEDS = [
  { view: "bill_items_masked", base: "bill_items", target: "products" },
  { view: "bills_masked", base: "bills", target: "shipping_providers" },
  { view: "purchase_orders_masked", base: "purchase_orders", target: "suppliers" },
  { view: "purchase_orders_masked", base: "purchase_orders", target: "branches" },
  { view: "purchase_order_items_masked", base: "purchase_order_items", target: "products" },
]

/** السياساتُ التى يجب أن تُنادى الحكمَ الواحد لا أن تكتبه. */
const ONE_RULE = [
  { table: "bills", policy: "bills_select_branch_isolation", rule: "can_access_bill" },
  { table: "purchase_orders", policy: "purchase_orders_select_branch_isolation", rule: "can_access_purchase_order" },
]

const url = process.env.PURCHASE_MASK_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure the masked path."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const problems = []
const notes = []

/**
 * ⚠️ v3.74.937 — اتصالٌ ينقطع ليس نتيجةَ قياس.
 *
 * سقطت هذه الدفعةُ ثلاث مراتٍ فى يومٍ واحد على انقطاعٍ عابر (`ECONNRESET`
 * مرةً، و«Connection terminated unexpectedly» مرتين). وفى إحداها **لم
 * يُبلِّغ الحارسُ بل مات**: حدثُ `error` على عميل `pg` بلا مستمعٍ يُسقط
 * العملية بأثرٍ برمجىٍّ خام، فيبدو الأمرُ عطباً فى الحجب وهو عطبٌ فى
 * الشبكة.
 *
 * **وحارسٌ يسقط عشوائياً يُلتفّ عليه بعد أسبوع** — يُعاد التشغيل حتى يمرّ،
 * فيصير المرورُ عادةً لا برهاناً. فالانقطاعُ العابر يُعاد فيه المحاولةُ
 * مرةً واحدة، **وما عداه يُرفع كما هو**: لا تُبتلع نتيجةُ قياسٍ حقيقية.
 */
const TRANSIENT = /ECONNRESET|Connection terminated|ETIMEDOUT|EPIPE|socket hang up/i

async function withDatabase(work) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    // ⚠️ المحاولةُ الثانية تبدأ من صفحةٍ بيضاء: لو بقيت ملاحظاتُ المحاولة
    // المقطوعة لأُبلغ عن نصفِ قياسٍ مرتين، **فصار الحارسُ يخترع أعطاباً**.
    problems.length = 0
    notes.length = 0
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
    // بلا هذا المستمع يقتل انقطاعُ المقبس العمليةَ بدل أن يُبلِّغ.
    client.on("error", (e) => { if (!TRANSIENT.test(String(e && e.message))) console.error(`! pg: ${e.message}`) })
    try {
      await client.connect()
      return await work(client)
    } catch (e) {
      const msg = String((e && e.message) || e)
      if (attempt === 1 && TRANSIENT.test(msg)) {
        console.log(`! the database connection dropped (${msg}) - measuring again, once.`)
        try { await client.end() } catch { /* already gone */ }
        continue
      }
      throw e
    } finally {
      try { await client.end() } catch { /* already gone */ }
    }
  }
}

;(async () => {
  await withDatabase(async (client) => {
    for (const t of TABLES) {
      const view = `${t.base}_masked`

      // ── (١) النافذةُ موجودة، وبحقوق قارئها ─────────────────────────────
      const { rows: cls } = await client.query(
        `SELECT c.relkind, c.reloptions
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = $1`, [view])
      if (cls.length === 0) {
        problems.push(`${view} does not exist - the authorised path is gone, and every screen on it reads nothing`)
        continue
      }
      const opts = cls[0].reloptions || []
      if (!opts.some((o) => /^security_invoker\s*=\s*(true|on)$/i.test(o))) {
        problems.push(
          `${view} is NOT security_invoker - it would read with its owner's rights and step over ` +
          `every branch-isolation policy built since 917`)
      }

      // ── (٢) ولا تقرأ عمودَ مالٍ من الجدول (يُقاس بالاعتماد لا بالنصّ) ──
      const { rows: deps } = await client.query(
        `SELECT DISTINCT a.attname
           FROM pg_depend d
           JOIN pg_rewrite r  ON r.oid = d.objid
           JOIN pg_class   v  ON v.oid = r.ev_class
           JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
           JOIN pg_class   bc ON bc.oid = d.refobjid
           JOIN pg_namespace bn ON bn.oid = bc.relnamespace
          WHERE v.relname = $1 AND bn.nspname = 'public' AND bc.relname = $2
            AND d.refobjsubid > 0 AND d.classid = 'pg_rewrite'::regclass`, [view, t.base])
      const readsDirectly = deps.map((d) => d.attname).filter((c) => t.money.includes(c))
      if (readsDirectly.length > 0) {
        problems.push(
          `${view} reads ${readsDirectly.join(", ")} straight from ${t.base} - the money is shown to ` +
          `everyone, and the view itself breaks the day the column is revoked`)
      }

      // ── (٣) وأعمدةُ النافذة هى أعمدةُ الجدول: لا زيادةَ ولا نقص ───────
      const { rows: vcols } = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [view])
      const { rows: bcols } = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t.base])
      const v = vcols.map((r) => r.column_name).join(",")
      const b = bcols.map((r) => r.column_name).join(",")
      if (v !== b) {
        const missing = bcols.map((r) => r.column_name).filter((c) => !vcols.some((x) => x.column_name === c))
        const extra = vcols.map((r) => r.column_name).filter((c) => !bcols.some((x) => x.column_name === c))
        problems.push(
          `${view} drifted from ${t.base}` +
          (missing.length ? ` - missing: ${missing.join(", ")}` : "") +
          (extra.length ? ` - unknown: ${extra.join(", ")}` : "") +
          (!missing.length && !extra.length ? " - same columns in a different order" : ""))
      }

      // ── (٣ب) وشاهدُ الحجب لا يقبل الفراغ فى الجدول ────────────────────
      //
      // v3.74.938 — تقرأ الواجهةُ `null` فى عمودٍ مقنَّعٍ فتقول «محجوب».
      // وهذا صحيحٌ **بشرط** ألا يكون العمودُ يقبل الفراغ أصلاً — وإلا التبس
      // «محجوبٌ عنك» بـ«لا قيمةَ هنا»، فظهرت «—» لمن يملك الرؤية (حجبٌ
      // كاذبٌ يراه الجميع) أو ظهر رقمٌ لمن حُجب عنه.
      //
      // فالشاهدُ المستعمَل فى الواجهة (`total_amount` فى الرؤوس، `unit_price`
      // فى البنود) يجب أن يكون `NOT NULL` هنا. ولو أُسقط القيدُ يوماً
      // **صاح الحارسُ بدل أن يصمت الحجب**.
      const witness = t.probe.replace(/^v\./, "")
      const { rows: wit } = await client.query(
        `SELECT a.attnotnull
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='public' AND c.relname=$1 AND a.attname=$2 AND a.attnum > 0`,
        [t.base, witness])
      if (wit.length === 0) {
        problems.push(`${t.base}.${witness} is gone - the UI has no witness left to tell "hidden" from "no value"`)
      } else if (!wit[0].attnotnull) {
        problems.push(
          `${t.base}.${witness} is nullable - the screens read a null there as "hidden from you", ` +
          `so a genuinely empty value would show a dash to someone allowed to see it`)
      } else if (verbose) {
        notes.push(`  ${t.base}.${witness} is NOT NULL - a null in ${view} can only mean hidden`)
      }

      // ── (٤) والصلاحية: قراءةٌ لـ authenticated وحدها، ولا شىءَ لـ anon ─
      const { rows: grants } = await client.query(
        `SELECT grantee, privilege_type FROM information_schema.role_table_grants
          WHERE table_schema='public' AND table_name=$1`, [view])
      for (const g of grants) {
        if (g.grantee === "anon" || g.grantee === "PUBLIC") {
          problems.push(`${view} is granted ${g.privilege_type} to ${g.grantee} - an anonymous caller reaches purchase money`)
        }
        if (g.grantee === "authenticated" && g.privilege_type !== "SELECT") {
          problems.push(
            `${view} grants ${g.privilege_type} to authenticated - a view is for reading; ` +
            `the default privileges of this database hand out ALL unless they are revoked first`)
        }
      }
      if (!grants.some((g) => g.grantee === "authenticated" && g.privilege_type === "SELECT")) {
        problems.push(`${view} is not readable by authenticated - every screen on the authorised path goes blank`)
      }

      // ── (٥) ودالةُ المال: مخوَّلة، ومقصورة ────────────────────────────
      const { rows: fns } = await client.query(
        `SELECT p.prosecdef, p.provolatile, COALESCE(array_to_string(p.proacl, ' | '), '') acl
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.proname=$1`, [t.fn])
      if (fns.length === 0) {
        problems.push(`${t.fn}() is missing - ${view} has nothing to read the money from`)
      } else {
        const f = fns[0]
        if (!f.prosecdef) problems.push(`${t.fn}() is no longer SECURITY DEFINER - it cannot read what the caller may not`)
        if (f.acl === "") {
          problems.push(`${t.fn}() carries the default grant - EXECUTE is open to PUBLIC, and PUBLIC includes anon (919/929)`)
        } else {
          if (/(^|\s)=X\//.test(f.acl)) problems.push(`${t.fn}() is executable by PUBLIC - and PUBLIC includes anon`)
          if (/\banon=X\//.test(f.acl)) problems.push(`${t.fn}() is executable by anon`)
          if (!/\bauthenticated=X\//.test(f.acl)) problems.push(`${t.fn}() is not executable by authenticated - the masked view returns nothing but NULL to everyone`)
        }
      }
    }

    // ── (٦) والحكمُ واحدٌ يُنادى، لا نصٌّ يُكرَّر ───────────────────────
    for (const r of ONE_RULE) {
      const { rows } = await client.query(
        `SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname=$2`,
        [r.table, r.policy])
      if (rows.length === 0) {
        problems.push(`${r.table}: the policy ${r.policy} is gone`)
        continue
      }
      const qual = rows[0].qual || ""

      // v3.74.973 — الخاصّيّةُ لا الاسم.
      //
      // كان الشرطُ: «نصُّ السياسة يحوى اسمَ الدالّة». فصرخ على البرىء يومَ
      // ٩٧٠: صارت can_access_bill غلافاً لا يُقرّر بنفسه بل يفوّض إلى
      // can_access_bill_row، وصارت السياسةُ تنادى تلك الدالّةَ نفسَها.
      // فالبيتُ واحدٌ حقّاً، والحارسُ يصرخ على اسمٍ قديم.
      //
      // والمقصودُ من أوّل يوم: **أينتهى الطريقان إلى قرارٍ واحد؟** فيُقرأ
      // جسدُ الدالّة من الكتالوج: إن كانت لا تفوّض إلا إلى **دالّةِ حكمٍ
      // واحدةٍ لا غير**، فنداءُ السياسةِ لتلك الدالّة هو البيتُ الواحدُ
      // بعينه. أمّا إن فوّضت إلى أكثرَ من واحدة فلا تكافؤَ يُدَّعى، ويُرفض.
      //
      // وهذا **أشدُّ** من الأوّل لا أضعف: سياسةٌ تكتب حكمَها بنفسها تُرفض
      // كما كانت تُرفض، وقد رُفض بها أمرُ الشراء اليومَ حتى صار له بيتٌ واحد.
      const { rows: defRows } = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`, [r.rule])
      const body = defRows.map((d) => d.def || "").join("\n")
      const delegates = [...new Set(
        (body.match(/public\.([a-z_][a-z0-9_]*)\s*\(/gi) || [])
          .map((s) => s.replace(/^public\./i, "").replace(/\s*\($/, ""))
      )].filter((f) => f !== r.rule && /^(can_|is_)/.test(f))
      const oneDelegate = delegates.length === 1 ? delegates[0] : null
      const callsRule = qual.includes(`${r.rule}(`)
      const callsDelegate = oneDelegate !== null && qual.includes(`${oneDelegate}(`)
      if (!callsRule && !callsDelegate) {
        problems.push(
          `${r.table}: ${r.policy} decides for itself instead of calling ${r.rule}()` +
          (oneDelegate ? ` or its single delegate ${oneDelegate}()` : "") +
          ` - the visibility rule now has two copies (the policy and the money function), ` +
          `and changing one silently leaves the other open`)
      }
    }

    // ── (٧) والانتحال: القناعُ يحجب مبلغاً، لا مستنداً ─────────────────
    const { rows: members } = await client.query(
      `SELECT cm.user_id, cm.company_id, lower(btrim(cm.role)) role
         FROM company_members cm ORDER BY 3`)
    let sawMoney = 0
    let sawNone = 0
    await client.query("BEGIN")
    try {
      for (const m of members) {
        await client.query(
          `SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
          [m.user_id])

        // هل هو من جمهور التكلفة أصلاً؟ (نفسُ الحكم، لا نسخةٌ منه)
        const { rows: aud } = await client.query(
          `SELECT public.can_view_purchase_cost($1, NULL, NULL, false) AS ok`, [m.company_id])
        const inAudience = aud[0].ok === true

        for (const t of TABLES) {
          const view = `${t.base}_masked`

          // (أ) القناعُ لا يغيّر ما يُرى — ويُقاس على كل ما يراه الرجل.
          await client.query("SET LOCAL ROLE authenticated")
          const { rows: cnt } = await client.query(
            `SELECT (SELECT count(*) FROM public.${t.base}) AS base_rows,
                    (SELECT count(*) FROM public.${view})   AS view_rows`)
          // (ب) أما المبلغُ فيُقاس **فى شركة هذا الصفِّ وحدها**، لأن الحكم
          //     سُئل عنها وحدها. رجلٌ واحدٌ قد يكون موظفاً هنا ومسئولاً هناك.
          const { rows: mon } = await client.query(scopedMoneyCount(t), [m.company_id])
          await client.query("RESET ROLE")
          const c = cnt[0]
          const withMoney = Number(mon[0].n)
          if (c.base_rows !== c.view_rows) {
            problems.push(
              `${m.role}: ${view} shows ${c.view_rows} row(s) while ${t.base} shows ${c.base_rows} - ` +
              `the mask is changing WHICH documents are visible, not just their money`)
          }
          if (withMoney > 0) sawMoney++
          else sawNone++
          if (!inAudience && withMoney > 0) {
            // يبقى استثناءُ المنشئ: كلُّ صفٍّ يحمل مبلغاً يجب أن يكون من كتابته.
            await client.query("SET LOCAL ROLE authenticated")
            const { rows: own } = await client.query(scopedNotMineCount(t), [m.company_id])
            await client.query("RESET ROLE")
            if (Number(own[0].n) > 0) {
              problems.push(
                `${m.role} in company ${m.company_id} is not in the cost audience yet reads money on ` +
                `${own[0].n} ${view} row(s) of that company he did not write - the hide is off for him`)
            }
          }
          if (verbose) {
            notes.push(`  ${m.role.padEnd(22)} ${view.padEnd(30)} rows=${c.view_rows} withMoney=${withMoney}`)
          }
        }
      }
    } finally {
      await client.query("ROLLBACK")
    }

    // ── التضميناتُ المثبَّتة: أيبقى كلُّ زوجٍ مفردَ العلاقة؟ ───────────────
    for (const e of PINNED_VIEW_EMBEDS) {
      const { rows: rel } = await client.query(
        `SELECT count(*) AS n FROM pg_constraint con
           JOIN pg_class a ON a.oid = con.conrelid
           JOIN pg_class b ON b.oid = con.confrelid
          WHERE con.contype='f'
            AND ((a.relname=$1 AND b.relname=$2) OR (a.relname=$2 AND b.relname=$1))`,
        [e.base, e.target])
      const n = Number(rel[0].n)
      if (n !== 1) {
        problems.push(
          `${e.view} embeds ${e.target}(...) but there are now ${n} foreign key(s) between ` +
          `${e.base} and ${e.target} - PostgREST cannot choose (PGRST201), the request returns 500, ` +
          `and the screen goes EMPTY without a line of code changing. Stitch it instead of embedding.`)
      } else if (verbose) {
        notes.push(`  ${e.view} -> ${e.target}: still a single relationship`)
      }
    }

    // قياسٌ لا يقيس شيئاً يُخفى فشلاً: لا بد أن يكون قد رأى الحالتين.
    if (members.length > 0 && sawMoney === 0) {
      problems.push(
        "not one member reads a single purchase amount - either the whole path is dead, " +
        "or the measurement never ran")
    }
    if (members.length > 0 && sawNone === 0) {
      notes.push("! every member in every company is in the cost audience - the hide was not exercised here")
    }
  })

  if (problems.length > 0) {
    console.error(`X the purchase-cost masked path is not what the code assumes (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  See supabase/migrations/20260731000022_v3_74_933_purchase_cost_authorised_path.sql")
    process.exit(1)
  }

  if (verbose) for (const n of notes) console.log(n)
  console.log(
    `+ the purchase-cost masked path holds: ${TABLES.length} views, security_invoker, no money column read ` +
    `from the table, nothing to anon, one rule per head - measured by impersonating ` +
    `every member on the live database.`)
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
