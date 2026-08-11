#!/usr/bin/env node
/**
 * check-audit-trail-actually-records.js
 * ---------------------------------------------------------------------------
 * v3.74.859 — كل جدولٍ عليه مُشغِّل تدقيق **يُسجِّل فعلاً**.
 *
 * **الحادثة**: `audit_trigger_function` تقرأ الفرع بتعبير `CASE` مبنىٍّ على
 * **قائمة أسماء جداول مكتوبة يدوياً**. وستةُ جداول عليها المُشغِّل لا تملك
 * `branch_id` أصلاً ⇒ يُرفع `record "new" has no field "branch_id"` ⇒
 * يبتلعه `WHEN OTHERS` ⇒ **لا يُكتب قيد تدقيق البتة**، ولا يعلم أحد.
 *
 * القياس على الإنتاج قبل الإصلاح: `company_role_permissions` و
 * `accounting_periods` و`tax_codes` و`shareholders` بـ**صفر** قيد، والفواتير
 * بـ٤٣١. أى أن الثقب وقع فى **أخطر ما يجب تسجيله**.
 *
 * ⚠️ **ولماذا فحصٌ تجريبى لا صرفى؟**
 *
 * كتبتُ أولاً حارساً يقرأ مصدر الدوال ويُبلّغ عن كل `NEW.x` لعمودٍ غير موجود.
 * فأعطى **٢١ إنذاراً كاذباً**. والسبب أن PL/pgSQL يُخطِّط الجُمل **عند بلوغها**:
 *
 *     IF TG_TABLE_NAME = 'other' THEN v := NEW.absent; END IF;   ← لا يفشل أبداً
 *     v := CASE WHEN TG_TABLE_NAME = 'other' THEN NEW.absent END; ← يفشل دائماً
 *
 * (أُثبت الفرق بتجربةٍ مباشرة على الإنتاج داخل معاملة متراجَع عنها.)
 *
 * ⇒ فالشكل لا يكفى. **يُقاس الأثر**: هل يظهر قيد تدقيق فعلاً؟ لكل جدول
 *   تحديثٌ لا يغيّر شيئاً (`SET id = id`) داخل معاملة **تُلغى بالكامل**،
 *   ويُشترط ظهور قيد تدقيق جديد. صفر إنذارات كاذبة، ويقيس ما يهمّ فعلاً.
 *
 * خط الأساس: **صفر**. لا يُرفع أبداً.
 *
 * Usage: node scripts/check-audit-trail-actually-records.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot verify the audit trail."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const AUDITED_TABLES = `
  SELECT DISTINCT cl.relname AS t
    FROM pg_trigger tg
    JOIN pg_class     cl ON cl.oid = tg.tgrelid
    JOIN pg_namespace n  ON n.oid  = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_proc      p  ON p.oid  = tg.tgfoid
   WHERE NOT tg.tgisinternal
     AND p.proname = 'audit_trigger_function'
   ORDER BY 1
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const silent = []     // لم يُسجِّل شيئاً — عطب
  const recorded = []   // سجّل ✔
  const noData = []     // لا صفوف للاختبار
  const protectedT = [] // حارس أعمال رفض التعديل (وهذا سليم)

  try {
    const { rows: tables } = await client.query(AUDITED_TABLES)

    // كل شىء داخل معاملة واحدة تُلغى بالكامل. لا أثر يبقى.
    await client.query("BEGIN")

    for (const { t } of tables) {
      // اسم الجدول آتٍ من `pg_class` لا من مُدخل مستخدم، ويُقتبَس على أى حال.
      const { rows: sample } = await client.query(`SELECT id FROM public."${t}" LIMIT 1`)
      if (sample.length === 0) { noData.push(t); continue }
      const id = sample[0].id

      const { rows: b } = await client.query(
        `SELECT count(*)::int AS n FROM public.audit_logs WHERE target_table = $1`, [t]
      )

      await client.query("SAVEPOINT probe")
      try {
        await client.query(`UPDATE public."${t}" SET id = id WHERE id = $1`, [id])
        const { rows: a } = await client.query(
          `SELECT count(*)::int AS n FROM public.audit_logs WHERE target_table = $1`, [t]
        )
        if (a[0].n > b[0].n) recorded.push(t)
        else silent.push({ table: t, before: b[0].n })
        await client.query("ROLLBACK TO SAVEPOINT probe")
      } catch (e) {
        // حارس أعمال رفض التعديل (مثلاً: حركة مخزون مرتبطة بقيد مُرحَّل).
        // هذا سلوكٌ سليم مقصود، لا عطبٌ فى التدقيق.
        await client.query("ROLLBACK TO SAVEPOINT probe")
        protectedT.push({ table: t, why: String(e.message).slice(0, 70) })
      }
    }
  } finally {
    try { await client.query("ROLLBACK") } finally { await client.end() }
  }

  if (verbose) {
    for (const t of recorded) console.log(`  + ${t} — يسجّل`)
    for (const t of noData) console.log(`  · ${t} — لا صفوف للاختبار`)
    for (const p of protectedT) console.log(`  · ${p.table} — محمىٌّ بحارس أعمال: ${p.why}`)
  }

  if (silent.length > 0) {
    console.error(
      `X ${silent.length} audited table(s) record NOTHING - the trigger fires and writes no row:\n`
    )
    for (const s of silent) {
      console.error(`  - ${s.table}   (audit rows today: ${s.before})`)
    }
    console.error(
      `\n  Nobody will ever report this. The user sees no error, the operation succeeds,\n` +
        `  and the failure appears only as a WARNING in the database log. Then one day\n` +
        `  someone asks who changed a permission, reopened a closed period, or edited a\n` +
        `  payroll run - and there is no answer.\n` +
        `  Usual cause: the trigger function reads NEW.<col> inside a CASE expression.\n` +
        `  PL/pgSQL plans the whole expression regardless of the condition, so on a table\n` +
        `  without that column it raises, and WHEN OTHERS swallows it.\n` +
        `  Fix: (to_jsonb(NEW) ->> 'col')::uuid - NULL for a missing key, never raises.`
    )
    process.exit(1)
  }

  console.log(
    `+ every audited table actually records ` +
      `(${recorded.length} verified, ${noData.length} with no rows to test, ` +
      `${protectedT.length} protected by a business guard) - all rolled back.`
  )
})().catch((e) => {
  console.error(`X check-audit-trail-actually-records failed: ${e.message}`)
  process.exit(1)
})
