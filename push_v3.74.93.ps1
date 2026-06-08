# v3.74.93 - System Integrity Framework (16 checks + widget + cron)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

# Clean up v3.74.92 leftovers (the precursor that never shipped)
if (Test-Path "app/api/governance/customer-credit-integrity") {
    Remove-Item -LiteralPath "app/api/governance/customer-credit-integrity" -Recurse -Force
    Write-Host "+ removed app/api/governance/customer-credit-integrity" -ForegroundColor Green
}
if (Test-Path "app/api/cron/customer-credit-integrity") {
    Remove-Item -LiteralPath "app/api/cron/customer-credit-integrity" -Recurse -Force
    Write-Host "+ removed app/api/cron/customer-credit-integrity" -ForegroundColor Green
}
if (Test-Path "app/dashboard/_widgets/CreditIntegrityWidget.tsx") {
    Remove-Item -LiteralPath "app/dashboard/_widgets/CreditIntegrityWidget.tsx" -Force
    Write-Host "+ removed CreditIntegrityWidget.tsx" -ForegroundColor Green
}
# Also remove stale push scripts from previous version
if (Test-Path "push_v3.74.92.ps1") { Remove-Item -LiteralPath "push_v3.74.92.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.93"') { Write-Host "+ APP_VERSION = 3.74.93" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.93" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.93]')) { Write-Host "+ CHANGELOG 3.74.93" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.93" -ForegroundColor Red; exit 1 }

# Verify new files exist
$expected = @(
    "app/dashboard/_widgets/SystemIntegrityWidget.tsx",
    "app/api/governance/system-integrity/route.ts",
    "app/api/cron/system-integrity/route.ts"
)
foreach ($f in $expected) {
    if (Test-Path -LiteralPath $f) { Write-Host "+ $f" -ForegroundColor Green } else { Write-Host "X $f missing" -ForegroundColor Red; exit 1 }
}

# Verify the dashboard imports the new widget
$dash = Get-Content -LiteralPath "app/dashboard/page.tsx" -Raw
if ($dash -match 'SystemIntegrityWidget' -and $dash -notmatch 'CreditIntegrityWidget') {
    Write-Host "+ Dashboard wired to SystemIntegrityWidget (no leftover CreditIntegrityWidget ref)" -ForegroundColor Green
} else {
    Write-Host "X Dashboard import mismatch" -ForegroundColor Red; exit 1
}

# Verify vercel.json cron path
$vercel = Get-Content -LiteralPath "vercel.json" -Raw
if ($vercel -match '/api/cron/system-integrity' -and $vercel -notmatch 'customer-credit-integrity') {
    Write-Host "+ vercel.json cron path is /api/cron/system-integrity" -ForegroundColor Green
} else {
    Write-Host "X vercel.json cron path mismatch" -ForegroundColor Red; exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; $tsc | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.93 - System Integrity Framework + 16 checks

v3.74.92 introduced one focused integrity check (customer credit).
The user's call: same pattern across every balance the system tracks.

DB layer (4 migrations applied):
- integrity_check_definitions registry table
- 16 individual ic_* functions, each returns (severity, detail jsonb)
- master run_all_integrity_checks(company_id) reads the registry and
  dispatches via EXECUTE format(...). Per-check exception handler so
  one broken check can't break the run for the company.

The 16 checks:
Accounting (8): ar_balance, ap_balance, customer_credit, vendor_credit,
  trial_balance, orphaned_journals, cogs_balance, negative_assets.
Inventory (5): negative_stock, fifo_lot_integrity, stale_transfers,
  manufacturing_consumption, return_chain.
Operational (3): stale_approvals, overpaid_no_credit,
  credit_without_journal.

App layer (replaces v3.74.92 files, which never shipped):
- /api/governance/system-integrity   (unified API, role-gated)
- /api/cron/system-integrity          (daily 1:30 AM UTC)
- SystemIntegrityWidget.tsx           (silent-by-design banner)
- vercel.json cron registered

Removed precursor files:
- app/api/governance/customer-credit-integrity
- app/api/cron/customer-credit-integrity
- app/dashboard/_widgets/CreditIntegrityWidget.tsx

Verified: run_all_integrity_checks on the vitaslims test company
returns zero rows - clean across all 16 dimensions after v3.74.91.

TS: 0 errors.

Design principles enforced:
- Silent unless wrong (widget returns null when healthy)
- Pluggable (new check = 1 SQL function + 1 INSERT, no code changes)
- No auto-fix (notification + audit_log only, human decides)
- Per-company isolation (every check is scoped by company_id)" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.93 pushed" -ForegroundColor Green
}
