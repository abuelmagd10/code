import {
  NotificationOutboxActivationGateService,
  type NotificationDispatcherMode,
} from "@/lib/outbox/notification-outbox-activation-gate.service"
import { normalizeNotificationSeverity } from "@/lib/notification-workflow"
import {
  isSupportedNotificationOutboxCanaryEventType,
  resolveNotificationOutboxBaselineCreatedAfter,
  resolveNotificationOutboxDeadLetterPolicy,
  resolveNotificationDispatcherMode,
} from "@/lib/outbox/notification-outbox-activation-policy"
import {
  NotificationOutboxShadowDispatcherService,
  type ShadowDispatchItem,
} from "@/lib/outbox/notification-outbox-shadow-dispatcher.service"

type SupabaseLike = any

type PendingOutboxEventRow = {
  event_id: string
  tenant_id: string
  event_type: string
  delivery_status: string
  delivery_attempts: number
  available_at: string | null
  context: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

type DispatchIntentResult = {
  eventKey: string
  action: "claimed_existing" | "created"
  notificationId: string | null
}

type DispatchSuccessSummary = {
  mode: "active_canary"
  actorId: string | null
  deliveryMethod: "claimed_existing" | "created_notification"
  notificationCount: number
  existingClaimCount: number
  eventKeys: string[]
}

export type NotificationOutboxDispatchEventResult = {
  eventId: string
  eventType: string
  mode: NotificationDispatcherMode
  status: "dispatched" | "failed" | "skipped"
  deliveryMethod: "claimed_existing" | "created_notification" | "none"
  notificationCount: number
  existingClaimCount: number
  error: string | null
  eventKeys: string[]
}

export type NotificationOutboxDispatchRunResult = {
  mode: "active_canary"
  companyId: string
  requestedEventType: string | null
  limit: number
  processedEvents: number
  dispatchedEvents: number
  failedEvents: number
  skippedEvents: number
  createdNotifications: number
  claimedExistingNotifications: number
  gateSnapshot: Array<{
    eventType: string
    recommendedMode: NotificationDispatcherMode
    gateStatus: string
    dispatcherActivationAllowed: boolean
    blockers: string[]
  }>
  results: NotificationOutboxDispatchEventResult[]
}

function asNullableString(value: unknown) {
  const normalized = String(value || "").trim()
  return normalized || null
}

export class NotificationOutboxDispatcherService {
  private readonly gateService: NotificationOutboxActivationGateService
  private readonly shadowDispatcher: NotificationOutboxShadowDispatcherService
  private readonly deadLetterPolicy = resolveNotificationOutboxDeadLetterPolicy()

  constructor(private readonly supabase: SupabaseLike) {
    this.gateService = new NotificationOutboxActivationGateService(supabase)
    this.shadowDispatcher = new NotificationOutboxShadowDispatcherService(supabase)
  }

  async dispatchCanary(input: {
    companyId: string
    eventType?: string | null
    limit?: number
    actorId?: string | null
  }): Promise<NotificationOutboxDispatchRunResult> {
    const limit = Math.min(Math.max(Number(input.limit || 25), 1), 100)
    const requestedEventType = asNullableString(input.eventType)

    if (requestedEventType && !isSupportedNotificationOutboxCanaryEventType(requestedEventType)) {
      throw new Error(
        `OUTBOX_CANARY_EVENT_TYPE_NOT_SUPPORTED: ${requestedEventType}`
      )
    }

    const gate = await this.gateService.evaluate({
      companyId: input.companyId,
      eventType: requestedEventType,
      limit: 200,
      includeUnsupported: true,
    })

    const eligibleFamilies = gate.policies.filter((policy) => {
      if (!isSupportedNotificationOutboxCanaryEventType(policy.eventType)) {
        return false
      }
      const mode = resolveNotificationDispatcherMode({
        companyId: input.companyId,
        eventType: policy.eventType,
      })
      return (
        mode === "active_canary" &&
        policy.dispatcherActivationAllowed &&
        policy.recommendedMode === "activation_candidate"
      )
    })

    if (eligibleFamilies.length === 0) {
      throw new Error(
        requestedEventType
          ? `OUTBOX_CANARY_NOT_ALLOWED: event_type_${requestedEventType}_has_no_activation_candidate_policy`
          : "OUTBOX_CANARY_NOT_ALLOWED: no event family is currently eligible for canary dispatch"
      )
    }

    const pendingRows = await this.loadPendingEvents(
      input.companyId,
      eligibleFamilies.map((family) => ({
        eventType: family.eventType,
        createdAfter: resolveNotificationOutboxBaselineCreatedAfter(family.eventType),
      })),
      limit
    )

    if (pendingRows.length === 0) {
      return {
        mode: "active_canary",
        companyId: input.companyId,
        requestedEventType,
        limit,
        processedEvents: 0,
        dispatchedEvents: 0,
        failedEvents: 0,
        skippedEvents: 0,
        createdNotifications: 0,
        claimedExistingNotifications: 0,
        gateSnapshot: eligibleFamilies.map((policy) => ({
          eventType: policy.eventType,
          recommendedMode: policy.recommendedMode,
          gateStatus: policy.gateStatus,
          dispatcherActivationAllowed: policy.dispatcherActivationAllowed,
          blockers: policy.blockers,
        })),
        results: [],
      }
    }

    const shadowByEventId = new Map(
      (
        await this.shadowDispatcher.simulateByEventIds({
          companyId: input.companyId,
          eventIds: pendingRows.map((row) => row.event_id),
          includeUnsupported: true,
        })
      ).map((item) => [item.eventId, item])
    )

    const results: NotificationOutboxDispatchEventResult[] = []
    let createdNotifications = 0
    let claimedExistingNotifications = 0

    for (const row of pendingRows) {
      const shadow = shadowByEventId.get(row.event_id)
      const mode = resolveNotificationDispatcherMode({
        companyId: input.companyId,
        eventType: row.event_type,
      })

      if (mode !== "active_canary") {
        results.push({
          eventId: row.event_id,
          eventType: row.event_type,
          mode,
          status: "skipped",
          deliveryMethod: "none",
          notificationCount: 0,
          existingClaimCount: 0,
          error: "Event family is not enabled for canary dispatch",
          eventKeys: [],
        })
        continue
      }

      const claimed = await this.claimForProcessing(row)
      if (!claimed) {
        results.push({
          eventId: row.event_id,
          eventType: row.event_type,
          mode,
          status: "skipped",
          deliveryMethod: "none",
          notificationCount: 0,
          existingClaimCount: 0,
          error: "Event could not be claimed for processing",
          eventKeys: [],
        })
        continue
      }

      try {
        if (!shadow || shadow.simulationStatus !== "routed") {
          throw new Error(
            `OUTBOX_DISPATCH_NOT_ROUTABLE: simulation_status_${shadow?.simulationStatus || "missing"}`
          )
        }

        const deliveryResults: DispatchIntentResult[] = []
        for (const intent of shadow.notificationIntents) {
          const delivered = await this.dispatchIntent({
            companyId: input.companyId,
            actorId: shadow.scope.actorId || row.created_by || null,
            intent,
          })
          deliveryResults.push(delivered)
        }

        createdNotifications += deliveryResults.filter((item) => item.action === "created").length
        claimedExistingNotifications += deliveryResults.filter((item) => item.action === "claimed_existing").length

        await this.markDispatched(row.event_id, {
          mode: "active_canary",
          actorId: input.actorId || null,
          deliveryMethod: deliveryResults.some((item) => item.action === "created")
            ? "created_notification"
            : "claimed_existing",
          notificationCount: deliveryResults.length,
          existingClaimCount: deliveryResults.filter((item) => item.action === "claimed_existing").length,
          eventKeys: deliveryResults.map((item) => item.eventKey),
        })

        results.push({
          eventId: row.event_id,
          eventType: row.event_type,
          mode,
          status: "dispatched",
          deliveryMethod: deliveryResults.some((item) => item.action === "created")
            ? "created_notification"
            : "claimed_existing",
          notificationCount: deliveryResults.length,
          existingClaimCount: deliveryResults.filter((item) => item.action === "claimed_existing").length,
          error: null,
          eventKeys: deliveryResults.map((item) => item.eventKey),
        })
      } catch (error: any) {
        const message = String(error?.message || "Failed to dispatch notification outbox event")
        await this.markFailed(row, message)
        results.push({
          eventId: row.event_id,
          eventType: row.event_type,
          mode,
          status: "failed",
          deliveryMethod: "none",
          notificationCount: 0,
          existingClaimCount: 0,
          error: message,
          eventKeys: shadow?.notificationIntents?.map((intent) => intent.eventKey) || [],
        })
      }
    }

    return {
      mode: "active_canary",
      companyId: input.companyId,
      requestedEventType,
      limit,
      processedEvents: results.length,
      dispatchedEvents: results.filter((result) => result.status === "dispatched").length,
      failedEvents: results.filter((result) => result.status === "failed").length,
      skippedEvents: results.filter((result) => result.status === "skipped").length,
      createdNotifications,
      claimedExistingNotifications,
      gateSnapshot: gate.policies.map((policy) => ({
        eventType: policy.eventType,
        recommendedMode: policy.recommendedMode,
        gateStatus: policy.gateStatus,
        dispatcherActivationAllowed: policy.dispatcherActivationAllowed,
        blockers: policy.blockers,
      })),
      results,
    }
  }

  private async loadPendingEvents(
    companyId: string,
    eventFamilies: Array<{ eventType: string; createdAfter: string | null }>,
    limit: number
  ) {
    const now = new Date().toISOString()
    const { data, error } = await this.supabase
      .from("notification_outbox_events")
      .select("event_id, tenant_id, event_type, delivery_status, delivery_attempts, available_at, context, created_by, created_at")
      .eq("tenant_id", companyId)
      .in("event_type", eventFamilies.map((family) => family.eventType))
      .in("delivery_status", ["pending", "failed"])
      .lte("available_at", now)
      .order("created_at", { ascending: true })
      .limit(Math.min(Math.max(limit * 10, limit), 500))

    if (error) {
      throw new Error(error.message || "Failed to load pending notification outbox events")
    }

    const rows = Array.isArray(data) ? (data as PendingOutboxEventRow[]) : []
    const baselineByEventType = new Map(
      eventFamilies.map((family) => [family.eventType, family.createdAfter])
    )

    return rows
      .filter((row) => {
        const baseline = baselineByEventType.get(row.event_type) || null
        if (!baseline) return true
        return new Date(row.created_at).getTime() >= new Date(baseline).getTime()
      })
      .slice(0, limit)
  }

  private async claimForProcessing(row: PendingOutboxEventRow) {
    const now = new Date().toISOString()
    const { data, error } = await this.supabase
      .from("notification_outbox_events")
      .update({
        delivery_status: "processing",
        processing_started_at: now,
        delivery_attempts: Number(row.delivery_attempts || 0) + 1,
        last_error: null,
      })
      .eq("event_id", row.event_id)
      .eq("tenant_id", row.tenant_id)
      .in("delivery_status", ["pending", "failed"])
      .select("event_id")
      .maybeSingle()

    if (error) {
      throw new Error(error.message || "Failed to claim notification outbox event")
    }

    return Boolean(data?.event_id)
  }

  private async dispatchIntent(input: {
    companyId: string
    actorId: string | null
    intent: ShadowDispatchItem["notificationIntents"][number]
  }): Promise<DispatchIntentResult> {
    const existing = await this.findExistingNotification(input.companyId, input.intent.eventKey)
    if (existing) {
      return {
        eventKey: input.intent.eventKey,
        action: "claimed_existing",
        notificationId: existing,
      }
    }

    const { error } = await this.supabase.rpc("create_notification", {
      p_company_id: input.companyId,
      p_reference_type: input.intent.referenceType,
      p_reference_id: input.intent.referenceId,
      p_title: input.intent.title,
      p_message: input.intent.message,
      p_created_by: input.actorId,
      p_branch_id: input.intent.recipient.branchId || null,
      p_cost_center_id: input.intent.recipient.costCenterId || null,
      p_warehouse_id: input.intent.recipient.warehouseId || null,
      p_assigned_to_role: input.intent.recipient.kind === "role" ? input.intent.recipient.role : null,
      p_assigned_to_user: input.intent.recipient.kind === "user" ? input.intent.recipient.userId : null,
      p_priority: input.intent.priority,
      p_event_key: input.intent.eventKey,
      p_severity: normalizeNotificationSeverity(input.intent.severity),
      p_category: input.intent.category,
    })

    if (error) {
      const fallbackExisting = await this.findExistingNotification(input.companyId, input.intent.eventKey)
      if (fallbackExisting) {
        return {
          eventKey: input.intent.eventKey,
          action: "claimed_existing",
          notificationId: fallbackExisting,
        }
      }

      throw new Error(error.message || `Failed to deliver notification for event key ${input.intent.eventKey}`)
    }

    const createdId = await this.findExistingNotification(input.companyId, input.intent.eventKey)
    return {
      eventKey: input.intent.eventKey,
      action: "created",
      notificationId: createdId,
    }
  }

  private async findExistingNotification(companyId: string, eventKey: string) {
    const { data, error } = await this.supabase
      .from("notifications")
      .select("id")
      .eq("company_id", companyId)
      .eq("event_key", eventKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(error.message || "Failed to inspect existing notification by event key")
    }

    return asNullableString(data?.id)
  }

  private async markDispatched(eventId: string, summary: DispatchSuccessSummary) {
    const createdNotificationCount = Math.max(
      Number(summary.notificationCount || 0) - Number(summary.existingClaimCount || 0),
      0
    )
    const { error } = await this.supabase
      .from("notification_outbox_events")
      .update({
        delivery_status: "dispatched",
        dispatched_at: new Date().toISOString(),
        processing_started_at: null,
        failed_at: null,
        last_error: null,
        last_dispatch_summary: {
          mode: summary.mode,
          actor_id: summary.actorId,
          delivery_method: summary.deliveryMethod,
          notification_count: Number(summary.notificationCount || 0),
          existing_claim_count: Number(summary.existingClaimCount || 0),
          created_notification_count: createdNotificationCount,
          event_keys: summary.eventKeys,
        },
      })
      .eq("event_id", eventId)

    if (error) {
      throw new Error(error.message || "Failed to mark notification outbox event as dispatched")
    }
  }

  private async markFailed(row: PendingOutboxEventRow, message: string) {
    const currentAttempt = Number(row.delivery_attempts || 0) + 1
    const deadLetterNow =
      this.deadLetterPolicy.enabled &&
      currentAttempt >= this.deadLetterPolicy.maxAttempts
    const availableAt = deadLetterNow
      ? null
      : new Date(
          Date.now() + Math.max(this.deadLetterPolicy.retryBackoffSeconds, 0) * 1000
        ).toISOString()
    const { error } = await this.supabase
      .from("notification_outbox_events")
      .update({
        delivery_status: deadLetterNow ? "dead_letter" : "failed",
        failed_at: new Date().toISOString(),
        dead_lettered_at: deadLetterNow ? new Date().toISOString() : null,
        processing_started_at: null,
        available_at: availableAt,
        last_error: message,
        last_dispatch_summary: {
          mode: "active_canary",
          delivery_method: "none",
          notification_count: 0,
          existing_claim_count: 0,
          created_notification_count: 0,
          event_keys: [],
          failure_class: deadLetterNow ? "dead_letter" : "retryable_failure",
          attempt_number: currentAttempt,
          dlq_enabled: this.deadLetterPolicy.enabled,
          dlq_max_attempts: this.deadLetterPolicy.maxAttempts,
          retry_backoff_seconds: this.deadLetterPolicy.retryBackoffSeconds,
        },
      })
      .eq("event_id", row.event_id)

    if (error) {
      console.error("[NOTIFICATION_OUTBOX_MARK_FAILED]", error.message)
    }
  }
}
