# API Routes Catalog

Generated from `app/api/**/route.ts` on 2026-07-12. This file is an index, not a substitute for reading the route before editing it.

## Summary

- Route files: 437
- Exported handlers: 552
- Main guard markers auto-detected: `secureApiRequest`, `apiGuard`, `CRON_SECRET`, `PAYMOB_HMAC`, service-role/admin, RPC.
- Security warning: "not auto-detected" does not prove the route is unsafe; it means this script did not find the known marker strings.

## Routes By Group

### accept-invite

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/accept-invite | POST | `app/api/accept-invite/route.ts` | service-role/admin |

### accept-invite-logged-in

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/accept-invite-logged-in | POST | `app/api/accept-invite-logged-in/route.ts` | service-role/admin |

### accept-membership

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/accept-membership | POST | `app/api/accept-membership/route.ts` | service-role/admin |

### account-balances

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/account-balances | GET | `app/api/account-balances/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### account-lines

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/account-lines | GET | `app/api/account-lines/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### account-statement

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/account-statement | GET | `app/api/account-statement/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### accounting-audit

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/accounting-audit | GET | `app/api/accounting-audit/route.ts` | secureApiRequest, service-role/admin, RPC |

### accounting-periods

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/accounting-periods/lock | POST | `app/api/accounting-periods/lock/route.ts` | apiGuard, service-role/admin, RPC |
| /api/accounting-periods | GET, POST | `app/api/accounting-periods/route.ts` | service-role/admin |
| /api/accounting-periods/unlock | POST | `app/api/accounting-periods/unlock/route.ts` | apiGuard, service-role/admin, RPC |

### accounting-validation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/accounting-validation | GET | `app/api/accounting-validation/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |

### add-dividends-payable-account

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/add-dividends-payable-account | POST, GET | `app/api/add-dividends-payable-account/route.ts` | not auto-detected |

### admin

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/admin/apply-write-off-governance | POST | `app/api/admin/apply-write-off-governance/route.ts` | service-role/admin, RPC |
| /api/admin/fix-transfer-inventory-governance | POST | `app/api/admin/fix-transfer-inventory-governance/route.ts` | service-role/admin |

### aging-ap

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/aging-ap | GET | `app/api/aging-ap/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### aging-ap-base

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/aging-ap-base | GET | `app/api/aging-ap-base/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### aging-ap-gl

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/aging-ap-gl | GET | `app/api/aging-ap-gl/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### aging-ar

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/aging-ar | GET | `app/api/aging-ar/route.ts` | secureApiRequest, permission-gated |

### aging-ar-base

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/aging-ar-base | GET | `app/api/aging-ar-base/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### aging-ar-gl

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/aging-ar-gl | GET | `app/api/aging-ar-gl/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### ai

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/ai/alerts | GET | `app/api/ai/alerts/route.ts` | secureApiRequest, RPC |
| /api/ai/chat | GET, POST, PATCH | `app/api/ai/chat/route.ts` | secureApiRequest |
| /api/ai/find-page | GET | `app/api/ai/find-page/route.ts` | secureApiRequest |
| /api/ai/provider-status | GET | `app/api/ai/provider-status/route.ts` | secureApiRequest |
| /api/ai/review | GET | `app/api/ai/review/route.ts` | secureApiRequest |

### apply-orders-rules

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/apply-orders-rules | POST | `app/api/apply-orders-rules/route.ts` | RPC |

### apply-write-off-fix

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/apply-write-off-fix | POST | `app/api/apply-write-off-fix/route.ts` | RPC |

### audit-log

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/audit-log | POST | `app/api/audit-log/route.ts` | service-role/admin |

### audit-logs

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/audit-logs | GET, POST | `app/api/audit-logs/route.ts` | secureApiRequest, service-role/admin, RPC |

### auto-fix-remaining-payments

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/auto-fix-remaining-payments | POST | `app/api/auto-fix-remaining-payments/route.ts` | service-role/admin |

### backup

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/backup/:id/download | GET | `app/api/backup/[id]/download/route.ts` | not auto-detected |
| /api/backup/:id | DELETE | `app/api/backup/[id]/route.ts` | not auto-detected |
| /api/backup/export | POST, GET | `app/api/backup/export/route.ts` | not auto-detected |
| /api/backup/list | GET | `app/api/backup/list/route.ts` | not auto-detected |
| /api/backup/restore | POST | `app/api/backup/restore/route.ts` | not auto-detected |
| /api/backup/validate | POST | `app/api/backup/validate/route.ts` | not auto-detected |

### balance-sheet-audit

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/balance-sheet-audit | GET | `app/api/balance-sheet-audit/route.ts` | secureApiRequest, service-role/admin |

### banking

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/banking/transfers | POST | `app/api/banking/transfers/route.ts` | apiGuard |
| /api/banking/vouchers/:id/workflow | POST | `app/api/banking/vouchers/[id]/workflow/route.ts` | apiGuard, RPC |

### billing

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/billing/cancel-invite | POST | `app/api/billing/cancel-invite/route.ts` | service-role/admin |
| /api/billing/invoices/:id/pdf | GET | `app/api/billing/invoices/[id]/pdf/route.ts` | service-role/admin |
| /api/billing/invoices | GET | `app/api/billing/invoices/route.ts` | service-role/admin |
| /api/billing/preview | GET | `app/api/billing/preview/route.ts` | service-role/admin |
| /api/billing/reactivate | POST | `app/api/billing/reactivate/route.ts` | service-role/admin, RPC |
| /api/billing/renew | GET | `app/api/billing/renew/route.ts` | service-role/admin |
| /api/billing/seats/assignments | GET | `app/api/billing/seats/assignments/route.ts` | service-role/admin |
| /api/billing/seats/renew | POST | `app/api/billing/seats/renew/route.ts` | service-role/admin |
| /api/billing/seats | GET, POST | `app/api/billing/seats/route.ts` | service-role/admin |
| /api/billing/seats/swap | POST | `app/api/billing/seats/swap/route.ts` | service-role/admin, RPC |
| /api/billing/subscription/cancel | POST | `app/api/billing/subscription/cancel/route.ts` | not auto-detected |
| /api/billing/subscription | GET | `app/api/billing/subscription/route.ts` | not auto-detected |
| /api/billing/transactions | GET | `app/api/billing/transactions/route.ts` | not auto-detected |

### bills

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/bills/:id/approve | POST | `app/api/bills/[id]/approve/route.ts` | apiGuard |
| /api/bills/:id/confirm-receipt | POST | `app/api/bills/[id]/confirm-receipt/route.ts` | apiGuard, RPC |
| /api/bills/:id/delete | POST | `app/api/bills/[id]/delete/route.ts` | apiGuard |
| /api/bills/:id/discount-approval | GET | `app/api/bills/[id]/discount-approval/route.ts` | not auto-detected |
| /api/bills/:id/journal-entry-id | GET | `app/api/bills/[id]/journal-entry-id/route.ts` | service-role/admin |
| /api/bills/:id/pre-receipt-refund | POST | `app/api/bills/[id]/pre-receipt-refund/route.ts` | apiGuard |
| /api/bills/:id/reject-receipt | POST | `app/api/bills/[id]/reject-receipt/route.ts` | apiGuard |
| /api/bills/:id/reject | POST | `app/api/bills/[id]/reject/route.ts` | apiGuard |
| /api/bills/:id/restart-approval-notifications | POST | `app/api/bills/[id]/restart-approval-notifications/route.ts` | apiGuard, RPC |
| /api/bills/:id/submit-for-receipt | POST | `app/api/bills/[id]/submit-for-receipt/route.ts` | apiGuard |
| /api/bills/:id/validate-matching | POST | `app/api/bills/[id]/validate-matching/route.ts` | not auto-detected |
| /api/bills/:id/void | POST | `app/api/bills/[id]/void/route.ts` | apiGuard, RPC |
| /api/bills | GET, POST | `app/api/bills/route.ts` | not auto-detected |

### biometric

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/biometric/attendance/push | POST | `app/api/biometric/attendance/push/route.ts` | service-role/admin |
| /api/biometric/device/sync | POST | `app/api/biometric/device/sync/route.ts` | service-role/admin |

### bonuses

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/bonuses/attach-to-payroll | POST | `app/api/bonuses/attach-to-payroll/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/bonuses/reverse | POST | `app/api/bonuses/reverse/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/bonuses | GET, POST | `app/api/bonuses/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/bonuses/settings | GET, PATCH | `app/api/bonuses/settings/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### bookings

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/bookings/:id/activate | POST | `app/api/bookings/[id]/activate/route.ts` | apiGuard, RPC |
| /api/bookings/:id/cancel | POST | `app/api/bookings/[id]/cancel/route.ts` | apiGuard, RPC |
| /api/bookings/:id/complete | POST | `app/api/bookings/[id]/complete/route.ts` | apiGuard, RPC |
| /api/bookings/:id/confirm | POST | `app/api/bookings/[id]/confirm/route.ts` | apiGuard, RPC |
| /api/bookings/:id/discount-approval | GET | `app/api/bookings/[id]/discount-approval/route.ts` | apiGuard |
| /api/bookings/:id/no-show | POST | `app/api/bookings/[id]/no-show/route.ts` | apiGuard, RPC |
| /api/bookings/:id/notes | GET, POST, DELETE | `app/api/bookings/[id]/notes/route.ts` | apiGuard |
| /api/bookings/:id/payment | POST, GET | `app/api/bookings/[id]/payment/route.ts` | apiGuard, RPC |
| /api/bookings/:id/rate | POST | `app/api/bookings/[id]/rate/route.ts` | apiGuard, RPC |
| /api/bookings/:id | GET, PATCH | `app/api/bookings/[id]/route.ts` | apiGuard |
| /api/bookings/:id/start | POST | `app/api/bookings/[id]/start/route.ts` | apiGuard, RPC |
| /api/bookings/availability | GET | `app/api/bookings/availability/route.ts` | apiGuard |
| /api/bookings/calendar | GET | `app/api/bookings/calendar/route.ts` | apiGuard |
| /api/bookings | GET, POST | `app/api/bookings/route.ts` | apiGuard, RPC |

### branches

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/branches/:id | GET, PATCH, DELETE | `app/api/branches/[id]/route.ts` | not auto-detected |
| /api/branches | GET, POST | `app/api/branches/route.ts` | apiGuard, RPC |

### cash-flow

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/cash-flow | GET | `app/api/cash-flow/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### check-email-registered

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/check-email-registered | POST | `app/api/check-email-registered/route.ts` | service-role/admin |

### check-invitation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/check-invitation | POST | `app/api/check-invitation/route.ts` | service-role/admin |

### check-page-access

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/check-page-access | GET | `app/api/check-page-access/route.ts` | not auto-detected |

### check-warehouse-stock

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/check-warehouse-stock | POST | `app/api/check-warehouse-stock/route.ts` | service-role/admin |

### checkout

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/checkout | POST | `app/api/checkout/route.ts` | not auto-detected |

### commissions

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/commissions/advance-payments/available | GET | `app/api/commissions/advance-payments/available/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/commissions/advance-payments/pay | POST | `app/api/commissions/advance-payments/pay/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |
| /api/commissions/attach-to-payroll | POST | `app/api/commissions/attach-to-payroll/route.ts` | not auto-detected |
| /api/commissions/instant-payouts/pay | POST | `app/api/commissions/instant-payouts/pay/route.ts` | RPC |
| /api/commissions/instant-payouts | GET | `app/api/commissions/instant-payouts/route.ts` | RPC |
| /api/commissions/plans | GET, POST, DELETE | `app/api/commissions/plans/route.ts` | not auto-detected |
| /api/commissions/reports/employee-summary | GET | `app/api/commissions/reports/employee-summary/route.ts` | not auto-detected |
| /api/commissions/reports/ledger | GET | `app/api/commissions/reports/ledger/route.ts` | not auto-detected |
| /api/commissions/runs/:id/approve | POST | `app/api/commissions/runs/[id]/approve/route.ts` | not auto-detected |
| /api/commissions/runs/:id/pay | POST | `app/api/commissions/runs/[id]/pay/route.ts` | not auto-detected |
| /api/commissions/runs/:id/post | POST | `app/api/commissions/runs/[id]/post/route.ts` | RPC |
| /api/commissions/runs/calculate | POST | `app/api/commissions/runs/calculate/route.ts` | RPC |
| /api/commissions/runs | GET, POST | `app/api/commissions/runs/route.ts` | RPC |

### company

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/company/enabled-modules | GET, PUT | `app/api/company/enabled-modules/route.ts` | not auto-detected |

### company-info

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/company-info | GET | `app/api/company-info/route.ts` | not auto-detected |

### company-logo

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/company-logo | POST | `app/api/company-logo/route.ts` | apiGuard, service-role/admin |

### company-members

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/company-members/link-employee | POST | `app/api/company-members/link-employee/route.ts` | secureApiRequest, service-role/admin |
| /api/company-members | GET | `app/api/company-members/route.ts` | secureApiRequest, service-role/admin |

### consolidation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/consolidation/execute | POST | `app/api/consolidation/execute/route.ts` | secureApiRequest |
| /api/consolidation/runs | GET, POST | `app/api/consolidation/runs/route.ts` | secureApiRequest |
| /api/consolidation/statements | GET | `app/api/consolidation/statements/route.ts` | secureApiRequest |

### contact

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/contact | POST | `app/api/contact/route.ts` | not auto-detected |

### cost-centers

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/cost-centers/:id | GET, PATCH, DELETE | `app/api/cost-centers/[id]/route.ts` | not auto-detected |
| /api/cost-centers | GET, POST | `app/api/cost-centers/route.ts` | not auto-detected |

### cron

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/cron/backup-daily | GET | `app/api/cron/backup-daily/route.ts` | service-role/admin, CRON_SECRET |
| /api/cron/booking-reminders | GET | `app/api/cron/booking-reminders/route.ts` | service-role/admin, CRON_SECRET |
| /api/cron/ensure-accounting-periods | GET | `app/api/cron/ensure-accounting-periods/route.ts` | service-role/admin, CRON_SECRET, RPC |
| /api/cron/expire-permission-shares | GET | `app/api/cron/expire-permission-shares/route.ts` | service-role/admin, CRON_SECRET, RPC |
| /api/cron/fx-revaluation-reminder | GET | `app/api/cron/fx-revaluation-reminder/route.ts` | CRON_SECRET |
| /api/cron/subscription-renewal | GET, POST | `app/api/cron/subscription-renewal/route.ts` | service-role/admin, CRON_SECRET, RPC |
| /api/cron/system-integrity | GET | `app/api/cron/system-integrity/route.ts` | service-role/admin, CRON_SECRET, RPC |

### customer-credits

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/customer-credits/:customerId/apply | POST | `app/api/customer-credits/[customerId]/apply/route.ts` | RPC |
| /api/customer-credits/:customerId | GET | `app/api/customer-credits/[customerId]/route.ts` | not auto-detected |
| /api/customer-credits | GET | `app/api/customer-credits/route.ts` | not auto-detected |

### customer-debit-notes

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/customer-debit-notes/:id/notifications | POST | `app/api/customer-debit-notes/[id]/notifications/route.ts` | not auto-detected |
| /api/customer-debit-notes | GET, POST | `app/api/customer-debit-notes/route.ts` | not auto-detected |

### customer-payments

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/customer-payments/:id/apply-invoice | POST | `app/api/customer-payments/[id]/apply-invoice/route.ts` | apiGuard |
| /api/customer-payments/:id/delete | POST | `app/api/customer-payments/[id]/delete/route.ts` | apiGuard |
| /api/customer-payments/:id/update | POST | `app/api/customer-payments/[id]/update/route.ts` | apiGuard |
| /api/customer-payments | POST | `app/api/customer-payments/route.ts` | apiGuard |

### customer-refund-requests

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/customer-refund-requests/:id/approve | POST | `app/api/customer-refund-requests/[id]/approve/route.ts` | RPC |
| /api/customer-refund-requests/:id/execute | POST | `app/api/customer-refund-requests/[id]/execute/route.ts` | service-role/admin, RPC |
| /api/customer-refund-requests/:id/reject | POST | `app/api/customer-refund-requests/[id]/reject/route.ts` | RPC |
| /api/customer-refund-requests/accounts | GET | `app/api/customer-refund-requests/accounts/route.ts` | not auto-detected |

### customers

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/customers/delete | POST | `app/api/customers/delete/route.ts` | service-role/admin |
| /api/customers/refund-requests/:id/approve | POST | `app/api/customers/refund-requests/[id]/approve/route.ts` | apiGuard, RPC |
| /api/customers/refund-requests/:id/reject | POST | `app/api/customers/refund-requests/[id]/reject/route.ts` | apiGuard, RPC |
| /api/customers/refund-requests | POST | `app/api/customers/refund-requests/route.ts` | apiGuard, RPC |
| /api/customers/refunds | POST | `app/api/customers/refunds/route.ts` | apiGuard |
| /api/customers | GET, POST | `app/api/customers/route.ts` | not auto-detected |
| /api/customers/update | POST | `app/api/customers/update/route.ts` | service-role/admin |
| /api/customers/vouchers | POST | `app/api/customers/vouchers/route.ts` | apiGuard |

### daily-payments-receipts

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/daily-payments-receipts | GET | `app/api/daily-payments-receipts/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### dashboard-daily-income

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/dashboard-daily-income | GET | `app/api/dashboard-daily-income/route.ts` | secureApiRequest, permission-gated |

### dashboard-gl-summary

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/dashboard-gl-summary | GET | `app/api/dashboard-gl-summary/route.ts` | secureApiRequest, permission-gated |

### dashboard-stats

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/dashboard-stats | GET | `app/api/dashboard-stats/route.ts` | secureApiRequest, permission-gated |

### data-health-check

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/data-health-check | GET | `app/api/data-health-check/route.ts` | RPC |

### data-health-fix

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/data-health-fix | POST | `app/api/data-health-fix/route.ts` | RPC |

### data-integrity-check

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/data-integrity-check | GET | `app/api/data-integrity-check/route.ts` | secureApiRequest, RPC, permission-gated |

### deep-search-invoice

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/deep-search-invoice | GET | `app/api/deep-search-invoice/route.ts` | secureApiRequest, permission-gated |

### delete-orphan-entries

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/delete-orphan-entries | POST | `app/api/delete-orphan-entries/route.ts` | not auto-detected |

### delete-transfers

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/delete-transfers | POST | `app/api/delete-transfers/route.ts` | service-role/admin |

### diagnose-invoice

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/diagnose-invoice | GET | `app/api/diagnose-invoice/route.ts` | secureApiRequest, permission-gated |

### direct-fix

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/direct-fix | POST | `app/api/direct-fix/route.ts` | not auto-detected |

### discount-approvals

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/discount-approvals/:id/decide | POST | `app/api/discount-approvals/[id]/decide/route.ts` | RPC |
| /api/discount-approvals | GET | `app/api/discount-approvals/route.ts` | service-role/admin, RPC |

### employee-bonus-configs

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/employee-bonus-configs | GET, POST, DELETE | `app/api/employee-bonus-configs/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### finance

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/finance/journals | POST | `app/api/finance/journals/route.ts` | apiGuard |

### financial-integrity-checks

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/financial-integrity-checks | GET | `app/api/financial-integrity-checks/route.ts` | apiGuard |

### financial-operations

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/financial-operations/replay-calibration | GET | `app/api/financial-operations/replay-calibration/route.ts` | apiGuard |
| /api/financial-operations/replay-commit-intents | POST | `app/api/financial-operations/replay-commit-intents/route.ts` | apiGuard |
| /api/financial-operations/replay-coverage | GET | `app/api/financial-operations/replay-coverage/route.ts` | apiGuard |
| /api/financial-operations/replay-execute | POST | `app/api/financial-operations/replay-execute/route.ts` | apiGuard |
| /api/financial-operations/replay-executions | POST | `app/api/financial-operations/replay-executions/route.ts` | apiGuard |
| /api/financial-operations/replay-stabilization | GET | `app/api/financial-operations/replay-stabilization/route.ts` | apiGuard |
| /api/financial-operations/replay-trace | POST | `app/api/financial-operations/replay-trace/route.ts` | apiGuard |
| /api/financial-operations/replay | POST | `app/api/financial-operations/replay/route.ts` | apiGuard |

### financial-traces

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/financial-traces | GET | `app/api/financial-traces/route.ts` | apiGuard |

### find-user-by-login

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/find-user-by-login | POST | `app/api/find-user-by-login/route.ts` | service-role/admin |

### first-allowed-page

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/first-allowed-page | GET | `app/api/first-allowed-page/route.ts` | not auto-detected |

### fix-bill-return

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-bill-return | POST | `app/api/fix-bill-return/route.ts` | service-role/admin |

### fix-cogs-accounting

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-cogs-accounting | POST, GET | `app/api/fix-cogs-accounting/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |

### fix-historical-data

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-historical-data | POST | `app/api/fix-historical-data/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |

### fix-inv0001-foodcana

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-inv0001-foodcana | POST | `app/api/fix-inv0001-foodcana/route.ts` | not auto-detected |

### fix-inventory

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-inventory | GET, POST | `app/api/fix-inventory/route.ts` | not auto-detected |

### fix-invoice-0001-status

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-invoice-0001-status | POST | `app/api/fix-invoice-0001-status/route.ts` | RPC |

### fix-invoice-0028

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-invoice-0028 | POST | `app/api/fix-invoice-0028/route.ts` | not auto-detected |

### fix-invoice-display

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-invoice-display | POST | `app/api/fix-invoice-display/route.ts` | not auto-detected |

### fix-invoice-return-sent

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-invoice-return-sent | POST | `app/api/fix-invoice-return-sent/route.ts` | not auto-detected |

### fix-missing-payment-journals

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-missing-payment-journals | GET, POST | `app/api/fix-missing-payment-journals/route.ts` | not auto-detected |

### fix-nasr-stock

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-nasr-stock | POST | `app/api/fix-nasr-stock/route.ts` | service-role/admin |

### fix-negative-payments

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-negative-payments | POST | `app/api/fix-negative-payments/route.ts` | service-role/admin |

### fix-negative-quantities

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-negative-quantities | POST | `app/api/fix-negative-quantities/route.ts` | not auto-detected |

### fix-orphan-invoices

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-orphan-invoices | POST, GET | `app/api/fix-orphan-invoices/route.ts` | secureApiRequest |

### fix-sent-invoice-journals

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fix-sent-invoice-journals | POST, GET | `app/api/fix-sent-invoice-journals/route.ts` | not auto-detected |

### fixed-assets

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fixed-assets/:id/depreciation | GET, POST | `app/api/fixed-assets/[id]/depreciation/route.ts` | RPC |
| /api/fixed-assets/:id | GET, PUT, DELETE | `app/api/fixed-assets/[id]/route.ts` | RPC |
| /api/fixed-assets/apply-fixes | POST | `app/api/fixed-assets/apply-fixes/route.ts` | RPC |
| /api/fixed-assets/auto-post-depreciation | POST, GET | `app/api/fixed-assets/auto-post-depreciation/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |
| /api/fixed-assets/categories | GET, POST | `app/api/fixed-assets/categories/route.ts` | not auto-detected |
| /api/fixed-assets/db-status | GET | `app/api/fixed-assets/db-status/route.ts` | service-role/admin, RPC |
| /api/fixed-assets/diagnose-depreciation | GET | `app/api/fixed-assets/diagnose-depreciation/route.ts` | service-role/admin, RPC |
| /api/fixed-assets | GET, POST | `app/api/fixed-assets/route.ts` | RPC |

### fixed-assets-reports

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fixed-assets-reports | GET | `app/api/fixed-assets-reports/route.ts` | not auto-detected |

### fx-revaluation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/fx-revaluation | POST | `app/api/fx-revaluation/route.ts` | not auto-detected |

### general-ledger

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/general-ledger | GET | `app/api/general-ledger/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |

### get-invitation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/get-invitation | GET, POST | `app/api/get-invitation/route.ts` | service-role/admin |

### get-payment-details

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/get-payment-details | GET | `app/api/get-payment-details/route.ts` | service-role/admin |

### governance

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/governance/system-integrity | GET | `app/api/governance/system-integrity/route.ts` | RPC |

### governance-check

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/governance-check | GET | `app/api/governance-check/route.ts` | not auto-detected |

### health

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/health | GET | `app/api/health/route.ts` | not auto-detected |

### hr

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/hr/attendance/anomalies | GET, POST | `app/api/hr/attendance/anomalies/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/attendance/devices | GET, POST | `app/api/hr/attendance/devices/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/attendance/reports | GET | `app/api/hr/attendance/reports/route.ts` | secureApiRequest |
| /api/hr/attendance | GET, POST | `app/api/hr/attendance/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/attendance/settings | GET, POST | `app/api/hr/attendance/settings/route.ts` | secureApiRequest |
| /api/hr/attendance/shifts | GET, POST | `app/api/hr/attendance/shifts/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/employees | GET, POST, PUT, DELETE | `app/api/hr/employees/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/payroll/pay | POST | `app/api/hr/payroll/pay/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |
| /api/hr/payroll/payments | PUT, DELETE, GET | `app/api/hr/payroll/payments/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/payroll/payslips | PUT, DELETE | `app/api/hr/payroll/payslips/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/hr/payroll | POST | `app/api/hr/payroll/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |
| /api/hr/payroll/settings | GET, PUT | `app/api/hr/payroll/settings/route.ts` | secureApiRequest, permission-gated |

### income-statement

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/income-statement | GET | `app/api/income-statement/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### init-missing-company-tables

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/init-missing-company-tables | POST | `app/api/init-missing-company-tables/route.ts` | service-role/admin |

### inspect-negative-payments

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/inspect-negative-payments | GET | `app/api/inspect-negative-payments/route.ts` | service-role/admin |

### intercompany

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/intercompany/consolidation-runs/:id/eliminate | POST | `app/api/intercompany/consolidation-runs/[id]/eliminate/route.ts` | secureApiRequest |
| /api/intercompany/consolidation-runs | GET, POST | `app/api/intercompany/consolidation-runs/route.ts` | secureApiRequest |
| /api/intercompany/transactions/:id/approve | POST | `app/api/intercompany/transactions/[id]/approve/route.ts` | secureApiRequest |
| /api/intercompany/transactions/:id/reconcile | POST | `app/api/intercompany/transactions/[id]/reconcile/route.ts` | secureApiRequest |
| /api/intercompany/transactions/:id/submit | POST | `app/api/intercompany/transactions/[id]/submit/route.ts` | secureApiRequest |
| /api/intercompany/transactions | GET, POST | `app/api/intercompany/transactions/route.ts` | secureApiRequest |

### inventory

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/inventory/product-availability | GET | `app/api/inventory/product-availability/route.ts` | RPC |

### inventory-audit

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/inventory-audit | GET | `app/api/inventory-audit/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### inventory-count

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/inventory-count | GET | `app/api/inventory-count/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### inventory-transfers

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/inventory-transfers/:id/notifications | POST | `app/api/inventory-transfers/[id]/notifications/route.ts` | not auto-detected |

### inventory-valuation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/inventory-valuation | GET | `app/api/inventory-valuation/route.ts` | secureApiRequest, permission-gated |

### invoices

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/invoices/:id/delete | POST | `app/api/invoices/[id]/delete/route.ts` | apiGuard |
| /api/invoices/:id/discount-approval | GET | `app/api/invoices/[id]/discount-approval/route.ts` | not auto-detected |
| /api/invoices/:id/post | POST | `app/api/invoices/[id]/post/route.ts` | not auto-detected |
| /api/invoices/:id/pre-shipment-refund | POST | `app/api/invoices/[id]/pre-shipment-refund/route.ts` | apiGuard |
| /api/invoices/:id/record-payment | POST | `app/api/invoices/[id]/record-payment/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/invoices/:id/update | POST | `app/api/invoices/[id]/update/route.ts` | apiGuard |
| /api/invoices/:id/void | POST | `app/api/invoices/[id]/void/route.ts` | apiGuard, RPC |
| /api/invoices/:id/warehouse-approve-with-shipping | POST | `app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts` | service-role/admin |
| /api/invoices/:id/warehouse-approve | POST | `app/api/invoices/[id]/warehouse-approve/route.ts` | not auto-detected |
| /api/invoices/:id/warehouse-reject | POST | `app/api/invoices/[id]/warehouse-reject/route.ts` | not auto-detected |
| /api/invoices | GET, POST | `app/api/invoices/route.ts` | apiGuard, RPC |

### journal-amounts

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/journal-amounts | GET, POST | `app/api/journal-amounts/route.ts` | secureApiRequest, permission-gated |

### journal-entries

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/journal-entries/manual | POST | `app/api/journal-entries/manual/route.ts` | apiGuard |

### login-activity

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/login-activity | GET | `app/api/login-activity/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### manufacturing

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/manufacturing/approval-history | GET | `app/api/manufacturing/approval-history/route.ts` | not auto-detected |
| /api/manufacturing/bom-versions/:id/approve | POST | `app/api/manufacturing/bom-versions/[id]/approve/route.ts` | RPC |
| /api/manufacturing/bom-versions/:id/explosion-preview | POST | `app/api/manufacturing/bom-versions/[id]/explosion-preview/route.ts` | not auto-detected |
| /api/manufacturing/bom-versions/:id/reject | POST | `app/api/manufacturing/bom-versions/[id]/reject/route.ts` | RPC |
| /api/manufacturing/bom-versions/:id | GET, PATCH, DELETE | `app/api/manufacturing/bom-versions/[id]/route.ts` | not auto-detected |
| /api/manufacturing/bom-versions/:id/set-default | POST | `app/api/manufacturing/bom-versions/[id]/set-default/route.ts` | RPC |
| /api/manufacturing/bom-versions/:id/structure | PUT | `app/api/manufacturing/bom-versions/[id]/structure/route.ts` | RPC |
| /api/manufacturing/bom-versions/:id/submit-approval | POST | `app/api/manufacturing/bom-versions/[id]/submit-approval/route.ts` | RPC |
| /api/manufacturing/boms/:id | GET, PATCH, DELETE | `app/api/manufacturing/boms/[id]/route.ts` | not auto-detected |
| /api/manufacturing/boms/:id/versions | POST | `app/api/manufacturing/boms/[id]/versions/route.ts` | RPC |
| /api/manufacturing/boms | GET, POST | `app/api/manufacturing/boms/route.ts` | not auto-detected |
| /api/manufacturing/material-issue-approvals/:id/approve | POST | `app/api/manufacturing/material-issue-approvals/[id]/approve/route.ts` | RPC |
| /api/manufacturing/material-issue-approvals/:id/details | GET | `app/api/manufacturing/material-issue-approvals/[id]/details/route.ts` | RPC |
| /api/manufacturing/material-issue-approvals/:id/management-approve | POST | `app/api/manufacturing/material-issue-approvals/[id]/management-approve/route.ts` | RPC |
| /api/manufacturing/material-issue-approvals/:id/reject | POST | `app/api/manufacturing/material-issue-approvals/[id]/reject/route.ts` | RPC |
| /api/manufacturing/material-issue-approvals | GET | `app/api/manufacturing/material-issue-approvals/route.ts` | not auto-detected |
| /api/manufacturing/mrp/runs/:id/results | GET | `app/api/manufacturing/mrp/runs/[id]/results/route.ts` | not auto-detected |
| /api/manufacturing/mrp/runs/:id | GET | `app/api/manufacturing/mrp/runs/[id]/route.ts` | not auto-detected |
| /api/manufacturing/mrp/runs | GET, POST | `app/api/manufacturing/mrp/runs/route.ts` | not auto-detected |
| /api/manufacturing/product-receive-approvals/:id/approve | POST | `app/api/manufacturing/product-receive-approvals/[id]/approve/route.ts` | RPC |
| /api/manufacturing/product-receive-approvals/:id/reject | POST | `app/api/manufacturing/product-receive-approvals/[id]/reject/route.ts` | RPC |
| /api/manufacturing/product-receive-approvals | GET | `app/api/manufacturing/product-receive-approvals/route.ts` | not auto-detected |
| /api/manufacturing/production-order-operations/:id/progress | POST | `app/api/manufacturing/production-order-operations/[id]/progress/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/approve | POST | `app/api/manufacturing/production-orders/[id]/approve/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/cancel | POST | `app/api/manufacturing/production-orders/[id]/cancel/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/close-reservations | POST | `app/api/manufacturing/production-orders/[id]/close-reservations/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/complete | POST | `app/api/manufacturing/production-orders/[id]/complete/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/issue | POST | `app/api/manufacturing/production-orders/[id]/issue/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/receipt | POST | `app/api/manufacturing/production-orders/[id]/receipt/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/regenerate-operations | POST | `app/api/manufacturing/production-orders/[id]/regenerate-operations/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/reject | POST | `app/api/manufacturing/production-orders/[id]/reject/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/release | POST | `app/api/manufacturing/production-orders/[id]/release/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/request-material-issue | POST | `app/api/manufacturing/production-orders/[id]/request-material-issue/route.ts` | not auto-detected |
| /api/manufacturing/production-orders/:id/request-product-receive | POST | `app/api/manufacturing/production-orders/[id]/request-product-receive/route.ts` | RPC |
| /api/manufacturing/production-orders/:id | GET, PATCH, DELETE | `app/api/manufacturing/production-orders/[id]/route.ts` | not auto-detected |
| /api/manufacturing/production-orders/:id/start | POST | `app/api/manufacturing/production-orders/[id]/start/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/submit-approval | POST | `app/api/manufacturing/production-orders/[id]/submit-approval/route.ts` | RPC |
| /api/manufacturing/production-orders/:id/sync-materials | POST | `app/api/manufacturing/production-orders/[id]/sync-materials/route.ts` | RPC |
| /api/manufacturing/production-orders | GET, POST | `app/api/manufacturing/production-orders/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id/activate | POST | `app/api/manufacturing/routing-versions/[id]/activate/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id/approve | POST | `app/api/manufacturing/routing-versions/[id]/approve/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id/archive | POST | `app/api/manufacturing/routing-versions/[id]/archive/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id/deactivate | POST | `app/api/manufacturing/routing-versions/[id]/deactivate/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id/operations | PUT | `app/api/manufacturing/routing-versions/[id]/operations/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id/reject | POST | `app/api/manufacturing/routing-versions/[id]/reject/route.ts` | RPC |
| /api/manufacturing/routing-versions/:id | GET, PATCH, DELETE | `app/api/manufacturing/routing-versions/[id]/route.ts` | not auto-detected |
| /api/manufacturing/routing-versions/:id/submit-approval | POST | `app/api/manufacturing/routing-versions/[id]/submit-approval/route.ts` | RPC |
| /api/manufacturing/routings/:id | GET, PATCH, DELETE | `app/api/manufacturing/routings/[id]/route.ts` | not auto-detected |
| /api/manufacturing/routings/:id/versions | POST | `app/api/manufacturing/routings/[id]/versions/route.ts` | RPC |
| /api/manufacturing/routings | GET, POST | `app/api/manufacturing/routings/route.ts` | not auto-detected |
| /api/manufacturing/warehouses-with-stock-summary | GET | `app/api/manufacturing/warehouses-with-stock-summary/route.ts` | not auto-detected |
| /api/manufacturing/work-centers/:id | PATCH, DELETE | `app/api/manufacturing/work-centers/[id]/route.ts` | not auto-detected |
| /api/manufacturing/work-centers | GET, POST | `app/api/manufacturing/work-centers/route.ts` | not auto-detected |

### matching-exceptions

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/matching-exceptions | GET, PUT | `app/api/matching-exceptions/route.ts` | not auto-detected |

### member-delete

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/member-delete | POST | `app/api/member-delete/route.ts` | service-role/admin, RPC |

### member-password

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/member-password | POST | `app/api/member-password/route.ts` | secureApiRequest, service-role/admin |

### member-role

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/member-role | POST | `app/api/member-role/route.ts` | service-role/admin |

### members-emails

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/members-emails | POST | `app/api/members-emails/route.ts` | service-role/admin |

### my-company

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/my-company | GET | `app/api/my-company/route.ts` | not auto-detected |

### notification-outbox

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/notification-outbox/activation-gate | GET | `app/api/notification-outbox/activation-gate/route.ts` | apiGuard |
| /api/notification-outbox/authoritative-cutover-review | GET | `app/api/notification-outbox/authoritative-cutover-review/route.ts` | apiGuard |
| /api/notification-outbox/authoritative-readiness | GET | `app/api/notification-outbox/authoritative-readiness/route.ts` | apiGuard |
| /api/notification-outbox/canary-dispatch | POST | `app/api/notification-outbox/canary-dispatch/route.ts` | apiGuard |
| /api/notification-outbox/canary-health | GET | `app/api/notification-outbox/canary-health/route.ts` | apiGuard |
| /api/notification-outbox/drift-analysis | GET | `app/api/notification-outbox/drift-analysis/route.ts` | apiGuard |
| /api/notification-outbox/shadow-dispatch | GET | `app/api/notification-outbox/shadow-dispatch/route.ts` | apiGuard |

### notifications

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/notifications/pending-approvals-count | GET | `app/api/notifications/pending-approvals-count/route.ts` | RPC |
| /api/notifications/pending-dispatch-count | GET | `app/api/notifications/pending-dispatch-count/route.ts` | RPC |
| /api/notifications/preferences | GET, PUT | `app/api/notifications/preferences/route.ts` | service-role/admin |

### onboarding

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/onboarding/complete-step | POST | `app/api/onboarding/complete-step/route.ts` | RPC |

### payments

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/payments/:id/request-correction | POST | `app/api/payments/[id]/request-correction/route.ts` | RPC |
| /api/payments/:id/resubmit-after-reject | POST | `app/api/payments/[id]/resubmit-after-reject/route.ts` | RPC |
| /api/payments/:id/vendor-request-correction | POST | `app/api/payments/[id]/vendor-request-correction/route.ts` | RPC |
| /api/payments | GET, POST | `app/api/payments/route.ts` | not auto-detected |

### period-closing

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/period-closing | POST, GET | `app/api/period-closing/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |

### permissions

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/permissions/branch-access | GET, POST, PATCH | `app/api/permissions/branch-access/route.ts` | not auto-detected |
| /api/permissions | GET, POST | `app/api/permissions/route.ts` | not auto-detected |
| /api/permissions/shared-with-me | GET | `app/api/permissions/shared-with-me/route.ts` | service-role/admin |
| /api/permissions/transfer/:id/approve | POST | `app/api/permissions/transfer/[id]/approve/route.ts` | RPC |
| /api/permissions/transfer/:id/reject | POST | `app/api/permissions/transfer/[id]/reject/route.ts` | not auto-detected |
| /api/permissions/transfer | POST | `app/api/permissions/transfer/route.ts` | not auto-detected |

### product-expiry

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/product-expiry | GET | `app/api/product-expiry/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### products

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/products/:id/bundle/:child_id | PUT, DELETE | `app/api/products/[id]/bundle/[child_id]/route.ts` | apiGuard |
| /api/products/:id/bundle/expand | GET | `app/api/products/[id]/bundle/expand/route.ts` | apiGuard, RPC |
| /api/products/:id/bundle | GET, POST | `app/api/products/[id]/bundle/route.ts` | apiGuard |
| /api/products/:id | PUT | `app/api/products/[id]/route.ts` | apiGuard |
| /api/products/bundles | GET | `app/api/products/bundles/route.ts` | apiGuard |
| /api/products | GET, POST | `app/api/products/route.ts` | apiGuard, RPC |

### products-list

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/products-list | GET | `app/api/products-list/route.ts` | secureApiRequest, permission-gated |

### purchase-orders

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/purchase-orders/:id/notifications | POST | `app/api/purchase-orders/[id]/notifications/route.ts` | not auto-detected |
| /api/purchase-orders | GET, POST | `app/api/purchase-orders/route.ts` | not auto-detected |

### purchase-prices-by-period

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/purchase-prices-by-period | GET | `app/api/purchase-prices-by-period/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### purchase-returns

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/purchase-returns/:id/approve | POST | `app/api/purchase-returns/[id]/approve/route.ts` | apiGuard |
| /api/purchase-returns/:id/confirm-delivery | POST | `app/api/purchase-returns/[id]/confirm-delivery/route.ts` | apiGuard |
| /api/purchase-returns/:id/record-refund | POST | `app/api/purchase-returns/[id]/record-refund/route.ts` | apiGuard |
| /api/purchase-returns/:id/reject-warehouse | POST | `app/api/purchase-returns/[id]/reject-warehouse/route.ts` | apiGuard |
| /api/purchase-returns | POST | `app/api/purchase-returns/route.ts` | apiGuard |

### reconciliation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/reconciliation | GET, POST | `app/api/reconciliation/route.ts` | RPC |

### refund-requests

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/refund-requests/approve | POST | `app/api/refund-requests/approve/route.ts` | not auto-detected |
| /api/refund-requests/disburse | POST | `app/api/refund-requests/disburse/route.ts` | not auto-detected |
| /api/refund-requests/reject | POST | `app/api/refund-requests/reject/route.ts` | not auto-detected |
| /api/refund-requests/reopen | POST | `app/api/refund-requests/reopen/route.ts` | not auto-detected |
| /api/refund-requests | GET, POST | `app/api/refund-requests/route.ts` | not auto-detected |

### repair-invoice

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/repair-invoice | GET, POST | `app/api/repair-invoice/route.ts` | not auto-detected |

### repair-shipping-journals

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/repair-shipping-journals | GET, POST | `app/api/repair-shipping-journals/route.ts` | not auto-detected |

### report-purchases

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/report-purchases | GET | `app/api/report-purchases/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### report-sales

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/report-sales | GET | `app/api/report-sales/route.ts` | secureApiRequest, permission-gated |

### report-sales-invoices-detail

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/report-sales-invoices-detail | GET | `app/api/report-sales-invoices-detail/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### reports

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/reports/bookings/bookings-by-branch | GET | `app/api/reports/bookings/bookings-by-branch/route.ts` | secureApiRequest, permission-gated |
| /api/reports/bookings/bookings-by-staff | GET | `app/api/reports/bookings/bookings-by-staff/route.ts` | secureApiRequest, permission-gated |
| /api/reports/bookings/cancelled-bookings | GET | `app/api/reports/bookings/cancelled-bookings/route.ts` | secureApiRequest, permission-gated |
| /api/reports/bookings/occupancy-rate | GET | `app/api/reports/bookings/occupancy-rate/route.ts` | secureApiRequest, permission-gated |
| /api/reports/bookings/revenue-by-service | GET | `app/api/reports/bookings/revenue-by-service/route.ts` | secureApiRequest, permission-gated |
| /api/reports/bookings/top-services | GET | `app/api/reports/bookings/top-services/route.ts` | secureApiRequest, permission-gated |

### resend-confirmation

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/resend-confirmation | GET, POST | `app/api/resend-confirmation/route.ts` | service-role/admin |

### resend-invite

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/resend-invite | POST | `app/api/resend-invite/route.ts` | service-role/admin |

### reset-password-with-code

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/reset-password-with-code | POST | `app/api/reset-password-with-code/route.ts` | not auto-detected |

### restore-bill

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/restore-bill | POST | `app/api/restore-bill/route.ts` | service-role/admin |

### restore-invoice

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/restore-invoice | POST | `app/api/restore-invoice/route.ts` | not auto-detected |

### sales-by-product

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sales-by-product | GET | `app/api/sales-by-product/route.ts` | secureApiRequest, permission-gated |

### sales-orders

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sales-orders/:id | PATCH, DELETE | `app/api/sales-orders/[id]/route.ts` | not auto-detected |
| /api/sales-orders | GET, POST | `app/api/sales-orders/route.ts` | RPC |

### sales-return-requests

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sales-return-requests/:id/approve | PATCH | `app/api/sales-return-requests/[id]/approve/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/sales-return-requests/:id/reject | PATCH | `app/api/sales-return-requests/[id]/reject/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/sales-return-requests/:id/warehouse-approve | PATCH | `app/api/sales-return-requests/[id]/warehouse-approve/route.ts` | secureApiRequest, service-role/admin |
| /api/sales-return-requests/:id/warehouse-reject | PATCH | `app/api/sales-return-requests/[id]/warehouse-reject/route.ts` | secureApiRequest, service-role/admin |
| /api/sales-return-requests/pending-count | GET | `app/api/sales-return-requests/pending-count/route.ts` | secureApiRequest, service-role/admin, permission-gated |
| /api/sales-return-requests | POST, GET | `app/api/sales-return-requests/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### sales-returns

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sales-returns | GET, POST | `app/api/sales-returns/route.ts` | not auto-detected |

### send-invite

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/send-invite | POST | `app/api/send-invite/route.ts` | service-role/admin |

### send-purchase-order

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/send-purchase-order | POST | `app/api/send-purchase-order/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### sentry-test

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sentry-test | GET | `app/api/sentry-test/route.ts` | not auto-detected |

### services

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/services/:id/archive | POST | `app/api/services/[id]/archive/route.ts` | apiGuard, RPC |
| /api/services/:id/products | GET, POST | `app/api/services/[id]/products/route.ts` | not auto-detected |
| /api/services/:id | GET, PUT | `app/api/services/[id]/route.ts` | apiGuard, RPC |
| /api/services/:id/schedules | GET, PUT | `app/api/services/[id]/schedules/route.ts` | apiGuard |
| /api/services/:id/staff | GET, POST, DELETE | `app/api/services/[id]/staff/route.ts` | apiGuard |
| /api/services | GET, POST | `app/api/services/route.ts` | apiGuard, RPC |

### settings

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/settings/branch-shipping-providers | GET, POST, DELETE | `app/api/settings/branch-shipping-providers/route.ts` | not auto-detected |
| /api/settings/users/:id/notifications | POST | `app/api/settings/users/[id]/notifications/route.ts` | not auto-detected |

### shareholders

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/shareholders/contributions/:id/reverse | POST | `app/api/shareholders/contributions/[id]/reverse/route.ts` | apiGuard |
| /api/shareholders/contributions/:id | GET, PATCH | `app/api/shareholders/contributions/[id]/route.ts` | apiGuard, RPC |
| /api/shareholders/contributions | POST | `app/api/shareholders/contributions/route.ts` | apiGuard |

### shipping

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/shipping/create | POST | `app/api/shipping/create/route.ts` | secureApiRequest, permission-gated |
| /api/shipping/test-connection | POST | `app/api/shipping/test-connection/route.ts` | secureApiRequest, permission-gated |
| /api/shipping/track | POST | `app/api/shipping/track/route.ts` | secureApiRequest, permission-gated |
| /api/shipping/webhook/:provider | POST | `app/api/shipping/webhook/[provider]/route.ts` | service-role/admin |

### shipping-costs

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/shipping-costs | GET | `app/api/shipping-costs/route.ts` | secureApiRequest, permission-gated |

### shipping-providers

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/shipping-providers | GET | `app/api/shipping-providers/route.ts` | not auto-detected |

### sidebar

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sidebar/approval-badges | GET | `app/api/sidebar/approval-badges/route.ts` | secureApiRequest, service-role/admin, RPC, permission-gated |

### simple-report

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/simple-report | GET | `app/api/simple-report/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### subscription

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/subscription/create | POST | `app/api/subscription/create/route.ts` | service-role/admin, RPC |
| /api/subscription/users | POST, GET | `app/api/subscription/users/route.ts` | service-role/admin |

### supplier-payments

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/supplier-payments/:id/apply-bill | POST | `app/api/supplier-payments/[id]/apply-bill/route.ts` | apiGuard |
| /api/supplier-payments/:id/apply-po | POST | `app/api/supplier-payments/[id]/apply-po/route.ts` | apiGuard |
| /api/supplier-payments/:id/approve | POST | `app/api/supplier-payments/[id]/approve/route.ts` | apiGuard |
| /api/supplier-payments/:id/delete | POST | `app/api/supplier-payments/[id]/delete/route.ts` | apiGuard |
| /api/supplier-payments/:id/update | POST | `app/api/supplier-payments/[id]/update/route.ts` | apiGuard |
| /api/supplier-payments | POST | `app/api/supplier-payments/route.ts` | apiGuard |

### supplier-price-comparison

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/supplier-price-comparison | GET | `app/api/supplier-price-comparison/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### suppliers

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/suppliers/refunds/receipt | POST | `app/api/suppliers/refunds/receipt/route.ts` | apiGuard |
| /api/suppliers | GET, POST | `app/api/suppliers/route.ts` | not auto-detected |

### sync-currency

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sync-currency | POST, GET | `app/api/sync-currency/route.ts` | not auto-detected |

### sync-so-0001

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/sync-so-0001 | POST | `app/api/sync-so-0001/route.ts` | not auto-detected |

### top-products

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/top-products | GET | `app/api/top-products/route.ts` | secureApiRequest, permission-gated |

### trial-balance

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/trial-balance | GET | `app/api/trial-balance/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### unbalanced-entries

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/unbalanced-entries | GET | `app/api/unbalanced-entries/route.ts` | secureApiRequest, permission-gated |

### update-tooltips

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/update-tooltips | POST, GET | `app/api/update-tooltips/route.ts` | not auto-detected |

### user-profile

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/user-profile | GET, PATCH, POST | `app/api/user-profile/route.ts` | secureApiRequest |

### users

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/users/display-names | POST | `app/api/users/display-names/route.ts` | not auto-detected |

### v2

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/v2/analytics/bills | GET | `app/api/v2/analytics/bills/route.ts` | not auto-detected |
| /api/v2/analytics/inventory | GET | `app/api/v2/analytics/inventory/route.ts` | not auto-detected |
| /api/v2/analytics/purchase-orders | GET | `app/api/v2/analytics/purchase-orders/route.ts` | not auto-detected |
| /api/v2/bills | GET | `app/api/v2/bills/route.ts` | not auto-detected |
| /api/v2/inventory | GET | `app/api/v2/inventory/route.ts` | not auto-detected |
| /api/v2/purchase-orders | GET | `app/api/v2/purchase-orders/route.ts` | not auto-detected |

### vat-input

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/vat-input | GET | `app/api/vat-input/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### vat-output

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/vat-output | GET | `app/api/vat-output/route.ts` | secureApiRequest, service-role/admin, permission-gated |

### vendor-credits

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/vendor-credits/:id/notifications | POST | `app/api/vendor-credits/[id]/notifications/route.ts` | not auto-detected |
| /api/vendor-credits | GET, POST | `app/api/vendor-credits/route.ts` | not auto-detected |

### vendor-payment-correction-requests

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/vendor-payment-correction-requests/:id/approve | POST | `app/api/vendor-payment-correction-requests/[id]/approve/route.ts` | RPC |
| /api/vendor-payment-correction-requests/:id/execute | POST | `app/api/vendor-payment-correction-requests/[id]/execute/route.ts` | RPC |
| /api/vendor-payment-correction-requests/:id/reject | POST | `app/api/vendor-payment-correction-requests/[id]/reject/route.ts` | RPC |

### vendor-refund-requests

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/vendor-refund-requests/:id/execute-pre-receipt | POST | `app/api/vendor-refund-requests/[id]/execute-pre-receipt/route.ts` | apiGuard |
| /api/vendor-refund-requests/:id/notifications | POST | `app/api/vendor-refund-requests/[id]/notifications/route.ts` | not auto-detected |

### verify-signup-with-code

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/verify-signup-with-code | POST | `app/api/verify-signup-with-code/route.ts` | not auto-detected |

### warehouses

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/warehouses/:id | GET, PATCH, DELETE | `app/api/warehouses/[id]/route.ts` | not auto-detected |
| /api/warehouses | GET, POST | `app/api/warehouses/route.ts` | not auto-detected |

### webhooks

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/webhooks/paymob | POST | `app/api/webhooks/paymob/route.ts` | webhook/hmac |

### write-off

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/write-off/validate | POST | `app/api/write-off/validate/route.ts` | RPC |

### write-offs

| Route | Methods | File | Markers |
| --- | --- | --- | --- |
| /api/write-offs/:id/notifications | POST | `app/api/write-offs/[id]/notifications/route.ts` | not auto-detected |
| /api/write-offs/:id | PATCH, DELETE | `app/api/write-offs/[id]/route.ts` | not auto-detected |
| /api/write-offs/approve | POST | `app/api/write-offs/approve/route.ts` | RPC |
