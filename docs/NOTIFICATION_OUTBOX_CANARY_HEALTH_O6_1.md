# Phase O.6.1 - Notification Outbox Canary Health

## Goal

Provide an operational read-only report for the first canary wave before any authoritative cutover.

This phase answers:

- how many outbox events were dispatched
- how many notifications were claimed vs backfilled
- whether any events are stuck in processing
- whether drift remains aligned with runtime notifications

## Read-only API

- `GET /api/notification-outbox/canary-health`

Supported filters:

- `event_type`
- `limit`
- `processing_stuck_minutes`

Only governance replay canary families are supported in this phase.

## Metrics Returned

### Delivery metrics

- total outbox events
- pending / processing / dispatched / failed / dead-letter counts
- retry candidate count
- stuck processing count
- claimed existing notifications
- created notifications
- total delivered notification intents

### Latency metrics

- average dispatch latency
- max dispatch latency

### Drift metrics

- exact-match rate
- drift-detected count
- policy-gap count
- unsupported count
- orphan notifications
- duplicate deliveries

### Lifecycle health

- stable lifecycle boolean
- per-family recommendation:
  - `stable`
  - `needs_attention`

## Data Source

This phase reads from two sources:

1. `notification_outbox_events`
2. `O.5 activation gate / O.4 drift reconciliation`

It does not write any notification data and does not trigger dispatch.

## Dispatch Summary Persistence

O.6.1 also adds a lightweight dispatch summary onto each successfully dispatched outbox row.

Stored fields include:

- dispatch mode
- dispatcher actor id
- delivery method
- notification count
- existing claim count
- created notification count
- delivered event keys

This makes post-run canary analysis possible without relying only on transient API responses.

## Expected Usage

Typical safe rollout flow:

1. enable one allowlist tenant for canary
2. run `POST /api/notification-outbox/canary-dispatch`
3. inspect `GET /api/notification-outbox/canary-health`
4. verify:
   - zero duplicate deliveries
   - zero orphan notifications
   - zero stuck processing events
   - acceptable failure rate
   - drift still aligned

Only after repeated stable waves should the platform consider broader promotion.
