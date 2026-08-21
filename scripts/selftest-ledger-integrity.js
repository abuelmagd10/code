#!/usr/bin/env node
/**
 * selftest-ledger-integrity.js
 * ---------------------------------------------------------------------------
 * v3.74.860 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله.
 * وقد كلّفنا هذا الدرس ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣ و٨٥٧ و٨٥٨ و٨٥٩.
 *
 * يزرع هذا الملف فخّين متقابلين على **قاعدة الاختبار**، كلاهما بعمليةٍ
 * **يسمح بها النظام** ويتراجع عنها بالكامل:
 *
 *   (أ) يُحذف منطقياً قيدٌ **تشير إليه دفعة**  ← يُشترط أن **يسقط** الحارس
 *       (فحص «مستندات تشير إلى قيدٍ محذوف»)
 *   (ب) يُحذف منطقياً قيدٌ **لا يشير إليه مستند** ← يُشترط أن **لا يسقط**
 *
 * والفخّ (ب) معكوسٌ عن قصد: فلو عدّ الحارسُ سطورَ القيود المحذوفة منطقياً
 * سطوراً يتيمة، أو أدخلها فى الميزان، **لسقط هنا خطأً**. أى أن الخطأ الذى
 * وقعتُ فيه **مرّتين فى جلسةٍ واحدة** (وأنتج فجوة ٢٢.٦٩ الوهمية) لا يمكن أن
 * يقع فى الحارس نفسه دون أن يُكشف.
 *
 * 🔒 **ولا يُضعَّف أى حارسٍ قائم لزرع الفخّ.** جُرّبت ثلاث محاولاتٍ ورُفضت
 *    كلها **بحقّ**، ولم يُلمس أىٌّ منها:
 *      ١) إضافة سطرٍ إلى قيدٍ مُرحَّل → «استعمل القيد العكسى».
 *      ٢) تعطيل فرض المُشغِّلات (`session_replication_role`) → صلاحية قاصرة.
 *      ٣) إنشاء قيدٍ مُرحَّلٍ غير متوازن → `ACCOUNTING_BALANCE_VIOLATION`.
 *    ⇒ **والثالثة أهمّها**: القاعدة نفسها تمنع القيد غير المتوازن بنيوياً،
 *      فلا يمكن زرعه أصلاً. وفحوص التوازن تبقى طبقةَ دفاعٍ ثانية (لو عُطِّل
 *      مُشغِّلٌ يوماً أو استُعيدت نسخةٌ معطوبة).
 *    ⇒ **القاعدة**: إن اضطرّك الفخُّ لإضعاف حماية، فالفخُّ خاطئ لا الحماية.
 *
 * ℹ️ وفحص «السطور بلا قيدٍ أب» **أثبتته الحقيقة لا فخّ**: أول تشغيلٍ له على
 *    الإنتاج كشف ٧٣٣ سطراً حقيقياً (٣٤٩ قيداً مفقوداً). ولا يمكن زرع نظيرها
 *    لأن المفتاح الأجنبى يمنعها — وهو الصواب.
 *
 * Usage: node scripts/selftest-ledger-integrity.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const { requireDbOrSkip } = require("./lib/selftest-db")
const testUrl = requireDbOrSkip("TEST_SUPABASE_DB_URL", "أنَّ حارسَ ترابطِ الدفاترِ يرفضُ قيداً مزروعاً غيرَ متوازن")

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

function runGuard() {
  const r = spawnSync(
    process.execPath,
    ["scripts/check-ledger-integrity.js", "--require-db"],
    { encoding: "utf8", env: { ...process.env, PRODUCTION_SUPABASE_DB_URL: testUrl } }
  )
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

/**
 * أسماء الفحوص الساقطة من خرج الحارس (الأسطر التى تبدأ بـ"  - ").
 *
 * 🔴 **ولماذا مقارنةٌ تفاضلية لا مطلقة؟**
 *
 * أول صياغةٍ لهذا الملف افترضت أن قاعدة الاختبار **نظيفة**، فاشترطت أن يمرّ
 * الحارس قبل الفخّ. وكان الافتراض خاطئاً: قاعدة الاختبار بها اختلالٌ حقيقى
 * قائم بين الأستاذ وFIFO (فرق ٠.١٤١٩) لا علاقة له بأى فخّ — والحارس يرصده
 * بحقّ. فسقط الفخّ المعكوس **لسببٍ سابقٍ عليه**.
 *
 * ⇒ الاختبار يقيس **ما أضافه الفخّ**، لا الحالة المطلقة. فتُلتقط قائمةُ
 *   الفحوص الساقطة قبل الفخّ، وتُقارن بما بعده: الفخّ الموجب يجب أن **يضيف**
 *   فحصاً بعينه، والمعكوس يجب ألّا **يضيف** شيئاً. وهكذا لا يتعطّل الاختبار
 *   بسبب دَينٍ قائمٍ فى بيانات الاختبار، ولا يتساهل معه.
 */
function failedChecks(output) {
  return new Set(
    String(output || "")
      .split("\n")
      .filter((l) => l.trimStart().startsWith("- "))
      .map((l) => l.trim().replace(/^-\s*/, "").split("(")[0].trim())
  )
}

function added(before, after) {
  return [...after].filter((x) => !before.has(x))
}

;(async () => {
  const client = new Client({ connectionString: testUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const results = []
  const softDeleted = []   // ما حُذف منطقياً أثناء الاختبار، ليُعاد كما كان

  async function softDelete(entryId) {
    await client.query(`UPDATE public.journal_entries SET is_deleted = true WHERE id = $1`, [entryId])
    softDeleted.push(entryId)
  }

  /**
   * يجرّب المرشّحين واحداً واحداً حتى **يسمح النظام** بحذف أحدهم منطقياً.
   *
   * ⚠️ ولا يُستثنى أى حارسٍ يرفض: المشروع يحمى قيوداً بعينها (قيد إيراد
   *    فاتورة مدفوعة مثلاً: `PAID_INVOICE_JE_PROTECTED`). فالفخّ يطلب الإذن
   *    ويقبل الرفض وينتقل، بدل أن يلتفّ على الحماية.
   */
  async function softDeleteFirstAllowed(ids) {
    for (const id of ids) {
      try { await softDelete(id); return id } catch { /* محمىّ — جرّب التالى */ }
    }
    return null
  }
  async function restore(entryId) {
    await client.query(`UPDATE public.journal_entries SET is_deleted = false WHERE id = $1`, [entryId])
  }

  try {
    // ── خطُّ الأساس: ما يسقط **قبل** أى فخّ ─────────────────────────────
    // قاعدة الاختبار قد تحمل دَيناً قائماً (وهى تحمله فعلاً: فرق ٠.١٤١٩ بين
    // الأستاذ وFIFO). الاختبار يقيس ما **أضافه** الفخّ لا الحالة المطلقة.
    const base = runGuard()
    const baseFails = failedChecks(base.output)
    if (baseFails.size > 0) {
      console.log(`! خطّ الأساس على قاعدة الاختبار به ${baseFails.size} فحصاً ساقطاً بالفعل:`)
      for (const f of baseFails) console.log(`    · ${f}`)
      console.log("  (دَينٌ قائمٌ فى بيانات الاختبار — يُقاس الفارق لا المطلق.)")
    }

    // ── الفخّ (أ): قيدٌ تشير إليه دفعة، يُحذف منطقياً ─────────────────────
    //     ⇒ يجب أن **يضيف** الحارسُ فحص «مستندات تشير إلى قيدٍ محذوف»،
    //       وألّا يضيف غيره: فلو أغفل شرط is_deleted لأضاف «سطور بلا قيدٍ أب»
    //       أو اختلال الميزان أيضاً.
    const { rows: withDoc } = await client.query(`
      SELECT DISTINCT p.journal_entry_id AS id
        FROM public.payments p
        JOIN public.journal_entries e ON e.id = p.journal_entry_id
       WHERE coalesce(e.is_deleted,false) = false
       LIMIT 20`)
    const aId = await softDeleteFirstAllowed(withDoc.map((x) => x.id))
    if (!aId) throw new Error("لم يسمح النظام بحذف أى قيدٍ مرتبطٍ بدفعة — تعذّر بناء الفخّ")
    let r = runGuard()
    results.push({
      probe: "مستندٌ يشير إلى قيدٍ محذوف",
      newFails: added(baseFails, failedChecks(r.output)),
      expectAdds: ["مستندات تشير إلى قيدٍ محذوف أو غير موجود"],
      output: r.output,
    })
    await restore(aId)

    // ── الفخّ (ب) المعكوس: قيدٌ لا يمسّ مستنداً ولا مخزوناً ──────────────
    //     ⇒ يجب ألّا **يضيف** الحارسُ شيئاً إطلاقاً.
    //
    //     ⚠️ وشرطُ استبعاد حسابات المخزون تعلّمتُه بالخطأ: أول صياغةٍ أهملته
    //        فحُذف قيدٌ مخزنى، فاختلّ تطابق الأستاذ مع FIFO **بحقّ**. ولم يكن
    //        ذلك خطأ الحارس بل خطأ الفخّ: أنشأ تناقضاً حقيقياً ثم لام كاشفه.
    const { rows: noDoc } = await client.query(`
      SELECT e.id
        FROM public.journal_entries e
       WHERE e.status = 'posted' AND coalesce(e.is_deleted,false) = false
         AND EXISTS (SELECT 1 FROM public.journal_entry_lines l WHERE l.journal_entry_id = e.id)
         AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.journal_entry_id = e.id)
         AND NOT EXISTS (SELECT 1 FROM public.inventory_transactions t WHERE t.journal_entry_id = e.id)
         AND NOT EXISTS (
               SELECT 1 FROM public.journal_entry_lines l
                 JOIN public.chart_of_accounts a ON a.id = l.account_id
                WHERE l.journal_entry_id = e.id
                  AND a.account_type = 'asset' AND a.sub_type = 'inventory')
       LIMIT 20`)
    const bId = await softDeleteFirstAllowed(noDoc.map((x) => x.id))
    if (!bId) {
      console.log("! تعذّر بناء الفخّ المعكوس (كل المرشّحين محميّون) — الفخّ (أ) وحده يُثبت الشرط.")
    } else {
      r = runGuard()
      results.push({
        probe: "قيدٌ محذوفٌ منطقياً بلا أثر",
        newFails: added(baseFails, failedChecks(r.output)),
        expectAdds: [],
        output: r.output,
      })
      await restore(bId)
    }
  } finally {
    // 🔴 الإعادة مضمونة مهما حدث: لا يبقى قيدٌ محذوفاً منطقياً بسبب الاختبار.
    for (const id of softDeleted) {
      try { await restore(id) } catch { /* تُحاوَل كلها */ }
    }
    await client.end()
  }

  let ok = true
  for (const r of results) {
    // مطابقةٌ متسامحة: يكفى أن يحتوى أحدهما الآخر. أول صياغةٍ اشترطت تطابقاً
    // حرفياً فسقط الاختبار لأن اسم الفحص فى الحارس يزيد بكلمتين («أو غير
    // موجود») — عطبٌ فى شرط الاختبار لا فى الحارس ولا فى المشروع.
    const like = (a, b) => a.includes(b) || b.includes(a)
    const missing = r.expectAdds.filter((x) => !r.newFails.some((y) => like(x, y)))
    const unexpected = r.newFails.filter((y) => !r.expectAdds.some((x) => like(x, y)))

    if (missing.length > 0) {
      console.error(
        `X الحارس لم يرصد ما زرعه الفخّ «${r.probe}»: ${missing.join("، ")}\n` +
          `  حارسٌ لا يسقط أبداً زينةٌ لا حماية.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
      continue
    }
    if (unexpected.length > 0) {
      console.error(
        `X الفخّ «${r.probe}» جعل الحارس يُبلّغ عن فحوصٍ زائدة: ${unexpected.join("، ")}\n` +
          `  السببان المحتملان — اقرأ الخرج قبل الحكم:\n` +
          `    ١) الحارس أغفل شرط is_deleted فعدّ القيدَ المحذوف كأنه غير موجود.\n` +
          `    ٢) الفخّ نفسه أنشأ تناقضاً حقيقياً — عندئذٍ أصلح الفخّ لا الحارس.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
      continue
    }
    console.log(
      `+ ${r.probe}: ` +
        (r.expectAdds.length > 0 ? "رُصد كما يجب، وبلا بلاغاتٍ زائدة" : "لم يُبلَّغ عنه كما يجب")
    )
  }

  if (!ok) process.exit(1)
  console.log("+ ledger-integrity guard proven to refuse - and proven to honour is_deleted (everything restored).")
})().catch((e) => {
  console.error(`X ledger-integrity self-test failed: ${e.message}`)
  process.exit(1)
})
