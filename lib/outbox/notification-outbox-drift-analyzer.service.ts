import type { NotificationOutboxDeliveryStatus } from "@/lib/outbox/domain-event-contract"
import {
  NotificationOutboxShadowDispatcherService,
  type NotificationOutboxShadowDispatchQuery,
  type ShadowDispatchItem,
  type ShadowDispatchNotificationIntent,
} from "@/lib/outbox/notification-outbox-shadow-dispatcher.service"
import { buildNotificationEventKey } from "@/lib/notification-workflow"

type SupabaseLike = any

type ActualNotificationRow = {
  id: string
  reference_type: string
  reference_id: string
  title: string | null
  message: string | null
  priority: "low" | "normal" | "high" | "urgent" | null
  status: string | null
  created_at: string
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  assigned_to_user: string | null
  assigned_to_role: string | null
  severity: "info" | "warning" | "error" | "critical" | null
  category: "finance" | "inventory" | "sales" | "approvals" | "system" | null
  event_key: string | null
  actioned_at: string | null
  expires_at: string | null
}

export type NotificationOutboxDriftMismatchCode =
  | "MISSING_NOTIFICATION"
  | "ORPHAN_NOTIFICATION"
  | "RECIPIENT_MISMATCH"
  | "SEVERITY_MISMATCH"
  | "CATEGORY_MISMATCH"
  | "PRIORITY_MISMATCH"
  | "DUPLICATE_EVENT_KEY"
  | "POLICY_GAP"
  | "UNBOUND_RUNTIME_DELIVERY"
  | "UNSUPPORTED_EVENT"
  | "INCONSISTENT_SUPERSEDE_BEHAVIOR"

export type NotificationOutboxDriftMismatch = {
  code: NotificationOutboxDriftMismatchCode
  message: string
  expected?: Record<string, unknown> | null
  actual?: Record<string, unknown> | null
}

export type NotificationOutboxDriftComparisonStatus =
  | "exact_match"
  | "drift_detected"
  | "policy_gap"
  | "unsupported"

export type NotificationOutboxDriftItem = {
  shadow: ShadowDispatchItem
  comparisonStatus: NotificationOutboxDriftComparisonStatus
  expectedIntentCount: number
  actualNotificationCount: number
  matchedIntentCount: number
  actualNotifications: ActualNotificationRow[]
  mismatches: NotificationOutboxDriftMismatch[]
}

export type NotificationOutboxDriftAnalysisResult = {
  summary: {
    evaluatedEvents: number
    exactMatchEvents: number
    driftDetectedEvents: number
    policyGapEvents: number
    unsupportedEvents: number
    totalMismatches: number
    missingNotifications: number
    orphanNotifications: number
    duplicateDeliveries: number
    supersedeWarnings: number
  }
  filters: {
    companyId: string
    eventType: string | null
    deliveryStatus: NotificationOutboxDeliveryStatus | null
    createdAfter: string | null
    cursor: string | null
    limit: number
    includeUnsupported: boolean
  }
  supportedEventTypes: readonly string[]
  nextCursor: string | null
  items: NotificationOutboxDriftItem[]
}

function referencePairKey(referenceType: string, referenceId: string) {
  return `${referenceType}:${referenceId}`
}

function eventFamilyPrefixFromIntent(intent: ShadowDispatchNotificationIntent) {
  return `${buildNotificationEventKey(
    intent.eventDomain,
    intent.referenceType,
    intent.referenceId,
    intent.eventAction
  )}:`
}

function eventFamilyPrefixFromShadowItem(item: ShadowDispatchItem) {
  if (item.notificationIntents[0]) {
    return eventFamilyPrefixFromIntent(item.notificationIntents[0])
  }

  if (item.candidatePolicy) {
    return `${buildNotificationEventKey(
      item.candidatePolicy.eventDomain,
      item.candidatePolicy.referenceType,
      item.candidatePolicy.referenceId,
      item.candidatePolicy.eventAction
    )}:`
  }

  return null
}

function isActiveNotificationStatus(status: string | null | undefined) {
  return status === "unread" || status === "read"
}

export class NotificationOutboxDriftAnalyzerService {
  private readonly shadowDispatcher: NotificationOutboxShadowDispatcherService

  constructor(private readonly supabase: SupabaseLike) {
    this.shadowDispatcher = new NotificationOutboxShadowDispatcherService(supabase)
  }

  async analyze(
    query: NotificationOutboxShadowDispatchQuery
  ): Promise<NotificationOutboxDriftAnalysisResult> {
    const shadowResult = await this.shadowDispatcher.simulate({
      ...query,
      includeUnsupported: query.includeUnsupported !== false,
    })

    const actualNotifications = await this.loadActualNotifications(
      query.companyId,
      shadowResult.items
    )

    const byReferencePair = new Map<string, ActualNotificationRow[]>()
    for (const notification of actualNotifications) {
      const key = referencePairKey(notification.reference_type, notification.reference_id)
      const current = byReferencePair.get(key) || []
      current.push(notification)
      byReferencePair.set(key, current)
    }

    const items = shadowResult.items.map((shadow) =>
      this.analyzeItem(
        shadow,
        byReferencePair.get(
          referencePairKey(
            shadow.notificationIntents[0]?.referenceType ||
              shadow.candidatePolicy?.referenceType ||
              shadow.aggregateType,
            shadow.notificationIntents[0]?.referenceId ||
              shadow.candidatePolicy?.referenceId ||
              shadow.aggregateId
          )
        ) || []
      )
    )

    return {
      summary: {
        evaluatedEvents: items.length,
        exactMatchEvents: items.filter((item) => item.comparisonStatus === "exact_match").length,
        driftDetectedEvents: items.filter((item) => item.comparisonStatus === "drift_detected").length,
        policyGapEvents: items.filter((item) => item.comparisonStatus === "policy_gap").length,
        unsupportedEvents: items.filter((item) => item.comparisonStatus === "unsupported").length,
        totalMismatches: items.reduce((sum, item) => sum + item.mismatches.length, 0),
        missingNotifications: items.reduce(
          (sum, item) => sum + item.mismatches.filter((m) => m.code === "MISSING_NOTIFICATION").length,
          0
        ),
        orphanNotifications: items.reduce(
          (sum, item) => sum + item.mismatches.filter((m) => m.code === "ORPHAN_NOTIFICATION").length,
          0
        ),
        duplicateDeliveries: items.reduce(
          (sum, item) => sum + item.mismatches.filter((m) => m.code === "DUPLICATE_EVENT_KEY").length,
          0
        ),
        supersedeWarnings: items.reduce(
          (sum, item) =>
            sum + item.mismatches.filter((m) => m.code === "INCONSISTENT_SUPERSEDE_BEHAVIOR").length,
          0
        ),
      },
      filters: shadowResult.filters,
      supportedEventTypes: shadowResult.supportedEventTypes,
      nextCursor: shadowResult.nextCursor,
      items,
    }
  }

  private async loadActualNotifications(
    companyId: string,
    shadowItems: ShadowDispatchItem[]
  ) {
    const referenceTypes = Array.from(
      new Set(
        shadowItems
          .map(
            (item) =>
              item.notificationIntents[0]?.referenceType || item.candidatePolicy?.referenceType || null
          )
          .filter(Boolean)
      )
    )
    const referenceIds = Array.from(
      new Set(
        shadowItems
          .map(
            (item) =>
              item.notificationIntents[0]?.referenceId || item.candidatePolicy?.referenceId || null
          )
          .filter(Boolean)
      )
    )

    if (referenceTypes.length === 0 || referenceIds.length === 0) {
      return [] as ActualNotificationRow[]
    }

    const oldestCreatedAt = shadowItems
      .map((item) => item.createdAt)
      .filter(Boolean)
      .sort()[0]

    let query = this.supabase
      .from("notifications")
      .select(`
        id,
        reference_type,
        reference_id,
        title,
        message,
        priority,
        status,
        created_at,
        branch_id,
        warehouse_id,
        cost_center_id,
        assigned_to_user,
        assigned_to_role,
        severity,
        category,
        event_key,
        actioned_at,
        expires_at
      `)
      .eq("company_id", companyId)
      .in("reference_type", referenceTypes)
      .in("reference_id", referenceIds)
      .order("created_at", { ascending: false })

    if (oldestCreatedAt) {
      query = query.gte("created_at", oldestCreatedAt)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message || "Failed to load actual notifications for drift analysis")
    }

    return Array.isArray(data) ? (data as ActualNotificationRow[]) : []
  }

  private analyzeItem(
    shadow: ShadowDispatchItem,
    actualNotifications: ActualNotificationRow[]
  ): NotificationOutboxDriftItem {
    if (shadow.simulationStatus === "unsupported") {
      return {
        shadow,
        comparisonStatus: "unsupported",
        expectedIntentCount: 0,
        actualNotificationCount: actualNotifications.length,
        matchedIntentCount: 0,
        actualNotifications,
        mismatches: [
          {
            code: "UNSUPPORTED_EVENT",
            message: `Event type (${shadow.eventType}) is not routed in shadow mode yet.`,
            expected: null,
            actual: { actualNotificationCount: actualNotifications.length },
          },
        ],
      }
    }

    if (shadow.simulationStatus === "needs_policy_binding") {
      const familyPrefix = eventFamilyPrefixFromShadowItem(shadow)
      const familyNotifications = familyPrefix
        ? actualNotifications.filter((notification) =>
            !notification.event_key || String(notification.event_key).startsWith(familyPrefix)
          )
        : []

      const mismatches: NotificationOutboxDriftMismatch[] = [
        {
          code: "POLICY_GAP",
          message: `Event type (${shadow.eventType}) is captured in the outbox but has no delivery policy binding yet.`,
          expected: {
            candidatePolicy: shadow.candidatePolicy,
            candidateRecipientCount: shadow.candidateRecipients.length,
          },
          actual: {
            runtimeNotificationsFound: familyNotifications.length,
          },
        },
      ]

      if (familyNotifications.length > 0) {
        mismatches.push({
          code: "UNBOUND_RUNTIME_DELIVERY",
          message:
            "Runtime notifications exist for an event family that shadow mode still classifies as an unbound policy gap.",
          expected: {
            eventFamilyPrefix: familyPrefix,
          },
          actual: {
            notificationIds: familyNotifications.map((notification) => notification.id),
            eventKeys: familyNotifications.map((notification) => notification.event_key),
          },
        })
      }

      return {
        shadow,
        comparisonStatus: "policy_gap",
        expectedIntentCount: 0,
        actualNotificationCount: familyNotifications.length,
        matchedIntentCount: 0,
        actualNotifications: familyNotifications,
        mismatches,
      }
    }

    const expectedIntents = shadow.notificationIntents
    const expectedEventKeys = new Set(expectedIntents.map((intent) => intent.eventKey))
    const familyPrefix = eventFamilyPrefixFromShadowItem(shadow)
    const familyNotifications = familyPrefix
      ? actualNotifications.filter((notification) =>
          !notification.event_key || String(notification.event_key).startsWith(familyPrefix)
        )
      : actualNotifications

    const mismatches: NotificationOutboxDriftMismatch[] = []
    let matchedIntentCount = 0

    for (const intent of expectedIntents) {
      const actualMatches = familyNotifications.filter(
        (notification) => notification.event_key === intent.eventKey
      )

      if (actualMatches.length === 0) {
        mismatches.push({
          code: "MISSING_NOTIFICATION",
          message: `No runtime notification exists for expected event key (${intent.eventKey}).`,
          expected: {
            eventKey: intent.eventKey,
            recipient: intent.recipient,
            severity: intent.severity,
            category: intent.category,
            priority: intent.priority,
          },
          actual: null,
        })
        continue
      }

      if (actualMatches.length > 1) {
        mismatches.push({
          code: "DUPLICATE_EVENT_KEY",
          message: `Multiple runtime notifications share the same event key (${intent.eventKey}).`,
          expected: { eventKey: intent.eventKey },
          actual: { notificationIds: actualMatches.map((item) => item.id) },
        })
      }

      const actual = actualMatches[0]
      matchedIntentCount += 1

      if (
        actual.assigned_to_user !== (intent.recipient.kind === "user" ? intent.recipient.userId : null) ||
        actual.assigned_to_role !== (intent.recipient.kind === "role" ? intent.recipient.role : null) ||
        (actual.branch_id || null) !== (intent.recipient.branchId || null) ||
        (actual.warehouse_id || null) !== (intent.recipient.warehouseId || null) ||
        (actual.cost_center_id || null) !== (intent.recipient.costCenterId || null)
      ) {
        mismatches.push({
          code: "RECIPIENT_MISMATCH",
          message: `Runtime notification recipient scope diverges from shadow intent for event key (${intent.eventKey}).`,
          expected: { recipient: intent.recipient },
          actual: {
            assignedToUser: actual.assigned_to_user,
            assignedToRole: actual.assigned_to_role,
            branchId: actual.branch_id,
            warehouseId: actual.warehouse_id,
            costCenterId: actual.cost_center_id,
          },
        })
      }

      if ((actual.severity || "info") !== intent.severity) {
        mismatches.push({
          code: "SEVERITY_MISMATCH",
          message: `Runtime notification severity diverges from shadow intent for event key (${intent.eventKey}).`,
          expected: { severity: intent.severity },
          actual: { severity: actual.severity || "info" },
        })
      }

      if ((actual.category || "system") !== intent.category) {
        mismatches.push({
          code: "CATEGORY_MISMATCH",
          message: `Runtime notification category diverges from shadow intent for event key (${intent.eventKey}).`,
          expected: { category: intent.category },
          actual: { category: actual.category || "system" },
        })
      }

      if ((actual.priority || "normal") !== intent.priority) {
        mismatches.push({
          code: "PRIORITY_MISMATCH",
          message: `Runtime notification priority diverges from shadow intent for event key (${intent.eventKey}).`,
          expected: { priority: intent.priority },
          actual: { priority: actual.priority || "normal" },
        })
      }
    }

    const orphanNotifications = familyNotifications.filter(
      (notification) => !expectedEventKeys.has(String(notification.event_key || ""))
    )

    if (orphanNotifications.length > 0) {
      mismatches.push({
        code: "ORPHAN_NOTIFICATION",
        message:
          "Runtime notifications exist inside the same event family but are not represented by the current shadow intent set.",
        expected: { expectedEventKeys: Array.from(expectedEventKeys) },
        actual: {
          notificationIds: orphanNotifications.map((notification) => notification.id),
          eventKeys: orphanNotifications.map((notification) => notification.event_key),
        },
      })
    }

    const activeFamilyNotifications = familyNotifications.filter((notification) =>
      isActiveNotificationStatus(notification.status)
    )
    if (activeFamilyNotifications.length > expectedIntents.length) {
      mismatches.push({
        code: "INCONSISTENT_SUPERSEDE_BEHAVIOR",
        message:
          "Active runtime notifications in the same event family exceed the expected shadow intent count, which suggests supersede drift or duplicate live delivery.",
        expected: { expectedActiveCount: expectedIntents.length },
        actual: {
          actualActiveCount: activeFamilyNotifications.length,
          notificationIds: activeFamilyNotifications.map((notification) => notification.id),
        },
      })
    }

    return {
      shadow,
      comparisonStatus: mismatches.length === 0 ? "exact_match" : "drift_detected",
      expectedIntentCount: expectedIntents.length,
      actualNotificationCount: familyNotifications.length,
      matchedIntentCount,
      actualNotifications: familyNotifications,
      mismatches,
    }
  }
}
