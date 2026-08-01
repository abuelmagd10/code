#!/usr/bin/env node
/**
 * selftest-product-management-one-door.js
 * ---------------------------------------------------------------------------
 * v3.74.935 — يُرى الحارس وهو يرفض، وأهمُّ ما يرفضه **البابُ الحقيقى**.
 *
 * الشكلُ الأخطر هنا لا يُرى فى فرقٍ ولا فى مراجعة: سياسةُ الصف مضبوطةٌ
 * تماماً، والدالةُ المخوَّلة لا تسأل عن الدور — **فالنصُّ يقول مُغلقٌ
 * والأثرُ يقول مفتوح**. ولا سبيل لبرهنة حارسٍ كهذا إلا بزرع الشكل فى
 * قاعدةٍ حيّة ثم النظر: أيرفض أم يمرّ؟
 *
 * ويعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`). وأربع
 * زراعات:
 *   (أ) بابٌ ثانٍ متساهلٌ يعود بجوار الأول          ⇒ يُرفض.
 *   (ب) `create_product_atomic` تفقد سؤالَ الدور     ⇒ يُرفض (وهذا هو
 *       الشكلُ الذى كان قائماً فعلاً قبل 935).
 *   (ج) `can_manage_products` تُمنح لـ`anon`         ⇒ يُرفض.
 *   (د) ثم تُعاد الحال                                ⇒ يصمت الحارس.
 *
 * والاستعادةُ من `pg_get_functiondef` الملتقَطة قبل الزرع، فلا تنحرف
 * نسخةُ الفخّ عن الهجرة.
 *
 * Usage: node scripts/selftest-product-management-one-door.js
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

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-product-management-one-door.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PRODUCT_DOOR_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  // لقطةُ الحال الصحيحة
  const { rows: snap } = await client.query(
    `SELECT p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_product_atomic'`)
  if (snap.length === 0) { console.error("X create_product_atomic is missing - nothing to prove."); process.exit(1) }

  const restoreRpc = async () => {
    for (const s of snap) {
      await client.query(s.def)
      await client.query(`REVOKE ALL ON FUNCTION ${s.sig} FROM PUBLIC, anon`)
      await client.query(`GRANT EXECUTE ON FUNCTION ${s.sig} TO authenticated, service_role`)
    }
  }
  const restorePolicies = async () => {
    await client.query("DROP POLICY IF EXISTS products_insert ON public.products")
    await client.query("DROP POLICY IF EXISTS products_insert_managers ON public.products")
    await client.query(
      `CREATE POLICY products_insert_managers ON public.products
       FOR INSERT WITH CHECK (public.can_manage_products(company_id))`)
  }
  const restoreRule = async () => {
    await client.query(`REVOKE ALL ON FUNCTION public.can_manage_products(uuid) FROM PUBLIC, anon`)
    await client.query(`GRANT EXECUTE ON FUNCTION public.can_manage_products(uuid) TO authenticated, service_role`)
  }

  const stage = async (title, plant, needle, undo) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    await undo()
    if (!r.failed || !new RegExp(needle).test(r.output)) {
      console.error(`X ${title}: the guard did NOT refuse (looked for /${needle}/).`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log(`+ ${title}: رُفض كما يجب`)
    }
  }

  try {
    // (أ) بابٌ ثانٍ متساهل
    await stage(
      "a second permissive INSERT door beside the first",
      () => client.query(
        `CREATE POLICY products_insert ON public.products
         FOR INSERT WITH CHECK (public.can_modify_data(company_id))`),
      "INSERT door",
      restorePolicies)

    // (ب) البابُ الحقيقى يفقد سؤالَ الدور — وهو ما كان قائماً قبل 935
    await stage(
      "the SECURITY DEFINER creator no longer asks about the role",
      async () => {
        for (const s of snap) {
          const stripped = s.def.replace(
            /\n\s*--\s*v3\.74\.935[\s\S]*?END IF;\n/, "\n")
          if (stripped === s.def) throw new Error(`could not strip the guard from ${s.sig}`)
          await client.query(stripped)
        }
      },
      "does not ask can_manage_products",
      restoreRpc)

    // (ج) الحكمُ يُفتح لـ anon
    await stage(
      "the rule opened to anon",
      () => client.query("GRANT EXECUTE ON FUNCTION public.can_manage_products(uuid) TO anon"),
      "executable by anon",
      restoreRule)

    // (د) والحال الصحيحة
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
    try { await restoreRpc(); await restorePolicies(); await restoreRule() }
    catch (e) { console.error(`! restore failed: ${e.message}`) }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the products-door guard is proven refusing a second permissive door, a definer creator")
  console.log("  that stopped asking, and a rule opened to anon - and silent on the correct state.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
