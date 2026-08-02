#!/usr/bin/env node
/**
 * selftest-notifications-reach-a-person.js
 * ---------------------------------------------------------------------------
 * v3.74.939 — يُرى الحارسُ وهو يرفض، **وهو يُبقى الحالَ الصحيحة**.
 *
 * وكلُّ شكلٍ هنا **لا يعيش فى ملف**: يُسقَط المُحفِّزُ بيدٍ فى لوحة التحكم،
 * أو يُوسَّع فيصير يحوّل كلَّ شىء، أو تُعاد الدالةُ إلى نسختها القديمة —
 * ولا يتغيّر حرفٌ فى الكود. فالفحصُ النصّى يقول «سليم» بينما الإشعاراتُ
 * تذهب إلى فراغ. ولا سبيلَ لبرهنةِ حارسٍ كهذا إلا **بزرع العطب فى قاعدةٍ
 * حيّة ثم النظر: أيرفض أم يمرّ؟**
 *
 * ويعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`).
 *   ‏(أ) يُسقَط المُحفِّز                        ⇒ يُرفض.
 *   ‏(ب) المُحفِّزُ يحوّل **حتى ما له صاحب**      ⇒ يُرفض (حارسٌ يرفض الكلَّ
 *       لا يحرس شيئاً — وهذا أخبثُ الشكلين لأنه «يعمل» فى الظاهر).
 *   ‏(ج) المُحفِّزُ يحوّل بصمتٍ بلا سبب           ⇒ يُرفض (النقصُ يُخفى).
 *   ‏(د) الفحصُ يعود إلى `ELSE TRUE` (نسخة 215)  ⇒ يُرفض (عودةُ الإنذار الكاذب).
 *   ‏(هـ) `anon` يُمنح تنفيذَ دالة التوجيه        ⇒ يُرفض.
 *   ‏(و) ثم تُعاد الحال                           ⇒ يصمت الحارس.
 *
 * والاستعادةُ لا تُكتب بيدى: يُلتقط `pg_get_functiondef` قبل الزرع ويُعاد
 * حرفياً بعده — فلا تنحرف نسخةُ الفخّ عن نسخة الهجرة أبداً.
 *
 * Usage: node scripts/selftest-notifications-reach-a-person.js
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
  const r = spawnSync(process.execPath, ["scripts/check-notifications-reach-a-person.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, NOTIFY_ROUTING_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  const snap = {}
  for (const fn of ["notifications_route_to_a_person()", "ic_stale_critical_notifications(uuid)"]) {
    const { rows } = await client.query(`SELECT pg_get_functiondef($1::regprocedure) AS def`, [`public.${fn}`])
    if (rows.length === 0) { console.error(`X public.${fn} does not exist - nothing to prove.`); process.exit(1) }
    snap[fn] = rows[0].def
  }

  const restoreAll = async () => {
    for (const fn of Object.keys(snap)) await client.query(snap[fn])
    await client.query("REVOKE ALL ON FUNCTION public.notifications_route_to_a_person() FROM PUBLIC, anon")
    await client.query(`DROP TRIGGER IF EXISTS trg_notifications_route_to_a_person ON public.notifications`)
    await client.query(
      `CREATE TRIGGER trg_notifications_route_to_a_person
         BEFORE INSERT ON public.notifications
         FOR EACH ROW EXECUTE FUNCTION public.notifications_route_to_a_person()`)
  }

  const stage = async (title, plant, needle) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    await restoreAll()
    if (!r.failed || !new RegExp(needle).test(r.output)) {
      console.error(`X ${title}: the guard did NOT refuse (looked for /${needle}/).`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log(`+ ${title}: رُفض كما يجب`)
    }
  }

  try {
    await stage(
      "the routing trigger dropped",
      () => client.query("DROP TRIGGER IF EXISTS trg_notifications_route_to_a_person ON public.notifications"),
      "has no routing trigger")

    await stage(
      "a trigger that reroutes even a role that HAS a holder",
      () => client.query(`
        CREATE OR REPLACE FUNCTION public.notifications_route_to_a_person()
         RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
         SET search_path TO 'public', 'pg_catalog'
        AS $f$
        DECLARE v_owner uuid;
        BEGIN
          IF NEW.assigned_to_user IS NOT NULL OR NEW.assigned_to_role IS NULL THEN RETURN NEW; END IF;
          SELECT m.user_id INTO v_owner FROM public.company_members m
           WHERE m.company_id = NEW.company_id AND lower(trim(m.role))='owner' LIMIT 1;
          IF v_owner IS NULL THEN RETURN NEW; END IF;
          NEW.assigned_to_user := v_owner;
          NEW.assigned_to_role := NULL;
          NEW.message := COALESCE(NEW.message,'') || E'\\n[v3.74.939]';
          RETURN NEW;
        END $f$`),
      "a rule that rewrites everything protects nothing")

    await stage(
      "a trigger that reroutes in silence, without saying why",
      () => client.query(`
        CREATE OR REPLACE FUNCTION public.notifications_route_to_a_person()
         RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
         SET search_path TO 'public', 'pg_catalog'
        AS $f$
        DECLARE v_owner uuid;
        BEGIN
          IF NEW.assigned_to_user IS NOT NULL OR NEW.assigned_to_role IS NULL THEN RETURN NEW; END IF;
          IF public.company_role_has_holder(NEW.company_id, NEW.assigned_to_role) THEN RETURN NEW; END IF;
          SELECT m.user_id INTO v_owner FROM public.company_members m
           WHERE m.company_id = NEW.company_id AND lower(trim(m.role))='owner' LIMIT 1;
          IF v_owner IS NULL THEN RETURN NEW; END IF;
          NEW.assigned_to_user := v_owner;
          NEW.assigned_to_role := NULL;
          RETURN NEW;
        END $f$`),
      "does not say WHY it was rerouted")

    await stage(
      "the staleness check back on the 215 catch-all (the false alarm returns)",
      () => client.query(`
        CREATE OR REPLACE FUNCTION public.ic_stale_critical_notifications(p_company_id uuid)
         RETURNS TABLE(severity text, detail jsonb) LANGUAGE plpgsql SECURITY DEFINER
         SET search_path TO 'public', 'pg_catalog'
        AS $f$
        DECLARE v_count integer;
        BEGIN
          SELECT COUNT(*) INTO v_count FROM notifications n
           WHERE n.company_id = p_company_id AND n.priority IN ('critical','high')
             AND n.read_at IS NULL AND n.created_at < NOW() - INTERVAL '30 days';
          IF v_count > 0 THEN
            severity := 'low';
            detail := jsonb_build_object('unread_critical_count', v_count, 'hint','legacy');
            RETURN NEXT;
          END IF;
        END $f$`),
      "still calls a RESOLVED document a missed decision")

    await stage(
      "anon granted execute on the routing function",
      () => client.query("GRANT EXECUTE ON FUNCTION public.notifications_route_to_a_person() TO anon"),
      "executable by anon")

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
    try { await restoreAll() } catch (e) { console.error(`! restore failed: ${e.message}`) }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the routing guard is proven refusing all five shapes that would send a notification into a void,")
  console.log("  and staying silent on the correct state (test database only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
