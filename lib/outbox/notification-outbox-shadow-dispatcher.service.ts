import { buildNotificationEventKey } from "@/lib/notification-workflow"
import {
  NotificationRecipientResolverService,
  type ResolvedNotificationRecipient,
} from "@/lib/services/notification-recipient-resolver.service"
import {
  buildBillReceiptConfirmedNotificationIntents,
  type BillReceiptNotificationBill,
} from "@/lib/services/bill-receipt-notification.service"

import type { NotificationOutboxDeliveryStatus } from "@/lib/outbox/domain-event-contract"

type SupabaseLike = any
type JsonMap = Record<string, unknown>

export const SUPPORTED_NOTIFICATION_OUTBOX_EVENT_TYPES = [
  "procurement.bill_receipt_posted",
  "governance.replay_commit_intent_issued",
  "governance.replay_execution_activated",
] as const

export type SupportedNotificationOutboxEventType =
  (typeof SUPPORTED_NOTIFICATION_OUTBOX_EVENT_TYPES)[number]

type NotificationOutboxEventRow = {
  event_id: string
  tenant_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload: JsonMap | null
  context: JsonMap | null
  idempotency_key: string | null
  correlation_id: string | null
  causation_event_id: string | null
  version: number
  delivery_status: NotificationOutboxDeliveryStatus
  delivery_attempts: number
  available_at: string | null
  processing_started_at: string | null
  dispatched_at: string | null
  failed_at: string | null
  dead_lettered_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

type BillProjection = {
  id: string
  bill_number: string | null
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  purchase_order_id: string | null
  purchase_order_creator_user_id: string | null
}

type EventScope = {
  branchId: string | null
  warehouseId: string | null
  costCenterId: string | null
  uiSurface: string | null
  actorId: string | null
  requestHash: string | null
  correlationId: string | null
}

type ShadowDispatchCandidatePolicy = {
  eventDomain: string
  referenceType: string
  referenceId: string
  eventAction: string
  priority: "low" | "normal" | "high" | "urgent"
  severity: "info" | "warning" | "error" | "critical"
  category: "finance" | "inventory" | "sales" | "approvals" | "system"
  rationale: string
}

type ShadowDispatchRecipientCandidate = {
  strategy: string
  recipient: ResolvedNotificationRecipient
  recipientScopeSegments: string[]
  rationale: string
}

export type ShadowDispatchNotificationIntent = {
  eventDomain: string
  eventAction: string
  referenceType: string
  referenceId: string
  title: string
  message: string
  priority: "low" | "normal" | "high" | "urgent"
  severity: "info" | "warning" | "error" | "critical"
  category: "finance" | "inventory" | "sales" | "approvals" | "system"
  recipient: ResolvedNotificationRecipient
  recipientScopeSegments: string[]
  eventKey: string
}

export type ShadowDispatchSimulationStatus =
  | "routed"
  | "needs_policy_binding"
  | "unsupported"

export type ShadowDispatchItem = {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  createdAt: string
  deliveryStatus: NotificationOutboxDeliveryStatus
  deliveryAttempts: number
  availableAt: string | null
  processingStartedAt: string | null
  dispatchedAt: string | null
  failedAt: string | null
  deadLetteredAt: string | null
  lastError: string | null
  idempotencyKey: string | null
  correlationId: string | null
  causationEventId: string | null
  version: number
  supported: boolean
  routerKey: string
  simulationStatus: ShadowDispatchSimulationStatus
  scope: EventScope
  notificationIntents: ShadowDispatchNotificationIntent[]
  candidatePolicy: ShadowDispatchCandidatePolicy | null
  candidateRecipients: ShadowDispatchRecipientCandidate[]
  warnings: string[]
  blockers: string[]
}

export type NotificationOutboxShadowDispatchResult = {
  summary: {
    evaluatedEvents: number
    supportedEvents: number
    routedEvents: number
    needsPolicyBindingEvents: number
    unsupportedEvents: number
    simulatedNotificationIntents: number
    candidateRecipientCount: number
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
  supportedEventTypes: readonly SupportedNotificationOutboxEventType[]
  nextCursor: string | null
  items: ShadowDispatchItem[]
}

export type NotificationOutboxShadowDispatchQuery = {
  companyId: string
  eventType?: string | null
  deliveryStatus?: NotificationOutboxDeliveryStatus | null
  createdAfter?: string | null
  cursor?: string | null
  limit?: number
  includeUnsupported?: boolean
}

function asObject(value: unknown): JsonMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as JsonMap
}

function asNullableString(value: unknown) {
  const normalized = String(value || "").trim()
  return normalized || null
}

function uniqueBy<T>(items: T[], keySelector: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keySelector(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export class NotificationOutboxShadowDispatcherService {
  private readonly resolver: NotificationRecipientResolverService

  constructor(private readonly supabase: SupabaseLike) {
    this.resolver = new NotificationRecipientResolverService(supabase)
  }

  async simulate(query: NotificationOutboxShadowDispatchQuery): Promise<NotificationOutboxShadowDispatchResult> {
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 200)
    const includeUnsupported = query.includeUnsupported !== false
    const rows = await this.loadOutboxEvents({
      companyId: query.companyId,
      eventType: query.eventType || null,
      deliveryStatus: query.deliveryStatus || null,
      createdAfter: query.createdAfter || null,
      cursor: query.cursor || null,
      limit,
    })

    const billsById = await this.loadBillsByIds(
      query.companyId,
      rows
        .filter((row) => row.event_type === "procurement.bill_receipt_posted")
        .map((row) => row.aggregate_id)
    )

    const simulated = await Promise.all(
      rows.map((row) => this.simulateEvent(row, billsById.get(row.aggregate_id) || null))
    )

    const items = includeUnsupported
      ? simulated
      : simulated.filter((item) => item.simulationStatus !== "unsupported")

    return {
      summary: {
        evaluatedEvents: items.length,
        supportedEvents: items.filter((item) => item.supported).length,
        routedEvents: items.filter((item) => item.simulationStatus === "routed").length,
        needsPolicyBindingEvents: items.filter((item) => item.simulationStatus === "needs_policy_binding").length,
        unsupportedEvents: items.filter((item) => item.simulationStatus === "unsupported").length,
        simulatedNotificationIntents: items.reduce((sum, item) => sum + item.notificationIntents.length, 0),
        candidateRecipientCount: items.reduce((sum, item) => sum + item.candidateRecipients.length, 0),
      },
      filters: {
        companyId: query.companyId,
        eventType: query.eventType || null,
        deliveryStatus: query.deliveryStatus || null,
        createdAfter: query.createdAfter || null,
        cursor: query.cursor || null,
        limit,
        includeUnsupported,
      },
      supportedEventTypes: SUPPORTED_NOTIFICATION_OUTBOX_EVENT_TYPES,
      nextCursor: rows.length === limit ? rows[rows.length - 1]?.created_at || null : null,
      items,
    }
  }

  async simulateByEventIds(input: {
    companyId: string
    eventIds: string[]
    includeUnsupported?: boolean
  }): Promise<ShadowDispatchItem[]> {
    const uniqueEventIds = Array.from(new Set((input.eventIds || []).filter(Boolean)))
    if (uniqueEventIds.length === 0) return []

    const rows = await this.loadOutboxEventsByIds(input.companyId, uniqueEventIds)
    const billsById = await this.loadBillsByIds(
      input.companyId,
      rows
        .filter((row) => row.event_type === "procurement.bill_receipt_posted")
        .map((row) => row.aggregate_id)
    )

    const simulated = await Promise.all(
      rows.map((row) => this.simulateEvent(row, billsById.get(row.aggregate_id) || null))
    )

    if (input.includeUnsupported === false) {
      return simulated.filter((item) => item.simulationStatus !== "unsupported")
    }

    return simulated
  }

  private async loadOutboxEvents(input: {
    companyId: string
    eventType: string | null
    deliveryStatus: NotificationOutboxDeliveryStatus | null
    createdAfter: string | null
    cursor: string | null
    limit: number
  }) {
    let query = this.supabase
      .from("notification_outbox_events")
      .select(`
        event_id,
        tenant_id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        context,
        idempotency_key,
        correlation_id,
        causation_event_id,
        version,
        delivery_status,
        delivery_attempts,
        available_at,
        processing_started_at,
        dispatched_at,
        failed_at,
        dead_lettered_at,
        last_error,
        created_at,
        updated_at
      `)
      .eq("tenant_id", input.companyId)
      .order("created_at", { ascending: false })
      .order("event_id", { ascending: false })
      .limit(input.limit)

    if (input.eventType) {
      query = query.eq("event_type", input.eventType)
    }

    if (input.deliveryStatus) {
      query = query.eq("delivery_status", input.deliveryStatus)
    }

    if (input.createdAfter) {
      query = query.gte("created_at", input.createdAfter)
    }

    if (input.cursor) {
      query = query.lt("created_at", input.cursor)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message || "Failed to load notification outbox events")
    }

    return Array.isArray(data) ? (data as NotificationOutboxEventRow[]) : []
  }

  private async loadOutboxEventsByIds(companyId: string, eventIds: string[]) {
    const { data, error } = await this.supabase
      .from("notification_outbox_events")
      .select(`
        event_id,
        tenant_id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        context,
        idempotency_key,
        correlation_id,
        causation_event_id,
        version,
        delivery_status,
        delivery_attempts,
        available_at,
        processing_started_at,
        dispatched_at,
        failed_at,
        dead_lettered_at,
        last_error,
        created_at,
        updated_at
      `)
      .eq("tenant_id", companyId)
      .in("event_id", eventIds)
      .order("created_at", { ascending: false })
      .order("event_id", { ascending: false })

    if (error) {
      throw new Error(error.message || "Failed to load notification outbox events by id")
    }

    return Array.isArray(data) ? (data as NotificationOutboxEventRow[]) : []
  }

  private async loadBillsByIds(companyId: string, billIds: string[]) {
    const uniqueIds = Array.from(new Set(billIds.filter(Boolean)))
    const map = new Map<string, BillProjection>()

    if (uniqueIds.length === 0) return map

    const { data, error } = await this.supabase
      .from("bills")
      .select("id, bill_number, branch_id, warehouse_id, cost_center_id, purchase_order_id")
      .eq("company_id", companyId)
      .in("id", uniqueIds)

    if (error) {
      throw new Error(error.message || "Failed to load bill projections for shadow dispatch")
    }

    const purchaseOrderIds = Array.from(
      new Set(
        (Array.isArray(data) ? data : [])
          .map((row: any) => row.purchase_order_id)
          .filter(Boolean)
      )
    )
    const purchaseOrderCreators = new Map<string, string | null>()

    if (purchaseOrderIds.length > 0) {
      const { data: purchaseOrders, error: purchaseOrderError } = await this.supabase
        .from("purchase_orders")
        .select("id, created_by_user_id")
        .eq("company_id", companyId)
        .in("id", purchaseOrderIds)

      if (purchaseOrderError) {
        throw new Error(
          purchaseOrderError.message ||
            "Failed to load purchase-order creator projections for shadow dispatch"
        )
      }

      for (const row of Array.isArray(purchaseOrders) ? purchaseOrders : []) {
        purchaseOrderCreators.set(String(row.id), row.created_by_user_id || null)
      }
    }

    for (const row of Array.isArray(data) ? data : []) {
      map.set(String(row.id), {
        id: String(row.id),
        bill_number: row.bill_number || null,
        branch_id: row.branch_id || null,
        warehouse_id: row.warehouse_id || null,
        cost_center_id: row.cost_center_id || null,
        purchase_order_id: row.purchase_order_id || null,
        purchase_order_creator_user_id:
          (row.purchase_order_id &&
            purchaseOrderCreators.get(String(row.purchase_order_id))) ||
          null,
      })
    }

    return map
  }

  private async simulateEvent(
    row: NotificationOutboxEventRow,
    bill: BillProjection | null
  ): Promise<ShadowDispatchItem> {
    switch (row.event_type) {
      case "governance.replay_commit_intent_issued":
        return this.simulateReplayCommitIntentIssued(row)
      case "governance.replay_execution_activated":
        return this.simulateReplayExecutionActivated(row)
      case "procurement.bill_receipt_posted":
        return this.simulateBillReceiptPosted(row, bill)
      default:
        return this.buildUnsupportedEvent(row)
    }
  }

  private simulateReplayCommitIntentIssued(row: NotificationOutboxEventRow): ShadowDispatchItem {
    const payload = asObject(row.payload)
    const scope = this.resolveScope(row)
    const intents = this.buildGovernanceIntents({
      referenceType: "financial_replay_commit_intent",
      referenceId: row.aggregate_id,
      title: "تم إصدار نية تنفيذ Replay مالية",
      message: `تم إصدار Replay Commit Intent للـtrace (${asNullableString(payload.source_trace_id) || row.correlation_id || "unknown_trace"}) الخاص بالحدث (${asNullableString(payload.event_type) || "unknown_event"}) بنسخة payload (${asNullableString(payload.payload_version) || "unknown_version"})، وصلاحيتها حتى ${asNullableString(payload.expires_at) || "unknown_expiry"}.`,
      priority: "high",
      severity: "warning",
      category: "approvals",
      eventAction: "replay_commit_intent_issued",
      scope,
    })

    return this.baseItem(row, {
      supported: true,
      routerKey: "governance.replay_commit_intent",
      simulationStatus: "routed",
      scope,
      notificationIntents: intents,
      candidatePolicy: null,
      candidateRecipients: [],
      warnings: [],
      blockers: [],
    })
  }

  private simulateReplayExecutionActivated(row: NotificationOutboxEventRow): ShadowDispatchItem {
    const payload = asObject(row.payload)
    const scope = this.resolveScope(row)
    const intents = this.buildGovernanceIntents({
      referenceType: "financial_replay_execution",
      referenceId: row.aggregate_id,
      title: "تم تفعيل Replay مالية تحت الحوكمة",
      message: `تم تفعيل Replay Execution للـtrace (${asNullableString(payload.source_trace_id) || row.correlation_id || "unknown_trace"}) الخاص بالحدث (${asNullableString(payload.event_type) || "unknown_event"}) بنسخة payload (${asNullableString(payload.payload_version) || "unknown_version"}). الكتابات المالية المنفذة: ${payload.financial_writes_performed ? "نعم" : "لا"} حتى الآن. وقت التفعيل: ${asNullableString(payload.executed_at) || "unknown_time"}.`,
      priority: "high",
      severity: "info",
      category: "approvals",
      eventAction: "replay_execution_activated",
      scope,
    })

    return this.baseItem(row, {
      supported: true,
      routerKey: "governance.replay_execution",
      simulationStatus: "routed",
      scope,
      notificationIntents: intents,
      candidatePolicy: null,
      candidateRecipients: [],
      warnings: [],
      blockers: [],
    })
  }

  private async simulateBillReceiptPosted(
    row: NotificationOutboxEventRow,
    bill: BillProjection | null
  ): Promise<ShadowDispatchItem> {
    const payload = asObject(row.payload)
    const replayPayload = asObject(payload.replay_payload)
    const replayBill = asObject(replayPayload.bill)
    const resolvedBill: BillReceiptNotificationBill = bill
      ? {
          id: bill.id,
          bill_number: bill.bill_number,
          branch_id: bill.branch_id,
          warehouse_id: bill.warehouse_id,
          cost_center_id: bill.cost_center_id,
          purchase_order_id: bill.purchase_order_id,
          created_by: asNullableString(replayBill.created_by),
          created_by_user_id: asNullableString(replayBill.created_by_user_id),
        }
      : {
          id: row.aggregate_id,
          bill_number: asNullableString(replayBill.bill_number),
          branch_id: asNullableString(replayBill.branch_id),
          warehouse_id: asNullableString(replayBill.warehouse_id),
          cost_center_id: asNullableString(replayBill.cost_center_id),
          purchase_order_id: asNullableString(replayBill.purchase_order_id),
          created_by: asNullableString(replayBill.created_by),
          created_by_user_id: asNullableString(replayBill.created_by_user_id),
        }
    const scope = this.resolveScope(
      row,
      bill || {
        id: resolvedBill.id,
        bill_number: resolvedBill.bill_number,
        branch_id: resolvedBill.branch_id,
        warehouse_id: resolvedBill.warehouse_id,
        cost_center_id: resolvedBill.cost_center_id,
        purchase_order_id: resolvedBill.purchase_order_id,
        purchase_order_creator_user_id: null,
      }
    )
    const warnings: string[] = []

    if (!bill) {
      warnings.push(
        "Bill projection was not available; shadow routing used replay payload and outbox context fallbacks."
      )
    }

    const intents = buildBillReceiptConfirmedNotificationIntents({
      resolver: this.resolver,
      bill: resolvedBill,
      cycleKey: scope.correlationId || row.correlation_id || row.event_id,
      actorId: scope.actorId,
      purchaseOrderCreatorUserId: bill?.purchase_order_creator_user_id || null,
    }).map((intent) => ({
      eventDomain: intent.eventDomain,
      eventAction: intent.eventAction,
      referenceType: intent.referenceType,
      referenceId: intent.referenceId,
      title: intent.title,
      message: intent.message,
      priority: intent.priority || "normal",
      severity: intent.severity || "info",
      category: intent.category || "system",
      recipient: intent.recipient,
      recipientScopeSegments: intent.recipientScopeSegments,
      eventKey: intent.eventKey,
    })) satisfies ShadowDispatchNotificationIntent[]

    return this.baseItem(row, {
      supported: true,
      routerKey: "procurement.bill_receipt_posted",
      simulationStatus: "routed",
      scope,
      notificationIntents: intents,
      candidatePolicy: null,
      candidateRecipients: [],
      warnings,
      blockers: [],
    })
  }

  private buildUnsupportedEvent(row: NotificationOutboxEventRow): ShadowDispatchItem {
    return this.baseItem(row, {
      supported: false,
      routerKey: "unmapped.outbox_event",
      simulationStatus: "unsupported",
      scope: this.resolveScope(row),
      notificationIntents: [],
      candidatePolicy: null,
      candidateRecipients: [],
      warnings: [`No shadow dispatcher router is registered for event type (${row.event_type}).`],
      blockers: ["MISSING_ROUTER"],
    })
  }

  private buildGovernanceIntents(input: {
    referenceType: string
    referenceId: string
    title: string
    message: string
    priority: "low" | "normal" | "high" | "urgent"
    severity: "info" | "warning" | "error" | "critical"
    category: "finance" | "inventory" | "sales" | "approvals" | "system"
    eventAction: string
    scope: EventScope
  }) {
    const recipients = this.resolver.resolveLeadershipVisibilityRecipients(
      input.scope.branchId,
      input.scope.warehouseId,
      input.scope.costCenterId
    )

    return recipients.map((recipient) => {
      const recipientScopeSegments = this.resolver.buildRecipientScopeSegments(recipient)
      return {
        eventDomain: "governance",
        eventAction: input.eventAction,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        title: input.title,
        message: input.message,
        priority: input.priority,
        severity: input.severity,
        category: input.category,
        recipient,
        recipientScopeSegments,
        eventKey: buildNotificationEventKey(
          "governance",
          input.referenceType,
          input.referenceId,
          input.eventAction,
          ...recipientScopeSegments
        ),
      } satisfies ShadowDispatchNotificationIntent
    })
  }

  private buildCandidateRecipient(
    strategy: string,
    recipient: ResolvedNotificationRecipient,
    rationale: string
  ): ShadowDispatchRecipientCandidate {
    return {
      strategy,
      recipient,
      recipientScopeSegments: this.resolver.buildRecipientScopeSegments(recipient),
      rationale,
    }
  }

  private resolveScope(row: NotificationOutboxEventRow, bill?: BillProjection | null): EventScope {
    const context = asObject(row.context)
    const payload = asObject(row.payload)
    const traceMetadata = asObject(payload.trace_metadata)

    return {
      branchId:
        bill?.branch_id ||
        asNullableString(context.branchId) ||
        asNullableString(traceMetadata.branch_id),
      warehouseId:
        bill?.warehouse_id ||
        asNullableString(context.warehouseId) ||
        asNullableString(traceMetadata.warehouse_id),
      costCenterId:
        bill?.cost_center_id ||
        asNullableString(context.costCenterId) ||
        asNullableString(traceMetadata.cost_center_id),
      uiSurface: asNullableString(context.uiSurface),
      actorId: asNullableString(context.actorId),
      requestHash: asNullableString(context.requestHash),
      correlationId: row.correlation_id || asNullableString(context.correlationId),
    }
  }

  private baseItem(
    row: NotificationOutboxEventRow,
    derived: Pick<
      ShadowDispatchItem,
      | "supported"
      | "routerKey"
      | "simulationStatus"
      | "scope"
      | "notificationIntents"
      | "candidatePolicy"
      | "candidateRecipients"
      | "warnings"
      | "blockers"
    >
  ): ShadowDispatchItem {
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      createdAt: row.created_at,
      deliveryStatus: row.delivery_status,
      deliveryAttempts: Number(row.delivery_attempts || 0),
      availableAt: row.available_at || null,
      processingStartedAt: row.processing_started_at || null,
      dispatchedAt: row.dispatched_at || null,
      failedAt: row.failed_at || null,
      deadLetteredAt: row.dead_lettered_at || null,
      lastError: row.last_error || null,
      idempotencyKey: row.idempotency_key || null,
      correlationId: row.correlation_id || null,
      causationEventId: row.causation_event_id || null,
      version: Number(row.version || 1),
      ...derived,
    }
  }
}
