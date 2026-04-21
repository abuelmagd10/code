# Notification Outbox Drift Analysis (Phase O.4)

## Goal

`Phase O.4` introduces a reconciliation layer between:

- `shadow dispatcher output` from `Phase O.3`
- `runtime notifications` currently written by the legacy live delivery path

This phase remains read-only.

It does **not**:

- send notifications
- update the outbox
- archive or remediate notifications
- perform cutover

## Why O.4 exists

The system is now running in a dual-truth transitional mode:

- the legacy runtime delivery path is still active
- the event-driven backbone is now captured and understood

`Phase O.4` validates whether both views agree before any dispatcher activation.

## Read-only API

- `GET /api/notification-outbox/drift-analysis`

Supported filters:

- `limit`
- `event_type`
- `delivery_status`
- `cursor`
- `include_unsupported`

## Comparison model

For each outbox event, the analyzer compares:

1. expected shadow intents
2. actual notification rows in `notifications`
3. event-family drift inside the same deterministic event-key prefix

## Comparison statuses

- `exact_match`
- `drift_detected`
- `policy_gap`
- `unsupported`

## Mismatch codes

- `MISSING_NOTIFICATION`
- `ORPHAN_NOTIFICATION`
- `RECIPIENT_MISMATCH`
- `SEVERITY_MISMATCH`
- `CATEGORY_MISMATCH`
- `PRIORITY_MISMATCH`
- `DUPLICATE_EVENT_KEY`
- `POLICY_GAP`
- `UNBOUND_RUNTIME_DELIVERY`
- `UNSUPPORTED_EVENT`
- `INCONSISTENT_SUPERSEDE_BEHAVIOR`

## Current O.4 behavior

### Governance events

These are expected to reconcile cleanly because:

- they are already routed in `Phase O.3`
- they already have backend-owned runtime delivery
- their event keys are deterministic

### Bill receipt posted

This event remains intentionally classified as `policy_gap`.

`Phase O.4` therefore checks:

- whether a runtime notification already exists for that unbound family
- whether the gap is clean
- whether unbound delivery has already leaked into runtime

## Architectural value

`Phase O.4` is not a dispatcher.

It is a reconciliation layer that proves whether:

- the event backbone and runtime delivery agree
- routing policy is complete
- recipient resolution is stable
- supersede behavior is consistent

## Next logical phase

`Phase O.5` should only start after O.4 produces stable results on the scoped
event families, especially:

- governance replay events
- bill receipt posted policy-gap visibility

The intended next step is still shadow-first:

- analyze drift over time
- close policy gaps
- confirm exact-match readiness

Only after that should dispatcher activation be discussed.
