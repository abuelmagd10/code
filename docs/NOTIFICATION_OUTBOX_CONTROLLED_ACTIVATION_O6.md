# Phase O.6 - Notification Outbox Controlled Activation

## Goal

Activate the dispatcher in a tightly controlled `active_canary` mode without cutting over the current runtime notification services.

This phase is intentionally narrower than a normal dispatcher rollout:

- only governance replay event families are eligible
- only allowlisted companies are eligible
- only event families that pass `O.5 activation gating` are eligible
- no authoritative cutover happens in this phase

## Eligible Event Families

The only families allowed in O.6 are:

- `governance.replay_commit_intent_issued`
- `governance.replay_execution_activated`

`procurement.bill_receipt_posted` remains blocked in `shadow_only` until the policy gap is closed.

## Activation Policy

Dispatcher mode is resolved by:

- `NOTIFICATION_OUTBOX_CANARY_COMPANY_IDS`
- `NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES`

If `NOTIFICATION_OUTBOX_CANARY_EVENT_TYPES` is omitted, the canary fallback defaults to the two governance replay event families above.

Authoritative mode flags may still exist in configuration, but O.6 does **not** enable authoritative delivery.

## Runtime Behavior

`POST /api/notification-outbox/canary-dispatch`

This route:

1. verifies governance leadership access
2. verifies the requested event family is allowed in O.6
3. verifies O.5 recommends `activation_candidate`
4. loads pending/failed outbox events for the eligible family
5. runs shadow routing for the exact outbox rows being processed
6. tries to claim an existing runtime notification by `event_key`
7. if no runtime notification exists, creates a backfill notification
8. marks the outbox event as `dispatched` or `failed`

## Delivery Semantics

This is a `claim-or-backfill` canary model:

- if a runtime notification already exists for the same `event_key`, the dispatcher claims it and does not create a duplicate
- if no runtime notification exists, the dispatcher creates exactly one notification

This preserves current production behavior while validating dispatcher delivery on real traffic.

## Outbox Lifecycle

During O.6:

- `pending` / `failed` -> `processing`
- successful claim or creation -> `dispatched`
- any runtime delivery failure -> `failed`

No event family is moved to `active_authoritative` in this phase.

## Operational Safety

O.6 keeps the current runtime governance notification services active.

That means:

- no cutover
- no removal of legacy runtime delivery
- no dependence on the dispatcher for correctness yet

The dispatcher is validating production behavior under a controlled canary envelope.

## Post-run analysis

After each canary wave, inspect:

- `GET /api/notification-outbox/canary-health`

This provides:

- claimed vs created notification counts
- retry candidates
- stuck processing events
- latency metrics
- drift-alignment snapshot against the current runtime system

## Expected Next Step

After observing O.6 safely, the next phase should be a stricter readiness and promotion decision for event families that remain stable under `active_canary`.
