#!/usr/bin/env node
/**
 * check-duplicate-role-notifications.js
 * ---------------------------------------------------------------------------
 * v3.74.851 — لا حدثٌ واحد يُرسِل أكثر من إشعار إلى **نفس الجمهور**.
 *
 * **الحادثة**: أبلغ المالك أن رسالة «طلب اعتماد صرف مواد خام» وصلته
 * **مكرَّرة** فى الجرس. والسبب ليس فى الإرسال وحده بل فى **قاعدة القراءة**:
 *
 *     components/NotificationCenter.tsx
 *     الأدوار العليا (owner / admin / general_manager) ترى إشعارات بعضها.
 *
 * أى أن الثلاثة **جمهور واحد**، فكل إرسال بدور منها يُضاعف الرسالة عند كل
 * واحد منهم.
 *
 * ⇒ **الدرس**: من يكتب لجمهور **يقرأ قاعدة الجمهور أولاً**. وعدد المرسَل
 *   إليهم لا يُقاس بعدد الأدوار المذكورة بل بعدد **من ستصلهم الرسالة**.
 *
 * ⚠️ **ولماذا يقرأ هذا الفحص القاعدة بدل الكود؟**
 * لأن نسخته الأولى كانت ساكنة تبحث عن `assignedToRole: "..."` النصّى، فأعلنت
 * **صفر مخالفات** — وفى قاعدة الإنتاج **خمس عشرة** فاتورة مُشعَرة ثلاث مرات.
 * السبب أن نصف المشروع يُرسل داخل **حلقة بمتغيّر** (`p_assigned_to_role:
 * targetRole`) فلا يراه بحث نصّى. حارسٌ يقول «صفر» وهو أعمى عن نصف الأشكال
 * أسوأ من لا حارس: يمنح طمأنينة كاذبة.
 *
 * فالمقياس هنا **الأثر لا الشكل**: يُعدّ ما وصل الجرس فعلاً.
 *
 * Usage: node scripts/check-duplicate-role-notifications.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

// عدد الأحداث المكرَّرة القائمة وقت كتابة الفحص. الهدف تصفيرها؛ والبناء يفشل
// إذا **زادت**، فلا يدخل مصدر تكرار جديد.
//
// ٨٥١: ٦ مسارات تصنيع أُصلحت (BOM ومسار التشغيل وأمر الإنتاج، طلباً وإعادةَ
//      اعتماد) ⇒ التصنيع صفر. والباقى ٢٢ حدثاً بـ٤٥ نسخة زائدة.
// ٨٥٥: **صفر**. والـ٢٢ الباقية لم تكن اثنتين وعشرين مشكلة بل **مشكلة واحدة**:
//      ثلاث دوال فى `NotificationRecipientResolverService` تُنتج قائمة
//      المستلمين لكل خدمات المبيعات والمالية، وكانت تضع الأدوار الثلاثة
//      (owner/admin/general_manager) صفوفاً منفصلة. أُصلحت النقطة الواحدة
//      فسقط التكرار من كل مستدعِيها، وأُرشِفت الـ٤٥ نسخة القائمة.
//
// ⇒ **الدرس**: قبل إصلاح ٢٢ موضعاً، يُبحث عن النقطة التى تمرّ منها كلها.
const BASELINE = Number(process.env.DUP_NOTIFY_BASELINE ?? 0)

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot count duplicate notifications."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

// حدثٌ واحد = نفس المرجع + نفس نصّ الرسالة. ويُجرَّد الدور من مفتاح الحدث
// لأنه هو بالضبط ما يفرّق النسخ المكرَّرة عن بعضها.
const SQL = `
  SELECT reference_type,
         reference_id,
         left(title, 60) AS title,
         count(*)                          AS copies,
         string_agg(assigned_to_role, ', ' ORDER BY assigned_to_role) AS roles
    FROM public.notifications
   WHERE assigned_to_role IN ('owner', 'admin', 'general_manager')
     AND status <> 'archived'
   GROUP BY reference_type, reference_id, left(title, 60), message
  HAVING count(*) > 1
   ORDER BY count(*) DESC, reference_type
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  try { ({ rows } = await client.query(SQL)) } finally { await client.end() }

  const total = rows.length

  if (total > BASELINE) {
    console.error(
      `X ${total} event(s) reach the same audience more than once - baseline is ${BASELINE}:\n`
    )
    for (const r of rows.slice(0, 25)) {
      console.error(`  - ${r.reference_type}  "${r.title}"  x${r.copies}  (${r.roles})`)
    }
    if (rows.length > 25) console.error(`  ... and ${rows.length - 25} more`)
    console.error(
      "\n  owner, admin and general_manager are ONE audience: NotificationCenter\n" +
        "  shows each of them the others' notifications. One send per role means\n" +
        "  every one of them receives the message that many times.\n\n" +
        "  Send once for senior management (role 'owner'), and keep a separate\n" +
        "  send for 'manager' - the branch manager is NOT in that audience and\n" +
        "  sees none of their notifications."
    )
    process.exit(1)
  }

  console.log(
    `+ no new duplicate-audience notifications ` +
      `(${total} pre-existing at baseline ${BASELINE}; ` +
      `audience: owner / admin / general_manager).`
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})
