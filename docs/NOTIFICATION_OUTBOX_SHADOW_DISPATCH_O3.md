# Notification Outbox Shadow Dispatch (Phase O.3)

## Goal

`Phase O.3` introduces a read-only dispatcher simulation layer above
`notification_outbox_events`.

This phase does **not**:

- send notifications
- insert into `notifications`
- update outbox delivery state
- retry, dead-letter, or cut over runtime delivery

It exists to validate the event graph before any dispatcher activation.

## Scope

Current supported event types:

- `procurement.bill_receipt_posted`
- `governance.replay_commit_intent_issued`
- `governance.replay_execution_activated`

## Runtime Behavior

The shadow dispatcher:

1. reads committed outbox rows for the tenant
2. resolves scope from event context and supported projections
3. evaluates the registered router for each event type
4. returns one of:
   - `routed`
   - `needs_policy_binding`
   - `unsupported`
5. emits simulation output only through the API response

No delivery side effects are allowed in this phase.

## Current O.3 Decision Model

### Governance events

These are fully routed in shadow mode because their notification policy already
exists in the current backend-owned workflow services.

### Bill receipt posted

This event is captured authoritatively in the outbox, but no notification
delivery policy is bound yet. Shadow mode reports it as:

- `supported = true`
- `simulationStatus = needs_policy_binding`

It also returns candidate recipient strategies so the policy gap is explicit and
reviewable before activation.

## API Surface

Read-only route:

- `GET /api/notification-outbox/shadow-dispatch`

Supported filters:

- `limit`
- `event_type`
- `delivery_status`
- `cursor`
- `include_unsupported`

## Why this phase matters

`Phase O.3` proves the routing model before any worker or dispatcher is allowed
to produce side effects.

This gives us:

- missing router detection
- missing policy detection
- recipient resolution verification
- deterministic event-key simulation
- governance-safe visibility into the event backbone

## Next logical phase

`Phase O.4` should remain shadow-first:

- compare shadow intents against existing notification side effects
- log mismatches
- keep runtime delivery unchanged

Only after that should we discuss any delivery cutover or dispatcher writes.
