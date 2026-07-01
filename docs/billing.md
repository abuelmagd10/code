# Billing lifecycle

Reference for how the subscription system moves a company between
states, which triggers fire on which transitions, and how each state
affects users' access.

Written after the v3.74.442 → v3.74.446 series.

## States

| status | meaning | access | who sets it |
| --- | --- | --- | --- |
| `active` | subscription paid and current | full read/write | webhook success, `reactivate_company_subscription` |
| `past_due` | period_end passed, in grace period | full read/write + reminders | `daily_billing_check` (cron) or paymob `handlePaymentFailed` |
| `payment_failed` | grace expired, subscription suspended | **read-only** | `suspend_subscription` (called by cron) |
| `cancelled` / `canceled` | owner cancelled | read-only until period_end | `cancelSubscription` (manual/API) |

The state machine is one-way most of the time. The only backward
transition is `payment_failed → active` via `reactivate_company_subscription`,
which fires automatically when a seat_license gets renewed
(see the auto-reactivation trigger below).

## The daily cron

`daily_billing_check()` runs once a day at 06:00 UTC (~09:00 Cairo)
through `pg_cron`. Five idempotent steps, in order:

1. **T-7 reminder** — active companies where `current_period_end` is
   6-8 days out and `reminder_7d_sent_at IS NULL`. Sends an
   info-severity notification, stamps `reminder_7d_sent_at`.
2. **T-3 reminder** — same shape, 2-4 days out, warning severity.
3. **T-1 reminder** — 0-30 hours out, error severity.
4. **`past_due` transition** — `period_end < NOW()` and
   `subscription_status='active'`. UPDATE flips status to `past_due`
   which fires `companies_subscription_status_transitions` (v3.74.445)
   to auto-stamp `past_due_at`. Resets all three `reminder_*_sent_at`
   so the next cycle starts fresh. Notification sent.
5. **Suspend** — `subscription_status='past_due'` and
   `past_due_at + grace_period_days < NOW()`. Calls
   `suspend_subscription` which flips to `payment_failed`. The
   status trigger auto-stamps `suspended_at`. Notification sent.

Every state change writes an in-app notification with
`category='billing'` targeted at every owner / GM / admin of the
company (via `notify_company_billing_owner`).

## The write gate

`can_write_to_company(company_id)` returns `false` when
`subscription_status` is one of `payment_failed`, `cancelled`,
`canceled`. `subscription_write_gate` triggers on 12 top-level
transactional tables (POs, SOs, bills, invoices, payments, returns,
5 manufacturing tables) block INSERT with:

```
الاشتراك موقوف بسبب فشل الدفع. الوصول للقراءة فقط.
جدّد الاشتراك من /settings/billing لاستعادة الوصول الكامل.
```

UPDATE on existing rows still works so owners can wind down
in-flight documents.

## Payment flow (Paymob)

1. Owner clicks "Renew All Expired" (or Buy) on `/settings/seats` or
   `/settings/billing`.
2. `POST /api/billing/seats/renew` builds a Paymob intention with
   `extras.action='renew'` and the target `seat_license_ids`.
3. User pays on Paymob's hosted checkout.
4. Paymob calls `POST /api/webhooks/paymob`. HMAC verified,
   extras extracted.
5. `syncSubscriptionFromWebhook` routes to `handleRenewalSuccess`
   (or `handlePaymentSuccess` for a first buy).
6. `renew_seat_licenses` RPC extends `expires_at` on each seat.
7. **`company_seat_license_auto_reactivate` trigger** notices the
   `expires_at` moved further into the future and, if the company
   was in `past_due` / `payment_failed`, calls
   `reactivate_company_subscription` — flipping status back to
   `active`, clearing `past_due_at` / `suspended_at`, refreshing
   `current_period_end`, and pinging the owner.

Because the reactivation is in a trigger, the webhook code does not
need to know about it. Any path that renews seats (webhook, coupon
grant, admin action) gets auto-reactivation for free.

## Manual reactivation

`POST /api/billing/reactivate` (owner-only) is the fallback. Calls
`reactivate_company_subscription(company_id, performed_by)`. Refuses
if there is no active seat (`expires_at > NOW()`).

## End-to-end verified (v3.74.446)

`SELECT * FROM assert_baseline()` is the entry point. Section AR
enforces every constraint added in v3.74.442 → v3.74.445.

A live 7-scenario walkthrough on the test company was executed on
2026-07-01 in v3.74.446. All seven passed and the company state
was restored to the pre-test snapshot:

```
PASS 1/7: T-7 reminder sent
PASS 2/7: T-3 reminder sent
PASS 3/7: T-1 reminder sent
PASS 4/7: past_due auto-transition + past_due_at auto-stamped
PASS 5/7: suspended after grace + suspended_at auto-stamped
PASS 6/7: write gate refused new PO with Arabic message
PASS 7/7: seat renewal auto-reactivated the company
```

## What can go wrong

- **`created_by NOT NULL` on notifications**: originally
  `notify_company_billing_owner` passed NULL and every cron run
  crashed. Fixed in v3.74.446 by pulling the company owner
  `user_id` and using it as `created_by`. If you rename the owner
  column on `companies`, this helper needs updating.
- **Spelling drift on `subscription_status`**: TS uses `canceled`
  (US). SQL originally checked `cancelled` (UK). v3.74.445 makes
  `can_write_to_company` accept both. If you add a new enum-like
  value, add it to `can_write_to_company` and to any new gate.
- **Grace period not respected**: if `past_due_at` is not set,
  the suspend step in the cron never fires. v3.74.445 added the
  trigger that auto-stamps `past_due_at`. If you remove that
  trigger, add the stamping to the code path instead.
- **Auto-reactivation trigger too strict**: earlier the trigger
  required the seat to have been fully expired (`OLD.expires_at <=
  NOW()`). Paymob renewing a seat two days before expiry left the
  company stuck. v3.74.446 relaxed the condition to any forward
  movement of `expires_at`.
