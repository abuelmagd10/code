"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Download, RotateCcw, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type ReplayPlan = {
  success: boolean
  dry_run: boolean
  mode: "trace" | "idempotency_key"
  safety_status: "safe" | "blocked" | "handler_required"
  confidence: "HIGH" | "MEDIUM" | "LOW"
  blocked_reason: "PERIOD_LOCK" | "HASH_MISMATCH" | "MISSING_HANDLER" | "MISSING_REQUEST_HASH" | "MISSING_REPLAY_PAYLOAD" | "MISSING_ARTIFACTS" | "UNKNOWN_PERIOD_STATE" | "NONE"
  is_deterministic: boolean
  replay_supported: boolean
  trace: {
    transaction_id: string
    source_entity: string
    source_id: string
    event_type: string
    idempotency_key: string | null
    request_hash: string | null
    created_at: string
  }
  safety: {
    request_hash_match: boolean | null
    effective_date: string | null
    period_open: boolean | null
    period_message: string | null
    handler_registered: boolean
    requires: {
      handler_registered: boolean
      payload_complete: boolean
      period_open: boolean
      request_hash_match: boolean | null
      lineage_intact: boolean
    }
  }
  current_state: {
    linked_artifacts: Array<{
      entity_type: string
      entity_id: string
      link_role: string | null
      exists: boolean | null
    }>
    missing_artifacts: Array<{
      entity_type: string
      entity_id: string
      link_role: string | null
    }>
  }
  diff: {
    expected_actions: string[]
    blocked_reasons: string[]
    recovery_notes: string[]
    grouped_diff: {
      safety: string[]
      lineage: string[]
      handler: string[]
      payload: string[]
    }
    suggested_fixes: Array<{
      code: string
      type: string
      action: string
      target: string
      priority: "HIGH" | "MEDIUM" | "LOW"
      requires: string[]
      title: string
      description: string
      next_step: string
    }>
  }
  execution?: {
    mode: "shadow"
    execution_ready: boolean
    commit_attempted: false
    commit_performed: false
    writes_performed: string[]
    handler: {
      event_type: string
      registered: boolean
      implemented: boolean
      notes: string
    }
    handler_preview: {
      event_type: string
      handler_id: string
      mode: "shadow_prepare_only"
      prepared: boolean
      error: string | null
      payload_version: string | null
      reference_id: string | null
      effective_date: string | null
      journal_line_count: number
      inventory_transaction_count: number
      bill_update_status: string | null
      writes_performed: []
    } | null
    handler_validation: {
      classification: "EXACT_MATCH" | "NUMERIC_DRIFT" | "STRUCTURAL_MISMATCH" | "MISSING_ARTIFACTS" | "NOT_EVALUATED"
      compared: boolean
      tolerance: {
        monetary: number
        quantity: number
      }
      missing_artifacts: string[]
      journal: {
        expected_line_count: number
        actual_line_count: number
        expected_debit_total: number
        actual_debit_total: number
        expected_credit_total: number
        actual_credit_total: number
        account_mismatches: Array<{ key: string; expected: string | number | null; actual: string | number | null; delta?: number }>
        amount_mismatches: Array<{ key: string; expected: string | number | null; actual: string | number | null; delta?: number }>
      }
      inventory: {
        expected_transaction_count: number
        actual_transaction_count: number
        product_mismatches: Array<{ key: string; expected: string | number | null; actual: string | number | null; delta?: number }>
        quantity_mismatches: Array<{ key: string; expected: string | number | null; actual: string | number | null; delta?: number }>
      }
      notes: string[]
    } | null
    selective_write_policy: {
      phase: "X2.4 Phase B.8 (selective financial write policy)"
      validation_classification: string | null
      execution_mode: "validate_only" | "repair_missing" | "controlled_review" | "blocked"
      financial_writes_allowed: boolean
      financial_writes_reason: string
      allowed_future_modes: Array<"validate_only" | "repair_missing" | "full_replay">
      required_controls: string[]
      blockers: string[]
    }
    replay_confidence: {
      score: number
      threshold: number
      passed: boolean
      classification: "READY_FOR_CONTROLLED_EXECUTION" | "REQUIRES_REVIEW" | "BLOCKED"
      required_validation: "EXACT_MATCH"
      components: {
        determinism_score: number
        payload_completeness_score: number
        validation_score: number
        handler_maturity_score: number
      }
      notes: string[]
    }
    execution_envelope: {
      phase: "X2.4 Phase B.5 (controlled execution envelope)"
      mode: "shadow_commit_intent"
      preview_result_hash: string | null
      preview_hash_algorithm: "sha256:stable-json"
      preview_hash_inputs: {
        trace_id: string
        event_type: string
        payload_version: string | null
        effective_date: string | null
        journal_line_count: number
        inventory_transaction_count: number
        validation_classification: string | null
        replay_confidence_score: number
        replay_confidence_threshold: number
      }
      commit_intent: {
        required: true
        status: "NOT_ISSUED"
        commit_allowed: false
        eligible_for_future_intent: boolean
      }
      double_confirmation: {
        system_readiness_passed: boolean
        manual_approval_required: true
        manual_approval_present: false
        execution_token_required: true
        execution_token_issued: false
      }
      scope: {
        allowed_event_type: "bill_receipt_posting"
        actual_event_type: string
        allowed_payload_version: "bill_receipt_v1"
        actual_payload_version: string | null
        company_id: string
        tenant_scope_required: true
        tenant_allowed: boolean
        tenant_allowlist_source: "env:FINANCIAL_REPLAY_EXECUTION_TENANT_ALLOWLIST" | "not_configured"
      }
      blockers: string[]
      notes: string[]
    }
    gates: Array<{
      code: string
      passed: boolean
      severity: "blocking" | "advisory"
      message: string
    }>
    missing_capabilities: string[]
    simulated_steps: string[]
    safety_notes: string[]
  }
}

type ReplayCoverageReport = {
  success: true
  checked_at: string
  sample_limit: number
  execution_policy: {
    phase: string
    execution_enabled: false
    shadow_mode_only: true
    critical_financial_threshold_percent: 100
    standard_threshold_percent: 90
    determinism_rule: string
    capability_rule: string
    readiness_rule: string
  }
  summary: {
    registered_contracts: number
    implemented_handlers: number
    observed_event_types: number
    observed_registered: number
    observed_unregistered: number
    registered_unobserved: number
    coverage_percent: number
    critical_financial_event_types: number
    critical_financial_coverage_percent: number
    threshold_met: boolean
  }
  coverage: Array<{
    event_type: string
    domain: string
    observed_count: number
    last_seen: string | null
    contract_registered: boolean
    implemented: boolean
    execution_enabled: false
    shadow_supported: boolean
    determinism_policy: string
    replay_strategy: string
    criticality: string
    required_capabilities: string[]
    accepted_payload_versions: string[]
    replay_policy: string
    capability_resolution: Array<{
      capability: string
      implemented: boolean
      enabled: boolean
      version_compatible: boolean
      status: string
      notes: string
    }>
    readiness: string
    readiness_badge: "READY" | "NEEDS_CAPABILITIES" | "BLOCKED"
    blockers: string[]
    warnings: string[]
    notes: string
  }>
}

type ReplayCalibrationReport = {
  success: true
  checked_at: string
  event_type: "bill_receipt_posting"
  payload_version: "bill_receipt_v1"
  sample_limit: number
  sampled_count: number
  threshold: number
  execution_enabled: false
  summary: {
    ready_count: number
    blocked_count: number
    exact_match_count: number
    exact_match_below_threshold_count: number
    high_score_without_exact_match_count: number
    average_score: number
    min_score: number
    max_score: number
  }
  score_distribution: {
    gte_95: number
    between_90_94: number
    between_70_89: number
    lt_70: number
  }
  validation_distribution: {
    EXACT_MATCH: number
    NUMERIC_DRIFT: number
    STRUCTURAL_MISMATCH: number
    MISSING_ARTIFACTS: number
    NOT_EVALUATED: number
  }
  anomalies: Array<{
    trace_id: string
    source_id: string
    created_at: string
    score: number
    validation: string | null
    classification: string | null
    issue: string
    message: string
  }>
  samples: Array<{
    trace_id: string
    source_id: string
    created_at: string
    score: number | null
    threshold: number
    validation: string | null
    classification: string | null
    execution_ready: boolean
    blocked_reason: string | null
    gate_failures: string[]
  }>
}

type ReplayStabilizationReport = {
  success: true
  checked_at: string
  event_type: "bill_receipt_posting"
  payload_version: "bill_receipt_v1"
  requested_window_count: number
  per_window_limit: number
  sampled_count: number
  threshold: number
  execution_enabled: false
  stability_status: "STABLE" | "NEEDS_MORE_DATA" | "UNSTABLE"
  execution_switch: {
    replay_execution_enabled: boolean
    controlled_execution_available: false
    source: "env:FINANCIAL_REPLAY_EXECUTION_ENABLED" | "default_false"
    required_stability_status: "STABLE"
    current_stability_status: "STABLE" | "NEEDS_MORE_DATA" | "UNSTABLE" | "NOT_EVALUATED"
    manual_approval_required: true
    manual_approval_present: boolean
    allowed_event_type: "bill_receipt_posting"
    allowed_payload_version: "bill_receipt_v1"
    execution_allowed: false
    blockers: string[]
  }
  criteria: {
    min_windows: number
    false_positive_required_zero: true
    false_negative_required_zero: true
    max_average_score_range: number
    max_ready_rate_range_percent: number
    threshold_cluster_band: "90-94"
  }
  summary: {
    windows_evaluated: number
    stable_windows: number
    false_positive_count: number
    false_negative_count: number
    threshold_cluster_count: number
    average_score_range: number
    ready_rate_range_percent: number
    exact_match_rate_range_percent: number
    distribution_stable: boolean
    notes: string[]
  }
  windows: Array<{
    window_id: string
    window_date: string
    sampled_count: number
    ready_count: number
    exact_match_count: number
    false_positive_count: number
    false_negative_count: number
    threshold_cluster_count: number
    average_score: number
    ready_rate_percent: number
    exact_match_rate_percent: number
    status: "STABLE" | "NEEDS_REVIEW"
    score_distribution: ReplayCalibrationReport["score_distribution"]
    validation_distribution: ReplayCalibrationReport["validation_distribution"]
    anomalies: ReplayCalibrationReport["anomalies"]
  }>
}

type ReplayCommitIntentResult = {
  success: true
  phase: "X2.4 Phase B.6 (tokenized audit-only activation)"
  intent: {
    id: string
    status: "issued"
    source_trace_id: string
    event_type: string
    payload_version: string
    preview_result_hash: string
    preview_hash_algorithm: "sha256:stable-json"
    token: string
    token_hint: string
    expires_at: string
    approved_by: string
    approved_at: string
  }
  write_guard: {
    preview_hash_match: true
    incoming_preview_hash: string
    recomputed_preview_hash: string
    token_hash_stored: true
    financial_execution_enabled: false
  }
  execution_switch: ReplayStabilizationReport["execution_switch"]
  execution_envelope: NonNullable<ReplayPlan["execution"]>["execution_envelope"]
  stability: {
    checked_at: string
    stability_status: ReplayStabilizationReport["stability_status"]
    sampled_count: number
    summary: ReplayStabilizationReport["summary"]
  }
  notes: string[]
}

type ReplayExecutionActivationResult = {
  success: true
  phase: "X2.4 Phase B.7 (controlled single-path activation)"
  execution: {
    id: string
    status: "validated"
    commit_intent_id: string
    source_trace_id: string
    event_type: string
    payload_version: string
    preview_result_hash: string
    financial_writes_performed: false
    executed_by: string
    executed_at: string
  }
  write_guard: {
    stored_preview_hash: string
    incoming_preview_hash: string
    recomputed_preview_hash: string
    preview_hash_match: true
    token_hash_verified: true
    expiry_checked: true
    intent_consumed: true
    financial_writes_enabled: false
    financial_writes_performed: false
  }
  selective_write_policy: NonNullable<ReplayPlan["execution"]>["selective_write_policy"]
  execution_envelope: NonNullable<ReplayPlan["execution"]>["execution_envelope"]
  notes: string[]
}

const shortId = (value: string | null | undefined) => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : "-"

const safetyClass = (status: ReplayPlan["safety_status"]) => {
  if (status === "safe") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (status === "handler_required") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

const confidenceClass = (confidence: ReplayPlan["confidence"]) => {
  if (confidence === "HIGH") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (confidence === "MEDIUM") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

const readinessBadgeClass = (badge: ReplayCoverageReport["coverage"][number]["readiness_badge"]) => {
  if (badge === "READY") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (badge === "NEEDS_CAPABILITIES") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

const validationClass = (classification: NonNullable<NonNullable<ReplayPlan["execution"]>["handler_validation"]>["classification"]) => {
  if (classification === "EXACT_MATCH") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (classification === "NUMERIC_DRIFT") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

const replayConfidenceClass = (classification: NonNullable<ReplayPlan["execution"]>["replay_confidence"]["classification"]) => {
  if (classification === "READY_FOR_CONTROLLED_EXECUTION") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (classification === "REQUIRES_REVIEW") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

const stabilizationClass = (status: ReplayStabilizationReport["stability_status"] | ReplayStabilizationReport["windows"][number]["status"]) => {
  if (status === "STABLE") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (status === "NEEDS_MORE_DATA") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

const booleanLabel = (value: boolean | null) => value === true ? "true" : value === false ? "false" : "unknown"

export default function FinancialReplayRecoveryPage() {
  const router = useRouter()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [mode, setMode] = useState<"trace" | "idempotency_key">("trace")
  const [traceId, setTraceId] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [requestHash, setRequestHash] = useState("")
  const [plan, setPlan] = useState<ReplayPlan | null>(null)
  const [coverage, setCoverage] = useState<ReplayCoverageReport | null>(null)
  const [calibration, setCalibration] = useState<ReplayCalibrationReport | null>(null)
  const [stabilization, setStabilization] = useState<ReplayStabilizationReport | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [calibrationLoading, setCalibrationLoading] = useState(false)
  const [stabilizationLoading, setStabilizationLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commitIntentLoading, setCommitIntentLoading] = useState(false)
  const [commitIntent, setCommitIntent] = useState<ReplayCommitIntentResult | null>(null)
  const [commitIntentError, setCommitIntentError] = useState<string | null>(null)
  const [executionLoading, setExecutionLoading] = useState(false)
  const [executionActivation, setExecutionActivation] = useState<ReplayExecutionActivationResult | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)

  useEffect(() => {
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === "en") { setAppLang("en"); return }
        const fromCookie = document.cookie.split("; ").find((item) => item.startsWith("app_language="))?.split("=")[1]
        const next = fromCookie || localStorage.getItem("app_language") || "ar"
        setAppLang(next === "en" ? "en" : "ar")
      } catch {
        setAppLang("ar")
      }
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  useEffect(() => {
    let mounted = true
    const loadReadinessSurfaces = async () => {
      setCoverageLoading(true)
      setCalibrationLoading(true)
      setStabilizationLoading(true)
      try {
        const [coverageResponse, calibrationResponse, stabilizationResponse] = await Promise.all([
          fetch("/api/financial-operations/replay-coverage?sample_limit=5000"),
          fetch("/api/financial-operations/replay-calibration?sample_limit=50"),
          fetch("/api/financial-operations/replay-stabilization?window_count=5&per_window_limit=10"),
        ])
        const coveragePayload = await coverageResponse.json().catch(() => ({}))
        const calibrationPayload = await calibrationResponse.json().catch(() => ({}))
        const stabilizationPayload = await stabilizationResponse.json().catch(() => ({}))
        if (mounted && coverageResponse.ok && coveragePayload?.success) setCoverage(coveragePayload)
        if (mounted && calibrationResponse.ok && calibrationPayload?.success) setCalibration(calibrationPayload)
        if (mounted && stabilizationResponse.ok && stabilizationPayload?.success) setStabilization(stabilizationPayload)
      } finally {
        if (mounted) {
          setCoverageLoading(false)
          setCalibrationLoading(false)
          setStabilizationLoading(false)
        }
      }
    }
    loadReadinessSurfaces()
    return () => {
      mounted = false
    }
  }, [])

  const t = (en: string, ar: string) => appLang === "en" ? en : ar
  const replayInputReady = mode === "trace" ? Boolean(traceId.trim()) : Boolean(idempotencyKey.trim())
  const buildReplayBody = () => mode === "trace"
    ? { trace_id: traceId.trim(), request_hash: requestHash.trim() || null, dry_run: true }
    : { idempotency_key: idempotencyKey.trim(), request_hash: requestHash.trim() || null, dry_run: true }

  const runDryRun = async () => {
    setLoading(true)
    setError(null)
    setCommitIntent(null)
    setCommitIntentError(null)
    setExecutionActivation(null)
    setExecutionError(null)
    setPlan(null)
    try {
      const endpoint = mode === "trace" ? "/api/financial-operations/replay-trace" : "/api/financial-operations/replay"

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReplayBody()),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to plan replay")
      }
      setPlan(payload)
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to plan replay"))
    } finally {
      setLoading(false)
    }
  }

  const runShadowExecution = async () => {
    setLoading(true)
    setError(null)
    setCommitIntent(null)
    setCommitIntentError(null)
    setExecutionActivation(null)
    setExecutionError(null)
    setPlan(null)
    try {
      const response = await fetch("/api/financial-operations/replay-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildReplayBody(), mode: "shadow" }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to evaluate shadow replay execution")
      }
      setPlan(payload)
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to evaluate shadow replay execution"))
    } finally {
      setLoading(false)
    }
  }

  const issueCommitIntent = async () => {
    if (!plan?.execution?.execution_envelope.preview_result_hash) return
    setCommitIntentLoading(true)
    setCommitIntent(null)
    setCommitIntentError(null)
    setExecutionActivation(null)
    setExecutionError(null)
    try {
      const response = await fetch("/api/financial-operations/replay-commit-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: plan.trace.transaction_id,
          request_hash: plan.trace.request_hash,
          preview_result_hash: plan.execution.execution_envelope.preview_result_hash,
          manual_approval: true,
          ttl_minutes: 15,
          ui_surface: "financial_replay_recovery_console",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to issue replay commit intent")
      }
      setCommitIntent(payload)
    } catch (err: any) {
      setCommitIntentError(String(err?.message || err || "Failed to issue replay commit intent"))
    } finally {
      setCommitIntentLoading(false)
    }
  }

  const activateExecution = async () => {
    if (!commitIntent?.intent.token) return
    setExecutionLoading(true)
    setExecutionActivation(null)
    setExecutionError(null)
    try {
      const response = await fetch("/api/financial-operations/replay-executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent_id: commitIntent.intent.id,
          token: commitIntent.intent.token,
          preview_result_hash: commitIntent.intent.preview_result_hash,
          ui_surface: "financial_replay_recovery_console",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to activate replay execution")
      }
      setExecutionActivation(payload)
    } catch (err: any) {
      setExecutionError(String(err?.message || err || "Failed to activate replay execution"))
    } finally {
      setExecutionLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-stone-50 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200 px-3 py-1 text-xs font-medium mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("X2.3 Dry-Run Replay Planner", "X2.3 مخطط إعادة التشغيل التجريبي")}
            </div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
              {t("Financial Replay & Recovery", "إعادة تشغيل واسترداد العمليات المالية")}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t("Plan replay safely by trace or idempotency key. Execution is blocked until an event-specific handler is registered.", "خطط لإعادة التشغيل بأمان عبر trace أو idempotency key. التنفيذ الفعلي محجوب حتى تسجيل handler صريح لكل نوع حدث.")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="w-4 h-4 mr-2" />
              {t("Print", "طباعة")}
            </Button>
            <Button variant="outline" onClick={() => router.push("/reports")}>
              <ArrowRight className="w-4 h-4 mr-2" />
              {t("Back", "رجوع")}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("Handler Coverage Map", "خريطة تغطية Replay Handlers")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {coverageLoading && !coverage ? (
                <p className="text-sm text-gray-500">{t("Loading coverage...", "جاري تحميل التغطية...")}</p>
              ) : coverage ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{t("Coverage", "التغطية")}</p>
                      <p className="text-2xl font-bold">{coverage.summary.coverage_percent}%</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{t("Critical Coverage", "تغطية الحرِج")}</p>
                      <p className="text-2xl font-bold">{coverage.summary.critical_financial_coverage_percent}%</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{t("Contracts", "العقود")}</p>
                      <p className="text-2xl font-bold">{coverage.summary.registered_contracts}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{t("Implemented", "مفعل")}</p>
                      <p className="text-2xl font-bold">{coverage.summary.implemented_handlers}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{t("Observed", "مرصود")}</p>
                      <p className="text-2xl font-bold">{coverage.summary.observed_event_types}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">{t("Unregistered", "غير مسجل")}</p>
                      <p className="text-2xl font-bold">{coverage.summary.observed_unregistered}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{coverage.execution_policy.phase}</p>
                      <span className={`rounded-full px-2 py-0.5 ${coverage.summary.threshold_met ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}`}>
                        {coverage.summary.threshold_met ? t("threshold met", "الحد محقق") : t("threshold blocked", "الحد غير محقق")}
                      </span>
                    </div>
                    <p>{t("Critical threshold", "حد الأحداث الحرجة")}: {coverage.execution_policy.critical_financial_threshold_percent}% / {t("standard threshold", "الحد القياسي")}: {coverage.execution_policy.standard_threshold_percent}%</p>
                    <p>{coverage.execution_policy.determinism_rule}</p>
                    <p>{coverage.execution_policy.capability_rule}</p>
                    <p>{coverage.execution_policy.readiness_rule}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-2 pr-3">{t("Event Type", "نوع الحدث")}</th>
                          <th className="py-2 pr-3">{t("Domain", "النطاق")}</th>
                          <th className="py-2 pr-3">{t("Observed", "مرصود")}</th>
                          <th className="py-2 pr-3">{t("Badge", "الشارة")}</th>
                          <th className="py-2 pr-3">{t("Contract", "العقد")}</th>
                          <th className="py-2 pr-3">{t("Criticality", "الأهمية")}</th>
                          <th className="py-2 pr-3">{t("Policy", "السياسة")}</th>
                          <th className="py-2 pr-3">{t("Determinism", "الحتمية")}</th>
                          <th className="py-2 pr-3">{t("Blockers", "العوائق")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coverage.coverage
                          .filter((item) => item.observed_count > 0 || item.readiness !== "contract_registered")
                          .slice(0, 24)
                          .map((item) => (
                            <tr key={item.event_type} className="border-t">
                              <td className="py-2 pr-3 font-mono">{item.event_type}</td>
                              <td className="py-2 pr-3">{item.domain}</td>
                              <td className="py-2 pr-3">{item.observed_count}</td>
                              <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 ${readinessBadgeClass(item.readiness_badge)}`}>{item.readiness_badge}</span></td>
                              <td className="py-2 pr-3">{item.contract_registered ? t("registered", "مسجل") : t("missing", "ناقص")}</td>
                              <td className="py-2 pr-3">{item.criticality}</td>
                              <td className="py-2 pr-3">{item.replay_policy}{item.accepted_payload_versions.length > 0 ? ` (${item.accepted_payload_versions.join(", ")})` : ""}</td>
                              <td className="py-2 pr-3">{item.determinism_policy}</td>
                              <td className="py-2 pr-3">{item.blockers.concat(item.warnings).join(", ") || item.readiness}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">{t("Coverage map is not available yet.", "خريطة التغطية غير متاحة بعد.")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Replay Confidence Calibration", "معايرة ثقة إعادة التشغيل")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {calibrationLoading && !calibration ? (
                <p className="text-sm text-gray-500">{t("Loading calibration sample...", "جاري تحميل عينة المعايرة...")}</p>
              ) : calibration ? (
                <>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/30 p-3 text-xs text-cyan-900 dark:text-cyan-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{calibration.event_type} / {calibration.payload_version}</p>
                      <span className="rounded-full bg-slate-100 text-slate-800 dark:bg-slate-900/70 dark:text-slate-200 px-2 py-0.5">
                        {t("execution disabled", "التنفيذ مغلق")}
                      </span>
                    </div>
                    <p>{t("Sampled", "العينة")}: {calibration.sampled_count}/{calibration.sample_limit} · {t("threshold", "الحد")}: {calibration.threshold}</p>
                    <p>{t("Checked at", "وقت الفحص")}: {calibration.checked_at}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Average", "المتوسط")}</p><p className="text-2xl font-bold">{calibration.summary.average_score}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Min", "الأدنى")}</p><p className="text-2xl font-bold">{calibration.summary.min_score}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Max", "الأعلى")}</p><p className="text-2xl font-bold">{calibration.summary.max_score}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Ready", "جاهز")}</p><p className="text-2xl font-bold">{calibration.summary.ready_count}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Exact", "مطابق")}</p><p className="text-2xl font-bold">{calibration.summary.exact_match_count}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Anomalies", "شذوذ")}</p><p className="text-2xl font-bold">{calibration.anomalies.length}</p></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="font-medium mb-2">{t("Score Distribution", "توزيع الدرجات")}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-gray-500">≥ 95</p><p className="font-mono">{calibration.score_distribution.gte_95}</p></div>
                        <div><p className="text-gray-500">90–94</p><p className="font-mono">{calibration.score_distribution.between_90_94}</p></div>
                        <div><p className="text-gray-500">70–89</p><p className="font-mono">{calibration.score_distribution.between_70_89}</p></div>
                        <div><p className="text-gray-500">&lt; 70</p><p className="font-mono">{calibration.score_distribution.lt_70}</p></div>
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium mb-2">{t("Validation Distribution", "توزيع المطابقة")}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(calibration.validation_distribution).map(([key, value]) => (
                          <div key={key}><p className="text-gray-500">{key}</p><p className="font-mono">{value}</p></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {calibration.anomalies.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
                      <p className="font-medium text-red-800 dark:text-red-200 mb-2">{t("Calibration Anomalies", "شذوذ المعايرة")}</p>
                      <div className="space-y-2">
                        {calibration.anomalies.slice(0, 8).map((item) => (
                          <div key={`${item.trace_id}-${item.issue}`} className="rounded bg-white/70 dark:bg-slate-900/60 p-2 text-xs">
                            <p className="font-mono">{shortId(item.trace_id)} · {item.issue} · {item.score}</p>
                            <p className="text-gray-600 dark:text-gray-300">{item.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-2 pr-3">{t("Trace", "التتبع")}</th>
                          <th className="py-2 pr-3">{t("Score", "الدرجة")}</th>
                          <th className="py-2 pr-3">{t("Validation", "المطابقة")}</th>
                          <th className="py-2 pr-3">{t("Classification", "التصنيف")}</th>
                          <th className="py-2 pr-3">{t("Ready", "جاهز")}</th>
                          <th className="py-2 pr-3">{t("Failures", "الفشل")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calibration.samples.slice(0, 20).map((sample) => (
                          <tr key={sample.trace_id} className="border-t">
                            <td className="py-2 pr-3 font-mono">{shortId(sample.trace_id)}</td>
                            <td className="py-2 pr-3 font-mono">{sample.score ?? "-"}/{sample.threshold}</td>
                            <td className="py-2 pr-3">{sample.validation || "-"}</td>
                            <td className="py-2 pr-3">{sample.classification || "-"}</td>
                            <td className="py-2 pr-3">{sample.execution_ready ? t("yes", "نعم") : t("no", "لا")}</td>
                            <td className="py-2 pr-3">{sample.gate_failures.join(", ") || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">{t("Calibration sample is not available yet.", "عينة المعايرة غير متاحة بعد.")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Calibration Stabilization", "استقرار المعايرة")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stabilizationLoading && !stabilization ? (
                <p className="text-sm text-gray-500">{t("Loading stabilization windows...", "جاري تحميل نوافذ الاستقرار...")}</p>
              ) : stabilization ? (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{stabilization.event_type} / {stabilization.payload_version}</p>
                      <span className={`rounded-full px-2 py-0.5 ${stabilizationClass(stabilization.stability_status)}`}>
                        {stabilization.stability_status}
                      </span>
                    </div>
                    <p>{t("Windows", "النوافذ")}: {stabilization.summary.windows_evaluated}/{stabilization.requested_window_count} · {t("Per window", "لكل نافذة")}: {stabilization.per_window_limit} · {t("Sampled", "العينة")}: {stabilization.sampled_count}</p>
                    <p>{t("Execution", "التنفيذ")}: {stabilization.execution_enabled ? t("enabled", "مفعل") : t("disabled", "مغلق")} · {t("Checked at", "وقت الفحص")}: {stabilization.checked_at}</p>
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-xs text-red-900 dark:text-red-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{t("Execution Readiness Switch", "قاطع جاهزية التنفيذ")}</p>
                      <span className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100 px-2 py-0.5">
                        {stabilization.execution_switch.execution_allowed ? t("allowed", "مسموح") : t("blocked", "محجوب")}
                      </span>
                    </div>
                    <p>{t("Flag", "العلم")}: {String(stabilization.execution_switch.replay_execution_enabled)} · {t("Source", "المصدر")}: {stabilization.execution_switch.source}</p>
                    <p>{t("Required stability", "الاستقرار المطلوب")}: {stabilization.execution_switch.required_stability_status} · {t("Current", "الحالي")}: {stabilization.execution_switch.current_stability_status}</p>
                    <p>{t("Manual approval", "الموافقة اليدوية")}: {String(stabilization.execution_switch.manual_approval_present)} · {t("Controlled execution available", "التنفيذ المحكوم متاح")}: {String(stabilization.execution_switch.controlled_execution_available)}</p>
                    <p>{t("Blockers", "العوائق")}: {stabilization.execution_switch.blockers.join(", ") || "-"}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Stable Windows", "نوافذ مستقرة")}</p><p className="text-2xl font-bold">{stabilization.summary.stable_windows}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("False Positive", "إيجابي كاذب")}</p><p className="text-2xl font-bold">{stabilization.summary.false_positive_count}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("False Negative", "سلبي كاذب")}</p><p className="text-2xl font-bold">{stabilization.summary.false_negative_count}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("90-94 Cluster", "تكتل 90-94")}</p><p className="text-2xl font-bold">{stabilization.summary.threshold_cluster_count}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Score Range", "مدى الدرجات")}</p><p className="text-2xl font-bold">{stabilization.summary.average_score_range}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">{t("Ready Range", "مدى الجاهزية")}</p><p className="text-2xl font-bold">{stabilization.summary.ready_rate_range_percent}%</p></div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100">
                    <p className="font-medium mb-1">{t("Stability Criteria", "معايير الاستقرار")}</p>
                    <p>{t("Minimum windows", "الحد الأدنى للنوافذ")}: {stabilization.criteria.min_windows}</p>
                    <p>{t("False positives", "الإيجابيات الكاذبة")}: 0 · {t("False negatives", "السلبيات الكاذبة")}: 0</p>
                    <p>{t("Max average score range", "أقصى مدى لمتوسط الدرجة")}: {stabilization.criteria.max_average_score_range} · {t("Max ready-rate range", "أقصى مدى لنسبة الجاهزية")}: {stabilization.criteria.max_ready_rate_range_percent}%</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-2 pr-3">{t("Window", "النافذة")}</th>
                          <th className="py-2 pr-3">{t("Status", "الحالة")}</th>
                          <th className="py-2 pr-3">{t("Sampled", "العينة")}</th>
                          <th className="py-2 pr-3">{t("Average", "المتوسط")}</th>
                          <th className="py-2 pr-3">{t("Ready %", "جاهزية %")}</th>
                          <th className="py-2 pr-3">{t("Exact %", "مطابقة %")}</th>
                          <th className="py-2 pr-3">{t("FP/FN", "FP/FN")}</th>
                          <th className="py-2 pr-3">{t("Cluster", "تكتل")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stabilization.windows.map((window) => (
                          <tr key={window.window_id} className="border-t">
                            <td className="py-2 pr-3 font-mono">{window.window_date}</td>
                            <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 ${stabilizationClass(window.status)}`}>{window.status}</span></td>
                            <td className="py-2 pr-3">{window.sampled_count}</td>
                            <td className="py-2 pr-3">{window.average_score}</td>
                            <td className="py-2 pr-3">{window.ready_rate_percent}%</td>
                            <td className="py-2 pr-3">{window.exact_match_rate_percent}%</td>
                            <td className="py-2 pr-3">{window.false_positive_count}/{window.false_negative_count}</td>
                            <td className="py-2 pr-3">{window.threshold_cluster_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {stabilization.summary.notes.map((note) => (
                      <span key={note} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs">{note}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">{t("Stabilization report is not available yet.", "تقرير الاستقرار غير متاح بعد.")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Replay Scope", "نطاق إعادة التشغيل")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm mb-1">{t("Mode", "الوضع")}</label>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as "trace" | "idempotency_key")}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="trace">{t("Trace ID", "معرف التتبع")}</option>
                  <option value="idempotency_key">{t("Idempotency Key", "مفتاح عدم التكرار")}</option>
                </select>
              </div>
              {mode === "trace" ? (
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">{t("Trace ID", "معرف التتبع")}</label>
                  <Input value={traceId} onChange={(event) => setTraceId(event.target.value)} placeholder="UUID" />
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">{t("Idempotency Key", "مفتاح عدم التكرار")}</label>
                  <Input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} />
                </div>
              )}
              <div>
                <label className="block text-sm mb-1">{t("Request Hash", "request hash")}</label>
                <Input value={requestHash} onChange={(event) => setRequestHash(event.target.value)} placeholder={t("Optional", "اختياري")} />
              </div>
              <div className="md:col-span-4">
                <Button disabled={loading || !replayInputReady} onClick={runDryRun}>
                  <RotateCcw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  {loading ? t("Planning...", "جاري التخطيط...") : t("Run Dry-Run Replay Plan", "تشغيل خطة Dry-Run")}
                </Button>
                <Button className="ml-2" variant="outline" disabled={loading || !replayInputReady} onClick={runShadowExecution}>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {t("Evaluate Shadow Execution Gates", "تقييم بوابات التنفيذ الظلي")}
                </Button>
              </div>
              {error && (
                <div className="md:col-span-4 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200 p-3 text-sm">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {plan && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Safety", "السلامة")}</p><span className={`inline-flex mt-2 rounded-full px-2 py-0.5 text-xs ${safetyClass(plan.safety_status)}`}>{plan.safety_status}</span></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Confidence", "درجة الثقة")}</p><span className={`inline-flex mt-2 rounded-full px-2 py-0.5 text-xs ${confidenceClass(plan.confidence)}`}>{plan.confidence}</span></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Blocked Reason", "سبب الحجب")}</p><p className="text-sm font-mono mt-2">{plan.blocked_reason}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Deterministic", "حتمي")}</p><p className="text-2xl font-bold">{plan.is_deterministic ? t("Yes", "نعم") : t("No", "لا")}</p></CardContent></Card>
              </div>

              <Card>
                <CardHeader><CardTitle>{t("Replay Plan", "خطة إعادة التشغيل")}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">{t("Trace", "التتبع")}</p>
                      <p className="font-mono">{shortId(plan.trace.transaction_id)}</p>
                      <p>{plan.trace.event_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t("Safety Checks", "فحوصات السلامة")}</p>
                      <p>{t("Request hash match", "تطابق request hash")}: {String(plan.safety.request_hash_match ?? "not provided")}</p>
                      <p>{t("Period open", "الفترة مفتوحة")}: {String(plan.safety.period_open ?? "unknown")}</p>
                      <p>{t("Effective date", "تاريخ التنفيذ")}: {plan.safety.effective_date || "-"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="font-medium mb-2">{t("Required Capabilities", "المتطلبات اللازمة")}</p>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      {Object.entries(plan.safety.requires || {}).map(([key, value]) => (
                        <div key={key} className="rounded-lg border p-3">
                          <p className="text-xs text-gray-500">{key}</p>
                          <p className="font-mono text-sm">{booleanLabel(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {plan.execution && (
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 dark:border-cyan-900 dark:bg-cyan-950/30 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{t("X2.4 Shadow Execution Gates", "بوابات التنفيذ الظلي X2.4")}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-300">
                            {t("No commit is attempted in shadow mode.", "لا توجد أي محاولة commit في وضع التنفيذ الظلي.")}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs ${plan.execution.execution_ready ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}`}>
                          {plan.execution.execution_ready ? t("Ready", "جاهز") : t("Gated", "محجوب")}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3">
                          <p className="text-xs text-gray-500">{t("Handler", "المعالج")}</p>
                          <p className="font-mono">{plan.execution.handler.event_type}</p>
                          <p className="text-xs text-gray-500">{plan.execution.handler.implemented ? t("implemented", "مفعل") : t("not implemented", "غير مفعل")}</p>
                        </div>
                        <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3">
                          <p className="text-xs text-gray-500">{t("Commit", "الترحيل")}</p>
                          <p className="font-mono">{t("attempted", "محاولة")}: {String(plan.execution.commit_attempted)}</p>
                          <p className="font-mono">{t("performed", "تم التنفيذ")}: {String(plan.execution.commit_performed)}</p>
                        </div>
                        <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3">
                          <p className="text-xs text-gray-500">{t("Missing Capabilities", "المتطلبات الناقصة")}</p>
                          <p className="font-mono break-words">{plan.execution.missing_capabilities.join(", ") || "-"}</p>
                        </div>
                      </div>

                      {plan.execution.handler_preview && (
                        <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{t("Handler Shadow Preview", "معاينة المعالج الظلية")}</p>
                              <p className="text-xs text-gray-500 font-mono">{plan.execution.handler_preview.handler_id} / {plan.execution.handler_preview.payload_version || "-"}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${plan.execution.handler_preview.prepared ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}`}>
                              {plan.execution.handler_preview.prepared ? t("prepared", "جاهز") : t("failed", "فشل")}
                            </span>
                          </div>
                          {plan.execution.handler_preview.error && (
                            <p className="text-xs text-red-700 dark:text-red-300 mt-2">{plan.execution.handler_preview.error}</p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
                            <div className="rounded border p-2"><p className="text-xs text-gray-500">{t("Journal lines", "سطور القيد")}</p><p className="font-mono">{plan.execution.handler_preview.journal_line_count}</p></div>
                            <div className="rounded border p-2"><p className="text-xs text-gray-500">{t("Inventory tx", "حركات المخزون")}</p><p className="font-mono">{plan.execution.handler_preview.inventory_transaction_count}</p></div>
                            <div className="rounded border p-2"><p className="text-xs text-gray-500">{t("Effective date", "تاريخ التنفيذ")}</p><p className="font-mono">{plan.execution.handler_preview.effective_date || "-"}</p></div>
                            <div className="rounded border p-2"><p className="text-xs text-gray-500">{t("Writes", "الكتابات")}</p><p className="font-mono">{plan.execution.handler_preview.writes_performed.length}</p></div>
                          </div>
                        </div>
                      )}

                      {plan.execution.handler_validation && (
                        <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{t("Historical Artifact Validation", "تحقق المطابقة مع الآثار التاريخية")}</p>
                              <p className="text-xs text-gray-500">
                                {t("Read-only comparison between handler preview and linked journal/inventory artifacts.", "مقارنة قراءة فقط بين معاينة المعالج والقيود/حركات المخزون المرتبطة.")}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${validationClass(plan.execution.handler_validation.classification)}`}>
                              {plan.execution.handler_validation.classification}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                            <div className="rounded border p-3">
                              <p className="font-medium mb-2">{t("Journal", "القيد")}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><p className="text-gray-500">{t("Lines expected", "السطور المتوقعة")}</p><p className="font-mono">{plan.execution.handler_validation.journal.expected_line_count}</p></div>
                                <div><p className="text-gray-500">{t("Lines actual", "السطور الفعلية")}</p><p className="font-mono">{plan.execution.handler_validation.journal.actual_line_count}</p></div>
                                <div><p className="text-gray-500">{t("Debit expected", "مدين متوقع")}</p><p className="font-mono">{plan.execution.handler_validation.journal.expected_debit_total}</p></div>
                                <div><p className="text-gray-500">{t("Debit actual", "مدين فعلي")}</p><p className="font-mono">{plan.execution.handler_validation.journal.actual_debit_total}</p></div>
                                <div><p className="text-gray-500">{t("Credit expected", "دائن متوقع")}</p><p className="font-mono">{plan.execution.handler_validation.journal.expected_credit_total}</p></div>
                                <div><p className="text-gray-500">{t("Credit actual", "دائن فعلي")}</p><p className="font-mono">{plan.execution.handler_validation.journal.actual_credit_total}</p></div>
                              </div>
                            </div>

                            <div className="rounded border p-3">
                              <p className="font-medium mb-2">{t("Inventory", "المخزون")}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><p className="text-gray-500">{t("Tx expected", "حركات متوقعة")}</p><p className="font-mono">{plan.execution.handler_validation.inventory.expected_transaction_count}</p></div>
                                <div><p className="text-gray-500">{t("Tx actual", "حركات فعلية")}</p><p className="font-mono">{plan.execution.handler_validation.inventory.actual_transaction_count}</p></div>
                                <div><p className="text-gray-500">{t("Money tolerance", "سماحية المال")}</p><p className="font-mono">{plan.execution.handler_validation.tolerance.monetary}</p></div>
                                <div><p className="text-gray-500">{t("Qty tolerance", "سماحية الكمية")}</p><p className="font-mono">{plan.execution.handler_validation.tolerance.quantity}</p></div>
                              </div>
                            </div>
                          </div>

                          {(plan.execution.handler_validation.missing_artifacts.length > 0 ||
                            plan.execution.handler_validation.journal.account_mismatches.length > 0 ||
                            plan.execution.handler_validation.journal.amount_mismatches.length > 0 ||
                            plan.execution.handler_validation.inventory.product_mismatches.length > 0 ||
                            plan.execution.handler_validation.inventory.quantity_mismatches.length > 0) && (
                            <pre className="text-xs overflow-auto rounded bg-slate-950 text-slate-100 p-3 max-h-56 mt-3">
                              {JSON.stringify({
                                missing_artifacts: plan.execution.handler_validation.missing_artifacts,
                                journal_account_mismatches: plan.execution.handler_validation.journal.account_mismatches,
                                journal_amount_mismatches: plan.execution.handler_validation.journal.amount_mismatches,
                                inventory_product_mismatches: plan.execution.handler_validation.inventory.product_mismatches,
                                inventory_quantity_mismatches: plan.execution.handler_validation.inventory.quantity_mismatches,
                              }, null, 2)}
                            </pre>
                          )}

                          {plan.execution.handler_validation.notes.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {plan.execution.handler_validation.notes.map((note) => (
                                <span key={note} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs">{note}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{t("Replay Confidence Gate", "بوابة ثقة إعادة التشغيل")}</p>
                            <p className="text-xs text-gray-500">
                              {t("Shadow-only readiness score before any future controlled execution.", "درجة جاهزية ظلّية فقط قبل أي تنفيذ محكوم لاحقًا.")}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${replayConfidenceClass(plan.execution.replay_confidence.classification)}`}>
                            {plan.execution.replay_confidence.classification}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-3">
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Score", "الدرجة")}</p>
                            <p className="font-mono">{plan.execution.replay_confidence.score}/{plan.execution.replay_confidence.threshold}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Determinism", "الحتمية")}</p>
                            <p className="font-mono">{plan.execution.replay_confidence.components.determinism_score}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Payload", "الحمولة")}</p>
                            <p className="font-mono">{plan.execution.replay_confidence.components.payload_completeness_score}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Validation", "المطابقة")}</p>
                            <p className="font-mono">{plan.execution.replay_confidence.components.validation_score}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Handler", "المعالج")}</p>
                            <p className="font-mono">{plan.execution.replay_confidence.components.handler_maturity_score}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {plan.execution.replay_confidence.notes.map((note) => (
                            <span key={note} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs">{note}</span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{t("Selective Write Policy", "سياسة الكتابة الانتقائية")}</p>
                            <p className="text-xs text-gray-500">
                              {t("B.8 blocks duplicate writes and only classifies future repair candidates.", "B.8 تمنع الكتابة المكررة وتكتفي بتصنيف الحالات المرشحة للإصلاح لاحقًا.")}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${plan.execution.selective_write_policy.financial_writes_allowed ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}`}>
                            {plan.execution.selective_write_policy.execution_mode}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Validation", "المطابقة")}</p>
                            <p className="font-mono">{plan.execution.selective_write_policy.validation_classification || "-"}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Writes allowed", "الكتابة مسموحة")}</p>
                            <p className="font-mono">{String(plan.execution.selective_write_policy.financial_writes_allowed)}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Future modes", "الأوضاع المستقبلية")}</p>
                            <p className="font-mono">{plan.execution.selective_write_policy.allowed_future_modes.join(", ")}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                          {plan.execution.selective_write_policy.financial_writes_reason}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {plan.execution.selective_write_policy.blockers.map((blocker) => (
                            <span key={blocker} className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-3 py-1 text-xs">{blocker}</span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{t("Controlled Execution Envelope", "غلاف التنفيذ المحكوم")}</p>
                            <p className="text-xs text-gray-500">
                              {t("B.6 can issue an audit-only commit intent token after re-validating the preview hash; financial execution remains closed.", "يمكن لـ B.6 إصدار token لنية تنفيذ قابلة للتدقيق بعد إعادة التحقق من هاش المعاينة؛ التنفيذ المالي لا يزال مغلقًا.")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-2 py-0.5 text-xs">
                              {plan.execution.execution_envelope.commit_intent.commit_allowed ? t("commit allowed", "commit مسموح") : t("commit blocked", "commit محجوب")}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!plan.execution.execution_envelope.preview_result_hash || commitIntentLoading}
                              onClick={issueCommitIntent}
                            >
                              {commitIntentLoading ? t("Issuing...", "جاري الإصدار...") : t("Issue Audit Intent", "إصدار نية تدقيق")}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Preview Hash", "هاش المعاينة")}</p>
                            <p className="font-mono break-all">{shortId(plan.execution.execution_envelope.preview_result_hash)}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Commit Intent", "نية التنفيذ")}</p>
                            <p className="font-mono">{plan.execution.execution_envelope.commit_intent.status}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Tenant Allowed", "النطاق مسموح")}</p>
                            <p className="font-mono">{String(plan.execution.execution_envelope.scope.tenant_allowed)}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("System Ready", "جاهزية النظام")}</p>
                            <p className="font-mono">{String(plan.execution.execution_envelope.double_confirmation.system_readiness_passed)}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Manual Approval", "الموافقة اليدوية")}</p>
                            <p className="font-mono">{String(plan.execution.execution_envelope.double_confirmation.manual_approval_present)}</p>
                          </div>
                          <div className="rounded border p-2">
                            <p className="text-xs text-gray-500">{t("Token Issued", "Token صادر")}</p>
                            <p className="font-mono">{String(plan.execution.execution_envelope.double_confirmation.execution_token_issued)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {plan.execution.execution_envelope.blockers.map((blocker) => (
                            <span key={blocker} className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-3 py-1 text-xs">{blocker}</span>
                          ))}
                        </div>

                        {commitIntentError && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                            <p className="font-medium">{t("Commit intent was not issued", "لم يتم إصدار نية التنفيذ")}</p>
                            <p className="mt-1 break-all">{commitIntentError}</p>
                          </div>
                        )}

                        {commitIntent && (
                          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">{t("Audit-only commit intent issued", "تم إصدار نية تنفيذ للتدقيق فقط")}</p>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100">
                                {commitIntent.intent.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                              <p>{t("Intent", "النية")}: <span className="font-mono">{shortId(commitIntent.intent.id)}</span></p>
                              <p>{t("Expires", "تنتهي")}: <span className="font-mono">{commitIntent.intent.expires_at}</span></p>
                              <p>{t("Token hint", "تلميح token")}: <span className="font-mono">{commitIntent.intent.token_hint}</span></p>
                              <p>{t("Hash guard", "حارس الهاش")}: <span className="font-mono">{String(commitIntent.write_guard.preview_hash_match)}</span></p>
                            </div>
                            <div className="mt-3 rounded border border-emerald-200 bg-white/70 p-2 dark:border-emerald-900/60 dark:bg-slate-950/40">
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-200">
                                {t("One-time token. Only token_hash is stored; financial replay execution is still disabled.", "Token لمرة واحدة. يتم تخزين token_hash فقط؛ التنفيذ المالي لإعادة التشغيل لا يزال مغلقًا.")}
                              </p>
                              <p className="font-mono break-all mt-1">{commitIntent.intent.token}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={executionLoading || Boolean(executionActivation)}
                                onClick={activateExecution}
                              >
                                {executionLoading ? t("Activating...", "جاري التفعيل...") : t("Activate Execution Audit", "تفعيل سجل التنفيذ")}
                              </Button>
                              <span className="text-[11px] text-emerald-700 dark:text-emerald-200">
                                {t("Consumes the token and records B.7 execution audit; still no financial artifact writes.", "يستهلك الـtoken ويسجل تدقيق تنفيذ B.7؛ لا توجد كتابة artifacts مالية بعد.")}
                              </span>
                            </div>
                          </div>
                        )}

                        {executionError && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                            <p className="font-medium">{t("Execution activation failed", "فشل تفعيل التنفيذ")}</p>
                            <p className="mt-1 break-all">{executionError}</p>
                          </div>
                        )}

                        {executionActivation && (
                          <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">{t("B.7 execution audit recorded", "تم تسجيل تدقيق تنفيذ B.7")}</p>
                              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-100">
                                {executionActivation.execution.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                              <p>{t("Execution", "التنفيذ")}: <span className="font-mono">{shortId(executionActivation.execution.id)}</span></p>
                              <p>{t("Executed at", "وقت التنفيذ")}: <span className="font-mono">{executionActivation.execution.executed_at}</span></p>
                              <p>{t("Intent consumed", "تم استهلاك النية")}: <span className="font-mono">{String(executionActivation.write_guard.intent_consumed)}</span></p>
                              <p>{t("Financial writes", "الكتابات المالية")}: <span className="font-mono">{String(executionActivation.write_guard.financial_writes_performed)}</span></p>
                              <p>{t("Write mode", "وضع الكتابة")}: <span className="font-mono">{executionActivation.selective_write_policy.execution_mode}</span></p>
                              <p>{t("Write policy", "سياسة الكتابة")}: <span className="font-mono">{executionActivation.selective_write_policy.validation_classification || "-"}</span></p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {executionActivation.notes.map((note) => (
                                <span key={note} className="rounded-full bg-white/80 dark:bg-slate-900/70 px-3 py-1 text-[11px]">{note}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {plan.execution.gates.map((gate) => (
                          <div key={gate.code} className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-xs">{gate.code}</p>
                              <span className={`rounded-full px-2 py-0.5 text-xs ${gate.passed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}`}>
                                {gate.passed ? t("pass", "نجح") : t("fail", "فشل")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{gate.message}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <p className="font-medium mb-2">{t("Simulated Steps", "خطوات المحاكاة")}</p>
                        <div className="flex flex-wrap gap-2">
                          {plan.execution.simulated_steps.map((step) => (
                            <span key={step} className="rounded-full bg-white/80 dark:bg-slate-900/70 px-3 py-1 text-xs">{step}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="font-medium mb-2">{t("Expected Actions", "الإجراءات المتوقعة")}</p>
                    <div className="flex flex-wrap gap-2">
                      {plan.diff.expected_actions.map((action) => (
                        <span key={action} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs">{action}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="font-medium mb-2">{t("Grouped Diff", "التجميع التحليلي")}</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      {Object.entries(plan.diff.grouped_diff || {}).map(([group, items]) => (
                        <div key={group} className="rounded-lg border p-3">
                          <p className="font-medium capitalize mb-2">{group}</p>
                          {items.length === 0 ? (
                            <p className="text-xs text-gray-500">{t("No notes", "لا توجد ملاحظات")}</p>
                          ) : (
                            <div className="space-y-1">
                              {items.map((item) => (
                                <p key={item} className="text-xs text-gray-600 dark:text-gray-300">{item}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {plan.diff.blocked_reasons.length > 0 && (
                    <div>
                      <p className="font-medium mb-2 text-red-700 dark:text-red-300">{t("Blocked Reasons", "أسباب الحجب")}</p>
                      <div className="flex flex-wrap gap-2">
                        {plan.diff.blocked_reasons.map((reason) => (
                          <span key={reason} className="rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 px-3 py-1 text-xs">{reason}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="font-medium mb-2">{t("Suggested Fixes", "الإصلاحات المقترحة")}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(plan.diff.suggested_fixes || []).map((fix) => (
                        <div key={fix.code} className="rounded-lg border bg-white/60 dark:bg-slate-900/60 p-3">
                          <p className="font-medium">{fix.title}</p>
                          <p className="text-xs text-gray-500 font-mono">{fix.type} / {fix.action}</p>
                          <p className="text-xs text-gray-500 font-mono">{fix.code} → {fix.target}</p>
                          <p className="text-xs text-gray-500 font-mono">{t("Priority", "الأولوية")}: {fix.priority}</p>
                          <p className="text-xs text-gray-500 font-mono">{t("Requires", "يتطلب")}: {fix.requires.join(", ") || "-"}</p>
                          <p className="text-sm mt-2">{fix.description}</p>
                          <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-2">{fix.next_step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="font-medium mb-2">{t("Recovery Notes", "ملاحظات الاسترداد")}</p>
                    <pre className="text-xs overflow-auto rounded bg-slate-950 text-slate-100 p-3 max-h-64">
                      {JSON.stringify(plan.diff.recovery_notes, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
