/**
 * financial-trace.ts
 * ---------------------------------------------------------------------------
 * v3.74.877 — دالتان تُنهيان صمت واحدٍ وثلاثين موضعاً.
 *
 * أثرُ العملية المالية (`financial_operation_traces` وروابطها) هو ما يُجيب
 * لاحقاً عن سؤال: **أى مستندٍ نتج عن أى عملية؟** وكان يُكتب فى ثلاثة عشر
 * خدمةً بشكلين متكرّرين، **وكلاهما يُهمل نتيجته**:
 *
 *     await admin.from("financial_operation_trace_links").upsert({ … })
 *     await admin.from("financial_operation_trace_links").delete().eq(…)
 *     await admin.from("financial_operation_traces").delete().eq(…)
 *
 * وsupabase-js **يُرجع** `{ error }` ولا يرمى — فالفشل يمرّ بلا أثر.
 *
 * ولمَ دالةٌ مشتركة بدل ترقيع كل موضع؟ لأن السابقة قائمة ونجحت:
 * `rollback-journal-entry.ts` أُنشئت فى v3.74.756 لهذا الغرض بعينه فأنهت
 * صمت ستة مواضع دفعةً واحدة. ⇒ **الشكل المتكرّر يُعالَج بدالةٍ لا بنسخٍ
 * متكرّر للعلاج.**
 *
 * ── قاعدة الرفع مقابل التسجيل (درس ٨٦٤) ────────────────────────────────
 *   `linkTraceEntity`  مسارٌ يمضى للأمام ⇒ **يُرفع**. فرابطٌ مفقود يعنى
 *                      مستنداً لا يمكن ردُّه إلى عمليته، والعملية ما زالت
 *                      قابلةً للإلغاء عند هذه النقطة.
 *   `purgeTrace`       مسارُ تراجُع ⇒ **يُسجَّل ولا يُرفع**، كى لا يُخفى
 *                      الخطأ الأصلى الذى بدأ التراجُع. لكنه **لا يصمت**.
 * ---------------------------------------------------------------------------
 */

type SupabaseLike = any

/**
 * يربط كياناً بأثر العملية.
 *
 * @throws إذا فشل الربط — بمعرّفاتٍ تكفى لإصلاحه يدوياً.
 */
export async function linkTraceEntity(
  admin: SupabaseLike,
  params: {
    traceId: string
    entityType: string
    entityId: string
    linkRole: string
    referenceType: string
  }
): Promise<void> {
  const { error } = await admin
    .from("financial_operation_trace_links")
    .upsert(
      {
        transaction_id: params.traceId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        link_role: params.linkRole,
        reference_type: params.referenceType,
      },
      { onConflict: "transaction_id,entity_type,entity_id" }
    )

  if (error) {
    throw new Error(
      `TRACE_LINK_FAILED: trace ${params.traceId} → ${params.entityType} ${params.entityId} ` +
      `(${params.linkRole}) — ${error.message}`
    )
  }
}

/**
 * يمسح أثر العملية وروابطه بعد فشلها.
 *
 * **لا يرمى أبداً.** يُستدعى من داخل `catch`، ورفعُ خطأٍ هناك يُخفى السبب
 * الأصلى. ويُسجَّل الفشل بمعرّف العملية كى يُنظَّف يدوياً.
 *
 * @returns true إذا مُسح الاثنان.
 */
export async function purgeTrace(
  admin: SupabaseLike,
  traceId: string | null | undefined,
  context: string
): Promise<boolean> {
  if (!traceId) return true

  let clean = true

  const { error: linksError } = await admin
    .from("financial_operation_trace_links")
    .delete()
    .eq("transaction_id", traceId)

  if (linksError) {
    clean = false
    console.error(
      `TRACE_PURGE_LINKS_FAILED: ${context} — trace ${traceId} kept its links after a failed ` +
      `operation — ${linksError.message}`
    )
  }

  const { error: traceError } = await admin
    .from("financial_operation_traces")
    .delete()
    .eq("transaction_id", traceId)

  if (traceError) {
    clean = false
    console.error(
      `TRACE_PURGE_FAILED: ${context} — trace ${traceId} survived a failed operation — ` +
      traceError.message
    )
  }

  return clean
}
