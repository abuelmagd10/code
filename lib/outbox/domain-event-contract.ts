export const DOMAIN_EVENT_CONTRACT_VERSION = 1 as const

export type DomainEventPayload = Record<string, unknown>

export type DomainEventContext = {
  actorId?: string | null
  actorRole?: string | null
  branchId?: string | null
  warehouseId?: string | null
  costCenterId?: string | null
  uiSurface?: string | null
  requestHash?: string | null
  correlationId?: string | null
  metadata?: Record<string, unknown>
}

export type NotificationOutboxDeliveryStatus =
  | "pending"
  | "processing"
  | "dispatched"
  | "failed"
  | "dead_letter"

export type DomainEvent<TPayload extends DomainEventPayload = DomainEventPayload> = {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  tenantId: string
  payload: TPayload
  context: DomainEventContext
  idempotencyKey: string | null
  createdAt: string
  version: number
  correlationId: string | null
  causationEventId: string | null
}

export type CreateDomainEventInput<TPayload extends DomainEventPayload = DomainEventPayload> = {
  eventId?: string
  eventType: string
  aggregateType: string
  aggregateId: string
  tenantId: string
  payload: TPayload
  context?: DomainEventContext
  idempotencyKey?: string | null
  createdAt?: string
  version?: number
  correlationId?: string | null
  causationEventId?: string | null
}

export type NotificationOutboxInsertRecord<TPayload extends DomainEventPayload = DomainEventPayload> = {
  event_id: string
  tenant_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload: TPayload
  context: DomainEventContext
  idempotency_key: string | null
  correlation_id: string | null
  causation_event_id: string | null
  version: number
}

function generateEventId() {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
  if (randomUUID) {
    return randomUUID()
  }

  return `evt_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function normalizeContext(context?: DomainEventContext): DomainEventContext {
  if (!context) return {}
  return {
    actorId: context.actorId || null,
    actorRole: context.actorRole || null,
    branchId: context.branchId || null,
    warehouseId: context.warehouseId || null,
    costCenterId: context.costCenterId || null,
    uiSurface: context.uiSurface || null,
    requestHash: context.requestHash || null,
    correlationId: context.correlationId || null,
    metadata: context.metadata || undefined,
  }
}

export function createDomainEvent<TPayload extends DomainEventPayload>(
  input: CreateDomainEventInput<TPayload>
): DomainEvent<TPayload> {
  return {
    eventId: input.eventId || generateEventId(),
    eventType: String(input.eventType || "").trim(),
    aggregateType: String(input.aggregateType || "").trim(),
    aggregateId: String(input.aggregateId || "").trim(),
    tenantId: String(input.tenantId || "").trim(),
    payload: input.payload,
    context: normalizeContext(input.context),
    idempotencyKey: input.idempotencyKey || null,
    createdAt: input.createdAt || new Date().toISOString(),
    version: input.version || DOMAIN_EVENT_CONTRACT_VERSION,
    correlationId: input.correlationId || input.context?.correlationId || null,
    causationEventId: input.causationEventId || null,
  }
}

export function toNotificationOutboxInsertRecord<TPayload extends DomainEventPayload>(
  event: DomainEvent<TPayload>
): NotificationOutboxInsertRecord<TPayload> {
  return {
    event_id: event.eventId,
    tenant_id: event.tenantId,
    event_type: event.eventType,
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId,
    payload: event.payload,
    context: event.context,
    idempotency_key: event.idempotencyKey,
    correlation_id: event.correlationId,
    causation_event_id: event.causationEventId,
    version: event.version,
  }
}
