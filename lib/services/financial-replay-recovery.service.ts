import { createHash, randomBytes } from "crypto"
import { prepareBillPostingFromPayload, type BillReceiptReplayPayload } from "@/lib/purchase-posting"

type SupabaseLike = any

export type FinancialReplayMode = "trace" | "idempotency_key"
export type FinancialReplaySafetyStatus = "safe" | "blocked" | "handler_required"
export type FinancialReplayConfidence = "HIGH" | "MEDIUM" | "LOW"
export type FinancialReplayActionPriority = "HIGH" | "MEDIUM" | "LOW"
export type FinancialReplayBlockedReason =
  | "PERIOD_LOCK"
  | "HASH_MISMATCH"
  | "MISSING_HANDLER"
  | "MISSING_REQUEST_HASH"
  | "MISSING_REPLAY_PAYLOAD"
  | "MISSING_ARTIFACTS"
  | "UNKNOWN_PERIOD_STATE"
  | "NONE"

export type FinancialReplayCommand = {
  companyId: string
  actorId: string
  traceId?: string | null
  idempotencyKey?: string | null
  requestHash?: string | null
  dryRun?: boolean
  uiSurface?: string | null
}

export type FinancialReplayPlan = {
  success: boolean
  dry_run: boolean
  mode: FinancialReplayMode
  safety_status: FinancialReplaySafetyStatus
  confidence: FinancialReplayConfidence
  blocked_reason: FinancialReplayBlockedReason
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
      priority: FinancialReplayActionPriority
      requires: string[]
      title: string
      description: string
      next_step: string
    }>
  }
}

type FinancialReplayRequiredCapability = keyof FinancialReplayPlan["safety"]["requires"]

export type FinancialReplayDeterminismPolicy = "deterministic" | "conditional" | "payload_required" | "legacy_blocked"
export type FinancialReplayReadinessBadge = "READY" | "NEEDS_CAPABILITIES" | "BLOCKED"
export type FinancialReplayEventCriticality = "critical_financial" | "standard" | "legacy"
export type FinancialReplayCapabilityStatus = "ready" | "contract_only" | "missing" | "blocked"
export type FinancialReplayStabilityStatus = "STABLE" | "NEEDS_MORE_DATA" | "UNSTABLE" | "NOT_EVALUATED"

type FinancialReplayHandlerContract = {
  handler_id: string
  domain: "sales" | "procurement" | "consolidation" | "banking" | "capital" | "manual_journal" | "legacy"
  implemented: boolean
  determinism_policy: FinancialReplayDeterminismPolicy
  replay_strategy: "command_service_replay" | "canonical_route_replay" | "payload_capture_required" | "legacy_blocked"
  required_capabilities: FinancialReplayRequiredCapability[]
  normalized_payload_required: boolean
  accepted_payload_versions: string[]
  replay_policy: "forward_only" | "historical_backfill_allowed" | "legacy_blocked"
  external_state_risks: string[]
  notes: string
}

export type FinancialReplayHandlerCoverageReport = {
  success: true
  checked_at: string
  company_id: string
  sample_limit: number
  execution_policy: {
    phase: "X2.4 Phase B.4 (confidence gated shadow validation)"
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
    domain: FinancialReplayHandlerContract["domain"] | "unknown"
    observed_count: number
    last_seen: string | null
    contract_registered: boolean
    implemented: boolean
    execution_enabled: false
    shadow_supported: boolean
    determinism_policy: FinancialReplayDeterminismPolicy | "unknown"
    replay_strategy: FinancialReplayHandlerContract["replay_strategy"] | "unregistered"
    criticality: FinancialReplayEventCriticality
    required_capabilities: FinancialReplayRequiredCapability[]
    accepted_payload_versions: string[]
    replay_policy: FinancialReplayHandlerContract["replay_policy"] | "unregistered"
    capability_resolution: Array<{
      capability: FinancialReplayRequiredCapability
      implemented: boolean
      enabled: boolean
      version_compatible: boolean
      status: FinancialReplayCapabilityStatus
      notes: string
    }>
    normalized_payload_required: boolean
    external_state_risks: string[]
    external_state_risks_mitigated: boolean
    readiness_badge: FinancialReplayReadinessBadge
    readiness: "ready_for_shadow" | "contract_registered" | "missing_contract" | "legacy_blocked"
    blockers: string[]
    warnings: string[]
    notes: string
  }>
}

export type FinancialReplayConfidenceCalibrationReport = {
  success: true
  checked_at: string
  company_id: string
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
  validation_distribution: Record<FinancialReplayValidationClassification, number>
  anomalies: Array<{
    trace_id: string
    source_id: string
    created_at: string
    score: number
    validation: FinancialReplayValidationClassification | null
    classification: FinancialReplayExecutionConfidence["classification"] | null
    issue: "EXACT_MATCH_BELOW_THRESHOLD" | "HIGH_SCORE_WITHOUT_EXACT_MATCH" | "SHADOW_EVALUATION_FAILED"
    message: string
  }>
  samples: Array<{
    trace_id: string
    source_id: string
    created_at: string
    score: number | null
    threshold: number
    validation: FinancialReplayValidationClassification | null
    classification: FinancialReplayExecutionConfidence["classification"] | null
    execution_ready: boolean
    blocked_reason: FinancialReplayBlockedReason | null
    gate_failures: string[]
  }>
}

export type FinancialReplayConfidenceStabilizationReport = {
  success: true
  checked_at: string
  company_id: string
  event_type: "bill_receipt_posting"
  payload_version: "bill_receipt_v1"
  requested_window_count: number
  per_window_limit: number
  sampled_count: number
  threshold: number
  execution_enabled: false
  stability_status: Exclude<FinancialReplayStabilityStatus, "NOT_EVALUATED">
  execution_switch: FinancialReplayExecutionReadinessSwitch
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
    score_distribution: FinancialReplayConfidenceCalibrationReport["score_distribution"]
    validation_distribution: FinancialReplayConfidenceCalibrationReport["validation_distribution"]
    anomalies: FinancialReplayConfidenceCalibrationReport["anomalies"]
  }>
}

export type FinancialReplayExecutionReadinessSwitch = {
  replay_execution_enabled: boolean
  controlled_execution_available: false
  source: "env:FINANCIAL_REPLAY_EXECUTION_ENABLED" | "default_false"
  required_stability_status: "STABLE"
  current_stability_status: FinancialReplayStabilityStatus
  manual_approval_required: true
  manual_approval_present: boolean
  allowed_event_type: "bill_receipt_posting"
  allowed_payload_version: "bill_receipt_v1"
  execution_allowed: false
  blockers: string[]
}

export type FinancialReplayControlledExecutionEnvelope = {
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
    validation_classification: FinancialReplayValidationClassification | null
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

export type FinancialReplayExecutionGate = {
  code:
    | "confidence_high"
    | "deterministic"
    | "no_blocked_reason"
    | "handler_shadow_prepare"
    | "historical_artifact_validation"
    | "replay_confidence_score"
    | FinancialReplayRequiredCapability
  passed: boolean
  severity: "blocking" | "advisory"
  message: string
}

export type FinancialReplayValidationClassification =
  | "EXACT_MATCH"
  | "NUMERIC_DRIFT"
  | "STRUCTURAL_MISMATCH"
  | "MISSING_ARTIFACTS"
  | "NOT_EVALUATED"

export type FinancialReplaySelectiveWriteMode =
  | "validate_only"
  | "repair_missing"
  | "controlled_review"
  | "blocked"

export type FinancialReplaySelectiveWritePolicy = {
  phase: "X2.4 Phase B.8 (selective financial write policy)"
  validation_classification: FinancialReplayValidationClassification | null
  execution_mode: FinancialReplaySelectiveWriteMode
  financial_writes_allowed: boolean
  financial_writes_reason: string
  allowed_future_modes: Array<"validate_only" | "repair_missing" | "full_replay">
  required_controls: string[]
  blockers: string[]
}

export type FinancialReplayArtifactMismatch = {
  key: string
  expected: string | number | null
  actual: string | number | null
  delta?: number
}

export type FinancialReplayHandlerValidation = {
  classification: FinancialReplayValidationClassification
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
    account_mismatches: FinancialReplayArtifactMismatch[]
    amount_mismatches: FinancialReplayArtifactMismatch[]
  }
  inventory: {
    expected_transaction_count: number
    actual_transaction_count: number
    product_mismatches: FinancialReplayArtifactMismatch[]
    quantity_mismatches: FinancialReplayArtifactMismatch[]
  }
  notes: string[]
}

export type FinancialReplayExecutionConfidence = {
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

export type FinancialReplayHandlerPreview = {
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
}

export type FinancialReplayShadowExecutionPlan = FinancialReplayPlan & {
  execution: {
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
    handler_preview: FinancialReplayHandlerPreview | null
    handler_validation: FinancialReplayHandlerValidation | null
    replay_confidence: FinancialReplayExecutionConfidence
    selective_write_policy: FinancialReplaySelectiveWritePolicy
    execution_envelope: FinancialReplayControlledExecutionEnvelope
    gates: FinancialReplayExecutionGate[]
    missing_capabilities: string[]
    simulated_steps: string[]
    safety_notes: string[]
  }
}

export type FinancialReplayCommitIntentCommand = {
  companyId: string
  actorId: string
  traceId?: string | null
  idempotencyKey?: string | null
  requestHash?: string | null
  previewResultHash: string
  manualApproval: boolean
  ttlMinutes?: number | null
  uiSurface?: string | null
}

export type FinancialReplayCommitIntentResult = {
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
  execution_switch: FinancialReplayExecutionReadinessSwitch
  execution_envelope: FinancialReplayControlledExecutionEnvelope
  stability: {
    checked_at: string
    stability_status: FinancialReplayConfidenceStabilizationReport["stability_status"]
    sampled_count: number
    summary: FinancialReplayConfidenceStabilizationReport["summary"]
  }
  notes: string[]
}

export type FinancialReplayExecutionActivationCommand = {
  companyId: string
  actorId: string
  intentId: string
  token: string
  previewResultHash: string
  uiSurface?: string | null
}

export type FinancialReplayExecutionActivationResult = {
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
  selective_write_policy: FinancialReplaySelectiveWritePolicy
  execution_envelope: FinancialReplayControlledExecutionEnvelope
  notes: string[]
}

type TraceRow = {
  transaction_id: string
  company_id: string
  source_entity: string
  source_id: string
  event_type: string
  idempotency_key: string | null
  request_hash: string | null
  metadata: Record<string, unknown>
  created_at: string
}

type TraceLinkRow = {
  id: string
  transaction_id: string
  entity_type: string
  entity_id: string
  link_role: string | null
  reference_type: string | null
}

const ENTITY_TABLES: Record<string, string> = {
  advance_application: "advance_applications",
  bill: "bills",
  capital_contribution: "capital_contributions",
  consolidation_run: "consolidation_runs",
  customer_credit: "customer_credits",
  inventory_transaction: "inventory_transactions",
  invoice: "invoices",
  journal_entry: "journal_entries",
  journal_entry_line: "journal_entry_lines",
  payment: "payments",
  payment_allocation: "payment_allocations",
  purchase_order: "purchase_orders",
  purchase_return: "purchase_returns",
  sales_order: "sales_orders",
  vendor_credit: "vendor_credits",
}

const BASE_REPLAY_CAPABILITIES: FinancialReplayRequiredCapability[] = [
  "handler_registered",
  "payload_complete",
  "period_open",
  "request_hash_match",
  "lineage_intact",
]

const REPLAY_HANDLER_REGISTRY: Record<string, FinancialReplayHandlerContract> = {
  bank_transfer_posting: {
    handler_id: "bank_transfer_command_replay",
    domain: "banking",
    implemented: false,
    determinism_policy: "conditional",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["bank account state", "branch/cost center account mapping"],
    notes: "Metadata contains core fields, but branch/cost center/account validation replay handler is not registered yet.",
  },
  bill_payment_posting: {
    handler_id: "bill_payment_command_replay",
    domain: "procurement",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["bill settlement state", "payment allocation state"],
    notes: "Bill payment replay must go through supplier payment command service with the original allocation payload.",
  },
  bill_receipt_posting: {
    handler_id: "bill_receipt_command_replay",
    domain: "procurement",
    implemented: true,
    determinism_policy: "payload_required",
    replay_strategy: "canonical_route_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: ["bill_receipt_v1"],
    replay_policy: "forward_only",
    external_state_risks: ["AP recognition state must still be verified before commit execution"],
    notes: "Phase B.4 handler available for shadow-only payload preparation, historical artifact validation, and replay confidence scoring. Commit execution remains disabled; bill_receipt_v1 normalized payload is required.",
  },
  consolidation_run_executed: {
    handler_id: "consolidation_execute_replay",
    domain: "consolidation",
    implemented: false,
    determinism_policy: "conditional",
    replay_strategy: "canonical_route_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["FX snapshot version", "consolidation input snapshot", "statement mapping version"],
    notes: "Consolidation replay is available through the canonical consolidation execute path, but this generic replay handler is not registered yet.",
  },
  customer_credit_refund_posting: {
    handler_id: "customer_refund_command_replay",
    domain: "sales",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["customer credit balance", "cash account state"],
    notes: "Customer refund replay requires the original credit/refund allocation payload.",
  },
  customer_payment_posting: {
    handler_id: "customer_payment_command_replay",
    domain: "sales",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["invoice settlement state", "payment allocation state"],
    notes: "Payment replay must go through customer payment command service with original allocation payload.",
  },
  customer_voucher_posting: {
    handler_id: "customer_voucher_command_replay",
    domain: "sales",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["customer credit state", "advance application state"],
    notes: "Customer voucher replay requires normalized voucher payload and credit/application lineage.",
  },
  invoice_payment_posting: {
    handler_id: "invoice_payment_command_replay",
    domain: "sales",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["invoice settlement state", "payment allocation state"],
    notes: "Invoice payment replay must use the customer payment allocation command with the original payload.",
  },
  invoice_posting: {
    handler_id: "invoice_posting_command_replay",
    domain: "sales",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "canonical_route_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["warehouse inventory state", "FIFO cost lots", "tax/account mapping state"],
    notes: "Invoice replay requires original normalized invoice posting payload and deterministic inventory cost snapshot.",
  },
  manual_journal_posting: {
    handler_id: "manual_journal_command_replay",
    domain: "manual_journal",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "payload_capture_required",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["manual journal line payload", "account permission policy"],
    notes: "Trace metadata intentionally stores summary only, not full journal lines. Replay requires payload snapshot capture first.",
  },
  purchase_return_allocation_posting: {
    handler_id: "purchase_return_allocation_command_replay",
    domain: "procurement",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["vendor credit balance", "purchase return settlement state"],
    notes: "Purchase return allocation replay requires original vendor-credit allocation payload.",
  },
  purchase_return_posting: {
    handler_id: "purchase_return_command_replay",
    domain: "procurement",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["inventory state", "vendor credit state", "return delivery state"],
    notes: "Purchase return replay requires the canonical purchase return command with delivery and inventory lineage.",
  },
  shareholder_capital_contribution_posting: {
    handler_id: "shareholder_capital_command_replay",
    domain: "capital",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["shareholder ownership state", "cash account state"],
    notes: "Capital contribution replay requires normalized contribution payload and shareholder account mapping.",
  },
  supplier_payment_posting: {
    handler_id: "supplier_payment_command_replay",
    domain: "procurement",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["bill settlement state", "payment allocation state"],
    notes: "Payment replay must go through supplier payment command service with original allocation payload.",
  },
  supplier_refund_receipt_posting: {
    handler_id: "supplier_refund_receipt_command_replay",
    domain: "procurement",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["vendor credit state", "cash account state"],
    notes: "Supplier refund receipt replay requires normalized refund payload and vendor credit lineage.",
  },
  vendor_credit_posting: {
    handler_id: "vendor_credit_command_replay",
    domain: "procurement",
    implemented: false,
    determinism_policy: "payload_required",
    replay_strategy: "command_service_replay",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "forward_only",
    external_state_risks: ["vendor credit state", "purchase return linkage"],
    notes: "Vendor credit replay must be coordinated with purchase return posting replay to avoid duplicate credit issuance.",
  },
  payment_posting: {
    handler_id: "legacy_payment_posting_replay",
    domain: "legacy",
    implemented: false,
    determinism_policy: "legacy_blocked",
    replay_strategy: "legacy_blocked",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "legacy_blocked",
    external_state_risks: ["legacy mixed AP/AR payment semantics"],
    notes: "Legacy payment_posting traces are blocked from generic replay and should be remediated through domain-specific payment commands.",
  },
  return: {
    handler_id: "legacy_sales_return_replay",
    domain: "legacy",
    implemented: false,
    determinism_policy: "legacy_blocked",
    replay_strategy: "legacy_blocked",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "legacy_blocked",
    external_state_risks: ["legacy sales return inventory/accounting semantics"],
    notes: "Legacy return traces need migration to a canonical sales-return event before replay execution.",
  },
  warehouse_approval: {
    handler_id: "legacy_warehouse_approval_replay",
    domain: "legacy",
    implemented: false,
    determinism_policy: "legacy_blocked",
    replay_strategy: "legacy_blocked",
    required_capabilities: BASE_REPLAY_CAPABILITIES,
    normalized_payload_required: true,
    accepted_payload_versions: [],
    replay_policy: "legacy_blocked",
    external_state_risks: ["legacy warehouse approval state"],
    notes: "Warehouse approval is treated as legacy workflow trace and is not eligible for generic financial replay.",
  },
}

const dateKeys = [
  "entry_date",
  "payment_date",
  "transfer_date",
  "contribution_date",
  "refund_date",
  "voucher_date",
  "receipt_date",
  "effective_receipt_date",
  "received_at",
  "return_date",
  "period_end",
]

const isLockedStatus = (value: unknown) => ["closed", "locked"].includes(String(value || "").toLowerCase())
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
const REPLAY_VALIDATION_MONETARY_TOLERANCE = 0.01
const REPLAY_VALIDATION_QUANTITY_TOLERANCE = 0.0001
const REPLAY_EXECUTION_CONFIDENCE_THRESHOLD = 95

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

const sha256StableJson = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex")

const sha256Text = (value: string) =>
  createHash("sha256").update(value).digest("hex")

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const roundComparable = (value: unknown, precision = 4) => {
  const factor = 10 ** precision
  return Math.round(toFiniteNumber(value) * factor) / factor
}

const withinTolerance = (expected: number, actual: number, tolerance: number) =>
  Math.abs(roundComparable(expected - actual, 6)) <= tolerance

export class FinancialReplayRecoveryService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  static resolveExecutionReadinessSwitch(params: {
    currentStabilityStatus?: FinancialReplayStabilityStatus
    manualApprovalPresent?: boolean
  } = {}): FinancialReplayExecutionReadinessSwitch {
    const rawFlag = String(process.env.FINANCIAL_REPLAY_EXECUTION_ENABLED || "").trim().toLowerCase()
    const replayExecutionEnabled = rawFlag === "true"
    const currentStabilityStatus = params.currentStabilityStatus || "NOT_EVALUATED"
    const manualApprovalPresent = params.manualApprovalPresent === true
    const blockers = unique([
      replayExecutionEnabled ? "" : "replay_execution_enabled_false",
      currentStabilityStatus === "STABLE" ? "" : "stabilization_status_not_stable",
      manualApprovalPresent ? "" : "manual_approval_missing",
      "financial_replay_execution_disabled_in_b6",
    ])

    return {
      replay_execution_enabled: replayExecutionEnabled,
      controlled_execution_available: false,
      source: replayExecutionEnabled ? "env:FINANCIAL_REPLAY_EXECUTION_ENABLED" : "default_false",
      required_stability_status: "STABLE",
      current_stability_status: currentStabilityStatus,
      manual_approval_required: true,
      manual_approval_present: manualApprovalPresent,
      allowed_event_type: "bill_receipt_posting",
      allowed_payload_version: "bill_receipt_v1",
      execution_allowed: false,
      blockers,
    }
  }

  async planReplay(command: FinancialReplayCommand): Promise<FinancialReplayPlan> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.traceId && !command.idempotencyKey) throw new Error("trace_id or idempotency_key is required")

    const mode: FinancialReplayMode = command.traceId ? "trace" : "idempotency_key"
    const trace = command.traceId
      ? await this.loadTraceById(command.companyId, command.traceId)
      : await this.loadTraceByIdempotency(command.companyId, command.idempotencyKey!)

    if (!trace) throw new Error("Financial trace was not found")

    const links = await this.loadTraceLinks(trace.transaction_id)
    const linkedArtifacts = await this.resolveLinkedArtifacts(links)
    const missingArtifacts = linkedArtifacts
      .filter((artifact) => artifact.exists === false)
      .map((artifact) => ({
        entity_type: artifact.entity_type,
        entity_id: artifact.entity_id,
        link_role: artifact.link_role,
      }))

    const requestHashMatch = command.requestHash ? trace.request_hash === command.requestHash : null
    const effectiveDate = this.deriveEffectiveDate(trace)
    const periodCheck = effectiveDate ? await this.checkPeriodOpen(trace.company_id, effectiveDate) : { open: null, message: null }
    const handler = REPLAY_HANDLER_REGISTRY[trace.event_type]
    const handlerRegistered = Boolean(handler?.implemented)
    const payloadComplete = this.hasReplayPayloadSnapshot(trace, handler)
    const requires = {
      handler_registered: handlerRegistered,
      payload_complete: payloadComplete,
      period_open: periodCheck.open === true,
      request_hash_match: requestHashMatch,
      lineage_intact: missingArtifacts.length === 0,
    }

    const blockedReasons: FinancialReplayBlockedReason[] = []
    if (requestHashMatch === false) blockedReasons.push("HASH_MISMATCH")
    if (periodCheck.open === false) blockedReasons.push("PERIOD_LOCK")
    if (!handlerRegistered) blockedReasons.push("MISSING_HANDLER")
    if (!trace.request_hash) blockedReasons.push("MISSING_REQUEST_HASH")
    if (trace.request_hash && !payloadComplete) blockedReasons.push("MISSING_REPLAY_PAYLOAD")
    if (missingArtifacts.length > 0) blockedReasons.push("MISSING_ARTIFACTS")
    if (periodCheck.open === null) blockedReasons.push("UNKNOWN_PERIOD_STATE")

    const recoveryNotes = [
      handler?.notes || "No replay contract registered for this event type yet.",
      missingArtifacts.length > 0
        ? "Broken trace links were detected. Recovery requires event-specific verification before reposting."
        : "Existing trace links resolve for the current sample.",
      command.dryRun === false
        ? "Execution is blocked until a replay handler is registered for this event type."
        : "Dry-run only: no financial data will be mutated.",
    ]
    const groupedDiff = this.groupDiff({
      blockedReasons,
      missingArtifactCount: missingArtifacts.length,
      handlerRegistered,
      hasRequestHash: Boolean(trace.request_hash),
      payloadComplete,
      requestHashMatch,
      periodOpen: periodCheck.open,
    })
    const confidence = this.scoreConfidence({
      blockedReasons,
      missingArtifactCount: missingArtifacts.length,
      handlerRegistered,
      requestHashMatch,
      periodOpen: periodCheck.open,
    })
    const isDeterministic = Object.values(requires).every((value) => value === true)

    return {
      success: true,
      dry_run: command.dryRun !== false,
      mode,
      safety_status: blockedReasons.length > 0 ? "blocked" : handlerRegistered ? "safe" : "handler_required",
      confidence,
      blocked_reason: this.primaryBlockedReason(blockedReasons),
      is_deterministic: isDeterministic,
      replay_supported: handlerRegistered,
      trace: {
        transaction_id: trace.transaction_id,
        source_entity: trace.source_entity,
        source_id: trace.source_id,
        event_type: trace.event_type,
        idempotency_key: trace.idempotency_key,
        request_hash: trace.request_hash,
        created_at: trace.created_at,
      },
      safety: {
        request_hash_match: requestHashMatch,
        effective_date: effectiveDate,
        period_open: periodCheck.open,
        period_message: periodCheck.message,
        handler_registered: handlerRegistered,
        requires,
      },
      current_state: {
        linked_artifacts: linkedArtifacts,
        missing_artifacts: missingArtifacts,
      },
      diff: {
        expected_actions: handlerRegistered
          ? [
              "Load original payload snapshot",
              "Validate request_hash and idempotency contract",
              "Validate financial period",
              "Execute event-specific command service in replay mode",
              "Create replay_execution trace linked to the original trace",
            ]
          : [
              "No financial mutation will run",
              "Register an event-specific replay handler before execution",
              "Use this dry-run result to inspect payload and lineage readiness",
            ],
        blocked_reasons: blockedReasons.filter((reason) => reason !== "NONE"),
        recovery_notes: recoveryNotes,
        grouped_diff: groupedDiff,
        suggested_fixes: this.suggestFixes({
          trace,
          blockedReasons,
          missingArtifactCount: missingArtifacts.length,
          handlerRegistered,
          hasRequestHash: Boolean(trace.request_hash),
          payloadComplete,
          requestHashMatch,
          periodOpen: periodCheck.open,
          isDeterministic,
        }),
      },
    }
  }

  async executeReplay(command: FinancialReplayCommand): Promise<FinancialReplayPlan> {
    const shadowPlan = await this.shadowReplayExecution(command)
    if (!shadowPlan.execution.execution_ready) {
      throw new Error(`Replay execution is gated: ${shadowPlan.execution.missing_capabilities.join(", ")}`)
    }
    throw new Error("Replay execution remains disabled in X2.4 Phase B.6. Use shadow mode or issue an audit-only commit intent.")
  }

  async issueReplayCommitIntent(command: FinancialReplayCommitIntentCommand): Promise<FinancialReplayCommitIntentResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.actorId) throw new Error("Actor is required")
    if (!command.traceId && !command.idempotencyKey) throw new Error("trace_id or idempotency_key is required")
    if (command.traceId && command.idempotencyKey) throw new Error("Use either trace_id or idempotency_key, not both")
    if (!command.requestHash) throw new Error("request_hash is required before issuing replay commit intent")
    if (!command.previewResultHash) throw new Error("preview_result_hash is required before issuing replay commit intent")
    if (command.manualApproval !== true) throw new Error("manual_approval_missing")

    const shadowPlan = await this.shadowReplayExecution({
      companyId: command.companyId,
      actorId: command.actorId,
      traceId: command.traceId || null,
      idempotencyKey: command.idempotencyKey || null,
      requestHash: command.requestHash,
      dryRun: true,
      uiSurface: command.uiSurface || "financial_replay_commit_intent_api",
    })

    const envelope = shadowPlan.execution.execution_envelope
    const recomputedPreviewHash = envelope.preview_result_hash
    if (!recomputedPreviewHash) {
      throw new Error("REPLAY_COMMIT_INTENT_BLOCKED: preview_result_hash could not be recomputed")
    }
    if (recomputedPreviewHash !== command.previewResultHash) {
      throw new Error("REPLAY_PREVIEW_HASH_MISMATCH: preview_result_hash drifted between preview and commit intent")
    }
    if (!envelope.commit_intent.eligible_for_future_intent) {
      throw new Error(`REPLAY_COMMIT_INTENT_BLOCKED: ${envelope.blockers.join(", ") || "envelope_not_eligible"}`)
    }
    if (shadowPlan.execution.handler_validation?.classification !== "EXACT_MATCH") {
      throw new Error("REPLAY_COMMIT_INTENT_BLOCKED: historical validation must be EXACT_MATCH")
    }
    if (!shadowPlan.execution.replay_confidence.passed) {
      throw new Error("REPLAY_COMMIT_INTENT_BLOCKED: replay confidence gate did not pass")
    }

    const stabilization = await this.stabilizeReplayConfidence(command.companyId, command.actorId, 5, 10)
    const executionSwitch = FinancialReplayRecoveryService.resolveExecutionReadinessSwitch({
      currentStabilityStatus: stabilization.stability_status,
      manualApprovalPresent: command.manualApproval === true,
    })

    if (!executionSwitch.replay_execution_enabled) {
      throw new Error("REPLAY_COMMIT_INTENT_BLOCKED: replay_execution_enabled_false")
    }
    if (stabilization.stability_status !== "STABLE") {
      throw new Error(`REPLAY_COMMIT_INTENT_BLOCKED: stabilization_status_${stabilization.stability_status.toLowerCase()}`)
    }

    const now = new Date()
    const ttlMinutes = Math.max(5, Math.min(Number(command.ttlMinutes || 15), 30))
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString()
    const token = `frt_${randomBytes(32).toString("hex")}`
    const tokenHash = sha256Text(token)
    const tokenHint = token.slice(-8)

    await this.expireStaleReplayCommitIntents({
      companyId: command.companyId,
      sourceTraceId: shadowPlan.trace.transaction_id,
      previewResultHash: recomputedPreviewHash,
      nowIso: now.toISOString(),
    })

    const payloadVersion = envelope.preview_hash_inputs.payload_version || ""
    const { data, error } = await this.adminSupabase
      .from("financial_replay_commit_intents")
      .insert({
        company_id: command.companyId,
        source_trace_id: shadowPlan.trace.transaction_id,
        event_type: shadowPlan.trace.event_type,
        payload_version: payloadVersion,
        preview_result_hash: recomputedPreviewHash,
        preview_hash_algorithm: envelope.preview_hash_algorithm,
        status: "issued",
        intent_scope: {
          ...envelope.scope,
          ui_surface: command.uiSurface || "financial_replay_commit_intent_api",
        },
        execution_envelope: envelope,
        execution_switch: executionSwitch,
        stability_snapshot: {
          checked_at: stabilization.checked_at,
          stability_status: stabilization.stability_status,
          sampled_count: stabilization.sampled_count,
          summary: stabilization.summary,
        },
        token_hash: tokenHash,
        token_hint: tokenHint,
        approved_by: command.actorId,
        created_by: command.actorId,
        expires_at: expiresAt,
      })
      .select("id, status, expires_at, approved_at")
      .single()

    if (error) {
      const message = String(error.message || "Failed to issue replay commit intent")
      if (message.includes("idx_financial_replay_commit_intents_active")) {
        throw new Error("REPLAY_COMMIT_INTENT_ALREADY_ISSUED: revoke or expire the active intent before issuing a new token")
      }
      throw new Error(message)
    }

    return {
      success: true,
      phase: "X2.4 Phase B.6 (tokenized audit-only activation)",
      intent: {
        id: String(data.id),
        status: "issued",
        source_trace_id: shadowPlan.trace.transaction_id,
        event_type: shadowPlan.trace.event_type,
        payload_version: payloadVersion,
        preview_result_hash: recomputedPreviewHash,
        preview_hash_algorithm: envelope.preview_hash_algorithm,
        token,
        token_hint: tokenHint,
        expires_at: String(data.expires_at || expiresAt),
        approved_by: command.actorId,
        approved_at: String(data.approved_at || now.toISOString()),
      },
      write_guard: {
        preview_hash_match: true,
        incoming_preview_hash: command.previewResultHash,
        recomputed_preview_hash: recomputedPreviewHash,
        token_hash_stored: true,
        financial_execution_enabled: false,
      },
      execution_switch: executionSwitch,
      execution_envelope: envelope,
      stability: {
        checked_at: stabilization.checked_at,
        stability_status: stabilization.stability_status,
        sampled_count: stabilization.sampled_count,
        summary: stabilization.summary,
      },
      notes: [
        "Commit intent issuance is audit-only: it stores the preview hash and token hash but performs no replay writes.",
        "The one-time token is returned only in this response; only token_hash is persisted.",
        "Future execution must recompute preview_result_hash and reject the token if the hash differs from this intent.",
      ],
    }
  }

  async activateReplayExecution(command: FinancialReplayExecutionActivationCommand): Promise<FinancialReplayExecutionActivationResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.actorId) throw new Error("Actor is required")
    if (!command.intentId) throw new Error("intent_id is required")
    if (!command.token) throw new Error("execution token is required")
    if (!command.previewResultHash) throw new Error("preview_result_hash is required")

    const intent = await this.loadReplayCommitIntent(command.companyId, command.intentId)
    if (!intent) throw new Error("REPLAY_COMMIT_INTENT_NOT_FOUND")
    if (intent.status !== "issued") throw new Error("REPLAY_COMMIT_INTENT_NOT_ACTIVE")
    if (new Date(String(intent.expires_at)).getTime() <= Date.now()) {
      throw new Error("REPLAY_COMMIT_INTENT_EXPIRED")
    }
    if (intent.event_type !== "bill_receipt_posting" || intent.payload_version !== "bill_receipt_v1") {
      throw new Error("REPLAY_EXECUTION_BLOCKED: unsupported event or payload version")
    }

    const sourceTrace = await this.loadTraceById(command.companyId, String(intent.source_trace_id))
    if (!sourceTrace?.request_hash) {
      throw new Error("REPLAY_EXECUTION_BLOCKED: source trace request_hash is required")
    }

    const shadowPlan = await this.shadowReplayExecution({
      companyId: command.companyId,
      actorId: command.actorId,
      traceId: String(intent.source_trace_id),
      requestHash: sourceTrace.request_hash,
      dryRun: true,
      uiSurface: command.uiSurface || "financial_replay_execution_activation_api",
    })

    const recomputedPreviewHash = shadowPlan.execution.execution_envelope.preview_result_hash
    if (!recomputedPreviewHash) {
      throw new Error("REPLAY_EXECUTION_BLOCKED: preview_result_hash could not be recomputed")
    }
    if (recomputedPreviewHash !== command.previewResultHash || recomputedPreviewHash !== intent.preview_result_hash) {
      throw new Error("REPLAY_COMMIT_PREVIEW_HASH_MISMATCH")
    }
    if (!shadowPlan.execution.execution_ready) {
      throw new Error(`REPLAY_EXECUTION_BLOCKED: ${shadowPlan.execution.missing_capabilities.join(", ") || "execution gates failed"}`)
    }

    const tokenHash = sha256Text(command.token)
    if (tokenHash !== intent.token_hash) {
      throw new Error("REPLAY_COMMIT_TOKEN_INVALID")
    }
    const selectiveWritePolicy = this.deriveSelectiveWritePolicy(shadowPlan.execution.handler_validation)

    const writeGuard = {
      stored_preview_hash: String(intent.preview_result_hash),
      incoming_preview_hash: command.previewResultHash,
      recomputed_preview_hash: recomputedPreviewHash,
      preview_hash_match: true,
      token_hash_verified: true,
      expiry_checked: true,
      intent_consumed: true,
      financial_writes_enabled: false,
      financial_writes_performed: false,
      selective_execution_mode: selectiveWritePolicy.execution_mode,
      selective_financial_writes_allowed: selectiveWritePolicy.financial_writes_allowed,
      duplicate_artifact_protection: "financial_artifact_writes_remain_disabled_until_a_non_duplicate_write_handler_is_available",
    }
    const executionMetadata = {
      ui_surface: command.uiSurface || "financial_replay_execution_activation_api",
      event_type: intent.event_type,
      payload_version: intent.payload_version,
      shadow_execution_ready: shadowPlan.execution.execution_ready,
      validation_classification: shadowPlan.execution.handler_validation?.classification || null,
      replay_confidence_score: shadowPlan.execution.replay_confidence.score,
      replay_confidence_threshold: shadowPlan.execution.replay_confidence.threshold,
      execution_scope: "single_trace",
      financial_write_handler: "disabled_in_b7",
      selective_write_policy: selectiveWritePolicy,
    }
    const resultSummary = {
      status: "validated",
      commit_intent_consumed: true,
      journal_entries_created: 0,
      inventory_transactions_created: 0,
      financial_writes_performed: false,
      selective_execution_mode: selectiveWritePolicy.execution_mode,
      selective_financial_writes_allowed: selectiveWritePolicy.financial_writes_allowed,
      reason: "B.7 activates the governed execution protocol and audit trail without duplicating existing financial artifacts.",
    }

    const { data, error } = await this.adminSupabase.rpc("record_financial_replay_execution_activation", {
      p_company_id: command.companyId,
      p_intent_id: command.intentId,
      p_token_hash: tokenHash,
      p_actor_id: command.actorId,
      p_preview_result_hash: recomputedPreviewHash,
      p_write_guard: writeGuard,
      p_execution_metadata: executionMetadata,
      p_result_summary: resultSummary,
    })

    if (error) throw new Error(error.message || "Failed to activate replay execution")

    const executionId = String(data?.execution_id || "")
    const executedAt = String(data?.consumed_at || new Date().toISOString())
    return {
      success: true,
      phase: "X2.4 Phase B.7 (controlled single-path activation)",
      execution: {
        id: executionId,
        status: "validated",
        commit_intent_id: command.intentId,
        source_trace_id: String(intent.source_trace_id),
        event_type: String(intent.event_type),
        payload_version: String(intent.payload_version),
        preview_result_hash: recomputedPreviewHash,
        financial_writes_performed: false,
        executed_by: command.actorId,
        executed_at: executedAt,
      },
      write_guard: {
        stored_preview_hash: String(intent.preview_result_hash),
        incoming_preview_hash: command.previewResultHash,
        recomputed_preview_hash: recomputedPreviewHash,
        preview_hash_match: true,
        token_hash_verified: true,
        expiry_checked: true,
        intent_consumed: true,
        financial_writes_enabled: false,
        financial_writes_performed: false,
      },
      selective_write_policy: selectiveWritePolicy,
      execution_envelope: shadowPlan.execution.execution_envelope,
      notes: [
        "The commit intent token was consumed atomically and an execution audit record was created.",
        "No journal entries or inventory transactions were written in B.7; this prevents duplicate artifacts while the non-duplicate replay write handler is still closed.",
        "Future financial replay writes must reuse this final preview-hash guard before writing any artifacts.",
      ],
    }
  }

  async shadowReplayExecution(command: FinancialReplayCommand): Promise<FinancialReplayShadowExecutionPlan> {
    const plan = await this.planReplay({ ...command, dryRun: true })
    const handler = REPLAY_HANDLER_REGISTRY[plan.trace.event_type]
    const baseGates = this.evaluateExecutionGates(plan)
    const baseExecutionReady = baseGates.every((gate) => gate.passed)
    const handlerPreview = baseExecutionReady ? await this.previewReplayHandler(command.companyId, plan) : null
    const handlerValidation = handlerPreview?.prepared
      ? await this.validateReplayPreview(command.companyId, plan, handlerPreview)
      : null
    const replayConfidence = this.scoreReplayExecutionConfidence({
      plan,
      handler,
      handlerPreview,
      handlerValidation,
    })
    const selectiveWritePolicy = this.deriveSelectiveWritePolicy(handlerValidation)
    const executionEnvelope = this.buildControlledExecutionEnvelope({
      companyId: command.companyId,
      plan,
      handlerPreview,
      handlerValidation,
      replayConfidence,
    })
    const gates = handler?.implemented
      ? [
          ...baseGates,
          {
            code: "handler_shadow_prepare" as const,
            passed: Boolean(handlerPreview?.prepared),
            severity: "blocking" as const,
            message: handlerPreview
              ? handlerPreview.prepared
                ? "Event-specific handler prepared replay payload in shadow mode."
                : `Event-specific handler shadow preparation failed: ${handlerPreview.error || "unknown error"}`
              : "Event-specific handler shadow preparation was skipped because upstream gates failed.",
          },
          {
            code: "historical_artifact_validation" as const,
            passed: handlerValidation?.classification === "EXACT_MATCH",
            severity: "blocking" as const,
            message: handlerValidation
              ? handlerValidation.classification === "EXACT_MATCH"
                ? "Replay preview exactly matches linked historical artifacts."
                : `Replay preview validation classified as ${handlerValidation.classification}.`
              : handlerPreview?.prepared
                ? "Historical artifact validation was not evaluated."
                : "Historical artifact validation was skipped because handler preview did not prepare.",
          },
          {
            code: "replay_confidence_score" as const,
            passed: replayConfidence.passed,
            severity: "blocking" as const,
            message: replayConfidence.passed
              ? `Replay confidence score ${replayConfidence.score}/${replayConfidence.threshold} allows controlled-execution readiness.`
              : `Replay confidence score ${replayConfidence.score}/${replayConfidence.threshold} blocks controlled-execution readiness.`,
          },
        ]
      : baseGates
    const executionReady = gates.every((gate) => gate.passed)
    const missingCapabilities = gates
      .filter((gate) => !gate.passed)
      .map((gate) => gate.code)

    return {
      ...plan,
      execution: {
        mode: "shadow",
        execution_ready: executionReady,
        commit_attempted: false,
        commit_performed: false,
        writes_performed: [],
        handler: {
          event_type: plan.trace.event_type,
          registered: Boolean(handler),
          implemented: Boolean(handler?.implemented),
          notes: handler?.notes || "No replay handler contract is registered for this event type.",
        },
        handler_preview: handlerPreview,
        handler_validation: handlerValidation,
        replay_confidence: replayConfidence,
        selective_write_policy: selectiveWritePolicy,
        execution_envelope: executionEnvelope,
        gates,
        missing_capabilities: missingCapabilities,
        simulated_steps: executionReady
          ? [
              "Would load normalized payload snapshot for the original operation.",
              "Would dispatch to the event-specific replay handler in shadow mode.",
              handlerPreview?.prepared
                ? `Payload-only handler prepared ${handlerPreview.journal_line_count} journal line(s) and ${handlerPreview.inventory_transaction_count} inventory transaction(s).`
                : "Payload-only handler preview is not available.",
              handlerValidation
                ? `Would require historical artifact validation result ${handlerValidation.classification} before any future commit.`
                : "Would require historical artifact validation before any future commit.",
              `Would require replay confidence score >= ${replayConfidence.threshold}; current score is ${replayConfidence.score}.`,
              selectiveWritePolicy.financial_writes_allowed
                ? `Future write mode ${selectiveWritePolicy.execution_mode} would require explicit repair controls.`
                : `Financial writes are blocked by B.8 policy: ${selectiveWritePolicy.financial_writes_reason}.`,
              "Would compare expected artifacts with current trace lineage.",
              "Would stop before replay_execution trace creation because shadow mode never writes.",
            ]
          : [
              "Would stop before handler dispatch because one or more execution gates failed.",
              "Would return planner findings and suggested fixes without mutating financial data.",
              "Would require all blocking gates to pass before enabling controlled execution.",
            ],
        safety_notes: [
          "Shadow mode is side-effect free and does not create audit logs, traces, journal entries, or inventory records.",
          "Controlled execution is allowed only after confidence=HIGH, is_deterministic=true, no blocked_reason, and all capabilities pass.",
        ],
      },
    }
  }

  async getHandlerCoverage(companyId: string, sampleLimit = 5000): Promise<FinancialReplayHandlerCoverageReport> {
    if (!companyId) throw new Error("Company is required")

    const observed = await this.loadObservedEventTypeStats(companyId, sampleLimit)
    const eventTypes = Array.from(new Set([
      ...Object.keys(REPLAY_HANDLER_REGISTRY),
      ...Array.from(observed.keys()),
    ])).sort()

    const coverage = eventTypes.map((eventType) => {
      const contract = REPLAY_HANDLER_REGISTRY[eventType]
      const observedStats = observed.get(eventType)
      const contractRegistered = Boolean(contract)
      const criticality = this.deriveEventCriticality(contract)
      const capabilityResolution = this.resolveCoverageCapabilities(contract)
      const externalStateRisksMitigated = Boolean(contract) && (contract?.external_state_risks.length || 0) === 0
      const blockers = this.deriveCoverageBlockers(contract)
      const warnings = this.deriveCoverageWarnings(contract)
      const readinessBadge = this.deriveCoverageReadinessBadge(contract, blockers)
      const readiness: FinancialReplayHandlerCoverageReport["coverage"][number]["readiness"] = !contractRegistered
        ? "missing_contract"
        : contract.determinism_policy === "legacy_blocked"
          ? "legacy_blocked"
          : contract.implemented
            ? "ready_for_shadow"
            : "contract_registered"

      return {
        event_type: eventType,
        domain: contract?.domain || "unknown",
        observed_count: observedStats?.count || 0,
        last_seen: observedStats?.last_seen || null,
        contract_registered: contractRegistered,
        implemented: Boolean(contract?.implemented),
        execution_enabled: false as const,
        shadow_supported: contractRegistered,
        determinism_policy: contract?.determinism_policy || "unknown",
        replay_strategy: contract?.replay_strategy || "unregistered",
        criticality,
        required_capabilities: contract?.required_capabilities || [],
        accepted_payload_versions: contract?.accepted_payload_versions || [],
        replay_policy: contract?.replay_policy || "unregistered",
        capability_resolution: capabilityResolution,
        normalized_payload_required: Boolean(contract?.normalized_payload_required),
        external_state_risks: contract?.external_state_risks || [],
        external_state_risks_mitigated: externalStateRisksMitigated,
        readiness_badge: readinessBadge,
        readiness,
        blockers,
        warnings,
        notes: contract?.notes || "Observed event type has no registered replay contract yet.",
      }
    })

    const observedEventTypes = Array.from(observed.keys())
    const observedRegistered = observedEventTypes.filter((eventType) => Boolean(REPLAY_HANDLER_REGISTRY[eventType])).length
    const observedUnregistered = observedEventTypes.length - observedRegistered
    const registeredUnobserved = Object.keys(REPLAY_HANDLER_REGISTRY).filter((eventType) => !observed.has(eventType)).length
    const criticalObserved = observedEventTypes.filter((eventType) => this.deriveEventCriticality(REPLAY_HANDLER_REGISTRY[eventType]) === "critical_financial")
    const criticalRegistered = criticalObserved.filter((eventType) => Boolean(REPLAY_HANDLER_REGISTRY[eventType])).length
    const coveragePercent = observedEventTypes.length === 0 ? 100 : Math.round((observedRegistered / observedEventTypes.length) * 100)
    const criticalCoveragePercent = criticalObserved.length === 0 ? 100 : Math.round((criticalRegistered / criticalObserved.length) * 100)

    return {
      success: true,
      checked_at: new Date().toISOString(),
      company_id: companyId,
      sample_limit: sampleLimit,
      execution_policy: {
        phase: "X2.4 Phase B.4 (confidence gated shadow validation)",
        execution_enabled: false,
        shadow_mode_only: true,
        critical_financial_threshold_percent: 100,
        standard_threshold_percent: 90,
        determinism_rule: "Execution is blocked unless determinism_policy is deterministic or all conditional/payload-required risks are explicitly mitigated by the handler.",
        capability_rule: "Each required capability must be implemented, enabled, and version-compatible before Phase B execution can be considered.",
        readiness_rule: "Execution remains disabled until a handler is implemented, confidence=HIGH, is_deterministic=true, blocked_reason=NONE, all required capabilities pass, and coverage thresholds are satisfied.",
      },
      summary: {
        registered_contracts: Object.keys(REPLAY_HANDLER_REGISTRY).length,
        implemented_handlers: Object.values(REPLAY_HANDLER_REGISTRY).filter((contract) => contract.implemented).length,
        observed_event_types: observedEventTypes.length,
        observed_registered: observedRegistered,
        observed_unregistered: observedUnregistered,
        registered_unobserved: registeredUnobserved,
        coverage_percent: coveragePercent,
        critical_financial_event_types: criticalObserved.length,
        critical_financial_coverage_percent: criticalCoveragePercent,
        threshold_met: criticalCoveragePercent >= 100 && coveragePercent >= 90,
      },
      coverage,
    }
  }

  async calibrateReplayConfidence(
    companyId: string,
    actorId: string,
    sampleLimit = 50
  ): Promise<FinancialReplayConfidenceCalibrationReport> {
    if (!companyId) throw new Error("Company is required")

    const limit = Math.max(1, Math.min(Number.isFinite(sampleLimit) ? Math.floor(sampleLimit) : 50, 100))
    const traces = await this.loadBillReceiptReplayCalibrationTraces(companyId, limit)
    const validationDistribution: Record<FinancialReplayValidationClassification, number> = {
      EXACT_MATCH: 0,
      NUMERIC_DRIFT: 0,
      STRUCTURAL_MISMATCH: 0,
      MISSING_ARTIFACTS: 0,
      NOT_EVALUATED: 0,
    }
    const scoreDistribution = {
      gte_95: 0,
      between_90_94: 0,
      between_70_89: 0,
      lt_70: 0,
    }
    const anomalies: FinancialReplayConfidenceCalibrationReport["anomalies"] = []
    const samples: FinancialReplayConfidenceCalibrationReport["samples"] = []

    for (const trace of traces) {
      try {
        const shadow = await this.shadowReplayExecution({
          companyId,
          actorId,
          traceId: trace.transaction_id,
          requestHash: trace.request_hash,
          dryRun: true,
          uiSurface: "financial_replay_confidence_calibration",
        })
        const score = shadow.execution.replay_confidence.score
        const validation = shadow.execution.handler_validation?.classification || null
        if (validation) validationDistribution[validation] += 1
        if (score >= 95) scoreDistribution.gte_95 += 1
        else if (score >= 90) scoreDistribution.between_90_94 += 1
        else if (score >= 70) scoreDistribution.between_70_89 += 1
        else scoreDistribution.lt_70 += 1

        if (validation === "EXACT_MATCH" && score < REPLAY_EXECUTION_CONFIDENCE_THRESHOLD) {
          anomalies.push({
            trace_id: trace.transaction_id,
            source_id: trace.source_id,
            created_at: trace.created_at,
            score,
            validation,
            classification: shadow.execution.replay_confidence.classification,
            issue: "EXACT_MATCH_BELOW_THRESHOLD",
            message: "Historical validation matched, but confidence score is below the execution-readiness threshold.",
          })
        }
        if (score >= REPLAY_EXECUTION_CONFIDENCE_THRESHOLD && validation !== "EXACT_MATCH") {
          anomalies.push({
            trace_id: trace.transaction_id,
            source_id: trace.source_id,
            created_at: trace.created_at,
            score,
            validation,
            classification: shadow.execution.replay_confidence.classification,
            issue: "HIGH_SCORE_WITHOUT_EXACT_MATCH",
            message: "Confidence score reached threshold without exact historical validation.",
          })
        }

        samples.push({
          trace_id: trace.transaction_id,
          source_id: trace.source_id,
          created_at: trace.created_at,
          score,
          threshold: shadow.execution.replay_confidence.threshold,
          validation,
          classification: shadow.execution.replay_confidence.classification,
          execution_ready: shadow.execution.execution_ready,
          blocked_reason: shadow.blocked_reason,
          gate_failures: shadow.execution.gates.filter((gate) => !gate.passed).map((gate) => gate.code),
        })
      } catch (error: any) {
        anomalies.push({
          trace_id: trace.transaction_id,
          source_id: trace.source_id,
          created_at: trace.created_at,
          score: 0,
          validation: null,
          classification: null,
          issue: "SHADOW_EVALUATION_FAILED",
          message: String(error?.message || "Shadow calibration failed for this trace."),
        })
        samples.push({
          trace_id: trace.transaction_id,
          source_id: trace.source_id,
          created_at: trace.created_at,
          score: null,
          threshold: REPLAY_EXECUTION_CONFIDENCE_THRESHOLD,
          validation: null,
          classification: null,
          execution_ready: false,
          blocked_reason: null,
          gate_failures: ["shadow_evaluation_failed"],
        })
      }
    }

    const scores = samples
      .map((sample) => sample.score)
      .filter((score): score is number => typeof score === "number")
    const readyCount = samples.filter((sample) => sample.execution_ready).length
    const exactMatchCount = samples.filter((sample) => sample.validation === "EXACT_MATCH").length

    return {
      success: true,
      checked_at: new Date().toISOString(),
      company_id: companyId,
      event_type: "bill_receipt_posting",
      payload_version: "bill_receipt_v1",
      sample_limit: limit,
      sampled_count: samples.length,
      threshold: REPLAY_EXECUTION_CONFIDENCE_THRESHOLD,
      execution_enabled: false,
      summary: {
        ready_count: readyCount,
        blocked_count: samples.length - readyCount,
        exact_match_count: exactMatchCount,
        exact_match_below_threshold_count: anomalies.filter((item) => item.issue === "EXACT_MATCH_BELOW_THRESHOLD").length,
        high_score_without_exact_match_count: anomalies.filter((item) => item.issue === "HIGH_SCORE_WITHOUT_EXACT_MATCH").length,
        average_score: scores.length > 0 ? roundComparable(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2) : 0,
        min_score: scores.length > 0 ? Math.min(...scores) : 0,
        max_score: scores.length > 0 ? Math.max(...scores) : 0,
      },
      score_distribution: scoreDistribution,
      validation_distribution: validationDistribution,
      anomalies,
      samples,
    }
  }

  async stabilizeReplayConfidence(
    companyId: string,
    actorId: string,
    requestedWindowCount = 5,
    perWindowLimit = 10
  ): Promise<FinancialReplayConfidenceStabilizationReport> {
    if (!companyId) throw new Error("Company is required")

    const windowCount = Math.max(1, Math.min(Number.isFinite(requestedWindowCount) ? Math.floor(requestedWindowCount) : 5, 5))
    const windowLimit = Math.max(1, Math.min(Number.isFinite(perWindowLimit) ? Math.floor(perWindowLimit) : 10, 20))
    const traces = await this.loadBillReceiptReplayCalibrationTraces(companyId, windowCount * windowLimit * 3)
    const grouped = new Map<string, TraceRow[]>()
    for (const trace of traces) {
      const dateKey = String(trace.created_at || "").slice(0, 10) || "unknown"
      if (!grouped.has(dateKey)) grouped.set(dateKey, [])
      grouped.get(dateKey)!.push(trace)
    }

    const windows: FinancialReplayConfidenceStabilizationReport["windows"] = []
    for (const windowDate of Array.from(grouped.keys()).slice(0, windowCount)) {
      const windowTraces = (grouped.get(windowDate) || []).slice(0, windowLimit)
      const windowResult = await this.evaluateReplayCalibrationWindow(companyId, actorId, windowDate, windowTraces)
      windows.push(windowResult)
    }

    const sampledCount = windows.reduce((sum, window) => sum + window.sampled_count, 0)
    const falsePositiveCount = windows.reduce((sum, window) => sum + window.false_positive_count, 0)
    const falseNegativeCount = windows.reduce((sum, window) => sum + window.false_negative_count, 0)
    const thresholdClusterCount = windows.reduce((sum, window) => sum + window.threshold_cluster_count, 0)
    const averageScores = windows.map((window) => window.average_score)
    const readyRates = windows.map((window) => window.ready_rate_percent)
    const exactRates = windows.map((window) => window.exact_match_rate_percent)
    const averageScoreRange = averageScores.length > 1 ? roundComparable(Math.max(...averageScores) - Math.min(...averageScores), 2) : 0
    const readyRateRange = readyRates.length > 1 ? roundComparable(Math.max(...readyRates) - Math.min(...readyRates), 2) : 0
    const exactMatchRateRange = exactRates.length > 1 ? roundComparable(Math.max(...exactRates) - Math.min(...exactRates), 2) : 0
    const minWindows = 3
    const maxAverageScoreRange = 5
    const maxReadyRateRangePercent = 20
    const hasEnoughWindows = windows.length >= minWindows
    const distributionStable =
      hasEnoughWindows &&
      averageScoreRange <= maxAverageScoreRange &&
      readyRateRange <= maxReadyRateRangePercent
    const stabilityStatus: FinancialReplayConfidenceStabilizationReport["stability_status"] = !hasEnoughWindows
      ? "NEEDS_MORE_DATA"
      : falsePositiveCount === 0 && falseNegativeCount === 0 && distributionStable
        ? "STABLE"
        : "UNSTABLE"

    return {
      success: true,
      checked_at: new Date().toISOString(),
      company_id: companyId,
      event_type: "bill_receipt_posting",
      payload_version: "bill_receipt_v1",
      requested_window_count: windowCount,
      per_window_limit: windowLimit,
      sampled_count: sampledCount,
      threshold: REPLAY_EXECUTION_CONFIDENCE_THRESHOLD,
      execution_enabled: false,
      stability_status: stabilityStatus,
      execution_switch: FinancialReplayRecoveryService.resolveExecutionReadinessSwitch({
        currentStabilityStatus: stabilityStatus,
        manualApprovalPresent: false,
      }),
      criteria: {
        min_windows: minWindows,
        false_positive_required_zero: true,
        false_negative_required_zero: true,
        max_average_score_range: maxAverageScoreRange,
        max_ready_rate_range_percent: maxReadyRateRangePercent,
        threshold_cluster_band: "90-94",
      },
      summary: {
        windows_evaluated: windows.length,
        stable_windows: windows.filter((window) => window.status === "STABLE").length,
        false_positive_count: falsePositiveCount,
        false_negative_count: falseNegativeCount,
        threshold_cluster_count: thresholdClusterCount,
        average_score_range: averageScoreRange,
        ready_rate_range_percent: readyRateRange,
        exact_match_rate_range_percent: exactMatchRateRange,
        distribution_stable: distributionStable,
        notes: unique([
          "Stabilization is read-only and recomputes shadow confidence over recent bill_receipt_v1 traces grouped by day.",
          hasEnoughWindows ? "" : `At least ${minWindows} windows are required before stability can be trusted.`,
          falsePositiveCount === 0 ? "No high-score-without-exact-match false positives were detected." : "High-score-without-exact-match anomalies must be zero before execution.",
          falseNegativeCount === 0 ? "No exact-match-below-threshold false negatives were detected." : "Exact-match-below-threshold anomalies must be resolved or explained before execution.",
          distributionStable ? "Score and ready-rate ranges are within the stabilization thresholds." : "Score or ready-rate ranges are not stable enough yet.",
        ]),
      },
      windows,
    }
  }

  private async expireStaleReplayCommitIntents(params: {
    companyId: string
    sourceTraceId: string
    previewResultHash: string
    nowIso: string
  }) {
    const { error } = await this.adminSupabase
      .from("financial_replay_commit_intents")
      .update({
        status: "expired",
        updated_at: params.nowIso,
      })
      .eq("company_id", params.companyId)
      .eq("source_trace_id", params.sourceTraceId)
      .eq("preview_result_hash", params.previewResultHash)
      .eq("status", "issued")
      .lt("expires_at", params.nowIso)

    if (error) throw new Error(error.message || "Failed to expire stale replay commit intents")
  }

  private async loadReplayCommitIntent(companyId: string, intentId: string): Promise<any | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_replay_commit_intents")
      .select("id, company_id, source_trace_id, event_type, payload_version, preview_result_hash, preview_hash_algorithm, status, token_hash, token_hint, expires_at")
      .eq("company_id", companyId)
      .eq("id", intentId)
      .maybeSingle()

    if (error) throw new Error(error.message || "Failed to load replay commit intent")
    return data || null
  }

  private async loadTraceById(companyId: string, traceId: string): Promise<TraceRow | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, company_id, source_entity, source_id, event_type, idempotency_key, request_hash, metadata, created_at")
      .eq("company_id", companyId)
      .eq("transaction_id", traceId)
      .maybeSingle()
    if (error) throw new Error(error.message || "Failed to load financial trace")
    return data ? { ...data, metadata: data.metadata || {} } as TraceRow : null
  }

  private async loadTraceByIdempotency(companyId: string, idempotencyKey: string): Promise<TraceRow | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, company_id, source_entity, source_id, event_type, idempotency_key, request_hash, metadata, created_at")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(2)
    if (error) throw new Error(error.message || "Failed to load financial trace by idempotency key")
    if ((data || []).length > 1) {
      throw new Error("Idempotency key matches multiple traces. Replay by trace_id or add event-specific replay support.")
    }
    const row = data?.[0]
    return row ? { ...row, metadata: row.metadata || {} } as TraceRow : null
  }

  private async loadTraceLinks(traceId: string): Promise<TraceLinkRow[]> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("id, transaction_id, entity_type, entity_id, link_role, reference_type")
      .eq("transaction_id", traceId)
    if (error) throw new Error(error.message || "Failed to load financial trace links")
    return (data || []) as TraceLinkRow[]
  }

  private async loadObservedEventTypeStats(companyId: string, sampleLimit: number): Promise<Map<string, { count: number; last_seen: string | null }>> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("event_type, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(sampleLimit, 10000)))

    if (error) throw new Error(error.message || "Failed to load observed replay event types")

    const stats = new Map<string, { count: number; last_seen: string | null }>()
    for (const row of data || []) {
      const eventType = String((row as any).event_type || "").trim()
      if (!eventType) continue
      const existing = stats.get(eventType)
      if (existing) {
        existing.count += 1
        continue
      }
      stats.set(eventType, { count: 1, last_seen: (row as any).created_at || null })
    }
    return stats
  }

  private async loadBillReceiptReplayCalibrationTraces(companyId: string, sampleLimit: number): Promise<TraceRow[]> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, company_id, source_entity, source_id, event_type, idempotency_key, request_hash, metadata, created_at")
      .eq("company_id", companyId)
      .eq("event_type", "bill_receipt_posting")
      .order("created_at", { ascending: false })
      .limit(Math.max(sampleLimit * 2, sampleLimit))

    if (error) throw new Error(error.message || "Failed to load replay confidence calibration traces")

    return ((data || []) as any[])
      .map((row) => ({ ...row, metadata: row.metadata || {} }) as TraceRow)
      .filter((trace) => {
        const metadata = trace.metadata || {}
        const payload = metadata.normalized_replay_payload as any
        return metadata.replay_payload_version === "bill_receipt_v1" && payload?.payload_version === "bill_receipt_v1"
      })
      .slice(0, sampleLimit)
  }

  private async evaluateReplayCalibrationWindow(
    companyId: string,
    actorId: string,
    windowDate: string,
    traces: TraceRow[]
  ): Promise<FinancialReplayConfidenceStabilizationReport["windows"][number]> {
    const validationDistribution: FinancialReplayConfidenceCalibrationReport["validation_distribution"] = {
      EXACT_MATCH: 0,
      NUMERIC_DRIFT: 0,
      STRUCTURAL_MISMATCH: 0,
      MISSING_ARTIFACTS: 0,
      NOT_EVALUATED: 0,
    }
    const scoreDistribution: FinancialReplayConfidenceCalibrationReport["score_distribution"] = {
      gte_95: 0,
      between_90_94: 0,
      between_70_89: 0,
      lt_70: 0,
    }
    const anomalies: FinancialReplayConfidenceCalibrationReport["anomalies"] = []
    const scores: number[] = []
    let readyCount = 0
    let exactMatchCount = 0
    let thresholdClusterCount = 0

    for (const trace of traces) {
      try {
        const shadow = await this.shadowReplayExecution({
          companyId,
          actorId,
          traceId: trace.transaction_id,
          requestHash: trace.request_hash,
          dryRun: true,
          uiSurface: "financial_replay_confidence_stabilization",
        })
        const score = shadow.execution.replay_confidence.score
        const validation = shadow.execution.handler_validation?.classification || "NOT_EVALUATED"
        scores.push(score)
        validationDistribution[validation] += 1
        if (shadow.execution.execution_ready) readyCount += 1
        if (validation === "EXACT_MATCH") exactMatchCount += 1
        if (score >= 95) scoreDistribution.gte_95 += 1
        else if (score >= 90) {
          scoreDistribution.between_90_94 += 1
          thresholdClusterCount += 1
        } else if (score >= 70) scoreDistribution.between_70_89 += 1
        else scoreDistribution.lt_70 += 1

        if (validation === "EXACT_MATCH" && score < REPLAY_EXECUTION_CONFIDENCE_THRESHOLD) {
          anomalies.push({
            trace_id: trace.transaction_id,
            source_id: trace.source_id,
            created_at: trace.created_at,
            score,
            validation,
            classification: shadow.execution.replay_confidence.classification,
            issue: "EXACT_MATCH_BELOW_THRESHOLD",
            message: "Historical validation matched, but confidence score is below the execution-readiness threshold.",
          })
        }
        if (score >= REPLAY_EXECUTION_CONFIDENCE_THRESHOLD && validation !== "EXACT_MATCH") {
          anomalies.push({
            trace_id: trace.transaction_id,
            source_id: trace.source_id,
            created_at: trace.created_at,
            score,
            validation,
            classification: shadow.execution.replay_confidence.classification,
            issue: "HIGH_SCORE_WITHOUT_EXACT_MATCH",
            message: "Confidence score reached threshold without exact historical validation.",
          })
        }
      } catch (error: any) {
        anomalies.push({
          trace_id: trace.transaction_id,
          source_id: trace.source_id,
          created_at: trace.created_at,
          score: 0,
          validation: null,
          classification: null,
          issue: "SHADOW_EVALUATION_FAILED",
          message: String(error?.message || "Shadow stabilization failed for this trace."),
        })
      }
    }

    const sampledCount = traces.length
    const averageScore = scores.length > 0 ? roundComparable(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2) : 0
    const readyRate = sampledCount > 0 ? roundComparable((readyCount / sampledCount) * 100, 2) : 0
    const exactMatchRate = sampledCount > 0 ? roundComparable((exactMatchCount / sampledCount) * 100, 2) : 0
    const falsePositiveCount = anomalies.filter((item) => item.issue === "HIGH_SCORE_WITHOUT_EXACT_MATCH").length
    const falseNegativeCount = anomalies.filter((item) => item.issue === "EXACT_MATCH_BELOW_THRESHOLD").length
    const status: FinancialReplayConfidenceStabilizationReport["windows"][number]["status"] =
      falsePositiveCount === 0 &&
      falseNegativeCount === 0 &&
      thresholdClusterCount === 0 &&
      sampledCount > 0
        ? "STABLE"
        : "NEEDS_REVIEW"

    return {
      window_id: `bill_receipt_v1:${windowDate}`,
      window_date: windowDate,
      sampled_count: sampledCount,
      ready_count: readyCount,
      exact_match_count: exactMatchCount,
      false_positive_count: falsePositiveCount,
      false_negative_count: falseNegativeCount,
      threshold_cluster_count: thresholdClusterCount,
      average_score: averageScore,
      ready_rate_percent: readyRate,
      exact_match_rate_percent: exactMatchRate,
      status,
      score_distribution: scoreDistribution,
      validation_distribution: validationDistribution,
      anomalies,
    }
  }

  private deriveEventCriticality(contract: FinancialReplayHandlerContract | undefined): FinancialReplayEventCriticality {
    if (!contract) return "critical_financial"
    if (contract.domain === "legacy" || contract.determinism_policy === "legacy_blocked") return "legacy"
    return "critical_financial"
  }

  private resolveCoverageCapabilities(contract: FinancialReplayHandlerContract | undefined): FinancialReplayHandlerCoverageReport["coverage"][number]["capability_resolution"] {
    const requiredCapabilities = contract?.required_capabilities || BASE_REPLAY_CAPABILITIES
    return requiredCapabilities.map((capability) => {
      if (!contract) {
        return {
          capability,
          implemented: false,
          enabled: false,
          version_compatible: false,
          status: "missing",
          notes: "No replay contract is registered for this event type.",
        }
      }

      if (contract.determinism_policy === "legacy_blocked") {
        return {
          capability,
          implemented: false,
          enabled: false,
          version_compatible: false,
          status: "blocked",
          notes: "Legacy event type is blocked from generic replay execution.",
        }
      }

      if (capability === "handler_registered") {
        return {
          capability,
          implemented: true,
          enabled: true,
          version_compatible: true,
          status: "ready",
          notes: "Replay contract is registered.",
        }
      }

      return {
        capability,
        implemented: contract.implemented,
        enabled: contract.implemented,
        version_compatible: contract.implemented,
        status: contract.implemented ? "ready" : "contract_only",
        notes: contract.implemented
          ? "Capability is available through the implemented replay handler."
          : "Capability is defined by contract but not implemented for execution yet.",
      }
    })
  }

  private deriveCoverageBlockers(contract: FinancialReplayHandlerContract | undefined): string[] {
    if (!contract) return ["missing_contract"]
    if (contract.determinism_policy === "legacy_blocked") return ["legacy_blocked"]
    if (!contract.implemented) return ["handler_not_implemented"]
    return []
  }

  private deriveCoverageWarnings(contract: FinancialReplayHandlerContract | undefined): string[] {
    if (!contract || contract.determinism_policy === "legacy_blocked") return []
    return unique([
      contract.determinism_policy === "conditional" ? "conditional_determinism_requires_mitigation" : "",
      contract.determinism_policy === "payload_required" ? "normalized_payload_snapshot_required" : "",
      contract.replay_strategy === "payload_capture_required" ? "payload_capture_required" : "",
      contract.replay_policy === "forward_only" ? "historical_traces_without_payload_remain_non_replayable" : "",
      contract.external_state_risks.length > 0 ? "external_state_risks_unmitigated" : "",
    ])
  }

  private deriveCoverageReadinessBadge(contract: FinancialReplayHandlerContract | undefined, blockers: string[]): FinancialReplayReadinessBadge {
    if (!contract || blockers.includes("legacy_blocked")) return "BLOCKED"
    if (blockers.length > 0 || this.deriveCoverageWarnings(contract).length > 0) return "NEEDS_CAPABILITIES"
    return "READY"
  }

  private async resolveLinkedArtifacts(links: TraceLinkRow[]) {
    const artifacts: FinancialReplayPlan["current_state"]["linked_artifacts"] = []
    for (const link of links) {
      const tableName = ENTITY_TABLES[link.entity_type]
      if (!tableName) {
        artifacts.push({ entity_type: link.entity_type, entity_id: link.entity_id, link_role: link.link_role, exists: null })
        continue
      }
      const { data, error } = await this.adminSupabase
        .from(tableName)
        .select("id")
        .eq("id", link.entity_id)
        .maybeSingle()
      artifacts.push({
        entity_type: link.entity_type,
        entity_id: link.entity_id,
        link_role: link.link_role,
        exists: error ? null : Boolean(data?.id),
      })
    }
    return artifacts
  }

  private scoreReplayExecutionConfidence(params: {
    plan: FinancialReplayPlan
    handler: FinancialReplayHandlerContract | undefined
    handlerPreview: FinancialReplayHandlerPreview | null
    handlerValidation: FinancialReplayHandlerValidation | null
  }): FinancialReplayExecutionConfidence {
    const determinismScore = params.plan.is_deterministic ? 25 : 0
    const payloadCompletenessScore = params.plan.safety.requires.payload_complete === true ? 25 : 0
    const validationScore = params.handlerValidation?.classification === "EXACT_MATCH"
      ? 25
      : params.handlerValidation?.classification === "NUMERIC_DRIFT"
        ? 10
        : 0
    const handlerMaturityScore = params.handler?.implemented && params.handlerPreview?.prepared ? 25 : 0
    const score = determinismScore + payloadCompletenessScore + validationScore + handlerMaturityScore
    const passed =
      score >= REPLAY_EXECUTION_CONFIDENCE_THRESHOLD &&
      params.handlerValidation?.classification === "EXACT_MATCH"
    const classification: FinancialReplayExecutionConfidence["classification"] = passed
      ? "READY_FOR_CONTROLLED_EXECUTION"
      : score >= 70
        ? "REQUIRES_REVIEW"
        : "BLOCKED"

    return {
      score,
      threshold: REPLAY_EXECUTION_CONFIDENCE_THRESHOLD,
      passed,
      classification,
      required_validation: "EXACT_MATCH",
      components: {
        determinism_score: determinismScore,
        payload_completeness_score: payloadCompletenessScore,
        validation_score: validationScore,
        handler_maturity_score: handlerMaturityScore,
      },
      notes: unique([
        "Replay confidence is a shadow-only execution-readiness score; it does not enable commits.",
        params.plan.is_deterministic ? "Determinism gate contributes full confidence." : "Determinism gate is incomplete.",
        params.plan.safety.requires.payload_complete ? "Payload completeness contributes full confidence." : "Payload completeness is incomplete.",
        params.handlerValidation?.classification === "EXACT_MATCH"
          ? "Historical validation contributes full confidence."
          : `Historical validation is ${params.handlerValidation?.classification || "NOT_EVALUATED"}.`,
        params.handler?.implemented && params.handlerPreview?.prepared
          ? "Handler maturity contributes full confidence for shadow preparation."
          : "Handler maturity is insufficient for controlled execution readiness.",
      ]),
    }
  }

  private buildControlledExecutionEnvelope(params: {
    companyId: string
    plan: FinancialReplayPlan
    handlerPreview: FinancialReplayHandlerPreview | null
    handlerValidation: FinancialReplayHandlerValidation | null
    replayConfidence: FinancialReplayExecutionConfidence
  }): FinancialReplayControlledExecutionEnvelope {
    const payloadVersion = params.handlerPreview?.payload_version || null
    const tenantAllowlistRaw = String(process.env.FINANCIAL_REPLAY_EXECUTION_TENANT_ALLOWLIST || "").trim()
    const tenantAllowlist = tenantAllowlistRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    const tenantAllowed = tenantAllowlist.includes(params.companyId)
    const previewHashInputs: FinancialReplayControlledExecutionEnvelope["preview_hash_inputs"] = {
      trace_id: params.plan.trace.transaction_id,
      event_type: params.plan.trace.event_type,
      payload_version: payloadVersion,
      effective_date: params.handlerPreview?.effective_date || params.plan.safety.effective_date || null,
      journal_line_count: params.handlerPreview?.journal_line_count || 0,
      inventory_transaction_count: params.handlerPreview?.inventory_transaction_count || 0,
      validation_classification: params.handlerValidation?.classification || null,
      replay_confidence_score: params.replayConfidence.score,
      replay_confidence_threshold: params.replayConfidence.threshold,
    }
    const systemReadinessPassed =
      params.replayConfidence.passed &&
      params.handlerValidation?.classification === "EXACT_MATCH" &&
      params.plan.trace.event_type === "bill_receipt_posting" &&
      payloadVersion === "bill_receipt_v1"
    const blockers = unique([
      systemReadinessPassed ? "" : "system_readiness_not_passed",
      tenantAllowed ? "" : "tenant_not_in_execution_allowlist",
      "manual_approval_missing",
      "execution_token_not_issued",
      "financial_replay_execution_disabled_in_b6",
    ])

    return {
      phase: "X2.4 Phase B.5 (controlled execution envelope)",
      mode: "shadow_commit_intent",
      preview_result_hash: params.handlerPreview?.prepared ? sha256StableJson(previewHashInputs) : null,
      preview_hash_algorithm: "sha256:stable-json",
      preview_hash_inputs: previewHashInputs,
      commit_intent: {
        required: true,
        status: "NOT_ISSUED",
        commit_allowed: false,
        eligible_for_future_intent: systemReadinessPassed && tenantAllowed,
      },
      double_confirmation: {
        system_readiness_passed: systemReadinessPassed,
        manual_approval_required: true,
        manual_approval_present: false,
        execution_token_required: true,
        execution_token_issued: false,
      },
      scope: {
        allowed_event_type: "bill_receipt_posting",
        actual_event_type: params.plan.trace.event_type,
        allowed_payload_version: "bill_receipt_v1",
        actual_payload_version: payloadVersion,
        company_id: params.companyId,
        tenant_scope_required: true,
        tenant_allowed: tenantAllowed,
        tenant_allowlist_source: tenantAllowlist.length > 0 ? "env:FINANCIAL_REPLAY_EXECUTION_TENANT_ALLOWLIST" : "not_configured",
      },
      blockers,
      notes: [
        "Envelope is shadow-only and creates no commit intent record, token, trace, journal entry, or inventory transaction in the shadow response.",
        "Future execution must recompute preview_result_hash and reject commit if it differs from the approved preview.",
        "Financial replay execution remains disabled in B.6; commit intent token issuance is audit-only.",
      ],
    }
  }

  private deriveSelectiveWritePolicy(
    validation: FinancialReplayHandlerValidation | null
  ): FinancialReplaySelectiveWritePolicy {
    const classification = validation?.classification || null
    if (classification === "MISSING_ARTIFACTS") {
      return {
        phase: "X2.4 Phase B.8 (selective financial write policy)",
        validation_classification: classification,
        execution_mode: "repair_missing",
        financial_writes_allowed: false,
        financial_writes_reason: "Missing artifacts are the only future candidate for selective repair, but the repair writer remains disabled in B.8.",
        allowed_future_modes: ["validate_only", "repair_missing"],
        required_controls: [
          "existing_artifact_check",
          "missing_artifact_scope",
          "preview_hash_match",
          "one_time_token",
          "transactional_write_guard",
        ],
        blockers: ["selective_repair_writer_not_implemented"],
      }
    }

    if (classification === "EXACT_MATCH") {
      return {
        phase: "X2.4 Phase B.8 (selective financial write policy)",
        validation_classification: classification,
        execution_mode: "validate_only",
        financial_writes_allowed: false,
        financial_writes_reason: "Historical artifacts already match the deterministic preview; writing would duplicate financial state.",
        allowed_future_modes: ["validate_only"],
        required_controls: ["preview_hash_match", "one_time_token", "execution_audit_record"],
        blockers: ["exact_match_duplicate_write_blocked"],
      }
    }

    if (classification === "NUMERIC_DRIFT" || classification === "STRUCTURAL_MISMATCH") {
      return {
        phase: "X2.4 Phase B.8 (selective financial write policy)",
        validation_classification: classification,
        execution_mode: "controlled_review",
        financial_writes_allowed: false,
        financial_writes_reason: "Drift or structural mismatch requires human review before any selective repair design.",
        allowed_future_modes: ["validate_only"],
        required_controls: ["human_review", "root_cause_analysis", "manual_remediation_plan"],
        blockers: [`${String(classification).toLowerCase()}_requires_review`],
      }
    }

    return {
      phase: "X2.4 Phase B.8 (selective financial write policy)",
      validation_classification: classification,
      execution_mode: "blocked",
      financial_writes_allowed: false,
      financial_writes_reason: "Validation was not evaluated, so replay writes remain blocked.",
      allowed_future_modes: ["validate_only"],
      required_controls: ["exact_validation_classification"],
      blockers: ["validation_not_evaluated"],
    }
  }

  private async validateReplayPreview(
    companyId: string,
    plan: FinancialReplayPlan,
    preview: FinancialReplayHandlerPreview
  ): Promise<FinancialReplayHandlerValidation> {
    const empty = (classification: FinancialReplayValidationClassification, notes: string[]): FinancialReplayHandlerValidation => ({
      classification,
      compared: false,
      tolerance: {
        monetary: REPLAY_VALIDATION_MONETARY_TOLERANCE,
        quantity: REPLAY_VALIDATION_QUANTITY_TOLERANCE,
      },
      missing_artifacts: [],
      journal: {
        expected_line_count: preview.journal_line_count,
        actual_line_count: 0,
        expected_debit_total: 0,
        actual_debit_total: 0,
        expected_credit_total: 0,
        actual_credit_total: 0,
        account_mismatches: [],
        amount_mismatches: [],
      },
      inventory: {
        expected_transaction_count: preview.inventory_transaction_count,
        actual_transaction_count: 0,
        product_mismatches: [],
        quantity_mismatches: [],
      },
      notes,
    })

    if (!preview.prepared) {
      return empty("NOT_EVALUATED", ["Handler preview did not prepare a deterministic payload."])
    }
    if (plan.trace.event_type !== "bill_receipt_posting") {
      return empty("NOT_EVALUATED", ["Historical artifact validation is only implemented for bill_receipt_posting in Phase B.3."])
    }

    const trace = await this.loadTraceById(companyId, plan.trace.transaction_id)
    const payload = trace?.metadata?.normalized_replay_payload as BillReceiptReplayPayload | undefined
    const preparation = prepareBillPostingFromPayload(payload as BillReceiptReplayPayload)
    if (!trace || !payload || !preparation.success || !preparation.payload?.journal) {
      return empty("STRUCTURAL_MISMATCH", [preparation.error || "Replay payload could not be rebuilt for historical validation."])
    }

    const expectedJournalLines = preparation.payload.journal.lines || []
    const expectedInventoryTransactions = preparation.payload.inventoryTransactions || []
    const links = await this.loadTraceLinks(plan.trace.transaction_id)
    const journalEntryIds = unique(
      links
        .filter((link) => link.entity_type === "journal_entry")
        .map((link) => link.entity_id)
    )
    const inventoryTransactionIds = unique(
      links
        .filter((link) => link.entity_type === "inventory_transaction")
        .map((link) => link.entity_id)
    )

    const missingArtifacts = unique([
      expectedJournalLines.length > 0 && journalEntryIds.length === 0 ? "journal_entry" : "",
      expectedInventoryTransactions.length > 0 && inventoryTransactionIds.length === 0 ? "inventory_transaction" : "",
    ])
    const actualJournalLines = journalEntryIds.length > 0
      ? await this.loadJournalLineArtifacts(journalEntryIds)
      : []
    const actualInventoryTransactions = inventoryTransactionIds.length > 0
      ? await this.loadInventoryTransactionArtifacts(inventoryTransactionIds)
      : []
    const journal = this.compareJournalArtifacts(expectedJournalLines, actualJournalLines)
    const inventory = this.compareInventoryArtifacts(expectedInventoryTransactions, actualInventoryTransactions)

    const hasStructuralMismatch =
      journal.expected_line_count !== journal.actual_line_count ||
      journal.account_mismatches.length > 0 ||
      inventory.expected_transaction_count !== inventory.actual_transaction_count ||
      inventory.product_mismatches.length > 0
    const hasNumericDrift =
      journal.amount_mismatches.length > 0 ||
      !withinTolerance(journal.expected_debit_total, journal.actual_debit_total, REPLAY_VALIDATION_MONETARY_TOLERANCE) ||
      !withinTolerance(journal.expected_credit_total, journal.actual_credit_total, REPLAY_VALIDATION_MONETARY_TOLERANCE) ||
      inventory.quantity_mismatches.length > 0

    const classification: FinancialReplayValidationClassification =
      missingArtifacts.length > 0
        ? "MISSING_ARTIFACTS"
        : hasStructuralMismatch
          ? "STRUCTURAL_MISMATCH"
          : hasNumericDrift
            ? "NUMERIC_DRIFT"
            : "EXACT_MATCH"

    return {
      classification,
      compared: true,
      tolerance: {
        monetary: REPLAY_VALIDATION_MONETARY_TOLERANCE,
        quantity: REPLAY_VALIDATION_QUANTITY_TOLERANCE,
      },
      missing_artifacts: missingArtifacts,
      journal,
      inventory,
      notes: unique([
        "Validation is read-only and compares the payload-only preview with linked historical artifacts.",
        classification === "EXACT_MATCH" ? "Preview matches historical journal and inventory artifacts within tolerance." : "",
        classification === "MISSING_ARTIFACTS" ? "One or more expected linked artifacts are missing from trace lineage." : "",
        classification === "STRUCTURAL_MISMATCH" ? "Preview shape differs from historical artifacts." : "",
        classification === "NUMERIC_DRIFT" ? "Preview shape matches, but amounts or quantities drift beyond tolerance." : "",
      ]),
    }
  }

  private async loadJournalLineArtifacts(journalEntryIds: string[]) {
    const { data, error } = await this.adminSupabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit_amount, credit_amount")
      .in("journal_entry_id", journalEntryIds)
    if (error) throw new Error(error.message || "Failed to load historical journal entry lines")
    return (data || []) as Array<{
      journal_entry_id: string
      account_id: string | null
      debit_amount: number | string | null
      credit_amount: number | string | null
    }>
  }

  private async loadInventoryTransactionArtifacts(inventoryTransactionIds: string[]) {
    const { data, error } = await this.adminSupabase
      .from("inventory_transactions")
      .select("id, product_id, transaction_type, quantity_change, reference_id, reference_type")
      .in("id", inventoryTransactionIds)
    if (error) throw new Error(error.message || "Failed to load historical inventory transactions")
    return (data || []) as Array<{
      id: string
      product_id: string | null
      transaction_type: string | null
      quantity_change: number | string | null
      reference_id: string | null
      reference_type: string | null
    }>
  }

  private compareJournalArtifacts(
    expectedLines: Array<{ account_id: string; debit_amount: number; credit_amount: number }>,
    actualLines: Array<{ account_id: string | null; debit_amount: number | string | null; credit_amount: number | string | null }>
  ): FinancialReplayHandlerValidation["journal"] {
    const expectedByAccount = this.aggregateJournalLines(expectedLines)
    const actualByAccount = this.aggregateJournalLines(actualLines)
    const accountMismatches: FinancialReplayArtifactMismatch[] = []
    const amountMismatches: FinancialReplayArtifactMismatch[] = []

    for (const [accountId, expected] of expectedByAccount) {
      const actual = actualByAccount.get(accountId)
      if (!actual) {
        accountMismatches.push({ key: accountId, expected: "present", actual: "missing" })
        continue
      }
      const debitDelta = roundComparable(actual.debit - expected.debit, 6)
      const creditDelta = roundComparable(actual.credit - expected.credit, 6)
      if (
        !withinTolerance(expected.debit, actual.debit, REPLAY_VALIDATION_MONETARY_TOLERANCE) ||
        !withinTolerance(expected.credit, actual.credit, REPLAY_VALIDATION_MONETARY_TOLERANCE)
      ) {
        amountMismatches.push({
          key: accountId,
          expected: roundComparable(expected.debit - expected.credit, 4),
          actual: roundComparable(actual.debit - actual.credit, 4),
          delta: roundComparable(debitDelta - creditDelta, 4),
        })
      }
    }

    for (const accountId of actualByAccount.keys()) {
      if (!expectedByAccount.has(accountId)) {
        accountMismatches.push({ key: accountId, expected: "missing", actual: "present" })
      }
    }

    return {
      expected_line_count: expectedLines.length,
      actual_line_count: actualLines.length,
      expected_debit_total: this.sumJournal(expectedLines, "debit_amount"),
      actual_debit_total: this.sumJournal(actualLines, "debit_amount"),
      expected_credit_total: this.sumJournal(expectedLines, "credit_amount"),
      actual_credit_total: this.sumJournal(actualLines, "credit_amount"),
      account_mismatches: accountMismatches,
      amount_mismatches: amountMismatches,
    }
  }

  private compareInventoryArtifacts(
    expectedTransactions: Array<{ product_id: string; quantity_change: number }>,
    actualTransactions: Array<{ product_id: string | null; quantity_change: number | string | null }>
  ): FinancialReplayHandlerValidation["inventory"] {
    const expectedByProduct = this.aggregateInventoryTransactions(expectedTransactions)
    const actualByProduct = this.aggregateInventoryTransactions(actualTransactions)
    const productMismatches: FinancialReplayArtifactMismatch[] = []
    const quantityMismatches: FinancialReplayArtifactMismatch[] = []

    for (const [productId, expectedQuantity] of expectedByProduct) {
      const actualQuantity = actualByProduct.get(productId)
      if (actualQuantity === undefined) {
        productMismatches.push({ key: productId, expected: "present", actual: "missing" })
        continue
      }
      if (!withinTolerance(expectedQuantity, actualQuantity, REPLAY_VALIDATION_QUANTITY_TOLERANCE)) {
        quantityMismatches.push({
          key: productId,
          expected: roundComparable(expectedQuantity, 4),
          actual: roundComparable(actualQuantity, 4),
          delta: roundComparable(actualQuantity - expectedQuantity, 4),
        })
      }
    }

    for (const productId of actualByProduct.keys()) {
      if (!expectedByProduct.has(productId)) {
        productMismatches.push({ key: productId, expected: "missing", actual: "present" })
      }
    }

    return {
      expected_transaction_count: expectedTransactions.length,
      actual_transaction_count: actualTransactions.length,
      product_mismatches: productMismatches,
      quantity_mismatches: quantityMismatches,
    }
  }

  private aggregateJournalLines(lines: Array<{ account_id: string | null; debit_amount: number | string | null; credit_amount: number | string | null }>) {
    const aggregated = new Map<string, { debit: number; credit: number }>()
    for (const line of lines) {
      const accountId = String(line.account_id || "").trim()
      if (!accountId) continue
      const existing = aggregated.get(accountId) || { debit: 0, credit: 0 }
      existing.debit = roundComparable(existing.debit + toFiniteNumber(line.debit_amount), 4)
      existing.credit = roundComparable(existing.credit + toFiniteNumber(line.credit_amount), 4)
      aggregated.set(accountId, existing)
    }
    return aggregated
  }

  private aggregateInventoryTransactions(lines: Array<{ product_id: string | null; quantity_change: number | string | null }>) {
    const aggregated = new Map<string, number>()
    for (const line of lines) {
      const productId = String(line.product_id || "").trim()
      if (!productId) continue
      aggregated.set(productId, roundComparable((aggregated.get(productId) || 0) + toFiniteNumber(line.quantity_change), 4))
    }
    return aggregated
  }

  private sumJournal(lines: Array<{ debit_amount?: number | string | null; credit_amount?: number | string | null }>, key: "debit_amount" | "credit_amount") {
    return roundComparable(lines.reduce((sum, line) => sum + toFiniteNumber(line[key]), 0), 4)
  }

  private async previewReplayHandler(companyId: string, plan: FinancialReplayPlan): Promise<FinancialReplayHandlerPreview | null> {
    const handler = REPLAY_HANDLER_REGISTRY[plan.trace.event_type]
    if (!handler?.implemented) return null

    const trace = await this.loadTraceById(companyId, plan.trace.transaction_id)
    const payload = trace?.metadata?.normalized_replay_payload

    if (plan.trace.event_type === "bill_receipt_posting") {
      const preparation = prepareBillPostingFromPayload(payload as BillReceiptReplayPayload)
      return {
        event_type: plan.trace.event_type,
        handler_id: handler.handler_id,
        mode: "shadow_prepare_only",
        prepared: preparation.success,
        error: preparation.error || null,
        payload_version: typeof (payload as any)?.payload_version === "string" ? (payload as any).payload_version : null,
        reference_id: preparation.payload?.journal?.reference_id || null,
        effective_date: preparation.payload?.journal?.entry_date || null,
        journal_line_count: preparation.payload?.journal?.lines.length || 0,
        inventory_transaction_count: preparation.payload?.inventoryTransactions?.length || 0,
        bill_update_status: preparation.payload?.billUpdate?.status || null,
        writes_performed: [],
      }
    }

    return {
      event_type: plan.trace.event_type,
      handler_id: handler.handler_id,
      mode: "shadow_prepare_only",
      prepared: false,
      error: "Replay handler preview is not implemented for this event type.",
      payload_version: typeof (payload as any)?.payload_version === "string" ? (payload as any).payload_version : null,
      reference_id: null,
      effective_date: null,
      journal_line_count: 0,
      inventory_transaction_count: 0,
      bill_update_status: null,
      writes_performed: [],
    }
  }

  private deriveEffectiveDate(trace: TraceRow): string | null {
    const payload = trace.metadata?.normalized_replay_payload as any
    const payloadDate = payload?.bill?.effective_receipt_date || payload?.bill?.received_at
    if (typeof payloadDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(payloadDate)) {
      return payloadDate.slice(0, 10)
    }

    for (const key of dateKeys) {
      const value = trace.metadata?.[key]
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trace.created_at)) return trace.created_at.slice(0, 10)
    return null
  }

  private hasReplayPayloadSnapshot(trace: TraceRow, handler: FinancialReplayHandlerContract | undefined): boolean {
    if (!trace.request_hash) return false
    if (!handler?.normalized_payload_required) return true

    const metadata = trace.metadata || {}
    if (!(
      metadata.replay_payload_version &&
      metadata.normalized_replay_payload &&
      metadata.normalized_replay_payload_hash
    )) {
      return false
    }

    if (
      handler.accepted_payload_versions.length > 0 &&
      !handler.accepted_payload_versions.includes(String(metadata.replay_payload_version))
    ) {
      return false
    }

    if (trace.event_type === "bill_receipt_posting") {
      const payload = metadata.normalized_replay_payload as any
      const lineItems = Array.isArray(payload?.line_items) ? payload.line_items : []
      const hasLineSnapshots = lineItems.length > 0 && lineItems.every((line: any) => (
        line?.bill_item_id &&
        Number.isFinite(Number(line.quantity)) &&
        Number.isFinite(Number(line.unit_price)) &&
        Number.isFinite(Number(line.tax_rate)) &&
        Number.isFinite(Number(line.discount_percent)) &&
        Number.isFinite(Number(line.line_total)) &&
        Number.isFinite(Number(line.gross_amount)) &&
        Number.isFinite(Number(line.discount_amount)) &&
        Number.isFinite(Number(line.tax_amount)) &&
        typeof line.stockable === "boolean"
      ))

      return Boolean(
        payload?.payload_version === "bill_receipt_v1" &&
        payload?.bill?.bill_id &&
        payload?.bill?.branch_id &&
        payload?.bill?.warehouse_id &&
        payload?.bill?.cost_center_id &&
        payload?.bill?.effective_receipt_date &&
        payload?.bill?.currency_code &&
        Number.isFinite(Number(payload?.bill?.exchange_rate)) &&
        payload?.account_mapping?.accounts_payable &&
        payload?.account_mapping?.mapping_source &&
        payload?.account_mapping?.mapping_version &&
        payload?.account_mapping_snapshot?.accounts_payable?.id === payload.account_mapping.accounts_payable &&
        (!payload.account_mapping.inventory || payload.account_mapping_snapshot?.inventory?.id === payload.account_mapping.inventory) &&
        (!payload.account_mapping.purchases || payload.account_mapping_snapshot?.purchases?.id === payload.account_mapping.purchases) &&
        (!payload.account_mapping.vat_input || payload.account_mapping_snapshot?.vat_input?.id === payload.account_mapping.vat_input) &&
        payload?.monetary_snapshot &&
        Number.isFinite(Number(payload.monetary_snapshot.subtotal)) &&
        Number.isFinite(Number(payload.monetary_snapshot.tax_amount)) &&
        Number.isFinite(Number(payload.monetary_snapshot.total_amount)) &&
        Number.isFinite(Number(payload.monetary_snapshot.shipping)) &&
        Number.isFinite(Number(payload.monetary_snapshot.adjustment)) &&
        payload?.currency_snapshot?.currency_code &&
        Number.isFinite(Number(payload.currency_snapshot.exchange_rate)) &&
        payload?.discount_snapshot?.discount_type &&
        payload?.discount_snapshot?.discount_position &&
        Number.isFinite(Number(payload.discount_snapshot.discount_value)) &&
        payload?.tax_snapshot &&
        typeof payload.tax_snapshot.tax_inclusive === "boolean" &&
        Number.isFinite(Number(payload.tax_snapshot.tax_amount)) &&
        Array.isArray(payload.tax_snapshot.breakdown) &&
        payload?.calculation_policy?.line_total_source === "bill_items.line_total" &&
        payload?.calculation_policy?.tax_source === "bills.tax_amount" &&
        typeof payload.calculation_policy.tax_inclusive === "boolean" &&
        payload?.inventory_policy?.valuation_replay_mode === "verify_only" &&
        payload.inventory_policy.warehouse_id === payload.bill.warehouse_id &&
        payload.inventory_policy.cost_center_id === payload.bill.cost_center_id &&
        payload?.artifact_expectations &&
        Number.isFinite(Number(payload.artifact_expectations.stockable_item_count)) &&
        Number.isFinite(Number(payload.artifact_expectations.line_item_count)) &&
        typeof payload.artifact_expectations.expects_inventory === "boolean" &&
        hasLineSnapshots
      )
    }

    return true
  }

  private async checkPeriodOpen(companyId: string, effectiveDate: string): Promise<{ open: boolean | null; message: string | null }> {
    const { data: fiscalPeriods, error: fiscalError } = await this.adminSupabase
      .from("fiscal_periods")
      .select("id, year, month, status")
      .eq("company_id", companyId)
      .eq("year", Number(effectiveDate.slice(0, 4)))
      .eq("month", Number(effectiveDate.slice(5, 7)))

    if (fiscalError) return { open: null, message: fiscalError.message }
    const lockedFiscal = (fiscalPeriods || []).find((period: any) => isLockedStatus(period.status))
    if (lockedFiscal) return { open: false, message: `Fiscal period ${lockedFiscal.year}-${lockedFiscal.month} is ${lockedFiscal.status}` }

    const { data: accountingPeriods, error: accountingError } = await this.adminSupabase
      .from("accounting_periods")
      .select("id, period_name, status, is_locked, period_start, period_end")
      .eq("company_id", companyId)
      .lte("period_start", effectiveDate)
      .gte("period_end", effectiveDate)

    if (accountingError) return { open: null, message: accountingError.message }
    const lockedAccounting = (accountingPeriods || []).find((period: any) => period.is_locked === true || isLockedStatus(period.status))
    if (lockedAccounting) return { open: false, message: `Accounting period ${lockedAccounting.period_name || lockedAccounting.id} is locked or closed` }
    return { open: true, message: "Financial period is open for replay planning" }
  }

  private scoreConfidence(params: {
    blockedReasons: string[]
    missingArtifactCount: number
    handlerRegistered: boolean
    requestHashMatch: boolean | null
    periodOpen: boolean | null
  }): FinancialReplayConfidence {
    if (params.blockedReasons.some((reason) => ["HASH_MISMATCH", "PERIOD_LOCK", "MISSING_REQUEST_HASH", "MISSING_REPLAY_PAYLOAD", "MISSING_ARTIFACTS"].includes(reason))) {
      return "LOW"
    }
    if (!params.handlerRegistered || params.requestHashMatch === null || params.periodOpen === null) {
      return "MEDIUM"
    }
    return "HIGH"
  }

  private groupDiff(params: {
    blockedReasons: string[]
    missingArtifactCount: number
    handlerRegistered: boolean
    hasRequestHash: boolean
    payloadComplete: boolean
    requestHashMatch: boolean | null
    periodOpen: boolean | null
  }) {
    return {
      safety: unique([
        params.requestHashMatch === false ? "Request hash mismatch blocks replay." : "",
        params.periodOpen === false ? "Financial period is locked or closed." : "",
        params.periodOpen === null ? "Financial period status could not be confirmed." : "",
      ]),
      lineage: unique([
        params.missingArtifactCount > 0 ? `${params.missingArtifactCount} linked artifact(s) are missing.` : "",
      ]),
      handler: unique([
        params.handlerRegistered ? "Replay handler is registered." : "Replay handler is not registered for this event type.",
      ]),
      payload: unique([
        params.hasRequestHash ? "Trace includes request_hash." : "Trace request_hash is missing.",
        params.payloadComplete ? "Trace includes normalized replay payload contract." : "Normalized replay payload contract is missing or incomplete.",
        params.blockedReasons.includes("MISSING_REQUEST_HASH") ? "Payload completeness cannot be trusted without request_hash." : "",
      ]),
    }
  }

  private evaluateExecutionGates(plan: FinancialReplayPlan): FinancialReplayExecutionGate[] {
    const requires = plan.safety.requires
    return [
      {
        code: "confidence_high",
        passed: plan.confidence === "HIGH",
        severity: "blocking",
        message: plan.confidence === "HIGH" ? "Replay confidence is HIGH." : `Replay confidence is ${plan.confidence}.`,
      },
      {
        code: "deterministic",
        passed: plan.is_deterministic === true,
        severity: "blocking",
        message: plan.is_deterministic ? "Replay is deterministic by current gates." : "Replay is not deterministic yet.",
      },
      {
        code: "no_blocked_reason",
        passed: plan.blocked_reason === "NONE" && plan.diff.blocked_reasons.length === 0,
        severity: "blocking",
        message: plan.blocked_reason === "NONE" ? "No blocked reason is present." : `Replay is blocked by ${plan.blocked_reason}.`,
      },
      {
        code: "handler_registered",
        passed: requires.handler_registered === true,
        severity: "blocking",
        message: requires.handler_registered ? "Replay handler is registered." : "Replay handler is missing.",
      },
      {
        code: "payload_complete",
        passed: requires.payload_complete === true,
        severity: "blocking",
        message: requires.payload_complete ? "Payload contract is complete enough for planning." : "Payload/request hash contract is incomplete.",
      },
      {
        code: "period_open",
        passed: requires.period_open === true,
        severity: "blocking",
        message: requires.period_open ? "Financial period is open." : "Financial period is not confirmed open.",
      },
      {
        code: "request_hash_match",
        passed: requires.request_hash_match === true,
        severity: "blocking",
        message: requires.request_hash_match === true ? "Request hash matches." : "Request hash match is missing or failed.",
      },
      {
        code: "lineage_intact",
        passed: requires.lineage_intact === true,
        severity: "blocking",
        message: requires.lineage_intact ? "Trace lineage is intact." : "Trace lineage has missing artifacts.",
      },
    ]
  }

  private suggestFixes(params: {
    trace: TraceRow
    blockedReasons: string[]
    missingArtifactCount: number
    handlerRegistered: boolean
    hasRequestHash: boolean
    payloadComplete: boolean
    requestHashMatch: boolean | null
    periodOpen: boolean | null
    isDeterministic: boolean
  }) {
    const fixes: FinancialReplayPlan["diff"]["suggested_fixes"] = []

    if (!params.handlerRegistered) {
      fixes.push({
        code: "REGISTER_REPLAY_HANDLER",
        type: "REGISTER_HANDLER",
        action: "add_replay_handler",
        target: params.trace.event_type,
        priority: "HIGH",
        requires: ["payload_complete", "period_open", "lineage_intact"],
        title: "Register event-specific replay handler",
        description: `Add a deterministic replay handler for ${params.trace.event_type} before allowing execution.`,
        next_step: "Capture normalized payload snapshot and route replay through the original command service.",
      })
    }
    if (!params.hasRequestHash) {
      fixes.push({
        code: "BACKFILL_REPLAY_PAYLOAD_CONTRACT",
        type: "FIX_PAYLOAD_CONTRACT",
        action: "backfill_or_recapture_payload_hash",
        target: params.trace.transaction_id,
        priority: "HIGH",
        requires: ["request_hash_match", "lineage_intact"],
        title: "Backfill or recapture replay contract",
        description: "This trace does not include request_hash, so deterministic replay cannot be proven.",
        next_step: "Mark the operation as legacy-replay-limited or create a supervised remediation trace.",
      })
    }
    if (params.hasRequestHash && !params.payloadComplete) {
      fixes.push({
        code: "CAPTURE_NORMALIZED_REPLAY_PAYLOAD",
        type: "FIX_PAYLOAD_CONTRACT",
        action: "capture_normalized_replay_payload",
        target: params.trace.event_type,
        priority: "HIGH",
        requires: ["payload_complete", "request_hash_match", "lineage_intact"],
        title: "Capture normalized replay payload",
        description: "The trace has request_hash but does not include the normalized replay payload required for deterministic execution.",
        next_step: "Use the event-specific command contract to store payload_version, normalized_replay_payload, and normalized_replay_payload_hash on future traces.",
      })
    }
    if (params.requestHashMatch === false) {
      fixes.push({
        code: "REJECT_HASH_MISMATCH",
        type: "HASH_MISMATCH",
        action: "reject_replay_request",
        target: params.trace.transaction_id,
        priority: "HIGH",
        requires: ["request_hash_match"],
        title: "Reject mismatched replay request",
        description: "The supplied request_hash does not match the original trace.",
        next_step: "Use the exact original payload hash or investigate a duplicate-key collision attempt.",
      })
    }
    if (params.periodOpen === false) {
      fixes.push({
        code: "REPLAY_PERIOD_LOCKED",
        type: "PERIOD_LOCK",
        action: "use_adjustment_or_reopen_workflow",
        target: params.trace.transaction_id,
        priority: "HIGH",
        requires: ["period_open"],
        title: "Period lock blocks replay",
        description: "The effective date falls in a locked or closed financial period.",
        next_step: "Use a controlled adjustment entry in an open period or follow the formal reopen workflow.",
      })
    }
    if (params.missingArtifactCount > 0) {
      fixes.push({
        code: "REPAIR_TRACE_LINEAGE",
        type: "FIX_LINEAGE",
        action: "relink_or_explain_entity",
        target: params.trace.transaction_id,
        priority: "MEDIUM",
        requires: ["lineage_intact"],
        title: "Repair or explain broken lineage",
        description: "One or more trace links reference missing artifacts.",
        next_step: "Run X2.2 integrity checks for the trace and repair links only after verifying source records.",
      })
    }
    if (fixes.length === 0) {
      fixes.push({
        code: "READY_FOR_HANDLER_REVIEW",
        type: "REVIEW",
        action: "review_replay_handler_readiness",
        target: params.trace.event_type,
        priority: params.isDeterministic ? "LOW" : "MEDIUM",
        requires: ["handler_registered", "payload_complete", "period_open", "request_hash_match", "lineage_intact"],
        title: "Ready for replay handler review",
        description: "No immediate safety blocker was detected in the dry-run plan.",
        next_step: "Review event-specific handler requirements before enabling execution.",
      })
    }

    return fixes
  }

  private primaryBlockedReason(blockedReasons: FinancialReplayBlockedReason[]): FinancialReplayBlockedReason {
    const priority: FinancialReplayBlockedReason[] = [
      "HASH_MISMATCH",
      "PERIOD_LOCK",
      "MISSING_REQUEST_HASH",
      "MISSING_REPLAY_PAYLOAD",
      "MISSING_ARTIFACTS",
      "MISSING_HANDLER",
      "UNKNOWN_PERIOD_STATE",
    ]
    return priority.find((reason) => blockedReasons.includes(reason)) || "NONE"
  }
}
