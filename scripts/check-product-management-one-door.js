#!/usr/bin/env node
/**
 * check-product-management-one-door.js
 * ---------------------------------------------------------------------------
 * v3.74.935 — من يُنشئ الأصناف: بابٌ واحد، **وهو البابُ الذى يمرّ منه الناس**.
 *
 * قرّر المالك قصرَ إنشاء الأصناف وتعديلها على أصحابه: المالك · المشرف ·
 * المدير العام · مديرُ الفرع · المحاسب · مديرُ المخزن · مسئولُ المشتريات.
 *
 * ═══ ولماذا لا تكفى سياسةُ الصف؟ لأن القياس قال ═══
 *
 * على `products` كان **بابان متجاوران للإضافة**، أحدُهما يُسمّى ستةَ أدوار
 * والآخرُ يمرّ لأحدَ عشر. ولو ضُيِّقا معاً لبدا الإصلاحُ تاماً — **وكان
 * سيكون مسكِّناً**: الشاشةُ لا تُدرج فى `products` إطلاقاً (صفرُ موضعٍ فى
 * الشجرة كلها). الإنشاءُ يمرّ بـ`create_product_atomic`، وهى
 * `SECURITY DEFINER`، **فسياسةُ الصف لا تُطبَّق داخلها أصلاً**.
 *
 * وقِيس ذلك قبل العلاج بالانتحال: الأدوارُ السبعةُ كلُّها أنشأت صنفاً
 * بنجاح — ومنهم الموظفُ ومسئولُ التصنيع.
 *
 * ⇒ **فالحكمُ واحدٌ يُنادى من موضعين**: `can_manage_products` تُناديها
 * سياسةُ الصف **والدالةُ المخوَّلة**. وهذا الحارس يقيس الاثنين معاً، لأن
 * إغلاق أحدهما وحده لا يغلق شيئاً.
 *
 * وأربعةُ أشكالٍ يرفضها:
 *   ١) بابٌ ثانٍ يعود بجوار الأول (INSERT أو UPDATE).
 *   ٢) سياسةٌ تكتب الحكمَ بيدها بدل أن تُناديه.
 *   ٣) نسخةٌ من `create_product_atomic` بلا سؤالٍ عن الدور — **وله
 *      تعريفان**، والشاشةُ تنادى أحدهما، فالآخرُ بابٌ نائمٌ مفتوح.
 *   ٤) `can_manage_products` مفتوحةٌ لـ`anon` أو `PUBLIC`.
 *
 * ثم يقيس **الأثر**: ينتحل كلَّ عضوٍ ويحاول الإنشاءَ والتعديلَ فعلاً،
 * داخل معاملةٍ تُلغى — ويطلب أن يُرفض من لا يملك، وأن يُقبل من يملك،
 * **وألا تتأثر القراءة**. فحارسٌ لا يرى أحداً يُرفض لم يقس شيئاً.
 *
 * Usage: node scripts/check-product-management-one-door.js [--require-db] [--list]
 * Env:   PRODUCT_DOOR_DB_URL — قاعدةٌ بديلة (يستعملها الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

const RULE = "can_manage_products"
const ALLOWED = ["owner", "admin", "general_manager", "gm", "generalmanager",
                 "manager", "accountant", "store_manager", "purchasing_officer"]

const url = process.env.PRODUCT_DOOR_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure who may create a product."
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

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    // ── (١) الحكمُ موجود، ومقصور ────────────────────────────────────────
    const { rows: fn } = await client.query(
      `SELECT p.prosecdef, COALESCE(array_to_string(p.proacl, ' | '), '') acl,
              pg_get_functiondef(p.oid) def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`, [RULE])
    if (fn.length === 0) {
      problems.push(`${RULE}() is missing - both the policy and the RPC lost the rule they call`)
    } else {
      const f = fn[0]
      if (!f.prosecdef) problems.push(`${RULE}() is no longer SECURITY DEFINER`)
      if (f.acl === "" || /(^|\s)=X\//.test(f.acl)) {
        problems.push(`${RULE}() is executable by PUBLIC - and PUBLIC includes anon (919/929)`)
      }
      if (/\banon=X\//.test(f.acl)) problems.push(`${RULE}() is executable by anon`)
      const missing = ALLOWED.filter((r) => !f.def.includes(`'${r}'`))
      if (missing.length) {
        problems.push(`${RULE}() no longer names: ${missing.join(", ")} - those roles silently lost the products screen`)
      }
    }

    // ── (٢) بابٌ واحدٌ لكل فعل، والحكمُ نداءٌ لا نصّ ────────────────────
    for (const cmd of ["INSERT", "UPDATE"]) {
      const { rows: pol } = await client.query(
        `SELECT policyname, COALESCE(qual, '') qual, COALESCE(with_check, '') wc
           FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'products' AND cmd IN ($1, 'ALL')`, [cmd])
      // سياسةُ ALL للمالك المسجَّل وحدها مسموحٌ بها بجوارهما (مقيسة: لا توسّع).
      const doors = pol.filter((p) => !/owner_dml/.test(p.policyname))
      if (doors.length !== 1) {
        problems.push(
          `products has ${doors.length} ${cmd} door(s): ${doors.map((d) => d.policyname).join(", ") || "none"} - ` +
          `permissive policies are OR-ed, so a second one swallows the first (921 · 928 · 931)`)
      }
      for (const d of doors) {
        if (!`${d.qual}${d.wc}`.includes(`${RULE}(`)) {
          problems.push(
            `products.${d.policyname} does not call ${RULE}() - the rule now has two copies, ` +
            `and changing one leaves the other open in silence`)
        }
      }
    }

    // ── (٣) والبابُ الحقيقى: كلُّ نسخةٍ من الدالة المخوَّلة تسأل عن الدور ─
    const { rows: rpcs } = await client.query(
      `SELECT p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def,
              COALESCE(array_to_string(p.proacl, ' | '), '') acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'create_product_atomic'`)
    if (rpcs.length === 0) {
      problems.push("create_product_atomic is gone - the products screen cannot create anything")
    }
    for (const r of rpcs) {
      if (!r.def.includes(`${RULE}(`)) {
        problems.push(
          `create_product_atomic ${r.sig} does not ask ${RULE}() - it is SECURITY DEFINER, so the row ` +
          `policy never runs inside it, and ANY member of the company can create a product through it`)
      }
      if (/(^|\s)=X\//.test(r.acl) || /\banon=X\//.test(r.acl)) {
        problems.push(`create_product_atomic ${r.sig} is executable by PUBLIC/anon`)
      }
    }
    if (verbose) notes.push(`  create_product_atomic overloads: ${rpcs.length}`)

    // ── (٤) والأثر: يُجرَّب الإنشاءُ والتعديلُ فعلاً، ثم يُلغى ──────────
    const { rows: members } = await client.query(
      `SELECT cm.user_id, cm.company_id, lower(btrim(cm.role)) role
         FROM company_members cm ORDER BY 3`)
    let refused = 0
    let allowed = 0
    await client.query("BEGIN")
    try {
      for (const m of members) {
        const { rows: br } = await client.query(
          `SELECT id FROM public.branches WHERE company_id = $1 LIMIT 1`, [m.company_id])
        const branch = br[0]?.id || null
        await client.query(
          `SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
          [m.user_id])

        const { rows: verdict } = await client.query(
          `SELECT public.can_manage_products($1) AS may`, [m.company_id])
        const may = verdict[0].may === true

        // القراءةُ قبل المحاولة — لا يجوز أن يتغيّر ما يُرى بحكمِ من يكتب.
        await client.query("SET LOCAL ROLE authenticated")
        const { rows: before } = await client.query(
          `SELECT count(*)::int n FROM public.products WHERE company_id = $1`, [m.company_id])

        let created = false
        try {
          await client.query("SAVEPOINT probe")
          await client.query(
            `SELECT public.create_product_atomic($1, $2, 'zz-probe 935', NULL, 10, 5, 'piece', 0, 0,
                                                 'product', NULL, NULL, NULL::text, $3, NULL, NULL, NULL)`,
            [m.company_id, `ZZ-935-${m.role}-${m.user_id.slice(0, 8)}`, branch])
          created = true
        } catch { /* refused is the expected half of this measurement */ }
        await client.query("ROLLBACK TO SAVEPOINT probe")

        let edited = 0
        try {
          await client.query("SAVEPOINT probe2")
          const r2 = await client.query(
            `UPDATE public.products SET name = name WHERE company_id = $1`, [m.company_id])
          edited = r2.rowCount || 0
        } catch { /* denied */ }
        await client.query("ROLLBACK TO SAVEPOINT probe2")

        const { rows: after } = await client.query(
          `SELECT count(*)::int n FROM public.products WHERE company_id = $1`, [m.company_id])
        await client.query("RESET ROLE")

        if (before[0].n !== after[0].n) {
          problems.push(`${m.role}: what he can READ changed while probing who may write - the probe is not clean`)
        }
        if (!may && created) {
          problems.push(
            `${m.role} may not manage products by the rule, yet create_product_atomic ACCEPTED him - ` +
            `the real door is still open`)
        }
        if (may && !created) {
          problems.push(`${m.role} may manage products by the rule, yet the real path REFUSED him - work is blocked`)
        }
        if (!may && edited > 0) {
          problems.push(`${m.role} may not manage products, yet he edited ${edited} row(s)`)
        }
        if (may) allowed++
        else refused++
        if (verbose) {
          notes.push(`  ${m.role.padEnd(22)} rule=${may ? "may " : "may not"}  created=${created}  edited=${edited}`)
        }
      }
    } finally {
      await client.query("ROLLBACK")
    }

    if (members.length > 0 && refused === 0) {
      notes.push("! every member of every company may manage products - the narrowing was not exercised here")
    }
    if (members.length > 0 && allowed === 0) {
      problems.push("not one member may manage products - the rule is too narrow, and nobody can add an item")
    }
  } finally {
    await client.end()
  }

  if (problems.length > 0) {
    console.error(`X who may create a product is not what the code assumes (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  See supabase/migrations/20260801000001_v3_74_935_products_are_created_by_their_owners.sql")
    process.exit(1)
  }

  if (verbose) for (const n of notes) console.log(n)
  console.log(
    `+ products have one door per write, the rule is called not restated, every ` +
    `create_product_atomic overload asks it - and it was measured by actually trying to create ` +
    `and edit as every member, rolled back.`)
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
