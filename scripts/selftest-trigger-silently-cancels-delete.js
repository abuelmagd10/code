#!/usr/bin/env node
/**
 * selftest-trigger-silently-cancels-delete.js
 * ---------------------------------------------------------------------------
 * v3.74.881 — يجب أن يُرى الحارس وهو يرفض، **وأن يُسمّى ما زُرع**.
 *
 * وهذا الفخّ يحمل عبئاً زائداً: **يُثبت أن العطب نفسه حقيقى**، لا أن الحارس
 * يُطابق نصّاً. فيزرع مُشغِّلاً يُعيد `NEW` على جدولٍ تجريبى، ثم **يحذف صفاً
 * فعلياً** ويعدّ ما بقى. فإن بقى الصفّ بلا خطأ، فقد رأينا الابتلاع الصامت
 * بأعيننا لا فى شرحٍ عنه.
 *
 *   (أ) مُشغِّل BEFORE DELETE يُعيد `NEW`         ⇒ يجب أن يسقط ويُسمّى
 *   (ب) وسلوكه: الحذف لا يفشل ولا يقع             ⇒ يجب أن يُرى
 *   (ج) نفسه وقد صار `COALESCE(NEW, OLD)`         ⇒ يجب ألّا يسقط، والحذف يقع
 *   (د) مُشغِّل يرفع خطأً دائماً (جدولٌ لا يُحذف منه) ⇒ يجب ألّا يسقط
 *       (وهذا هو الشكل الذى ضُيِّق الحكم لأجله: ٣ ⇒ ١)
 *
 * ── وأثرُه على الإنتاج ───────────────────────────────────────────────────
 * يُنشئ جدولاً واحداً اسمه `zz_probe_881_*` ويحذفه فى `finally`، ويتحقّق من
 * زواله. ولا يمسّ جدولاً قائماً ولا صفاً حقيقياً. وأى بقايا من تشغيلٍ سابق
 * تُنظَّف فى البداية — **فالفخّ الذى يترك أثراً لا يُشغَّل مرتين بأمان.**
 *
 * Usage: node scripts/selftest-trigger-silently-cancels-delete.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const path = require("path")
const checker = path.join(__dirname, "check-trigger-silently-cancels-delete.js")
const { findSilentCancellers, SQL } = require(checker)

let failed = false
const fail = (msg) => { console.error(`X ${msg}`); failed = true }

// ── الحكم وحده — بلا شبكة، فيبقى قائماً دائماً ─────────────────────────
{
  const bad = findSilentCancellers([
    { table_name: "zz_t", trigger_name: "zz_trg", fn: "zz_fn" },
  ])
  const none = findSilentCancellers([])
  if (bad.length !== 1 || !bad[0].includes("zz_fn") || !bad[0].includes("zz_t")) {
    fail("the rule did not report a planted row, or did not name it")
  } else if (none.length !== 0) {
    fail("the rule invented a finding out of an empty list")
  } else {
    console.log("+ (rule) reports what it is given, and nothing more")
  }
}

const TABLE = "zz_probe_881_silent_delete"
const FN_BAD = "zz_probe_881_returns_new"
const FN_GOOD = "zz_probe_881_returns_coalesce"
const FN_RAISE = "zz_probe_881_always_raises"

const DROP_ALL = `
  DROP TABLE IF EXISTS public.${TABLE} CASCADE;
  DROP FUNCTION IF EXISTS public.${FN_BAD}() CASCADE;
  DROP FUNCTION IF EXISTS public.${FN_GOOD}() CASCADE;
  DROP FUNCTION IF EXISTS public.${FN_RAISE}() CASCADE;
`

;(async () => {
  const { requireDbOrSkip } = require("./lib/selftest-db")
  requireDbOrSkip("PRODUCTION_SUPABASE_DB_URL", "أنَّ حارسَ المُشغِّلِ الذى يُلغى الحذفَ صامتاً يرفضُ مُشغِّلاً مزروعاً")

  let Client
  try { ({ Client } = require("pg")) } catch {
    console.error("X npm install pg --save-dev"); process.exit(1)
  }

  const client = new Client({
    connectionString: process.env.PRODUCTION_SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    // بقايا تشغيلٍ سابق تُزال قبل البدء، لا بعده.
    await client.query(DROP_ALL)

    await client.query(`CREATE TABLE public.${TABLE} (id INT PRIMARY KEY)`)
    await client.query(`
      CREATE FUNCTION public.${FN_BAD}() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        RETURN NEW;
      END $f$;
    `)
    await client.query(`
      CREATE FUNCTION public.${FN_GOOD}() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        RETURN COALESCE(NEW, OLD);
      END $f$;
    `)
    await client.query(`
      CREATE FUNCTION public.${FN_RAISE}() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        RAISE EXCEPTION '${TABLE} is immutable.';
      END $f$;
    `)

    // ── (أ) المُشغِّل المعطوب: يجب أن يُمسك ويُسمّى ─────────────────────
    await client.query(`
      CREATE TRIGGER zz_probe_881_trg BEFORE DELETE ON public.${TABLE}
      FOR EACH ROW EXECUTE FUNCTION public.${FN_BAD}()
    `)
    let { rows } = await client.query(SQL)
    let found = findSilentCancellers(rows)
    if (!found.some((f) => f.includes(FN_BAD))) {
      fail(`a BEFORE DELETE trigger returning NEW was not caught (got ${found.length} finding(s))`)
    } else {
      console.log("+ (a) a BEFORE DELETE trigger returning NEW is caught, and named")
    }

    // ── (ب) وسلوكه فعلاً: الحذف لا يفشل ولا يقع ────────────────────────
    await client.query(`INSERT INTO public.${TABLE} (id) VALUES (1)`)
    const del = await client.query(`DELETE FROM public.${TABLE} WHERE id = 1`)
    const { rows: left } = await client.query(`SELECT count(*)::int AS n FROM public.${TABLE}`)
    if (left[0].n !== 1) {
      fail(`the planted trigger did NOT swallow the delete (rows left = ${left[0].n}) - the premise is wrong`)
    } else {
      console.log(
        `+ (b) the delete raised nothing (rowCount=${del.rowCount}) and the row survived - ` +
        `the silent cancel is real, not a description of one`
      )
    }

    // ── (ج) الشكل الصحيح: لا إنذار، والحذف يقع ─────────────────────────
    await client.query(`DROP TRIGGER zz_probe_881_trg ON public.${TABLE}`)
    await client.query(`
      CREATE TRIGGER zz_probe_881_trg BEFORE DELETE ON public.${TABLE}
      FOR EACH ROW EXECUTE FUNCTION public.${FN_GOOD}()
    `)
    ;({ rows } = await client.query(SQL))
    found = findSilentCancellers(rows)
    if (found.some((f) => f.includes(FN_GOOD))) {
      fail("COALESCE(NEW, OLD) was reported - the guard cries wolf on the correct shape")
    } else {
      await client.query(`DELETE FROM public.${TABLE} WHERE id = 1`)
      const { rows: l2 } = await client.query(`SELECT count(*)::int AS n FROM public.${TABLE}`)
      if (l2[0].n !== 0) {
        fail("COALESCE(NEW, OLD) still swallowed the delete")
      } else {
        console.log("+ (c) COALESCE(NEW, OLD) passes the guard, and the delete actually happens")
      }
    }

    // ── (د) مُشغِّل يرفع خطأً دائماً: ليس صمتاً، فلا يُنذَر عنه ──────────
    await client.query(`DROP TRIGGER zz_probe_881_trg ON public.${TABLE}`)
    await client.query(`
      CREATE TRIGGER zz_probe_881_trg BEFORE DELETE ON public.${TABLE}
      FOR EACH ROW EXECUTE FUNCTION public.${FN_RAISE}()
    `)
    ;({ rows } = await client.query(SQL))
    found = findSilentCancellers(rows)
    if (found.some((f) => f.includes(FN_RAISE))) {
      fail("an always-raising trigger was reported - refusal is loud, and the guard must spare it")
    } else {
      console.log("+ (d) an always-raising trigger stays silent - it refuses out loud, which is fine")
    }
  } finally {
    await client.query(DROP_ALL)
    const { rows: leftover } = await client.query(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'zz_probe_881%'`
    )
    if (leftover[0].n !== 0) {
      console.error(`X ${leftover[0].n} probe object(s) survived cleanup - remove them by hand`)
      failed = true
    }
    await client.end()
  }

  if (failed) process.exit(1)
  console.log("+ the silent-cancel guard was seen refusing, seen staying silent, and the defect itself was reproduced")
})().catch((err) => {
  console.error(
    "X self-test failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})
