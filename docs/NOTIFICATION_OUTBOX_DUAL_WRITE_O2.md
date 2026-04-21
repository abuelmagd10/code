# Phase O.2 — Authoritative Dual Write (Governance + Bill Receipt)

## Goal

Start event mirroring without changing live notification delivery behavior.

This phase does **not** cut over delivery to the outbox. It only ensures that selected authoritative business facts are mirrored into `notification_outbox_events`.

## Why this slice was chosen first

The initial O.2 scope targets:

- bill receipt posting
- replay commit intent issuance
- replay execution activation

These were chosen because they are already:

- backend-owned
- deterministic
- audit-heavy
- governed by clear authoritative tables

## Implementation strategy

This phase uses **DB-level authoritative mirroring** instead of service-layer enqueue calls.

Reason:

- these flows already persist a canonical fact row in the database
- mirroring from that fact row keeps outbox creation inside the same database transaction
- no service-layer behavioral changes are required

## Mirrored authoritative sources

### 1. Bill Receipt

Source table:

- `public.financial_operation_traces`

Filter:

- `event_type = 'bill_receipt_posting'`

Mirrored outbox event:

- `procurement.bill_receipt_posted`

### 2. Replay Commit Intent

Source table:

- `public.financial_replay_commit_intents`

Mirrored outbox event:

- `governance.replay_commit_intent_issued`

### 3. Replay Execution Activation

Source table:

- `public.financial_replay_executions`

Mirrored outbox event:

- `governance.replay_execution_activated`

## Dual-write behavior

Current runtime still remains:

- authoritative write
- current notification service

New parallel behavior:

- authoritative write
- outbox row mirrored automatically by trigger

This means:

- zero delivery cutover
- zero dispatcher dependency
- zero behavioral change for users

## Important architectural distinction

The outbox row is a **domain event snapshot**, not a notification delivery artifact.

At this stage:

- notification delivery still happens through current services
- outbox rows are used for observation, validation, and future dispatcher activation

## Next safe step

### Phase O.3

Introduce a dispatcher in shadow mode:

- reads `notification_outbox_events`
- logs routing decisions
- performs no external side effects

That will allow verification before any future delivery cutover.
