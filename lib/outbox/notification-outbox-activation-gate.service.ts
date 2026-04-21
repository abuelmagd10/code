import type { NotificationOutboxDeliveryStatus } from "@/lib/outbox/domain-event-contract"
import {
  NotificationOutboxDriftAnalyzerService,
  type NotificationOutboxDriftAnalysisResult,
  type NotificationOutboxDriftItem,
  type NotificationOutboxDriftMismatchCode,
} from "@/lib/outbox/notification-outbox-drift-analyzer.service"
import { resolveNotificationOutboxBaselineCreatedAfter } from "@/lib/outbox/notification-outbox-activation-policy"

type SupabaseLike = any

export type NotificationDispatcherMode =
  | "shadow_only"
  | "activation_candidate"
  | "active_canary"
  | "active_authoritative"

export type NotificationOutboxActivationGateStatus =
  | "blocked"
  | "candidate_ready"
  | "insufficient_evidence"

type ActivationGateThresholds = {
  minSampleCount: number
  exactMatchRatePercent: number
  maxDriftDetectedRatePercent: number
  maxPolicyGapCount: number
  maxUnsupportedCount: number
  zeroToleranceMismatchCodes: NotificationOutboxDriftMismatchCode[]
}

type ActivationGatePolicy = {
  eventType: string
  gateKey: string
  displayName: string
  thresholds: ActivationGateThresholds
  notes: string[]
}

type ActivationGateMismatchCounts = Record<NotificationOutboxDriftMismatchCode, number>

export type NotificationOutboxActivationGateFamily = {
  gateKey: string
  eventType: string
  displayName: string
  currentMode: NotificationDispatcherMode
  recommendedMode: NotificationDispatcherMode
  gateStatus: NotificationOutboxActivationGateStatus
  dispatcherActivationAllowed: boolean
  authoritativeCutoverAllowed: false
  thresholds: ActivationGateThresholds
  sampleCount: number
  exactMatchCount: number
  driftDetectedCount: number
  policyGapCount: number
  unsupportedCount: number
  exactMatchRatePercent: number
  driftDetectedRatePercent: number
  mismatchCounts: ActivationGateMismatchCounts
  blockers: string[]
  warnings: string[]
  notes: string[]
}

export type NotificationOutboxActivationGateResult = {
  summary: {
    currentMode: NotificationDispatcherMode
    recommendedGlobalMode: NotificationDispatcherMode
    candidateReadyFamilies: number
    blockedFamilies: number
    insufficientEvidenceFamilies: number
    authoritativeCutoverAllowed: false
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
  policies: NotificationOutboxActivationGateFamily[]
  driftSummary: NotificationOutboxDriftAnalysisResult["summary"]
  nextCursor: string | null
}

export type NotificationOutboxActivationGateQuery = {
  companyId: string
  eventType?: string | null
  deliveryStatus?: NotificationOutboxDeliveryStatus | null
  createdAfter?: string | null
  cursor?: string | null
  limit?: number
  includeUnsupported?: boolean
}

const ZERO_MISMATCH_COUNTS: ActivationGateMismatchCounts = {
  MISSING_NOTIFICATION: 0,
  ORPHAN_NOTIFICATION: 0,
  RECIPIENT_MISMATCH: 0,
  SEVERITY_MISMATCH: 0,
  CATEGORY_MISMATCH: 0,
  PRIORITY_MISMATCH: 0,
  DUPLICATE_EVENT_KEY: 0,
  POLICY_GAP: 0,
  UNBOUND_RUNTIME_DELIVERY: 0,
  UNSUPPORTED_EVENT: 0,
  INCONSISTENT_SUPERSEDE_BEHAVIOR: 0,
}

const ACTIVATION_GATE_POLICIES: ActivationGatePolicy[] = [
  {
    gateKey: "governance.replay_commit_intent",
    eventType: "governance.replay_commit_intent_issued",
    displayName: "Governance Replay Commit Intent",
    thresholds: {
      minSampleCount: 5,
      exactMatchRatePercent: 98,
      maxDriftDetectedRatePercent: 1,
      maxPolicyGapCount: 0,
      maxUnsupportedCount: 0,
      zeroToleranceMismatchCodes: [
        "ORPHAN_NOTIFICATION",
        "RECIPIENT_MISMATCH",
        "DUPLICATE_EVENT_KEY",
        "UNBOUND_RUNTIME_DELIVERY",
        "POLICY_GAP",
        "UNSUPPORTED_EVENT",
      ],
    },
    notes: [
      "Governance replay commit intent can become an activation candidate only after drift stays below the defined threshold and all critical mismatch classes remain at zero.",
    ],
  },
  {
    gateKey: "governance.replay_execution",
    eventType: "governance.replay_execution_activated",
    displayName: "Governance Replay Execution Activation",
    thresholds: {
      minSampleCount: 5,
      exactMatchRatePercent: 98,
      maxDriftDetectedRatePercent: 1,
      maxPolicyGapCount: 0,
      maxUnsupportedCount: 0,
      zeroToleranceMismatchCodes: [
        "ORPHAN_NOTIFICATION",
        "RECIPIENT_MISMATCH",
        "DUPLICATE_EVENT_KEY",
        "UNBOUND_RUNTIME_DELIVERY",
        "POLICY_GAP",
        "UNSUPPORTED_EVENT",
      ],
    },
    notes: [
      "Replay execution activation remains gated until shadow-vs-runtime reconciliation proves stable and exact on the current governance flow.",
    ],
  },
  {
    gateKey: "procurement.bill_receipt_posted",
    eventType: "procurement.bill_receipt_posted",
    displayName: "Procurement Bill Receipt Posted",
    thresholds: {
      minSampleCount: 5,
      exactMatchRatePercent: 98,
      maxDriftDetectedRatePercent: 1,
      maxPolicyGapCount: 0,
      maxUnsupportedCount: 0,
      zeroToleranceMismatchCodes: [
        "ORPHAN_NOTIFICATION",
        "RECIPIENT_MISMATCH",
        "DUPLICATE_EVENT_KEY",
        "UNBOUND_RUNTIME_DELIVERY",
        "POLICY_GAP",
        "UNSUPPORTED_EVENT",
      ],
    },
    notes: [
      "This family is expected to remain blocked until the bill receipt posted notification policy is explicitly formalized and policy-gap count reaches zero.",
    ],
  },
]

function percent(part: number, whole: number) {
  if (!whole) return 0
  return Number(((part / whole) * 100).toFixed(2))
}

export class NotificationOutboxActivationGateService {
  private readonly driftAnalyzer: NotificationOutboxDriftAnalyzerService

  constructor(private readonly supabase: SupabaseLike) {
    this.driftAnalyzer = new NotificationOutboxDriftAnalyzerService(supabase)
  }

  async evaluate(
    query: NotificationOutboxActivationGateQuery
  ): Promise<NotificationOutboxActivationGateResult> {
    const createdAfter =
      query.createdAfter ||
      (query.eventType ? resolveNotificationOutboxBaselineCreatedAfter(query.eventType) : null)

    const drift = await this.driftAnalyzer.analyze({
      companyId: query.companyId,
      eventType: query.eventType || null,
      deliveryStatus: query.deliveryStatus || null,
      createdAfter,
      cursor: query.cursor || null,
      limit: query.limit || 100,
      includeUnsupported: query.includeUnsupported !== false,
    })

    const policies = ACTIVATION_GATE_POLICIES
      .filter((policy) => !query.eventType || policy.eventType === query.eventType)
      .map((policy) => this.evaluatePolicy(policy, drift.items))

    return {
      summary: {
        currentMode: "shadow_only",
        recommendedGlobalMode:
          policies.length > 0 &&
          policies.every((policy) => policy.recommendedMode === "activation_candidate")
            ? "activation_candidate"
            : "shadow_only",
        candidateReadyFamilies: policies.filter((policy) => policy.gateStatus === "candidate_ready").length,
        blockedFamilies: policies.filter((policy) => policy.gateStatus === "blocked").length,
        insufficientEvidenceFamilies: policies.filter((policy) => policy.gateStatus === "insufficient_evidence").length,
        authoritativeCutoverAllowed: false,
      },
      filters: drift.filters,
      policies,
      driftSummary: drift.summary,
      nextCursor: drift.nextCursor,
    }
  }

  private evaluatePolicy(
    policy: ActivationGatePolicy,
    items: NotificationOutboxDriftItem[]
  ): NotificationOutboxActivationGateFamily {
    const familyItems = items.filter((item) => item.shadow.eventType === policy.eventType)
    const sampleCount = familyItems.length
    const exactMatchCount = familyItems.filter((item) => item.comparisonStatus === "exact_match").length
    const driftDetectedCount = familyItems.filter((item) => item.comparisonStatus === "drift_detected").length
    const policyGapCount = familyItems.filter((item) => item.comparisonStatus === "policy_gap").length
    const unsupportedCount = familyItems.filter((item) => item.comparisonStatus === "unsupported").length

    const exactMatchRatePercent = percent(exactMatchCount, sampleCount)
    const driftDetectedRatePercent = percent(driftDetectedCount, sampleCount)

    const mismatchCounts = familyItems.reduce<ActivationGateMismatchCounts>((counts, item) => {
      for (const mismatch of item.mismatches) {
        counts[mismatch.code] += 1
      }
      return counts
    }, { ...ZERO_MISMATCH_COUNTS })

    const blockers: string[] = []
    const warnings: string[] = []

    if (sampleCount < policy.thresholds.minSampleCount) {
      blockers.push(
        `INSUFFICIENT_EVIDENCE: sample_count_${sampleCount}_below_min_${policy.thresholds.minSampleCount}`
      )
    }

    if (exactMatchRatePercent < policy.thresholds.exactMatchRatePercent) {
      blockers.push(
        `EXACT_MATCH_RATE_BELOW_THRESHOLD: ${exactMatchRatePercent}% < ${policy.thresholds.exactMatchRatePercent}%`
      )
    }

    if (driftDetectedRatePercent > policy.thresholds.maxDriftDetectedRatePercent) {
      blockers.push(
        `DRIFT_RATE_ABOVE_THRESHOLD: ${driftDetectedRatePercent}% > ${policy.thresholds.maxDriftDetectedRatePercent}%`
      )
    }

    if (policyGapCount > policy.thresholds.maxPolicyGapCount) {
      blockers.push(`POLICY_GAP_PRESENT: ${policyGapCount}`)
    }

    if (unsupportedCount > policy.thresholds.maxUnsupportedCount) {
      blockers.push(`UNSUPPORTED_EVENTS_PRESENT: ${unsupportedCount}`)
    }

    for (const code of policy.thresholds.zeroToleranceMismatchCodes) {
      const count = mismatchCounts[code]
      if (count > 0) {
        blockers.push(`ZERO_TOLERANCE_MISMATCH_${code}: ${count}`)
      }
    }

    if (mismatchCounts.MISSING_NOTIFICATION > 0) {
      warnings.push(`MISSING_NOTIFICATION_PRESENT: ${mismatchCounts.MISSING_NOTIFICATION}`)
    }
    if (mismatchCounts.SEVERITY_MISMATCH > 0) {
      warnings.push(`SEVERITY_MISMATCH_PRESENT: ${mismatchCounts.SEVERITY_MISMATCH}`)
    }
    if (mismatchCounts.CATEGORY_MISMATCH > 0) {
      warnings.push(`CATEGORY_MISMATCH_PRESENT: ${mismatchCounts.CATEGORY_MISMATCH}`)
    }
    if (mismatchCounts.PRIORITY_MISMATCH > 0) {
      warnings.push(`PRIORITY_MISMATCH_PRESENT: ${mismatchCounts.PRIORITY_MISMATCH}`)
    }
    if (mismatchCounts.INCONSISTENT_SUPERSEDE_BEHAVIOR > 0) {
      warnings.push(
        `INCONSISTENT_SUPERSEDE_BEHAVIOR_PRESENT: ${mismatchCounts.INCONSISTENT_SUPERSEDE_BEHAVIOR}`
      )
    }

    const gateStatus: NotificationOutboxActivationGateStatus =
      sampleCount < policy.thresholds.minSampleCount
        ? "insufficient_evidence"
        : blockers.length === 0
          ? "candidate_ready"
          : "blocked"

    return {
      gateKey: policy.gateKey,
      eventType: policy.eventType,
      displayName: policy.displayName,
      currentMode: "shadow_only",
      recommendedMode: gateStatus === "candidate_ready" ? "activation_candidate" : "shadow_only",
      gateStatus,
      dispatcherActivationAllowed: gateStatus === "candidate_ready",
      authoritativeCutoverAllowed: false,
      thresholds: policy.thresholds,
      sampleCount,
      exactMatchCount,
      driftDetectedCount,
      policyGapCount,
      unsupportedCount,
      exactMatchRatePercent,
      driftDetectedRatePercent,
      mismatchCounts,
      blockers,
      warnings,
      notes: policy.notes,
    }
  }
}
