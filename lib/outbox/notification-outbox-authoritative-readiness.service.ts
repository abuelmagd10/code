import type { NotificationDispatcherMode } from "@/lib/outbox/notification-outbox-activation-gate.service"
import { NotificationOutboxCanaryHealthService } from "@/lib/outbox/notification-outbox-canary-health.service"
import {
  resolveNotificationOutboxDeadLetterPolicy,
  resolveNotificationDispatcherMode,
  resolveNotificationOutboxAuthoritativeCompanyIds,
  resolveNotificationOutboxAuthoritativeEventTypes,
  resolveNotificationOutboxBaselineCreatedAfter,
  resolveNotificationOutboxCanaryCompanyIds,
  resolveNotificationOutboxCanaryEventTypes,
  isNotificationOutboxLegacyHotStandbyConfigured,
  isSupportedNotificationOutboxCanaryEventType,
  SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES,
} from "@/lib/outbox/notification-outbox-activation-policy"

type SupabaseLike = any

export type NotificationOutboxAuthoritativeReadinessStatus =
  | "blocked"
  | "review_ready"
  | "cutover_candidate"

type AuthoritativeReadinessThresholds = {
  minCanarySampleCount: number
  requireZeroFailedEvents: boolean
  requireZeroDeadLetterEvents: boolean
  requireZeroRetryCandidates: boolean
  requireStableLifecycle: boolean
}

type AuthoritativeReadinessPolicy = {
  eventType: string
  displayName: string
  thresholds: AuthoritativeReadinessThresholds
  notes: string[]
}

type AuthoritativeReadinessControls = {
  currentMode: NotificationDispatcherMode
  tenantScopedCanaryEnabled: boolean
  tenantScopedAuthoritativeEnabled: boolean
  tenantScopedFeatureFlagAvailable: true
  legacyRuntimeHotStandbyConfigured: boolean
  rollbackSwitchAvailable: true
  deadLetterAutomationImplemented: boolean
  deadLetterMaxAttempts: number | null
  retryBackoffSeconds: number | null
}

export type NotificationOutboxAuthoritativeReadinessFamily = {
  eventType: string
  displayName: string
  readinessStatus: NotificationOutboxAuthoritativeReadinessStatus
  reviewReady: boolean
  authoritativeCutoverAllowed: boolean
  thresholds: AuthoritativeReadinessThresholds
  controls: AuthoritativeReadinessControls
  sampleCount: number
  exactMatchCount: number
  exactMatchRatePercent: number
  failedEvents: number
  deadLetterEvents: number
  retryCandidateEvents: number
  claimedExistingNotifications: number
  createdNotifications: number
  gateStatus: string
  recommendedMode: string
  dispatcherActivationAllowed: boolean
  stableLifecycle: boolean
  blockers: string[]
  warnings: string[]
  notes: string[]
}

export type NotificationOutboxAuthoritativeReadinessResult = {
  summary: {
    currentMode: NotificationDispatcherMode
    recommendedGlobalMode: NotificationDispatcherMode
    reviewReadyFamilies: number
    cutoverCandidateFamilies: number
    blockedFamilies: number
    authoritativeCutoverAllowed: boolean
  }
  filters: {
    companyId: string
    eventType: string | null
    createdAfter: string | null
    limit: number
    processingStuckMinutes: number
  }
  families: NotificationOutboxAuthoritativeReadinessFamily[]
  canaryHealthSummary: NotificationOutboxCanaryHealthResult["summary"]
  gateSummary: NotificationOutboxCanaryHealthResult["gateSummary"]
  driftSummary: NotificationOutboxCanaryHealthResult["driftSummary"]
}

type NotificationOutboxCanaryHealthResult = Awaited<
  ReturnType<NotificationOutboxCanaryHealthService["analyze"]>
>

const AUTHORITATIVE_READINESS_POLICIES: Record<
  (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number],
  AuthoritativeReadinessPolicy
> = {
  "governance.replay_commit_intent_issued": {
    eventType: "governance.replay_commit_intent_issued",
    displayName: "Governance Replay Commit Intent",
    thresholds: {
      minCanarySampleCount: 10,
      requireZeroFailedEvents: true,
      requireZeroDeadLetterEvents: true,
      requireZeroRetryCandidates: true,
      requireStableLifecycle: true,
    },
    notes: [
      "Governance replay commit intent may enter authoritative review only after canary evidence stays clean across a wider sample window than O.5 activation gating.",
    ],
  },
  "governance.replay_execution_activated": {
    eventType: "governance.replay_execution_activated",
    displayName: "Governance Replay Execution Activation",
    thresholds: {
      minCanarySampleCount: 10,
      requireZeroFailedEvents: true,
      requireZeroDeadLetterEvents: true,
      requireZeroRetryCandidates: true,
      requireStableLifecycle: true,
    },
    notes: [
      "Governance replay execution remains under authoritative review until canary delivery proves stable and rollback posture is explicitly configured.",
    ],
  },
  "procurement.bill_receipt_posted": {
    eventType: "procurement.bill_receipt_posted",
    displayName: "Procurement Bill Receipt Posted",
    thresholds: {
      minCanarySampleCount: 20,
      requireZeroFailedEvents: true,
      requireZeroDeadLetterEvents: true,
      requireZeroRetryCandidates: true,
      requireStableLifecycle: true,
    },
    notes: [
      "Bill receipt authoritative review requires multi-scenario canary evidence, explicit rollback posture, and a documented hot-standby plan before any cutover decision.",
    ],
  },
}

function percent(part: number, whole: number) {
  if (!whole) return 0
  return Number(((part / whole) * 100).toFixed(2))
}

function matchesScopedSet(set: Set<string>, value: string) {
  return set.has("*") || set.has(String(value || "").trim())
}

export class NotificationOutboxAuthoritativeReadinessService {
  private readonly canaryHealth: NotificationOutboxCanaryHealthService

  constructor(private readonly supabase: SupabaseLike) {
    this.canaryHealth = new NotificationOutboxCanaryHealthService(supabase)
  }

  async evaluate(input: {
    companyId: string
    eventType?: string | null
    createdAfter?: string | null
    limit?: number
    processingStuckMinutes?: number
  }): Promise<NotificationOutboxAuthoritativeReadinessResult> {
    const eventType = String(input.eventType || "").trim() || null
    if (eventType && !isSupportedNotificationOutboxCanaryEventType(eventType)) {
      throw new Error(
        `OUTBOX_AUTHORITATIVE_READINESS_EVENT_TYPE_NOT_SUPPORTED: ${eventType}`
      )
    }

    const createdAfter =
      String(input.createdAfter || "").trim() ||
      (eventType ? resolveNotificationOutboxBaselineCreatedAfter(eventType) : null)

    const health = await this.canaryHealth.analyze({
      companyId: input.companyId,
      eventType,
      createdAfter,
      limit: input.limit,
      processingStuckMinutes: input.processingStuckMinutes,
    })

    const canaryCompanies = resolveNotificationOutboxCanaryCompanyIds()
    const canaryEventTypes = resolveNotificationOutboxCanaryEventTypes()
    const authoritativeCompanies = resolveNotificationOutboxAuthoritativeCompanyIds()
    const authoritativeEventTypes = resolveNotificationOutboxAuthoritativeEventTypes()
    const deadLetterPolicy = resolveNotificationOutboxDeadLetterPolicy()

    const families = health.families.map((family) => {
      const policy = AUTHORITATIVE_READINESS_POLICIES[
        family.eventType as (typeof SUPPORTED_NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES)[number]
      ]

      const controls: AuthoritativeReadinessControls = {
        currentMode: resolveNotificationDispatcherMode({
          companyId: input.companyId,
          eventType: family.eventType,
        }),
        tenantScopedCanaryEnabled:
          matchesScopedSet(canaryCompanies, input.companyId) &&
          matchesScopedSet(canaryEventTypes, family.eventType),
        tenantScopedAuthoritativeEnabled:
          matchesScopedSet(authoritativeCompanies, input.companyId) &&
          matchesScopedSet(authoritativeEventTypes, family.eventType),
        tenantScopedFeatureFlagAvailable: true,
        legacyRuntimeHotStandbyConfigured: isNotificationOutboxLegacyHotStandbyConfigured({
          companyId: input.companyId,
          eventType: family.eventType,
        }),
        rollbackSwitchAvailable: true,
        deadLetterAutomationImplemented: deadLetterPolicy.enabled,
        deadLetterMaxAttempts: deadLetterPolicy.enabled ? deadLetterPolicy.maxAttempts : null,
        retryBackoffSeconds: deadLetterPolicy.enabled
          ? deadLetterPolicy.retryBackoffSeconds
          : null,
      }

      const blockers: string[] = []
      const warnings: string[] = []

      if (family.gateStatus !== "candidate_ready" || !family.dispatcherActivationAllowed) {
        blockers.push("ACTIVATION_GATE_NOT_READY")
      }

      if (family.totalOutboxEvents < policy.thresholds.minCanarySampleCount) {
        blockers.push(
          `INSUFFICIENT_CANARY_SAMPLE: ${family.totalOutboxEvents} < ${policy.thresholds.minCanarySampleCount}`
        )
      }

      if (policy.thresholds.requireZeroFailedEvents && family.failedEvents > 0) {
        blockers.push(`FAILED_EVENTS_PRESENT: ${family.failedEvents}`)
      }

      if (policy.thresholds.requireZeroDeadLetterEvents && family.deadLetterEvents > 0) {
        blockers.push(`DEAD_LETTER_EVENTS_PRESENT: ${family.deadLetterEvents}`)
      }

      if (policy.thresholds.requireZeroRetryCandidates && family.retryCandidateEvents > 0) {
        blockers.push(`RETRY_CANDIDATES_PRESENT: ${family.retryCandidateEvents}`)
      }

      if (policy.thresholds.requireStableLifecycle && !health.summary.stableLifecycle) {
        blockers.push("UNSTABLE_CANARY_LIFECYCLE")
      }

      if (!controls.deadLetterAutomationImplemented) {
        blockers.push("DLQ_AUTOMATION_NOT_IMPLEMENTED")
      }

      if (!controls.legacyRuntimeHotStandbyConfigured) {
        blockers.push("LEGACY_HOT_STANDBY_NOT_CONFIGURED")
      }

      if (family.createdNotifications === 0) {
        warnings.push("CREATE_PATH_NOT_OBSERVED_IN_CANARY")
      }

      if (!controls.tenantScopedCanaryEnabled) {
        warnings.push("CANARY_ALLOWLIST_NOT_ACTIVE_FOR_THIS_FAMILY")
      }

      if (!controls.tenantScopedAuthoritativeEnabled) {
        warnings.push("AUTHORITATIVE_FLAG_NOT_YET_ENABLED")
      }

      const reviewReady = blockers.every(
        (blocker) =>
          blocker !== "DLQ_AUTOMATION_NOT_IMPLEMENTED" &&
          blocker !== "LEGACY_HOT_STANDBY_NOT_CONFIGURED"
      )

      const authoritativeCutoverAllowed =
        reviewReady &&
        controls.deadLetterAutomationImplemented &&
        controls.legacyRuntimeHotStandbyConfigured

      const readinessStatus: NotificationOutboxAuthoritativeReadinessStatus =
        authoritativeCutoverAllowed
          ? "cutover_candidate"
          : reviewReady
            ? "review_ready"
            : "blocked"

      return {
        eventType: family.eventType,
        displayName: policy.displayName,
        readinessStatus,
        reviewReady,
        authoritativeCutoverAllowed,
        thresholds: policy.thresholds,
        controls,
        sampleCount: family.totalOutboxEvents,
        exactMatchCount: family.exactMatchCount,
        exactMatchRatePercent: percent(family.exactMatchCount, family.totalOutboxEvents),
        failedEvents: family.failedEvents,
        deadLetterEvents: family.deadLetterEvents,
        retryCandidateEvents: family.retryCandidateEvents,
        claimedExistingNotifications: family.claimedExistingNotifications,
        createdNotifications: family.createdNotifications,
        gateStatus: family.gateStatus,
        recommendedMode: family.recommendedMode,
        dispatcherActivationAllowed: family.dispatcherActivationAllowed,
        stableLifecycle: health.summary.stableLifecycle,
        blockers,
        warnings,
        notes: policy.notes,
      }
    })

    return {
      summary: {
        currentMode:
          families.length > 0 &&
          families.every((family) => family.controls.currentMode === "active_authoritative")
            ? "active_authoritative"
            : families.some((family) => family.controls.currentMode === "active_canary")
              ? "active_canary"
              : "shadow_only",
        recommendedGlobalMode:
          families.length > 0 &&
          families.every((family) => family.readinessStatus === "cutover_candidate")
            ? "active_authoritative"
            : families.some((family) => family.readinessStatus === "review_ready")
              ? "activation_candidate"
              : "shadow_only",
        reviewReadyFamilies: families.filter((family) => family.reviewReady).length,
        cutoverCandidateFamilies: families.filter(
          (family) => family.readinessStatus === "cutover_candidate"
        ).length,
        blockedFamilies: families.filter((family) => family.readinessStatus === "blocked").length,
        authoritativeCutoverAllowed: families.length > 0 && families.every((family) => family.authoritativeCutoverAllowed),
      },
      filters: health.filters,
      families,
      canaryHealthSummary: health.summary,
      gateSummary: health.gateSummary,
      driftSummary: health.driftSummary,
    }
  }
}
