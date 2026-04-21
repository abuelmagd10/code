# Phase O.1 — Notification Outbox Foundation

## Scope

This phase introduces the schema and code foundation for event-driven notification delivery without changing live runtime behavior.

Included:

- canonical domain event contract
- canonical notification outbox table
- enqueue service for future dual-write adoption

Excluded:

- dispatcher runtime
- retry / DLQ execution
- cutover from direct notification delivery

## New foundation pieces

### 1. Domain Event Contract

Implemented in:

- `lib/outbox/domain-event-contract.ts`

Core fields:

- `eventId`
- `eventType`
- `aggregateType`
- `aggregateId`
- `tenantId`
- `payload`
- `context`
- `idempotencyKey`
- `createdAt`
- `version`

Additional foundation fields:

- `correlationId`
- `causationEventId`

### 2. Notification Outbox Table

Implemented in:

- `supabase/migrations/20260418_001_notification_outbox_foundation.sql`

Table:

- `public.notification_outbox_events`

Lifecycle fields:

- `delivery_status`
- `delivery_attempts`
- `available_at`
- `processing_started_at`
- `dispatched_at`
- `failed_at`
- `dead_lettered_at`
- `last_error`

### 3. Enqueue Service

Implemented in:

- `lib/outbox/notification-outbox.service.ts`

Purpose:

- create canonical domain event snapshot
- insert into `notification_outbox_events`
- support idempotent enqueue semantics

## Architectural intent

This phase does **not** replace current notification services.

Current runtime remains:

- `UI -> API -> Notification Service -> Notifications`

Phase O.1 only makes the next transition safe:

- `Service -> Notifications`
- `Service -> Outbox`

## Next safe step

### Phase O.2 — Dual Write

Notification services keep their existing behavior and also enqueue a matching outbox event.

This allows:

- shadow verification
- payload validation
- dispatcher development without delivery risk

## Why this is safe

- additive only
- no runtime cutover
- no dispatcher side effects
- no change to current delivery ownership

## Success condition for O.1

- schema exists
- contract exists
- enqueue service exists
- no live behavior changed
