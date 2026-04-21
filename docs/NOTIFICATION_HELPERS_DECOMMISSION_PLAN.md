# Notification Helpers Decommission Plan

## Status

`lib/notification-helpers.ts` is now a legacy isolated artifact.

Operationally:

- No live runtime consumers remain inside `app/`
- No live workflow depends on it for financial or administrative execution
- All active notification workflows now run through:
  - `UI -> API -> Notification Service / Resolver -> Notifications`

## Why the file still exists

The file is intentionally retained for a short compatibility window so that:

- any unexpected legacy import can still behave safely
- runtime usage emits a clear deprecation warning
- rollback remains simple if an unobserved edge path appears

This is a controlled decommission step, not a direct hard delete.

## Current freeze policy

Effective immediately:

- Do not add new imports from `@/lib/notification-helpers`
- Do not add new functions to `notification-helpers.ts`
- Do not reintroduce page-level notification creation

Any new workflow notification must be implemented through:

- backend route
- domain notification service
- deterministic event key
- centralized recipient resolver

## Compatibility behavior

The module now acts as a compatibility shim:

- preserves old behavior if an unexpected legacy call appears
- emits a one-time runtime warning
- makes hidden dependencies visible during the observation window

## Safe removal plan

### Stage 1 — Freeze

Completed.

- legacy module marked as isolated
- no live `app/` consumers remain

### Stage 2 — Observation Window

Recommended duration: `7-14 days`

Monitor:

- browser console warnings
- server logs
- Sentry / runtime telemetry
- CI / integration test regressions

Success condition:

- no legacy warning emitted in real usage
- no rollback request caused by hidden consumers

### Stage 3 — Removal Preparation

If the observation window is clean:

- remove unused exported helper functions
- keep a minimal stub only if rollback comfort is still needed
- rerun repository-wide search for any reintroduced imports

### Stage 4 — Final Delete

When confidence is high:

- delete `lib/notification-helpers.ts`
- delete any stale documentation referencing it as active infrastructure

## Rollback strategy

If an unexpected consumer appears during the observation window:

1. keep the compatibility shim in place
2. identify the caller
3. migrate that caller to:
   - backend route
   - notification service
   - resolver-based recipients
4. resume the decommission plan

## Final architectural state

After complete removal, the notification layer should remain:

- backend-owned
- workflow-aware
- deterministic
- audit-friendly
- ready for outbox / event-bus hardening
