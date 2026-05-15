/**
 * Approval History — Helper Functions
 * Phase R2: Approval History Infrastructure
 *
 * يُستخدم server-side فقط (API routes).
 * لا يُستخدم من client components مباشرة.
 */

// ── Types ────────────────────────────────────────────────────

export type ApprovalReferenceType =
  | "bom_version"
  | "routing"
  | "production_order"
  | "material_issue"
  | "product_receive"

export type ApprovalAction =
  | "submitted"
  | "re_submitted"
  | "approved"
  | "approved_management"
  | "approved_warehouse"
  | "rejected"
  | "rejected_management"
  | "edit_triggered_reapproval"
  | "cancelled"

export interface ApprovalHistoryEntry {
  id: string
  cycle_no: number
  action: ApprovalAction
  actor_id: string
  actor_role: string
  reason: string | null
  snapshot_data: Record<string, unknown> | null
  created_at: string
}

export interface RecordApprovalParams {
  supabase: any
  companyId: string
  referenceType: ApprovalReferenceType
  referenceId: string
  cycleNo: number
  action: ApprovalAction
  actorId: string
  actorRole: string
  reason?: string | null
  snapshotData?: Record<string, unknown> | null
  branchId?: string | null
}

// ── Functions ────────────────────────────────────────────────

/**
 * تسجيل إجراء اعتماد في approval_history.
 * يُستخدم في كل API route تُجري approve/reject/submit.
 *
 * آمن: try/catch صامت — فشل التسجيل لا يفشل العملية الأصلية.
 */
export async function recordApprovalAction(
  params: RecordApprovalParams
): Promise<string | null> {
  const {
    supabase, companyId, referenceType, referenceId,
    cycleNo, action, actorId, actorRole,
    reason = null, snapshotData = null, branchId = null,
  } = params

  try {
    const { data, error } = await supabase.rpc("record_approval_action", {
      p_company_id:     companyId,
      p_reference_type: referenceType,
      p_reference_id:   referenceId,
      p_cycle_no:       cycleNo,
      p_action:         action,
      p_actor_id:       actorId,
      p_actor_role:     actorRole,
      p_reason:         reason,
      p_snapshot_data:  snapshotData,
      p_branch_id:      branchId,
    })

    if (error) {
      console.error("[ApprovalHistory] Failed to record action:", error.message)
      return null
    }

    return data as string
  } catch (err: any) {
    console.error("[ApprovalHistory] Unexpected error:", err?.message)
    return null
  }
}

/**
 * جلب التاريخ الكامل لدورات اعتماد سجل معين.
 * مرتّب من الأقدم للأحدث.
 */
export async function getApprovalHistory(
  supabase: any,
  companyId: string,
  referenceType: ApprovalReferenceType,
  referenceId: string
): Promise<ApprovalHistoryEntry[]> {
  try {
    const { data, error } = await supabase.rpc("get_approval_history", {
      p_company_id:     companyId,
      p_reference_type: referenceType,
      p_reference_id:   referenceId,
    })

    if (error) {
      console.error("[ApprovalHistory] Failed to fetch history:", error.message)
      return []
    }

    return (data ?? []) as ApprovalHistoryEntry[]
  } catch (err: any) {
    console.error("[ApprovalHistory] Unexpected error:", err?.message)
    return []
  }
}

/**
 * بناء snapshotData قياسي عند تغيير حالة سجل.
 * يُخزَّن لأغراض الـ audit.
 */
export function buildApprovalSnapshot(params: {
  statusBefore: string
  statusAfter: string
  extraFields?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    status_before: params.statusBefore,
    status_after:  params.statusAfter,
    timestamp:     new Date().toISOString(),
    ...params.extraFields,
  }
}

/**
 * الحصول على رقم الدورة التالية لسجل معين.
 * يُستخدم عند إعادة الدورة بسبب تعديل.
 */
export async function getNextCycleNo(
  supabase: any,
  companyId: string,
  referenceType: ApprovalReferenceType,
  referenceId: string
): Promise<number> {
  try {
    const { data } = await supabase
      .from("approval_history")
      .select("cycle_no")
      .eq("company_id", companyId)
      .eq("reference_type", referenceType)
      .eq("reference_id", referenceId)
      .order("cycle_no", { ascending: false })
      .limit(1)
      .maybeSingle()

    return ((data?.cycle_no ?? 0) as number) + 1
  } catch {
    return 1
  }
}

/**
 * دالة مساعدة: هل الإجراء يعني رفض؟
 */
export function isRejectionAction(action: ApprovalAction): boolean {
  return action === "rejected" || action === "rejected_management"
}

/**
 * دالة مساعدة: هل الإجراء يعني موافقة نهائية؟
 */
export function isFinalApprovalAction(action: ApprovalAction): boolean {
  return action === "approved" || action === "approved_warehouse"
}

// ── Label helpers (for UI display) ──────────────────────────

export const APPROVAL_ACTION_LABELS: Record<ApprovalAction, { ar: string; en: string; color: string }> = {
  submitted:                 { ar: "أُرسل للاعتماد",          en: "Submitted",              color: "text-blue-600" },
  re_submitted:              { ar: "أُعيد إرساله",            en: "Re-submitted",           color: "text-blue-500" },
  approved:                  { ar: "مُوافَق عليه",            en: "Approved",               color: "text-green-600" },
  approved_management:       { ar: "اعتماد الإدارة",          en: "Mgmt. Approved",         color: "text-green-500" },
  approved_warehouse:        { ar: "تنفيذ المخزن",            en: "Warehouse Issued",       color: "text-emerald-600" },
  rejected:                  { ar: "مرفوض",                   en: "Rejected",               color: "text-red-600" },
  rejected_management:       { ar: "مرفوض من الإدارة",        en: "Mgmt. Rejected",         color: "text-red-500" },
  edit_triggered_reapproval: { ar: "تعديل أعاد دورة الاعتماد", en: "Edit → Re-approval",    color: "text-amber-600" },
  cancelled:                 { ar: "ملغى",                    en: "Cancelled",              color: "text-gray-500" },
}

export const REFERENCE_TYPE_LABELS: Record<ApprovalReferenceType, { ar: string; en: string }> = {
  bom_version:       { ar: "قائمة المواد",      en: "BOM Version" },
  routing:           { ar: "مسار التصنيع",      en: "Routing" },
  production_order:  { ar: "أمر الإنتاج",       en: "Production Order" },
  material_issue:    { ar: "طلب صرف مواد",     en: "Material Issue" },
  product_receive:   { ar: "استلام منتج نهائي", en: "Product Receive" },
}
