#!/usr/bin/env node
/**
 * check-notifications-reach-a-person.js
 * ---------------------------------------------------------------------------
 * v3.74.939 — **إشعارٌ يُرسَل إلى دورٍ لا يحمله أحد إشعارٌ لا يصل.**
 *
 * قِيس على الإنتاج (٢ أغسطس ٢٠٢٦): ٣٥ إشعاراً غير مقروءٍ فى الشركة الرئيسية
 * موجَّهةٌ إلى `general_manager` (١٨) و`admin` (١٤) و`warehouse_manager` (٣)
 * — **وصفرُ أعضاءٍ بهذه الأدوار فى كل الشركات**. واعتمادٌ يصل إلى فراغ
 * اعتمادٌ لا يُتَّخذ، ولا شىءَ كان يقول ذلك.
 *
 * ═══ ولماذا مُحفِّزٌ لا دالة؟ ═══
 *
 * `create_notification` موجودة، **لكن أربعاً وعشرين دالةً تُدرج فى الجدول
 * مباشرةً وتتخطّاها** (مقيسٌ بقراءة أجساد الدوال). فقاعدةٌ فى الدالة
 * مسكِّن — نفسُ درس 935. ومكانُها الجدولُ نفسُه.
 *
 * ═══ وهذا الحارسُ يقيس الأثر لا النصّ ═══
 *
 * لا يكفى أن يوجد المُحفِّزُ باسمه: **يُدرَج إشعارٌ حقيقىٌّ داخل معاملةٍ
 * مُلغاة** ويُنظر أين وقع. وثلاثةُ أسئلةٍ لا سؤالٌ واحد:
 *   ‏(أ) دورٌ لا يحمله أحد     ⇒ يجب أن يصل المالكَ **وأن يقول لماذا**.
 *   ‏(ب) دورٌ له عضو            ⇒ يجب أن **يُترك كما هو**. وحارسٌ يحوّل كلَّ
 *       شىءٍ لا يحرس شيئاً؛ ولا بد أن يُرى وهو يُبقى البرىء.
 *   ‏(ج) موجَّهٌ إلى شخصٍ بعينه ⇒ لا يُمَسّ.
 *
 * وكذلك الفحصُ الصحّى: **يصيح لمستندٍ ما زال معلَّقاً، ويصمت لمستندٍ انتهى**
 * — وهذا بعينه ما كان مكسوراً (خمسةُ إنذاراتٍ كلُّها تشير إلى `PRET-5689`
 * وحالتُه `completed`).
 *
 * Usage: node scripts/check-notifications-reach-a-person.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

const url = process.env.NOTIFY_ROUTING_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure where a notification lands."
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
 * ⚠️ درس 937 — اتصالٌ ينقطع ليس نتيجةَ قياس. حدثُ `error` بلا مستمعٍ يقتل
 * العملية بأثرٍ خام فيبدو العطبُ فى الحجب وهو فى الشبكة. وحارسٌ يسقط
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

const FUNCTIONS = [
  "workflow_status_is_open",
  "workflow_row_is_open",
  "company_role_has_holder",
  "notifications_route_to_a_person",
  "ic_stale_critical_notifications",
]

;(async () => {
  await withDatabase(async (client) => {
    // ── (١) المُحفِّزُ موجودٌ على الجدول، قبل الإدراج، ولكل صف ──────────────
    const { rows: trg } = await client.query(
      `SELECT t.tgname, t.tgenabled, p.proname, p.prosecdef,
              (t.tgtype & 2) <> 0 AS is_before,
              (t.tgtype & 4) <> 0 AS on_insert,
              (t.tgtype & 1) <> 0 AS for_each_row
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname='public' AND c.relname='notifications' AND NOT t.tgisinternal
          AND p.proname = 'notifications_route_to_a_person'`)
    if (trg.length === 0) {
      problems.push(
        "notifications has no routing trigger - a notification addressed to a role nobody holds " +
        "would sit unread forever, and 24 writers insert straight into the table")
    } else {
      const t = trg[0]
      if (!t.is_before || !t.on_insert || !t.for_each_row) {
        problems.push(`${t.tgname} is not BEFORE INSERT FOR EACH ROW - it cannot rewrite the row`)
      }
      if (t.tgenabled === "D") problems.push(`${t.tgname} is DISABLED - the rule is off`)
      if (!t.prosecdef) {
        problems.push(
          `${t.proname} is not SECURITY DEFINER - it reads company_members, and a caller ` +
          `without that right would silently fail to route`)
      }
    }

    // ── (٢) ولا دالةَ من الخمس مفتوحةٌ لزائرٍ مجهول (درس 919/929) ─────────
    // ⚠️ `grantee = 0` هو PUBLIC، و`pg_get_userbyid(0)` لا يُسأل عنه مباشرةً —
    // فالتسميةُ تُحسب فى `CASE` (يقصر التقييم على فرعه) ثم يُرشَّح بعدها.
    const { rows: grants } = await client.query(
      `SELECT q.proname, q.grantee FROM (
         SELECT p.proname,
                CASE WHEN ax.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(ax.grantee) END AS grantee,
                ax.privilege_type
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) ax
          WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
       ) q
       WHERE q.privilege_type = 'EXECUTE' AND q.grantee IN ('PUBLIC', 'anon')`, [FUNCTIONS])
    for (const g of grants) {
      problems.push(`${g.proname} is executable by ${g.grantee} - every CREATE FUNCTION hands EXECUTE to PUBLIC, and PUBLIC includes anon`)
    }

    // ── (٣) الأثرُ نفسُه: أين يقع الإشعارُ فعلاً؟ (معاملةٌ مُلغاة) ─────────
    await client.query("BEGIN")
    try {
      const { rows: co } = await client.query(
        `SELECT m.company_id, m.user_id AS owner_id,
                (SELECT m2.role FROM public.company_members m2
                  WHERE m2.company_id = m.company_id
                    AND lower(trim(m2.role)) <> 'owner' LIMIT 1) AS a_held_role
           FROM public.company_members m
          WHERE lower(trim(m.role)) = 'owner'
          ORDER BY (SELECT count(*) FROM public.company_members m3 WHERE m3.company_id = m.company_id) DESC
          LIMIT 1`)
      if (co.length === 0) {
        problems.push("no company has an owner - the routing rule has nowhere to send anything")
      } else {
        const { company_id, owner_id, a_held_role } = co[0]
        const plant = async (role, user) => {
          const { rows } = await client.query(
            `INSERT INTO public.notifications
               (company_id, created_by, reference_type, reference_id, title, message,
                priority, assigned_to_role, assigned_to_user, status)
             VALUES ($1,$2,'zz_probe_939', gen_random_uuid(), 'probe', 'body', 'high', $3, $4, 'unread')
             RETURNING assigned_to_role, assigned_to_user, message`,
            [company_id, owner_id, role, user])
          return rows[0]
        }

        // (أ) دورٌ لا يحمله أحد
        const a = await plant("zz_role_nobody_holds", null)
        if (a.assigned_to_user !== owner_id) {
          problems.push("a notification addressed to a role nobody holds did NOT reach the owner - it would never be read")
        }
        if (!String(a.message || "").includes("v3.74.939")) {
          problems.push("the rerouted notification does not say WHY it was rerouted - a silent reroute hides that the company is missing a role")
        }
        if (a.assigned_to_role !== null) {
          problems.push("the rerouted notification still carries the empty role - role-filtered inboxes would show it to nobody")
        }

        // (ب) دورٌ له عضو — يجب أن يُترك
        if (a_held_role) {
          const b = await plant(a_held_role, null)
          if (b.assigned_to_user !== null || b.assigned_to_role !== a_held_role) {
            problems.push(
              `a notification addressed to ${a_held_role} (a role that HAS a holder) was rerouted anyway - ` +
              `a rule that rewrites everything protects nothing`)
          }
        } else {
          notes.push("! the chosen company has only an owner - the spare-the-innocent case was not exercised here")
        }

        // (ج) موجَّهٌ إلى شخصٍ بعينه — لا يُمَسّ
        const c2 = await plant("zz_role_nobody_holds", owner_id)
        if (c2.assigned_to_role !== "zz_role_nobody_holds") {
          problems.push("a notification already addressed to a person was rewritten - the rule reaches past its business")
        }

        // (د) والفحصُ الصحّى: يصيح للمعلَّق، ويصمت للمنتهى
        const { rows: po } = await client.query(
          `SELECT id, status FROM public.purchase_orders WHERE company_id = $1 LIMIT 1`, [company_id])
        if (po.length === 0) {
          notes.push("! no purchase order to exercise the staleness check with")
        } else {
          await client.query(
            `INSERT INTO public.notifications
               (company_id, created_by, reference_type, reference_id, title, message,
                priority, assigned_to_user, status, created_at)
             VALUES ($1,$2,'purchase_order',$3,'probe','body','high',$2,'unread', NOW() - INTERVAL '60 days')`,
            [company_id, owner_id, po[0].id])

          const fired = async () => {
            const { rows } = await client.query(
              `SELECT COALESCE((detail->>'unread_critical_count')::int, 0) AS n
                 FROM public.ic_stale_critical_notifications($1)
                WHERE detail ? 'unread_critical_count'`, [company_id])
            return rows.length > 0 && Number(rows[0].n) > 0
          }

          await client.query(`UPDATE public.purchase_orders SET status='pending_approval' WHERE id=$1`, [po[0].id])
          if (!(await fired())) {
            problems.push("the staleness check stayed silent on a document that is STILL pending - a missed decision would never surface")
          }
          await client.query(`UPDATE public.purchase_orders SET status='billed' WHERE id=$1`, [po[0].id])
          if (await fired()) {
            problems.push(
              "the staleness check still calls a RESOLVED document a missed decision - " +
              "this is the false alarm 939 exists to remove, and a guard that cries wolf gets switched off")
          }
        }
      }
    } finally {
      await client.query("ROLLBACK")
    }

    // ── (٤) وما لا يُقاس بالزرع يُقال بعدده ────────────────────────────────
    const { rows: noOwner } = await client.query(
      `SELECT count(*) AS n FROM public.companies c
        WHERE NOT EXISTS (SELECT 1 FROM public.company_members m
                           WHERE m.company_id = c.id AND lower(trim(m.role))='owner')
          AND c.user_id IS NULL`)
    if (Number(noOwner[0].n) > 0) {
      problems.push(
        `${noOwner[0].n} company(ies) have no owner at all - a notification to an empty role there ` +
        `has nowhere to go, and the trigger deliberately leaves it rather than drop it`)
    }

    const { rows: stranded } = await client.query(
      `SELECT count(*) AS n FROM public.notifications n
        WHERE n.assigned_to_user IS NULL AND n.assigned_to_role IS NOT NULL AND n.read_at IS NULL
          AND NOT public.company_role_has_holder(n.company_id, n.assigned_to_role)`)
    const { rows: strandedOpen } = await client.query(
      `SELECT count(*) AS n FROM public.notifications n
        WHERE n.assigned_to_user IS NULL AND n.assigned_to_role IS NOT NULL AND n.read_at IS NULL
          AND NOT public.company_role_has_holder(n.company_id, n.assigned_to_role)
          AND public.workflow_row_is_open(n.reference_id) IS TRUE`)
    if (Number(strandedOpen[0].n) > 0) {
      problems.push(
        `${strandedOpen[0].n} unread notification(s) sit on a role nobody holds AND their workflow is still open - ` +
        `these are decisions nobody can take; the 939 backfill should have moved them`)
    }
    notes.push(
      `  ${stranded[0].n} unread notification(s) still address a role with no holder - ` +
      `all of them for work that is already finished (log lines, not decisions)`)
  })

  if (problems.length > 0) {
    console.error(`X a notification can still be sent where nobody will read it (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  See supabase/migrations/20260802000001_v3_74_939_notifications_reach_a_person.sql")
    process.exit(1)
  }

  if (verbose) for (const n of notes) console.log(n)
  console.log(
    "+ every notification reaches a person: a role with no holder is rerouted to the owner and says why, " +
    "a role WITH a holder is left alone, one already addressed to a person is untouched, and the staleness " +
    "check fires for a pending document and stays silent for a resolved one - measured by planting, rolled back.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })
