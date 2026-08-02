#!/usr/bin/env node
/**
 * check-purchase-return-priced-by-the-bill.js
 * ---------------------------------------------------------------------------
 * v3.74.941 — **المرتجعُ يُسعَّر من الفاتورة، لا من المتصفح.**
 *
 * ما كان: `process_purchase_return_atomic` تقفل صفَّ `bill_items` بين يديها
 * (`FOR UPDATE`) ثم تسأله عن **الكمية وحدها**، وتأخذ السعرَ من الطلب:
 *
 *     COALESCE((v_item->>'unit_price')::NUMERIC, 0)
 *     COALESCE((v_item->>'line_total')::NUMERIC, 0)
 *     COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0)
 *
 * فمن يُنشئ مرتجعاً يُسعّره بما شاء، والدفترُ ورصيدُ المورد وائتمانُ المخزون
 * تتبع رقمَ المتصفح. و`COALESCE(...,0)` يجعل سعراً **غائباً** صفراً بصمت.
 *
 * والبرهانُ لم يكن استنتاجاً من قراءة الكود: المرتجعان الوحيدان على الإنتاج
 * **على نفس الفاتورة ونفس بندها ونفس الكمية ونفس الخصم** ولهما قيمتان —
 * `PRET-5689` بـ`0.90` (صيغةُ ما قبل 515) و`PRET-79328` بـ`0.77` (بعدها).
 * الرقمُ لم يكن مشتقاً من شىء.
 *
 * ═══ وهذا الحارسُ يقيس الأثر لا النصّ ═══
 *
 * لا يكفى أن يوجد اسمُ `purchase_return_priced_line` فى جسد الدالة: **يُزرع
 * مرتجعٌ حقيقىٌّ داخل معاملةٍ مُلغاة** ويُنظر ماذا يحدث — ثلاثةُ أسئلةٍ لا
 * سؤالٌ واحد:
 *   ‏(أ) سعرٌ مصنوعٌ يخالف الفاتورة   ⇒ يجب أن يُرفض **وأن يذكر الرقمين**.
 *   ‏(ب) ما ترسله الشاشةُ اليوم        ⇒ يجب أن **يُقبل**. وحارسٌ يرفض الكلَّ
 *       لا يحرس شيئاً؛ ولا بد أن يُرى وهو يُبقى البرىء — وإلا عُطِّل خلال أسبوع.
 *   ‏(ج) لا مالَ مُرسَلٌ إطلاقاً         ⇒ يُقبل، **ويكتب الخادمُ المشتقَّ**.
 *
 * وكلُّ ذلك داخل `BEGIN … ROLLBACK`: لا صفَّ يبقى، ولا رقمَ يتحرك.
 *
 * ═══ والدَّينُ يُعدّ ولا يُخبَّأ ═══
 *
 * كلُّ بندِ مرتجعٍ قائمٍ يُقارَن ببند فاتورته. والانحرافُ المقيسُ اليوم:
 * صفرٌ فى السعر، وواحدٌ فى `line_total` هو `PRET-5689` وحده — مثبَّتٌ بالاسم،
 * لا يُغتفر صامتاً، ولا يُسمح للعدد بالنمو.
 *
 * Usage: node scripts/check-purchase-return-priced-by-the-bill.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

const url =
  process.env.RETURN_PRICING_DB_URL ||
  process.env.PRODUCTION_SUPABASE_DB_URL

if (!url) {
  const msg = "no database URL - cannot measure how a purchase return is priced."
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

/** الدوالُ الثلاثُ التى تكتب مالَ المرتجع، وبيتُ التسعير الذى تناديه. */
const WRITERS = [
  "process_purchase_return_atomic",
  "process_purchase_return_multi_warehouse",
  "resubmit_purchase_return",
]

/** أشكالُ «المالُ يأتى من الطلب» — كلُّ واحدٍ منها كان موجوداً قبل 941. */
const PAYLOAD_MONEY = [
  { needle: "COALESCE((v_item->>'unit_price')",            what: "unit_price من الطلب" },
  { needle: "COALESCE((v_item->>'line_total')",            what: "line_total من الطلب" },
  { needle: "COALESCE((p_purchase_return->>'total_amount')", what: "إجمالى الرأس من الطلب" },
  { needle: "COALESCE((p_purchase_return->>'subtotal')",   what: "صافى الرأس من الطلب" },
  { needle: "COALESCE((v_group->>'total_amount')",         what: "إجمالى مجموعة المخزن من الطلب" },
  { needle: "p_bill_update->>'total_amount'",              what: "إعادةُ كتابة إجمالى الفاتورة من الطلب" },
]

/**
 * ⚠️ درس 937 — اتصالٌ ينقطع ليس نتيجةَ قياس. حدثُ `error` بلا مستمعٍ يقتل
 * العملية بأثرٍ خام فيبدو العطبُ فى التسعير وهو فى الشبكة. وحارسٌ يسقط
 * عشوائياً يُلتفّ عليه بعد أسبوع.
 */
const TRANSIENT = /ECONNRESET|Connection terminated|ETIMEDOUT|EPIPE|socket hang up/i
async function withDatabase(work) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    problems.length = 0
    notes.length = 0
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
    client.on("error", (e) => { if (!TRANSIENT.test(String(e && e.message))) console.error(`! pg: ${e.message}`) })
    try { await client.connect(); return await work(client) }
    catch (e) {
      const msg = String((e && e.message) || e)
      if (attempt === 1 && TRANSIENT.test(msg)) {
        console.log(`! the database connection dropped (${msg}) - measuring again, once.`)
        try { await client.end() } catch {}
        continue
      }
      throw e
    } finally { try { await client.end() } catch {} }
  }
}

/** الانحرافاتُ المعروفةُ والمفسَّرة — تنكمش ولا تنمو. */
const PINNED_LINE_TOTAL_DRIFT = ["PRET-5689"] // صيغةُ ما قبل v3.74.515، موثَّقة

async function main(client) {
  // ── (١) لا موضعَ يأخذ مالاً من الطلب ─────────────────────────────────
  const { rows: defs } = await client.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS src
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`, [WRITERS])

  for (const name of WRITERS) {
    const row = defs.find((d) => d.proname === name)
    if (!row) { problems.push(`${name} does not exist - the purchase-return write path changed shape.`); continue }
    for (const shape of PAYLOAD_MONEY) {
      if (row.src.includes(shape.needle)) {
        problems.push(
          `${name} takes ${shape.what} (\`${shape.needle}\`) - the browser prices the document again. ` +
          `A return line is priced by the bill line it returns.`)
      }
    }
    if (!row.src.includes("purchase_return_priced_line")) {
      problems.push(`${name} does not call purchase_return_priced_line - the pricing rule has a second home.`)
    }
    if (!row.src.includes("assert_purchase_return_amount")) {
      problems.push(`${name} does not refuse a disagreeing number - a wrong screen would be written, not seen.`)
    }
    if (!/SET search_path/i.test(row.src)) {
      problems.push(`${name} is SECURITY DEFINER without SET search_path.`)
    }
  }

  // ── (٢) بيتُ التسعير ليس مفتوحاً لمستخدمٍ نهائى ───────────────────────
  const { rows: grants } = await client.query(
    `SELECT p.proname, ax.grantee_name
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL (
         SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                     ELSE (SELECT rolname FROM pg_roles WHERE oid = a.grantee) END AS grantee_name
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.privilege_type = 'EXECUTE'
       ) ax
      WHERE n.nspname = 'public'
        AND p.proname IN ('purchase_return_priced_line','purchase_return_bill_discount_ratio','assert_purchase_return_amount')
        AND ax.grantee_name IN ('PUBLIC','anon','authenticated')`)
  for (const g of grants) {
    problems.push(`${g.proname} is executable by ${g.grantee_name} - the pricing rule is called from inside, never by a caller.`)
  }

  // ── (٣) والأثر: يُزرع مرتجعٌ حقيقىٌّ ويُنظر ───────────────────────────
  // ⚠️ العيّنةُ التى يُقاس بها «البرىء» **لا تُؤخذ من القاعدة المُختبَرة**.
  // حارسٌ يسأل القاعدةَ ماذا يجب أن يُرسِل ثم يرسله إليها لا يقيس شيئاً: هو
  // يوافق نفسَه مهما انحرفت. فالمرجعُ **مستندٌ حقيقىٌّ أنشأته الشاشة**
  // وأرقامُه محفوظة. وإن لم يوجد مستندٌ كهذا قيل ذلك صراحةً ولم يُدَّعَ قياس.
  let { rows: subject } = await client.query(
    `SELECT b.id AS bill_id, b.company_id, b.supplier_id, c.user_id AS owner_id,
            bi.id AS bill_item_id, bi.product_id, bi.unit_price,
            pri.quantity   AS screen_qty,
            pri.unit_price AS screen_price,
            pri.line_total AS screen_line,
            pr.return_number AS exemplar
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
       JOIN bill_items bi ON bi.id = pri.bill_item_id
       JOIN bills b       ON b.id = bi.bill_id
       JOIN companies c   ON c.id = b.company_id AND c.user_id IS NOT NULL
      WHERE bi.unit_price > 0
        AND pr.return_number <> ALL($1::text[])
      ORDER BY pr.created_at DESC
      LIMIT 1`, [PINNED_LINE_TOTAL_DRIFT])

  if (subject.length === 0) {
    const fallback = await client.query(
      `SELECT b.id AS bill_id, b.company_id, b.supplier_id, c.user_id AS owner_id,
              bi.id AS bill_item_id, bi.product_id, bi.unit_price,
              1::numeric AS screen_qty,
              bi.unit_price AS screen_price,
              pl.line_total AS screen_line,
              NULL::text AS exemplar
         FROM bills b
         JOIN companies c   ON c.id = b.company_id AND c.user_id IS NOT NULL
         JOIN bill_items bi ON bi.bill_id = b.id
         CROSS JOIN LATERAL public.purchase_return_priced_line(b.id, bi.id, 1) pl
        WHERE bi.unit_price > 0
        ORDER BY b.created_at DESC
        LIMIT 1`)
    subject = fallback.rows
    if (subject.length > 0) {
      notes.push(
        "no purchase return created under the current rule exists yet, so the spare-the-innocent stage " +
        "had to take its expected value FROM THE RULE ITSELF - it cannot catch the rule drifting. " +
        "The divergence count below is what covers that today.")
    }
  }

  if (subject.length === 0) {
    notes.push("no bill with a priced line exists on this database - the planting stage had nothing to plant.")
  } else {
    const s = subject[0]
    const qty = Number(s.screen_qty)
    if (s.exemplar) {
      notes.push(`the expected value comes from ${s.exemplar}, a return the screen actually produced - not from the rule under test.`)
    }

    const plant = async (label, item) => {
      await client.query("BEGIN")
      try {
        await client.query(
          `SELECT set_config('request.jwt.claims',
                  json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [s.owner_id])
        const { rows } = await client.query(
          `SELECT public.process_purchase_return_atomic(
                    p_company_id := $1, p_supplier_id := $2, p_bill_id := $3,
                    p_purchase_return := $4::jsonb, p_return_items := $5::jsonb,
                    p_created_by := $6) AS res`,
          [s.company_id, s.supplier_id, s.bill_id,
           JSON.stringify({ return_number: `ZZ-GUARD-${label}`, return_date: new Date().toISOString().slice(0, 10),
                            settlement_method: "debit_note" }),
           JSON.stringify([{ bill_item_id: s.bill_item_id, product_id: s.product_id, quantity: qty, ...item }]),
           s.owner_id])
        const prId = rows[0].res.purchase_return_id
        const { rows: written } = await client.query(
          `SELECT i.unit_price, i.line_total, pr.total_amount
             FROM purchase_returns pr JOIN purchase_return_items i ON i.purchase_return_id = pr.id
            WHERE pr.id = $1`, [prId])
        return { ok: true, written: written[0] }
      } catch (e) {
        return { ok: false, message: String((e && e.message) || e) }
      } finally {
        await client.query("ROLLBACK")
      }
    }

    // (أ) سعرٌ مصنوع
    const forged = await plant("A", { unit_price: 0.01, line_total: 0.01 })
    if (forged.ok) {
      problems.push("a forged unit_price of 0.01 was ACCEPTED - the browser still prices the return.")
    } else if (!/unit_price/.test(forged.message)) {
      problems.push(`a forged price was refused, but the refusal does not name the field: ${forged.message}`)
    } else if (!forged.message.includes("0.01") || !forged.message.includes(String(s.unit_price))) {
      // «رُفض» بلا رقمين لا يُصلح شاشةً ولا يكشف عبثاً.
      problems.push(
        `a forged price was refused without carrying BOTH numbers ` +
        `(sent 0.01, bill ${s.unit_price}): ${forged.message}`)
    } else {
      notes.push("a forged price is refused, and the refusal carries both numbers.")
    }

    // (ب) ما ترسله الشاشةُ اليوم - يجب أن يمرّ، وإلا توقّفت كلُّ المرتجعات
    const honest = await plant("B", { unit_price: Number(s.screen_price), line_total: Number(s.screen_line) })
    if (!honest.ok) {
      problems.push(
        `the value the CURRENT screen sends was REFUSED - the rule and the screen disagree, and every ` +
        `purchase return would stop. Sent price=${s.screen_price} line=${s.screen_line}` +
        (s.exemplar ? ` (as recorded on ${s.exemplar})` : "") + `: ${honest.message}`)
    } else {
      notes.push("what the current screen sends is accepted - the innocent is spared.")
    }

    // (ج) لا مالَ مُرسَلاً إطلاقاً - الخادمُ يشتقُّه وحده، ويجب أن يطابق المستند
    const bare = await plant("C", {})
    if (!bare.ok) {
      problems.push(`a return with no money sent was refused - the server cannot price on its own: ${bare.message}`)
    } else if (!bare.written) {
      problems.push("a return was created with nothing sent, but no line was written.")
    } else if (Number(bare.written.unit_price) !== Number(s.screen_price) ||
               Math.abs(Number(bare.written.line_total) - Number(s.screen_line)) > 0.01) {
      problems.push(
        `with nothing sent the server wrote price=${bare.written.unit_price} line=${bare.written.line_total}, ` +
        `but the document the screen produced says price=${s.screen_price} line=${s.screen_line}` +
        (s.exemplar ? ` (${s.exemplar})` : "") + ".")
    } else {
      notes.push(
        `with no money sent at all the server derives it: price=${bare.written.unit_price} ` +
        `line=${bare.written.line_total} total=${bare.written.total_amount}.`)
    }
  }

  // ── (٤) والدَّينُ القائمُ يُعدّ ─────────────────────────────────────────
  const { rows: drift } = await client.query(
    `SELECT pr.return_number,
            pri.unit_price AS stored_price, pl.unit_price AS bill_price,
            pri.line_total AS stored_line,  pl.line_total  AS bill_line
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
       CROSS JOIN LATERAL public.purchase_return_priced_line(pr.bill_id, pri.bill_item_id, pri.quantity) pl
      WHERE round(pri.unit_price, 4) <> round(pl.unit_price, 4)
         OR abs(pri.line_total - pl.line_total) > 0.01`)

  const priceDrift = drift.filter((d) => Number(d.stored_price) !== Number(d.bill_price))
  const lineDrift  = drift.filter((d) => Number(d.stored_price) === Number(d.bill_price))

  for (const d of priceDrift) {
    problems.push(
      `${d.return_number} is priced ${d.stored_price} while its bill line is ${d.bill_price} - ` +
      `a return valued at a price the bill never had.`)
  }
  for (const d of lineDrift) {
    if (!PINNED_LINE_TOTAL_DRIFT.includes(d.return_number)) {
      problems.push(
        `${d.return_number} has line_total ${d.stored_line} while the bill derives ${d.bill_line} - ` +
        `a NEW divergence, not one of the ${PINNED_LINE_TOTAL_DRIFT.length} explained legacy row(s).`)
    }
  }
  if (verbose) {
    for (const d of drift) {
      console.log(`  ${d.return_number}: stored ${d.stored_price}/${d.stored_line} vs bill ${d.bill_price}/${d.bill_line}`)
    }
  }
  notes.push(
    `${priceDrift.length} price divergence(s) and ${lineDrift.length} line_total divergence(s) exist ` +
    `(${PINNED_LINE_TOTAL_DRIFT.length} pinned and explained: ${PINNED_LINE_TOTAL_DRIFT.join(", ")}).`)
}

withDatabase(main)
  .then(() => {
    if (problems.length > 0) {
      console.error("X a purchase return can still be priced by whoever sends the request:")
      for (const p of problems) console.error(`  - ${p}`)
      process.exit(1)
    }
    for (const n of notes) console.log(`  ${n}`)
    console.log(
      "+ a purchase return is priced by the bill it returns: no writer takes money from the request, " +
      "the rule has one home, a forged price is refused by name and number, what the screen sends is " +
      "accepted, and with nothing sent the server derives it - measured by planting, rolled back.")
  })
  .catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
