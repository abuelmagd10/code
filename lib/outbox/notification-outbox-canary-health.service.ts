import {
  GOVERNANCE_REPLAY_CANARY_EVENT_TYPES,
  resolveNotificationOutboxBaselineCreatedAfter,
  SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
} from "@/lib/outbox/notification-outbox-activation-policy"
import {
  NotificationOutboxActivationGateService,
  type NotificationOutboxActivationGateFamily,
} from "@/lib/outbox/notification-outbox-activation-gate.service"

type SupabaseLike = any

type OutboxCanaryEventRow = {
  event_id: string
  event_type: string
  delivery_status: "pending" | "processing" | "dispatched" | "failed" | "dead_letter"
  delivery_attempts: number
  available_at: string | null
  processing_started_at: string | null
  dispatched_at: string | null
  failed_at: string | null
  dead_lettered_at: string | null
  last_error: string | null
  created_at: string
  last_dispatch_summary: Record<string, unknown> | null
}

export type NotificationOutboxCanaryHealthFamily = {
  eventType: string
  totalOutboxEvents: number
  pendingEvents: number
  processingEvents: number
  dispatchedEvents: number
  failedEvents: number
  deadLetterEvents: number
  retryCandidateEvents: number
  stuckProcessingEvents: number
  claimedExistingNotifications: number
  createdNotifications: number
  totalDeliveredNotificationIntents: number
  averageDispatchLatencyMs: number | null
  maxDispatchLatencyMs: number | null
  gateStatus: NotificationOutboxActivationGateFamily["gateStatus"] | "not_configured"
  recommendedMode: NotificationOutboxActivationGateFamily["recommendedMode"] | "shadow_only"
  dispatcherActivationAllowed: boolean
  exactMatchCount: number
  driftDetectedCount: number
  policyGapCount: number
  unsupportedCount: number
  orphanNotificationCount: number
  duplicateEventKeyCount: number
  blockers: string[]
  warnings: string[]
  recommendation: "stable" | "needs_attention"
}

export type NotificationOutboxCanaryHealthResult = {
  summary: {
    totalOutboxEvents: number
    processedOutboxEvents: number
    pendingEvents: number
    processingEvents: number
    dispatchedEvents: number
    failedEvents: number
    deadLetterEvents: number
    retryCandidateEvents: number
    stuckProcessingEvents: number
    claimedExistingNotifications: number
    createdNotifications: number
    totalDeliveredNotificationIntents: number
    averageDispatchLatencyMs: number | null
    maxDispatchLatencyMs: number | null
    exactMatchRatePercent: number
    driftDetectedEvents: number
    policyGapEvents: number
    unsupportedEvents: number
    orphanNotifications: number
    duplicateDeliveries: number
    stableLifecycle: boolean
  }
  filters: {
    companyId: string
    eventType: string | null
    createdAfter: string | null
    limit: number
    processingStuckMinutes: number
  }
  gateSummary: {
    currentMode: string
    recommendedGlobalMode: string
    candidateReadyFamilies: number
    blockedFamilies: number
    insufficientEvidenceFamilies: number
    authoritativeCutoverAllowed: false
  }
  driftSummary: {
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
  families: NotificationOutboxCanaryHealthFamily[]
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asNullableString(value: unknown) {
  const normalized = String(value || "").trim()
  return normalized || null
}

function percent(part: number, whole: number) {
  if (!whole) return 0
  return Number(((part / whole) * 100).toFixed(2))
}

function average(values: number[]) {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function max(values: number[]) {
  if (values.length === 0) return null
  return Math.max(...values)
}

export class NotificationOutboxCanaryHealthService {
  private readonly activationGate: NotificationOutboxActivationGateService

  constructor(private readonly supabase: SupabaseLike) {
    this.activationGate = new NotificationOutboxActivationGateService(supabase)
  }

  async analyze(input: {
    companyId: string
    eventType?: string | null
    createdAfter?: string | null
    limit?: number
    processingStuckMinutes?: number
  }): Promise<NotificationOutboxCanaryHealthResult> {
    const limit = Math.min(Math.max(Number(input.limit || 200), 1), 500)
    const processingStuckMinutes = Math.min(
      Math.max(Number(input.processingStuckMinutes || 15), 1),
      1440
    )
    const eventType = asNullableString(input.eventType)
    const createdAfter =
      asNullableString(input.createdAfter) ||
      (eventType ? resolveNotificationOutboxBaselineCreatedAfter(eventType) : null)

    if (
      eventType &&
      !SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES.includes(
        eventType as (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number]
      )
    ) {
      throw new Error(`OUTBOX_CANARY_HEALTH_EVENT_TYPE_NOT_SUPPORTED: ${eventType}`)
    }

    const eventTypes = eventType
      ? [eventType]
      : Array.from(GOVERNANCE_REPLAY_CANARY_EVENT_TYPES)

    const rows = await this.loadOutboxEvents(input.companyId, eventTypes, createdAfter, limit)
    const gate = await this.activationGate.evaluate({
      companyId: input.companyId,
      eventType,
      createdAfter,
      limit: Math.max(limit, 200),
      includeUnsupported: true,
    })

    const gateByEventType = new Map(gate.policies.map((policy) => [policy.eventType, policy]))
    const families = eventTypes.map((currentEventType) =>
      this.buildFamilyHealth(
        currentEventType,
        rows.filter((row) => row.event_type === currentEventType),
        gateByEventType.get(currentEventType) || null,
        processingStuckMinutes
      )
    )

    const latencyValues = families
      .map((family) => family.averageDispatchLatencyMs)
      .filter((value): value is number => value !== null)

    return {
      summary: {
        totalOutboxEvents: families.reduce((sum, family) => sum + family.totalOutboxEvents, 0),
        processedOutboxEvents: families.reduce(
          (sum, family) => sum + family.dispatchedEvents + family.failedEvents + family.deadLetterEvents,
          0
        ),
        pendingEvents: families.reduce((sum, family) => sum + family.pendingEvents, 0),
        processingEvents: families.reduce((sum, family) => sum + family.processingEvents, 0),
        dispatchedEvents: families.reduce((sum, family) => sum + family.dispatchedEvents, 0),
        failedEvents: families.reduce((sum, family) => sum + family.failedEvents, 0),
        deadLetterEvents: families.reduce((sum, family) => sum + family.deadLetterEvents, 0),
        retryCandidateEvents: families.reduce((sum, family) => sum + family.retryCandidateEvents, 0),
        stuckProcessingEvents: families.reduce((sum, family) => sum + family.stuckProcessingEvents, 0),
        claimedExistingNotifications: families.reduce(
          (sum, family) => sum + family.claimedExistingNotifications,
          0
        ),
        createdNotifications: families.reduce((sum, family) => sum + family.createdNotifications, 0),
        totalDeliveredNotificationIntents: families.reduce(
          (sum, family) => sum + family.totalDeliveredNotificationIntents,
          0
        ),
        averageDispatchLatencyMs: average(latencyValues),
        maxDispatchLatencyMs: max(
          families
            .map((family) => family.maxDispatchLatencyMs)
            .filter((value): value is number => value !== null)
        ),
        exactMatchRatePercent: percent(
          gate.driftSummary.exactMatchEvents,
          gate.driftSummary.evaluatedEvents
        ),
        driftDetectedEvents: gate.driftSummary.driftDetectedEvents,
        policyGapEvents: gate.driftSummary.policyGapEvents,
        unsupportedEvents: gate.driftSummary.unsupportedEvents,
        orphanNotifications: gate.driftSummary.orphanNotifications,
        duplicateDeliveries: gate.driftSummary.duplicateDeliveries,
        stableLifecycle:
          families.every((family) => family.stuckProcessingEvents === 0) &&
          gate.driftSummary.orphanNotifications === 0 &&
          gate.driftSummary.duplicateDeliveries === 0,
      },
      filters: {
        companyId: input.companyId,
        eventType,
        createdAfter,
        limit,
        processingStuckMinutes,
      },
      gateSummary: gate.summary,
      driftSummary: gate.driftSummary,
      families,
    }
  }

  private async loadOutboxEvents(
    companyId: string,
    eventTypes: string[],
    createdAfter: string | null,
    limit: number
  ) {
    let query = this.supabase
      .from("notification_outbox_events")
      .select(`
        event_id,
        event_type,
        delivery_status,
        delivery_attempts,
        available_at,
        processing_started_at,
        dispatched_at,
        failed_at,
        dead_lettered_at,
        last_error,
        created_at,
        last_dispatch_summary
      `)
      .eq("tenant_id", companyId)
      .in("event_type", eventTypes)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (createdAfter) {
      query = query.gte("created_at", createdAfter)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message || "Failed to load notification outbox canary health rows")
    }

    return Array.isArray(data) ? (data as OutboxCanaryEventRow[]) : []
  }

  private buildFamilyHealth(
    eventType: string,
    rows: OutboxCanaryEventRow[],
    gate: NotificationOutboxActivationGateFamily | null,
    processingStuckMinutes: number
  ): NotificationOutboxCanaryHealthFamily {
    const nowMs = Date.now()
    const processingCutoffMs = nowMs - processingStuckMinutes * 60_000

    let pendingEvents = 0
    let processingEvents = 0
    let dispatchedEvents = 0
    let failedEvents = 0
    let deadLetterEvents = 0
    let stuckProcessingEvents = 0
    let claimedExistingNotifications = 0
    let createdNotifications = 0
    let totalDeliveredNotificationIntents = 0

    const dispatchLatencies: number[] = []

    for (const row of rows) {
      const dispatchSummary = asObject(row.last_dispatch_summary)
      claimedExistingNotifications += asNumber(dispatchSummary.existing_claim_count, 0)
      createdNotifications += asNumber(dispatchSummary.created_notification_count, 0)
      totalDeliveredNotificationIntents += asNumber(dispatchSummary.notification_count, 0)

      switch (row.delivery_status) {
        case "pending":
          pendingEvents += 1
          break
        case "processing":
          processingEvents += 1
          if (
            row.processing_started_at &&
            new Date(row.processing_started_at).getTime() <= processingCutoffMs
          ) {
            stuckProcessingEvents += 1
          }
          break
        case "dispatched":
          dispatchedEvents += 1
          if (row.dispatched_at && row.created_at) {
            dispatchLatencies.push(
              Math.max(
                new Date(row.dispatched_at).getTime() - new Date(row.created_at).getTime(),
                0
              )
            )
          }
          break
        case "failed":
          failedEvents += 1
          break
        case "dead_letter":
          deadLetterEvents += 1
          break
      }
    }

    const retryCandidateEvents = failedEvents + stuckProcessingEvents
    const orphanNotificationCount = gate?.mismatchCounts.ORPHAN_NOTIFICATION || 0
    const duplicateEventKeyCount = gate?.mismatchCounts.DUPLICATE_EVENT_KEY || 0

    return {
      eventType,
      totalOutboxEvents: rows.length,
      pendingEvents,
      processingEvents,
      dispatchedEvents,
      failedEvents,
      deadLetterEvents,
      retryCandidateEvents,
      stuckProcessingEvents,
      claimedExistingNotifications,
      createdNotifications,
      totalDeliveredNotificationIntents,
      averageDispatchLatencyMs: average(dispatchLatencies),
      maxDispatchLatencyMs: max(dispatchLatencies),
      gateStatus: gate?.gateStatus || "not_configured",
      recommendedMode: gate?.recommendedMode || "shadow_only",
      dispatcherActivationAllowed: gate?.dispatcherActivationAllowed || false,
      exactMatchCount: gate?.exactMatchCount || 0,
      driftDetectedCount: gate?.driftDetectedCount || 0,
      policyGapCount: gate?.policyGapCount || 0,
      unsupportedCount: gate?.unsupportedCount || 0,
      orphanNotificationCount,
      duplicateEventKeyCount,
      blockers: gate?.blockers || [],
      warnings: gate?.warnings || [],
      recommendation:
        (gate?.dispatcherActivationAllowed || false) &&
        retryCandidateEvents === 0 &&
        orphanNotificationCount === 0 &&
        duplicateEventKeyCount === 0
          ? "stable"
          : "needs_attention",
    }
  }
}
