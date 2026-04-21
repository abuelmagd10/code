# Phase O.7 - Authoritative Cutover Readiness Review

## Goal

Evaluate whether an outbox event family is ready to enter a formal `active_authoritative`
cutover review.

This phase is intentionally stricter than `O.5 activation gating` and `O.6 canary health`.
It does **not** activate authoritative delivery by itself.

## What O.7 Verifies

For each supported event family, O.7 evaluates:

- canary evidence volume over the current baseline window
- exact-match stability inherited from `O.4`
- retry / failed / stuck lifecycle cleanliness inherited from `O.6`
- whether rollout remains tenant-scoped through env-driven feature flags
- whether legacy runtime hot-standby is explicitly configured for post-cutover rollback
- whether dead-letter automation is implemented

## Readiness States

- `blocked`
  - the family is not ready for authoritative review yet
- `review_ready`
  - the family is stable enough to enter final cutover review, but explicit cutover blockers remain
- `cutover_candidate`
  - the family has passed review and no O.7 blockers remain

## Current O.7 Safety Model

At this stage, O.7 is expected to be conservative.

Two blockers are intentionally treated as cutover blockers until they are explicitly addressed:

- `DLQ_AUTOMATION_NOT_IMPLEMENTED`
- `LEGACY_HOT_STANDBY_NOT_CONFIGURED`

This means a family can be `review_ready` without being `authoritativeCutoverAllowed`.

## Hot-standby configuration

If leadership wants legacy runtime delivery to remain available during authoritative rollout,
configure:

- `NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_COMPANY_IDS`
- `NOTIFICATION_OUTBOX_LEGACY_HOT_STANDBY_EVENT_TYPES`

These flags do not activate cutover. They only express rollback posture.

## DLQ automation configuration

If leadership wants O.7 to recognize dead-letter handling as implemented, configure:

- `NOTIFICATION_OUTBOX_DLQ_AUTOMATION_ENABLED`
- `NOTIFICATION_OUTBOX_DLQ_MAX_ATTEMPTS`
- `NOTIFICATION_OUTBOX_DLQ_RETRY_BACKOFF_SECONDS`

In the current implementation, repeated dispatcher failures are automatically moved from
`failed` to `dead_letter` once the configured attempt threshold is reached.

## Route

`GET /api/notification-outbox/authoritative-readiness`

Leadership-only.

Supported query params:

- `event_type` / `eventType`
- `created_after` / `createdAfter` / `baseline_created_after`
- `limit`
- `processing_stuck_minutes` / `processingStuckMinutes`

## Output Shape

The route returns:

- readiness summary
- family-level blockers and warnings
- rollout controls snapshot
- inherited canary health summary
- inherited activation-gate summary
- inherited drift summary

## Interpretation

`review_ready` means:

- canary evidence is stable
- drift remains aligned
- lifecycle stayed clean
- the family can move into a formal authoritative cutover review

It does **not** mean authoritative delivery should be enabled immediately.

## Expected Next Step

If a family reaches `review_ready`, the next phase is a tightly controlled
`authoritative cutover decision` with:

- explicit rollback approval
- explicit hot-standby posture
- explicit DLQ / retry handling plan
- tenant-scoped authoritative flag activation
