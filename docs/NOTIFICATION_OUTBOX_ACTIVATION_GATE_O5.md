# Notification Outbox Activation Gate (Phase O.5)

## Goal

`Phase O.5` introduces a formal activation gate above the O.4 drift analyzer.

This phase does **not** perform cutover.

It only answers:

- which event families remain `shadow_only`
- which event families can become `activation_candidate`
- why a family is still blocked

## Dispatcher modes

- `shadow_only`
- `activation_candidate`
- `active_authoritative`

Current O.5 behavior:

- `currentMode` is always `shadow_only`
- `recommendedMode` may become `activation_candidate`
- `active_authoritative` is intentionally blocked in this phase

## Read-only API

- `GET /api/notification-outbox/activation-gate`

Supported filters:

- `limit`
- `event_type`
- `delivery_status`
- `cursor`
- `include_unsupported`

## Gating model

The gate evaluates each supported event family using:

- sample count
- exact-match rate
- drift-detected rate
- policy-gap count
- unsupported count
- zero-tolerance mismatch classes

## Current policy thresholds

Each family is evaluated with:

- `minSampleCount = 5`
- `exactMatchRatePercent >= 98`
- `driftDetectedRatePercent <= 1`
- `policyGapCount = 0`
- `unsupportedCount = 0`

Zero-tolerance mismatch classes:

- `ORPHAN_NOTIFICATION`
- `RECIPIENT_MISMATCH`
- `DUPLICATE_EVENT_KEY`
- `UNBOUND_RUNTIME_DELIVERY`
- `POLICY_GAP`
- `UNSUPPORTED_EVENT`

## Gate statuses

- `candidate_ready`
- `blocked`
- `insufficient_evidence`

## Event-family intent

### Governance replay events

These are the first realistic activation candidates because:

- they already have backend-owned runtime delivery
- they already route cleanly in O.3
- they can be reconciled directly in O.4

### Bill receipt posted

This family is expected to remain blocked until:

- notification policy is explicitly bound
- `policy_gap` reaches zero
- drift becomes measurable against a formal delivery contract

## Why O.5 matters

O.5 turns the migration into a formal decision system.

The platform no longer asks:

- "Is the dispatcher implemented?"

It asks:

- "Is this event family proven safe enough to activate?"

## Next logical phase

`Phase O.6` should be a narrowly scoped controlled activation only for families
that O.5 marks as:

- `recommendedMode = activation_candidate`
- `dispatcherActivationAllowed = true`

Even then, activation should start with a single scoped family, not the whole
notification system.
