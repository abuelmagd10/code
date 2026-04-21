import {
  resolveNotificationDispatcherMode,
  resolveNotificationOutboxAuthoritativeCompanyIds,
  resolveNotificationOutboxAuthoritativeEventTypes,
  resolveNotificationOutboxBaselineCreatedAfter,
  resolveNotificationOutboxDeadLetterPolicy,
  resolveNotificationOutboxLegacyHotStandbyCompanyIds,
  resolveNotificationOutboxLegacyHotStandbyEventTypes,
  isNotificationOutboxLegacyHotStandbyConfigured,
  isSupportedNotificationOutboxCanaryEventType,
} from "@/lib/outbox/notification-outbox-activation-policy"
import {
  NotificationOutboxAuthoritativeReadinessService,
  type NotificationOutboxAuthoritativeReadinessFamily,
} from "@/lib/outbox/notification-outbox-authoritative-readiness.service"

type SupabaseLike = any

export type NotificationOutboxCutoverReviewStatus =
  | "blocked"
  | "manual_review_required"
  | "ready_for_controlled_cutover"

type CutoverEnvPlan = {
  key: string
  current: string[]
  target: string[]
  changeRequired: boolean
  note: string
}

export type NotificationOutboxAuthoritativeCutoverFamilyReview = {
  eventType: string
  displayName: string
  cutoverReviewStatus: NotificationOutboxCutoverReviewStatus
  controlledCutoverReady: boolean
  currentMode: string
  targetMode: "active_authoritative"
  companyId: string
  baselineCreatedAfter: string | null
  readiness: {
    readinessStatus: NotificationOutboxAuthoritativeReadinessFamily["readinessStatus"]
    reviewReady: boolean
    authoritativeCutoverAllowed: boolean
    exactMatchRatePercent: number
    sampleCount: number
    failedEvents: number
    deadLetterEvents: number
    retryCandidateEvents: number
    stableLifecycle: boolean
  }
  activationPlan: {
    manualApprovalRequired: true
    authoritativeFlagChangeRequired: boolean
    legacyHotStandbyMustRemain: boolean
    rollbackSwitchPrepared: boolean
    envPlans: CutoverEnvPlan[]
  }
  monitoringPlan: {
    authoritativeWaveScope: {
      companyId: string
      eventType: string
      executionMode: "active_authoritative"
      rolloutScope: "single_tenant_single_family"
      legacyHotStandbyEnabled: boolean
    }
    checkpoints: string[]
    healthQueries: string[]
    stopConditions: string[]
  }
  rollbackPlan: {
    immediateRollbackPossible: boolean
    rollbackActions: string[]
  }
  blockers: string[]
  warnings: string[]
  notes: string[]
}

export type NotificationOutboxAuthoritativeCutoverReviewResult = {
  summary: {
    currentMode: string
    recommendedGlobalMode: string
    blockedFamilies: number
    manualReviewFamilies: number
    readyFamilies: number
    controlledCutoverAllowed: boolean
  }
  filters: {
    companyId: string
    eventType: string | null
    createdAfter: string | null
    limit: number
  }
  readinessSummary: {
    currentMode: string
    recommendedGlobalMode: string
    reviewReadyFamilies: number
    cutoverCandidateFamilies: number
    blockedFamilies: number
    authoritativeCutoverAllowed: boolean
  }
  families: NotificationOutboxAuthoritativeCutoverFamilyReview[]
}

function toArray(set: Set<string>) {
  return Array.from(set).sort((left, right) => left.localeCompare(right))
}

function mergeScopedSet(set: Set<string>, value: string) {
  const next = new Set(set)
  if (!next.has("*")) {
    next.add(String(value || "").trim())
  }
  return next
}

export class NotificationOutboxAuthoritativeCutoverReviewService {
  private readonly readiness: NotificationOutboxAuthoritativeReadinessService

  constructor(private readonly supabase: SupabaseLike) {
    this.readiness = new NotificationOutboxAuthoritativeReadinessService(supabase)
  }

  async evaluate(input: {
    companyId: string
    eventType?: string | null
    createdAfter?: string | null
    limit?: number
    processingStuckMinutes?: number
  }): Promise<NotificationOutboxAuthoritativeCutoverReviewResult> {
    const eventType = String(input.eventType || "").trim() || null
    if (eventType && !isSupportedNotificationOutboxCanaryEventType(eventType)) {
      throw new Error(`OUTBOX_AUTHORITATIVE_CUTOVER_EVENT_TYPE_NOT_SUPPORTED: ${eventType}`)
    }

    const createdAfter =
      String(input.createdAfter || "").trim() ||
      (eventType ? resolveNotificationOutboxBaselineCreatedAfter(eventType) : null)

    const readiness = await this.readiness.evaluate({
      companyId: input.companyId,
      eventType,
      createdAfter,
      limit: input.limit,
      processingStuckMinutes: input.processingStuckMinutes,
    })

    const authoritativeCompanies = resolveNotificationOutboxAuthoritativeCompanyIds()
    const authoritativeEventTypes = resolveNotificationOutboxAuthoritativeEventTypes()
    const hotStandbyCompanies = resolveNotificationOutboxLegacyHotStandbyCompanyIds()
    const hotStandbyEventTypes = resolveNotificationOutboxLegacyHotStandbyEventTypes()
    const deadLetterPolicy = resolveNotificationOutboxDeadLetterPolicy()

    const families = readiness.families.map((family) => {
      const currentMode = resolveNotificationDispatcherMode({
        companyId: input.companyId,
        eventType: family.eventType,
      })

      const authoritativeCompanyTarget = mergeScopedSet(authoritativeCompanies, input.companyId)
      const authoritativeEventTarget = mergeScopedSet(authoritativeEventTypes, family.eventType)
      const hotStandbyCompaniesTarget = mergeScopedSet(hotStandbyCompanies, input.companyId)
      const hotStandbyEventTypesTarget = mergeScopedSet(hotStandbyEventTypes, family.eventType)

      const envPlans: CutoverEnvPlan[] = [
        {
          key: "NOTIFICATION_OUTBOX_AUTHORITATIVE_COMPANY_IDS",
          current: toArray(authoritativeCompanies),
          target: toArray(authoritativeCompanyTarget),
          changeRequired: !authoritativeCompanies.has("*") && !authoritativeCompanies.has(input.companyId),
          note: "Enable authoritative mode only for the selected tenant during the first controlled wave.",
        },
        {
          key: "NOTIFICATION_OUTBOX_AUTHORITATIVE_EVENT_TYPES",
          current: toArray(authoritativeEventTypes),
          target: toArray(authoritativeEventTarget),
          changeRequired: !authoritativeEventTypes.has("*") && !authoritativeEventTypes.has(family.eventType),
          note: "Keep authoritative scope limited to the reviewed event family.",
        },
        {
          key: "NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_COMPANY_IDS",
          current: toArray(hotStandbyCompanies),
          target: toArray(hotStandbyCompaniesTarget),
          changeRequired: !isNotificationOutboxLegacyHotStandbyConfigured({
            companyId: input.companyId,
            eventType: family.eventType,
          }),
          note: "Retain legacy runtime delivery as an immediate rollback safety net during the first authoritative wave.",
        },
        {
          key: "NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_EVENT_TYPES",
          current: toArray(hotStandbyEventTypes),
          target: toArray(hotStandbyEventTypesTarget),
          changeRequired: !isNotificationOutboxLegacyHotStandbyConfigured({
            companyId: input.companyId,
            eventType: family.eventType,
          }),
          note: "Preserve hot standby specifically for the bill receipt family while authoritative mode is being introduced.",
        },
      ]

      const blockers = [...family.blockers]
      const warnings = [...family.warnings]

      const controlledCutoverReady = family.authoritativeCutoverAllowed
      const cutoverReviewStatus: NotificationOutboxCutoverReviewStatus = controlledCutoverReady
        ? "ready_for_controlled_cutover"
        : family.reviewReady
          ? "manual_review_required"
          : "blocked"

      const rollbackActions = [
        "Remove the tenant from NOTIFICATION_OUTBOX_AUTHORITATIVE_COMPANY_IDS or remove the event family from NOTIFICATION_OUTBOX_AUTHORITATIVE_EVENT_TYPES.",
        "Keep NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_COMPANY_IDS and NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_EVENT_TYPES in place during the rollback window.",
        "Re-run canary health and drift analysis immediately after rollback to confirm no orphan or duplicate delivery appeared.",
      ]

      if (family.createdNotifications === 0) {
        warnings.push("FIRST_AUTHORITATIVE_WAVE_SHOULD_BE_MONITORED_FOR_CREATE_PATH")
      }

      return {
        eventType: family.eventType,
        displayName: family.displayName,
        cutoverReviewStatus,
        controlledCutoverReady,
        currentMode,
        targetMode: "active_authoritative" as const,
        companyId: input.companyId,
        baselineCreatedAfter: createdAfter || null,
        readiness: {
          readinessStatus: family.readinessStatus,
          reviewReady: family.reviewReady,
          authoritativeCutoverAllowed: family.authoritativeCutoverAllowed,
          exactMatchRatePercent: family.exactMatchRatePercent,
          sampleCount: family.sampleCount,
          failedEvents: family.failedEvents,
          deadLetterEvents: family.deadLetterEvents,
          retryCandidateEvents: family.retryCandidateEvents,
          stableLifecycle: family.stableLifecycle,
        },
        activationPlan: {
          manualApprovalRequired: true as const,
          authoritativeFlagChangeRequired:
            envPlans.some((plan) => plan.key.includes("AUTHORITATIVE") && plan.changeRequired),
          legacyHotStandbyMustRemain: true,
          rollbackSwitchPrepared:
            deadLetterPolicy.enabled &&
            isNotificationOutboxLegacyHotStandbyConfigured({
              companyId: input.companyId,
              eventType: family.eventType,
            }),
          envPlans,
        },
        monitoringPlan: {
          authoritativeWaveScope: {
            companyId: input.companyId,
            eventType: family.eventType,
            executionMode: "active_authoritative" as const,
            rolloutScope: "single_tenant_single_family" as const,
            legacyHotStandbyEnabled: true,
          },
          checkpoints: [
            "Verify no unexpected increase in failed, dead-letter, or retry-candidate events after the first authoritative wave.",
            "Confirm drift remains exact-match on the same post-baseline window immediately after authoritative activation.",
            "Confirm legacy hot standby remains active and can still cover rollback without changing the delivery contract.",
          ],
          healthQueries: [
            `/api/notification-outbox/authoritative-readiness?eventType=${encodeURIComponent(
              family.eventType
            )}&createdAfter=${encodeURIComponent(createdAfter || "")}`,
            `/api/notification-outbox/canary-health?eventType=${encodeURIComponent(
              family.eventType
            )}&createdAfter=${encodeURIComponent(createdAfter || "")}`,
            `/api/notification-outbox/drift-analysis?eventType=${encodeURIComponent(
              family.eventType
            )}&createdAfter=${encodeURIComponent(createdAfter || "")}`,
          ],
          stopConditions: [
            "Any failed dispatch on the first authoritative wave.",
            "Any dead-letter event in the authoritative window.",
            "Any drift_detected, orphan notification, or duplicate delivery regression.",
          ],
        },
        rollbackPlan: {
          immediateRollbackPossible: true,
          rollbackActions,
        },
        blockers,
        warnings,
        notes: [
          ...family.notes,
          "O.8 review does not enable active_authoritative by itself. It only confirms whether the cutover envelope is ready for a single-tenant controlled wave.",
        ],
      }
    })

    return {
      summary: {
        currentMode:
          families.length > 0 && families.every((family) => family.currentMode === "active_authoritative")
            ? "active_authoritative"
            : families.some((family) => family.currentMode === "active_canary")
              ? "active_canary"
              : "shadow_only",
        recommendedGlobalMode:
          families.length > 0 &&
          families.every((family) => family.cutoverReviewStatus === "ready_for_controlled_cutover")
            ? "active_authoritative"
            : families.some((family) => family.cutoverReviewStatus === "manual_review_required")
              ? "activation_candidate"
              : "shadow_only",
        blockedFamilies: families.filter((family) => family.cutoverReviewStatus === "blocked").length,
        manualReviewFamilies: families.filter(
          (family) => family.cutoverReviewStatus === "manual_review_required"
        ).length,
        readyFamilies: families.filter(
          (family) => family.cutoverReviewStatus === "ready_for_controlled_cutover"
        ).length,
        controlledCutoverAllowed:
          families.length > 0 &&
          families.every((family) => family.cutoverReviewStatus === "ready_for_controlled_cutover"),
      },
      filters: {
        companyId: input.companyId,
        eventType,
        createdAfter: createdAfter || null,
        limit: Number(input.limit || 200),
      },
      readinessSummary: readiness.summary,
      families,
    }
  }
}
