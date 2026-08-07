/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/journal-entries/[id]/approve — اعتماد مسودَّة قيدٍ يدوى
 *
 * v3.74.865 — **هذا المسار لم يكن موجوداً.**
 *
 * كان تعليقٌ فى `manual-journal-command.service.ts` (منذ v3.74.567) يَعِد بأن
 * المسودَّة «تُرحَّل بمستخدمٍ ثانٍ مخوَّل عبر تحديثٍ لاحق». وبالبحث فى
 * `app/api/journal-entries/` لم يكن ثمّة إلا مسارٌ واحد هو `manual` — **ولا
 * مسار اعتمادٍ ولا زرّ فى الواجهة**. أى أن المسودَّة، لو أمكن إنشاؤها، كانت
 * ستعلق مسودَّةً إلى الأبد.
 *
 * وهو ثالث موضعٍ فى إصدارين يصف فيه تعليقٌ آليةً غير قائمة — بعد ضمان
 * v3.74.252 فى ملفَّى الاسترداد (٨٦٤)، وتعليق «الجدول لا يملك is_approved»
 * فى `currency-service.ts` بينما السطر ٤٦٠ يكتبه.
 * ⇒ **التعليق يصف نيّةً؛ والسطر الذى تحته هو الضمان.**
 *
 * ── مصفوفة الاعتماد (قرار المالك، ٢٦ يوليو ٢٠٢٦) ──────────────────────────
 *   مُنشئ القيد          مَن يعتمده
 *   ─────────────────    ────────────────────────────
 *   المالك               (لا اعتماد — يُرحَّل فور إنشائه)
 *   المدير العام         **المالك وحده**
 *   محاسب الفرع          المالك أو المدير العام
 *
 * وفصل المهام مطلقٌ: **لا أحد يعتمد قيداً أنشأه بنفسه**، ولو كان مالكاً.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createServiceClient } from "@/lib/supabase/server"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const norm = (v: unknown) => String(v || "").trim().toLowerCase()

/** مَن يجوز أن يعتمد قيداً أنشأه صاحبُ هذا الدور. */
function approversFor(creatorRole: string): Set<string> {
  switch (norm(creatorRole)) {
    case "general_manager":
      return new Set(["owner"])
    case "accountant":
      return new Set(["owner", "admin", "general_manager"])
    default:
      // المالك لا يحتاج اعتماداً؛ وأى دورٍ آخر لا حقّ له فى القيد أصلاً،
      // فمسودَّته — إن وُجدت من إصدارٍ سابق — لا تُعتمد إلا بقرار المالك.
      return new Set(["owner"])
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  const approverRole = norm(context.member?.role)
  if (approverRole !== "owner" && approverRole !== "admin" && approverRole !== "general_manager") {
    return NextResponse.json(
      { error: "forbidden", message: "اعتماد القيود اليدوية للمالك والمدير العام فقط" },
      { status: 403 }
    )
  }

  const { id: entryId } = await ctx.params
  if (!entryId) {
    return NextResponse.json({ error: "bad_request", message: "معرّف القيد مفقود" }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── ١) القيد نفسه، مقيَّداً بالشركة الحالية (لا يُستدَل عليه من الجسم) ──
  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .select("id, company_id, branch_id, status, reference_type, entry_date, created_by, is_deleted")
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
      { error: "not_draft", message: `القيد حالته «${entry.status}» ولا يقبل الاعتماد` },
      { status: 409 }
    )
  }

  // ── ٢) فصل المهام: لا أحد يعتمد ما أنشأه ──────────────────────────────
  if (entry.created_by && String(entry.created_by) === String(context.user.id)) {
    return NextResponse.json(
      { error: "self_approval", message: "لا يجوز اعتماد قيدٍ أنشأته بنفسك" },
      { status: 403 }
    )
  }

  // ── ٣) مصفوفة الاعتماد بحسب دور المُنشئ وقت الاعتماد ──────────────────
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
  const allowed = approversFor(creatorRole)
  if (!allowed.has(approverRole)) {
    return NextResponse.json(
      {
        error: "approver_rank",
        message:
          (creatorRole === "general_manager" || creatorRole === "admin")
            ? "قيد المدير العام يعتمده المالك"
            : "ليس لك اعتماد هذا القيد",
      },
      { status: 403 }
    )
  }

  // ── ٤) الفترة المحاسبية ما زالت مفتوحة وقت الاعتماد، لا وقت الإنشاء ────
  try {
    await requireOpenFinancialPeriod(context.companyId, String(entry.entry_date))
  } catch (e: any) {
    return NextResponse.json(
      { error: "period_locked", message: e?.message || "الفترة المحاسبية مقفلة" },
      { status: 409 }
    )
  }

  // ── ٥) التوازن يُعاد فحصه قبل الترحيل ─────────────────────────────────
  //     المسودَّة قابلة للتعديل بين الإنشاء والاعتماد، فتوازنُها وقت
  //     الإنشاء لا يضمن توازنها الآن.
  const { data: lines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("debit_amount, credit_amount")
    .eq("journal_entry_id", entryId)

  if (linesError) {
    return NextResponse.json(
      { error: "lines_lookup_failed", message: `تعذّر قراءة سطور القيد: ${linesError.message}` },
      { status: 500 }
    )
  }
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "empty_entry", message: "القيد بلا سطور" }, { status: 409 })
  }

  const round6 = (n: number) => Math.round(n * 1e6) / 1e6
  const totalDebit = round6((lines || []).reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0))
  const totalCredit = round6((lines || []).reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0))
  if (totalDebit !== totalCredit) {
    return NextResponse.json(
      {
        error: "unbalanced",
        message: `القيد غير متوازن: مدين ${totalDebit} مقابل دائن ${totalCredit}`,
      },
      { status: 409 }
    )
  }
  if (totalDebit === 0) {
    return NextResponse.json({ error: "zero_entry", message: "القيد بقيمة صفر" }, { status: 409 })
  }

  // ── ٦) الترحيل — تغييرُ حالةٍ فقط، وهو ما يسمح به حارس الحقول الثابتة ──
  //     والشرط `.eq("status","draft")` يجعلها ذرّية: لو اعتمدها آخر بين
  //     القراءة والكتابة لم يُرحَّل القيد مرّتين.
  const { data: posted, error: postError } = await supabase
    .from("journal_entries")
    .update({
      status: "posted",
      posted_by: context.user.id,
      posted_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("company_id", context.companyId)
    .eq("status", "draft")
    .select("id")

  if (postError) {
    return NextResponse.json(
      { error: "post_failed", message: `تعذّر ترحيل القيد: ${postError.message}` },
      { status: 500 }
    )
  }
  if (!posted || posted.length === 0) {
    return NextResponse.json(
      { error: "race", message: "اعتُمد القيد بالفعل من مستخدمٍ آخر" },
      { status: 409 }
    )
  }

  return NextResponse.json({
    success: true,
    journalEntryId: entryId,
    status: "posted",
    approvedBy: context.user.id,
    totalDebit,
    totalCredit,
  })
}
