# v3.74.9 - Auto-create accounting periods + friendly UX on closed period
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.9"') { Write-Host "+ APP_VERSION = 3.74.9" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.9" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.9\]' -and $cl -match 'seed_accounting_periods_for_company' -and $cl -match 'ensure-accounting-periods') {
    Write-Host "+ CHANGELOG entry for 3.74.9 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.9 entry" -ForegroundColor Red; exit 1 }

# Layer 2 - new cron route exists
if (Test-Path -LiteralPath "app/api/cron/ensure-accounting-periods/route.ts") {
    Write-Host "+ ensure-accounting-periods cron route exists" -ForegroundColor Green
} else { Write-Host "X ensure-accounting-periods route missing" -ForegroundColor Red; exit 1 }

# Layer 2 - vercel.json has the schedule
$vj = Get-Content -LiteralPath "vercel.json" -Raw
if ($vj -match '/api/cron/ensure-accounting-periods') {
    Write-Host "+ vercel.json registers the new cron" -ForegroundColor Green
} else { Write-Host "X vercel.json missing cron entry" -ForegroundColor Red; exit 1 }

# Layer 3 - service surfaces ERR_PERIOD_CLOSED code
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-payment-command.service.ts" -Raw
if ($svc -match 'ERR_PERIOD_CLOSED' -and $svc -match 'NO_ACTIVE_FINANCIAL_PERIOD') {
    Write-Host "+ service wraps ERR_PERIOD_CLOSED with friendly Arabic" -ForegroundColor Green
} else { Write-Host "X service didn't get the friendly-error patch" -ForegroundColor Red; exit 1 }

# Layer 3 - route surfaces code+details
$rt = Get-Content -LiteralPath "app/api/invoices/[id]/record-payment/route.ts" -Raw
if ($rt -match 'error\.code' -and $rt -match 'error\.details') {
    Write-Host "+ record-payment route exposes code + details" -ForegroundColor Green
} else { Write-Host "X record-payment route missing code/details surfacing" -ForegroundColor Red; exit 1 }

# Layer 3 - invoice page handles the CTA
$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -match 'ERR_PERIOD_CLOSED' -and $pg -match 'فتح الفترة' -and $pg -match '/accounting/periods') {
    Write-Host "+ invoice page renders the CTA toast for closed period" -ForegroundColor Green
} else { Write-Host "X invoice page CTA missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        vercel.json `
        "app/api/cron/ensure-accounting-periods/route.ts" `
        "lib/services/sales-invoice-payment-command.service.ts" `
        "app/api/invoices/[id]/record-payment/route.ts" `
        "app/invoices/[id]/page.tsx" 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(accounting): v3.74.9 - auto-create accounting periods + friendly UX

A payment on 2026-06-02 failed with NO_ACTIVE_FINANCIAL_PERIOD because the
company only had April and May 2026 seeded - nothing covered June. The
financial-lock guard worked as designed, but the system had no mechanism
to ensure the current month always has an open period. Every new month
would have broken every financial mutation until an admin manually
opened the next period - unacceptable for an enterprise ERP.

Three layers of defense:

Layer 1 - DB trigger on companies INSERT + backfill
  Migration: v3_74_9_auto_seed_accounting_periods_v2
    - UNIQUE (company_id, period_start) constraint
    - _arabic_month_name + _to_arabic_indic_digits helpers
    - seed_accounting_periods_for_company(company, start, months)
      idempotent, pre-checks overlap so it cooperates with the existing
      check_no_overlapping_periods BEFORE trigger
    - AFTER INSERT trigger on companies seeds 12 months from today
    - Backfill ran inside the migration: every existing company now has
      12 rolling months. Verified after migration.

Layer 2 - Daily cron ensures the next 3 months exist
  Migration: v3_74_9_ensure_periods_rpc
    - cron_ensure_accounting_periods(p_months_ahead int default 3) RPC
  New: app/api/cron/ensure-accounting-periods/route.ts
    - Bearer CRON_SECRET auth (same pattern as the other 4 crons)
    - audit_logs row per run
    - idempotent
  Updated: vercel.json
    - 0 1 * * * (1 AM UTC = 3 AM Cairo daily)

Layer 3 - Friendly UX instead of raw English DB error
  Updated: SalesInvoicePaymentCommandError - now carries optional
    code + details fields.
  Updated: sales-invoice-payment-command.service.ts - period-lock catch
    detects NO_ACTIVE_FINANCIAL_PERIOD vs FINANCIAL_PERIOD_LOCKED and
    substitutes a clear Arabic message + code='ERR_PERIOD_CLOSED'.
  Updated: /api/invoices/[id]/record-payment/route.ts - surfaces
    code + details in the JSON response.
  Updated: app/invoices/[id]/page.tsx - when code='ERR_PERIOD_CLOSED'
    the form shows a destructive toast with a 'fath al-fatra' action
    button that navigates to /accounting/periods. No more raw English
    error in the user's face.

Governance:
  - Trigger is SECURITY DEFINER but only adds periods (never modifies)
  - Seeding pre-checks overlap and is idempotent
  - Cron auth identical to the other crons (CRON_SECRET)
  - Friendly message reveals only the date the user already entered
  - Backfill ran inside the migration transaction

Files:
  DB:     v3_74_9_auto_seed_accounting_periods_v2
          v3_74_9_ensure_periods_rpc
  New:    app/api/cron/ensure-accounting-periods/route.ts
  Modified:
    vercel.json
    lib/version.ts (3.74.8 -> 3.74.9)
    lib/services/sales-invoice-payment-command.service.ts
    app/api/invoices/[id]/record-payment/route.ts
    app/invoices/[id]/page.tsx
    CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.9 pushed" -ForegroundColor Green
}
