import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type BaseParams = {
  companyId: string
  changedBy: string
  appLang?: "ar" | "en"
}

type RoleChangedParams = BaseParams & {
  userId: string
  oldRole: string
  newRole: string
  branchId?: string | null
  warehouseId?: string | null
  costCenterId?: string | null
}

type BranchChangedParams = BaseParams & {
  userId: string
  branchId?: string | null
  branchName?: string | null
  role?: string | null
  warehouseId?: string | null
  costCenterId?: string | null
}

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  owner: { ar: "مالك", en: "Owner" },
  admin: { ar: "مدير عام", en: "Admin" },
  general_manager: { ar: "مدير عام تنفيذي", en: "General Manager" },
  manager: { ar: "مدير", en: "Manager" },
  accountant: { ar: "محاسب", en: "Accountant" },
  store_manager: { ar: "مسؤول مخزن", en: "Store Manager" },
  staff: { ar: "موظف", en: "Staff" },
  viewer: { ar: "عرض فقط", en: "Viewer" },
}

function normalizeLanguage(appLang?: "ar" | "en") {
  return appLang === "en" ? "en" : "ar"
}

function getRoleLabel(role: string, lang: "ar" | "en") {
  const normalizedRole = String(role || "").trim().toLowerCase()
  const label = ROLE_LABELS[normalizedRole]
  if (label) {
    return lang === "en" ? label.en : label.ar
  }

  return normalizedRole || (lang === "en" ? "Unknown role" : "دور غير معروف")
}

function sanitizeKeySegment(value: string | null | undefined) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
}

export class UserGovernanceNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyRoleChanged(params: RoleChangedParams) {
    const appLang = normalizeLanguage(params.appLang)
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipient = resolver.resolveUserRecipient(
      params.userId,
      params.newRole,
      params.branchId || null,
      params.warehouseId || null,
      params.costCenterId || null
    )

    await this.archiveOpenNotifications(params.companyId, "user_role_change", params.userId)

    await this.createNotification(
      params,
      recipient,
      {
        referenceType: "user_role_change",
        referenceId: params.userId,
        title: appLang === "en" ? "Your Role Has Changed" : "تم تغيير دورك",
        message:
          appLang === "en"
            ? `Your role has been changed from ${getRoleLabel(params.oldRole, "en")} to ${getRoleLabel(params.newRole, "en")}.`
            : `تم تغيير دورك من ${getRoleLabel(params.oldRole, "ar")} إلى ${getRoleLabel(params.newRole, "ar")}.`,
        priority: "normal",
        severity: "info",
        category: "system",
        eventAction: `changed_to_${sanitizeKeySegment(params.newRole)}`,
      }
    )
  }

  async notifyBranchChanged(params: BranchChangedParams) {
    const appLang = normalizeLanguage(params.appLang)
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const recipient = resolver.resolveUserRecipient(
      params.userId,
      params.role || null,
      params.branchId || null,
      params.warehouseId || null,
      params.costCenterId || null
    )

    await this.archiveOpenNotifications(params.companyId, "user_branch_change", params.userId)

    await this.createNotification(
      params,
      recipient,
      {
        referenceType: "user_branch_change",
        referenceId: params.userId,
        title: appLang === "en" ? "Your Branch Has Changed" : "تم تغيير فرعك",
        message:
          appLang === "en"
            ? `Your assigned branch has been changed${params.branchName ? ` to ${params.branchName}` : ""}.`
            : `تم تغيير الفرع المخصص لك${params.branchName ? ` إلى ${params.branchName}` : ""}.`,
        priority: "normal",
        severity: "info",
        category: "system",
        eventAction: `changed_to_${sanitizeKeySegment(params.branchId || "none")}`,
      }
    )
  }

  private async archiveOpenNotifications(companyId: string, referenceType: string, referenceId: string) {
    const { error } = await this.supabase
      .from("notifications")
      .update({
        status: "actioned",
        actioned_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("reference_type", referenceType)
      .eq("reference_id", referenceId)
      .in("status", ["unread", "read"])

    if (error) {
      console.error("[USER_GOVERNANCE_NOTIFICATION] Failed to archive previous notifications:", error.message)
    }
  }

  private async createNotification(
    params: BaseParams & {
      branchId?: string | null
      warehouseId?: string | null
      costCenterId?: string | null
    },
    recipient: ResolvedNotificationRecipient,
    payload: {
      referenceType: string
      referenceId: string
      title: string
      message: string
      priority: "low" | "normal" | "high" | "urgent"
      severity: "info" | "warning" | "error" | "critical"
      category: "finance" | "inventory" | "sales" | "approvals" | "system"
      eventAction: string
    }
  ) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    const { error } = await this.supabase.rpc("create_notification", {
      p_company_id: params.companyId,
      p_reference_type: payload.referenceType,
      p_reference_id: payload.referenceId,
      p_title: payload.title,
      p_message: payload.message,
      p_created_by: params.changedBy,
      p_branch_id: recipient.branchId ?? params.branchId ?? null,
      p_cost_center_id: recipient.costCenterId ?? params.costCenterId ?? null,
      p_warehouse_id: recipient.warehouseId ?? params.warehouseId ?? null,
      p_assigned_to_role: recipient.kind === "role" ? recipient.role : null,
      p_assigned_to_user: recipient.kind === "user" ? recipient.userId : null,
      p_priority: payload.priority,
      p_event_key: buildNotificationEventKey(
        "governance",
        payload.referenceType,
        payload.referenceId,
        payload.eventAction,
        ...resolver.buildRecipientScopeSegments(recipient)
      ),
      p_severity: normalizeNotificationSeverity(payload.severity),
      p_category: payload.category,
    })

    if (error) {
      throw new Error(error.message || "Failed to dispatch user governance notification")
    }
  }
}
