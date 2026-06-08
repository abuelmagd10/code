# v3.74.92 - Customer credit integrity check + dashboard widget + daily cron
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.92"') { Write-Host "+ APP_VERSION = 3.74.92" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.92" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.92]')) { Write-Host "+ CHANGELOG 3.74.92" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.92" -ForegroundColor Red; exit 1 }

# Verify new files exist
$files = @(
  "app/dashboard/_widgets/CreditIntegrityWidget.tsx",
  "app/api/governance/customer-credit-integrity/route.ts",
  "app/api/cron/customer-credit-integrity/route.ts"
)
foreach ($f in $files) {
  if (Test-Path -LiteralPath $f) { Write-Host "+ $f present" -ForegroundColor Green } else { Write-Host "X $f missing" -ForegroundColor Red; exit 1 }
}

# Verify dashboard mounts the widget
$dash = Get-Content -LiteralPath "app/dashboard/page.tsx" -Raw
if ($dash -match 'CreditIntegrityWidget') { Write-Host "+ Dashboard imports CreditIntegrityWidget" -ForegroundColor Green } else { Write-Host "X CreditIntegrityWidget not imported" -ForegroundColor Red; exit 1 }

# Verify vercel.json cron registered
$vercel = Get-Content -LiteralPath "vercel.json" -Raw
if ($vercel -match 'customer-credit-integrity') { Write-Host "+ vercel.json cron registered" -ForegroundColor Green } else { Write-Host "X cron not in vercel.json" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-Object -First 15 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.92 - customer credit integrity monitoring (defense in depth)

After v3.74.91 sealed the immediate bug (overpayment without journal),
this version makes sure the same class of accounting gap can never stay
invisible again. Four-piece monitoring system:

1. DB function check_customer_credit_integrity(company_id) - 3 checks:
   - customer_credits.net vs account 2155.net per company
   - invoices with paid > total but no customer_credit row
   - customer_credits.overpayment rows without their journal

2. API GET /api/governance/customer-credit-integrity - scoped to caller
   company, gated to owner/manager/accountant roles. Returns findings.

3. Dashboard widget CreditIntegrityWidget - green when balanced, red
   with findings list when not. Hidden from non-financial roles.
   useAutoRefresh on focus, 60s throttle, skipIfHidden.

4. Daily cron /api/cron/customer-credit-integrity at 1:30 AM UTC -
   for each company with findings: audit_logs row + critical
   notification to each owner. Healthy companies write nothing -
   absence of audit row IS the green signal.

Design principle: three layers of defense.
- Layer 1: triggers do the work right (v3.74.91)
- Layer 2: UI reads canonical source so display can't drift (v3.74.89)
- Layer 3: automated check catches anything that slipped (this)

TypeScript: 0 errors. Files added (no existing files truncated):
- app/dashboard/_widgets/CreditIntegrityWidget.tsx (new)
- app/api/governance/customer-credit-integrity/route.ts (new)
- app/api/cron/customer-credit-integrity/route.ts (new)
- app/dashboard/page.tsx (import + 1-line mount)
- vercel.json (cron schedule entry)

DB migrations applied via apply_migration:
- v3_74_92_customer_credit_integrity_check_v2

Test company in DB returned zero findings post-v3.74.91 backfill." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.92 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.91.ps1') { Remove-Item -LiteralPath 'push_v3.74.91.ps1' -Force }
}
