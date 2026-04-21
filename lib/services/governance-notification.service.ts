import { buildNotificationEventKey, normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"

type SupabaseLike = any

type GovernanceNotificationBaseParams = {
  companyId: string
  createdBy: string
}

type ReplayCommitIntentNotificationParams = GovernanceNotificationBaseParams & {
  intentId: string
  sourceTraceId: string
  eventType: string
  payloadVersion: string
  expiresAt: string
}

type ReplayExecutionActivationNotificationParams = GovernanceNotificationBaseParams & {
  executionId: string
  commitIntentId: string
  sourceTraceId: string
  eventType: string
  payloadVersion: string
  financialWritesPerformed: boolean
  executedAt: string
}

export class GovernanceNotificationService {
  constructor(private readonly supabase: SupabaseLike) {}

  async notifyReplayCommitIntentIssued(params: ReplayCommitIntentNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatch(
      params,
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "financial_replay_commit_intent",
        referenceId: params.intentId,
        title: "تم إصدار نية تنفيذ Replay مالية",
        message: `تم إصدار Replay Commit Intent للـtrace (${params.sourceTraceId}) الخاص بالحدث (${params.eventType}) بنسخة payload (${params.payloadVersion})، وصلاحيتها حتى ${params.expiresAt}.`,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: "replay_commit_intent_issued",
      },
      "⚠️ [GOVERNANCE_NOTIFICATION] Replay commit intent notification failed:"
    )
  }

  async notifyReplayExecutionActivated(params: ReplayExecutionActivationNotificationParams) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatch(
      params,
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "financial_replay_execution",
        referenceId: params.executionId,
        title: "تم تفعيل Replay مالية تحت الحوكمة",
        message: `تم تفعيل Replay Execution للـtrace (${params.sourceTraceId}) الخاص بالحدث (${params.eventType}) بنسخة payload (${params.payloadVersion}). الكتابات المالية المنفذة: ${params.financialWritesPerformed ? "نعم" : "لا"} حتى الآن. وقت التفعيل: ${params.executedAt}.`,
        priority: "high",
        severity: "info",
        category: "approvals",
        eventAction: "replay_execution_activated",
      },
      "⚠️ [GOVERNANCE_NOTIFICATION] Replay execution activation notification failed:"
    )
  }

  async notifyReplayPolicyViolation(params: GovernanceNotificationBaseParams & {
    violationId: string
    stage: "commit_intent" | "execution_activation"
    subjectId: string
    subjectType: "trace" | "idempotency_key" | "intent"
    reason: string
    uiSurface?: string | null
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatch(
      params,
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "financial_replay_policy_violation",
        referenceId: params.violationId,
        title: "تم حجب عملية Replay مالية",
        message: `تم حجب ${params.stage === "commit_intent" ? "إصدار Replay Commit Intent" : "تفعيل Replay Execution"} بسبب (${params.reason}) على ${params.subjectType} (${params.subjectId})${params.uiSurface ? ` من السطح ${params.uiSurface}` : ""}.`,
        priority: "high",
        severity: "warning",
        category: "approvals",
        eventAction: `${params.stage}_blocked_policy_violation`,
      },
      "⚠️ [GOVERNANCE_NOTIFICATION] Replay policy violation notification failed:"
    )
  }

  async notifyIntegrityAlertsDetected(params: GovernanceNotificationBaseParams & {
    companyScopeId: string
    cycleDate: string
    totalAlerts: number
    criticalCount: number
    warningCount: number
  }) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    await this.dispatch(
      params,
      resolver.resolveLeadershipVisibilityRecipients(),
      {
        referenceType: "financial_integrity_alert_summary",
        referenceId: params.companyScopeId,
        title: "نتائج فحص سلامة البيانات المالية",
        message: `نتيجة الفحص المجدول بتاريخ ${params.cycleDate}: إجمالي التنبيهات ${params.totalAlerts}، الحرجة ${params.criticalCount}، التحذيرات ${params.warningCount}.`,
        priority: params.criticalCount > 0 ? "high" : "normal",
        severity: params.criticalCount > 0 ? "warning" : "info",
        category: "approvals",
        eventAction: `scheduled_integrity_findings_${params.cycleDate}_${params.criticalCount}_${params.warningCount}_${params.totalAlerts}`,
      },
      "⚠️ [GOVERNANCE_NOTIFICATION] Integrity findings notification failed:"
    )
  }

  private async dispatch(
    params: GovernanceNotificationBaseParams,
    recipients: ResolvedNotificationRecipient[],
    payload: {
      referenceType: string
      referenceId: string
      title: string
      message: string
      priority: "low" | "normal" | "high" | "urgent"
      severity: "info" | "warning" | "error" | "critical"
      category: "finance" | "inventory" | "sales" | "approvals" | "system"
      eventAction: string
    },
    warningLabel: string
  ) {
    const resolver = new NotificationRecipientResolverService(this.supabase)
    for (const recipient of recipients) {
      const { error } = await this.supabase.rpc("create_notification", {
        p_company_id: params.companyId,
        p_reference_type: payload.referenceType,
        p_reference_id: payload.referenceId,
        p_title: payload.title,
        p_message: payload.message,
        p_created_by: params.createdBy,
        p_branch_id: recipient.branchId ?? null,
        p_cost_center_id: recipient.costCenterId ?? null,
        p_warehouse_id: recipient.warehouseId ?? null,
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
        console.error(warningLabel, error.message)
      }
    }
  }
}
