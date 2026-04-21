# O.8 — Controlled Authoritative Cutover Review

## Purpose

`O.8` adds a formal review envelope above `O.7` for event families that already reached
`cutover_candidate`.

This phase does **not** activate `active_authoritative` by itself.

Instead, it answers:

- Is a single-tenant, single-family authoritative wave ready for manual approval?
- What exact env changes would be required?
- Is rollback still immediate through legacy hot standby?
- What health and drift checkpoints must be monitored during the first wave?

## Scope

Current implementation is limited to event families already supported by the outbox canary stack:

- `governance.replay_commit_intent_issued`
- `governance.replay_execution_activated`
- `procurement.bill_receipt_posted`

## Output States

Each family is classified as one of:

- `blocked`
- `manual_review_required`
- `ready_for_controlled_cutover`

At the summary level, `controlledCutoverAllowed = true` means every evaluated family is ready for a
single-tenant controlled authoritative wave.

## What O.8 Reviews

For each family, the review includes:

- current dispatcher mode
- target mode `active_authoritative`
- O.7 readiness snapshot
- env change plan for:
  - `NOTIFICATION_OUTBOX_AUTHORITATIVE_COMPANY_IDS`
  - `NOTIFICATION_OUTBOX_AUTHORITATIVE_EVENT_TYPES`
  - `NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_COMPANY_IDS`
  - `NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_EVENT_TYPES`
- rollback posture
- monitoring checkpoints
- stop conditions for the first authoritative wave

## API

Leadership-only route:

`GET /api/notification-outbox/authoritative-cutover-review`

Supported query params:

- `eventType`
- `createdAfter`
- `baseline_created_after`
- `limit`
- `processingStuckMinutes`

## Script

Direct DB review script:

`npx tsx scripts/outbox/run-authoritative-cutover-review.ts --company-id <uuid> --event-type procurement.bill_receipt_posted --created-after <timestamp> --limit 200`

## Important Constraint

`O.8` is still a review layer.

It can recommend a controlled authoritative wave, but the actual cutover must remain:

- tenant-scoped
- event-family-scoped
- manually approved
- rollback-ready
- protected by legacy hot standby
