/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/journal-entries/[id]/reject — ردّ مسودَّة قيدٍ يدوى إلى مُنشئها
 *
 * v3.74.866 — قرار المالك (٢٦ يوليو ٢٠٢٦): **الرفض إعادةٌ لا إعدام.**
 *
 * فالقيد المرفوض غالباً خطأٌ يسير — حسابٌ مغلوط أو وصفٌ ناقص — والمحاسب
 * أدرى بتصحيحه من إعادة إدخاله من أوله. ولذلك:
 *
 *   • تبقى الحالة `draft` كما هى، فلا يُحذف عملُ أحد ولا يُفقد سطر.
 *   • يُسجَّل الرفض وسببُه ومُحدِّدُه فى **أثر التدقيق** — الذى صار يعمل
 *     فعلاً منذ ٨٦٥ بعد أن كانت أعمدته وهمية.
 *   • يصل المُنشئ إشعارٌ شخصىّ بالسبب.
 *
 * ولا حاجة لحالةٍ ثالثة على `journal_entries` ولا لعمود سبب: إدخال حالةٍ
 * جديدة على جدول القيود يُلزم **كل تقريرٍ وكل فحصٍ قائم** باستيعابها، وهو
 * ثمنٌ باهظ لمعلومةٍ يحملها أثر التدقيق أصلاً.
 *
 * ── مَن يرفض؟ ─────────────────────────────────────────────────────────────
 * نفس مصفوفة الاعتماد بالضبط. فمَن لا يملك أن يقول «نعم» لا يملك أن يقول
 * «لا» — ولو اختلفت الصلاحيتان لأمكن لمن لا يعتمد أن يُعطّل.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"

const norm = (v: unknown) => String(v || "").trim().toLowerCase()

/** يطابق `approversFor` فى مسار الاعتماد حرفاً بحرف. */
function approversFor(creatorRole: string): Set<string> {
  switch (norm(creatorRole)) {
    case "accountant":
      return new Set(["owner", "admin"])
    default:
      return new Set(["owner"])
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const approverRole = norm(context.member?.role)
  if (approverRole !== "owner" && approverRole !== "admin" ) {
    return NextResponse.json(
      { error: "forbidden", message: "رفض القيود اليدوية للمالك والمدير العام فقط" },
      { status: 403 }
    )
  }

  const { id: entryId } = await ctx.params
  if (!entryId) {
    return NextResponse.json({ error: "bad_request", message: "معرّف القيد مفقود" }, { status: 400 })
  }

  let body: any = {}
  try { body = await request.json() } catch { body = {} }
  const reason = String(body?.reason || "").trim()
  if (reason.length < 3) {
    return NextResponse.json(
      { error: "reason_required", message: "سبب الرفض مطلوب — فالمُنشئ يحتاج أن يعرف ما يُصحِّح" },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .select("id, company_id, branch_id, status, reference_type, entry_date, description, created_by, is_deleted")
    .eq("id", entryId)
    .eq("company_id", context.companyId)
    .maybeSingle()

  if (entryError) {
    return NextResponse.json(
      { error: "lookup_failed", message: `تعذّر قراءة القيد: ${entryError.message}` },
      { status: 500 }
    )
  }
  if (!entry || entry.is_deleted) {
    return NextResponse.json({ error: "not_found", message: "القيد غير موجود" }, { status: 404 })
  }
  if (entry.reference_type !== "manual_entry") {
    return NextResponse.json(
      { error: "not_manual", message: "هذا المسار للقيود اليدوية وحدها" },
      { status: 400 }
    )
  }
  if (entry.status !== "draft") {
    return NextResponse.json(
      { error: "not_draft", message: `القيد حالته «${entry.status}» ولا يُردّ` },
      { status: 409 }
    )
  }
  if (entry.created_by && String(entry.created_by) === String(context.user.id)) {
    return NextResponse.json(
      { error: "self_rejection", message: "لا يجوز ردّ قيدٍ أنشأته بنفسك — احذف المسودَّة أو صحّحها" },
      { status: 403 }
    )
  }

  let creatorRole = ""
  if (entry.created_by) {
    const { data: creator } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", context.companyId)
      .eq("user_id", entry.created_by)
      .maybeSingle()
    creatorRole = norm(creator?.role)
  }
  if (!approversFor(creatorRole).has(approverRole)) {
    return NextResponse.json(
      {
        error: "approver_rank",
        message:
          (creatorRole === "admin")
            ? "قيد المدير العام يردّه المالك"
            : "ليس لك ردّ هذا القيد",
      },
      { status: 403 }
    )
  }

  // ── الرفض نفسه: أثر تدقيقٍ لا تغييرَ حالة ─────────────────────────────
  // وهذه الكتابة **تُفحص وتُرفع عند الفشل** — على خلاف مسار الاعتماد حيث
  // التسجيل ثانوىٌّ بعد ترحيلٍ تمّ. فهنا الأثرُ هو الفعلُ كلّه: لو ضاع،
  // لم يبق للرفض وجود، ورأى المُعتمِد قيداً «لم يُرفض» فاعتمده.
  const { error: auditError } = await supabase.from("audit_logs").insert({
    company_id: context.companyId,
    user_id: context.user.id,
    action: "manual_journal_rejected",
    entity: "journal_entry",
    entity_id: entryId,
    branch_id: entry.branch_id ?? null,
    reason,
    old_data: { status: "draft" },
    new_data: { status: "draft", returned_to: entry.created_by ?? null },
    metadata: {
      entry_date: entry.entry_date,
      description: entry.description,
      creator_role: creatorRole || null,
      rejected_at: new Date().toISOString(),
    },
  })

  if (auditError) {
    return NextResponse.json(
      {
        error: "audit_write_failed",
        message: `تعذّر تسجيل الرفض فلم يُنفَّذ: ${auditError.message}`,
      },
      { status: 500 }
    )
  }

  // إشعارٌ شخصىّ للمُنشئ. غير حَرِج — الرفض مُسجَّل بالفعل أعلاه — لكنه
  // لا يصمت عند الفشل.
  if (entry.created_by) {
    const { error: notifyError } = await supabase.from("notifications").insert({
      company_id: context.companyId,
      reference_type: "manual_journal",
      reference_id: entryId,
      title: "تم ردّ القيد اليدوى للمراجعة",
      message: `القيد «${entry.description || entryId.slice(0, 8)}» أُعيد إليك للتصحيح. السبب: ${reason}`,
      created_by: context.user.id,
      assigned_to_user: entry.created_by,
      priority: "high",
      severity: "warning",
      category: "approvals",
      event_key: `manual_journal:${entryId}:rejected:user:${entry.created_by}`,
      status: "unread",
    })
    if (notifyError) {
      console.error(
        `MANUAL_JOURNAL_REJECT_NOTIFY_FAILED: entry=${entryId} creator=${entry.created_by} — ${notifyError.message}`
      )
    }
  }

  return NextResponse.json({
    success: true,
    journalEntryId: entryId,
    status: "draft",
    returnedTo: entry.created_by ?? null,
    rejectedBy: context.user.id,
    reason,
  })
}
