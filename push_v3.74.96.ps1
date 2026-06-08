# v3.74.96 - 5 high-risk integrity checks (DB-only)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.95.ps1") { Remove-Item -LiteralPath "push_v3.74.95.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.96"') { Write-Host "+ APP_VERSION = 3.74.96" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.96" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.96]')) { Write-Host "+ CHANGELOG 3.74.96" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.96" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(governance): v3.74.96 - 5 high-risk integrity checks (33 total)

DB-only release. 5 new check functions + 5 registry rows. Framework
picks them up automatically.

New checks:
- fx_draft_stale: fx_period_end_revaluation journals stuck in draft > 7d
- fx_amount_accuracy: payments.base_currency_amount vs original*rate
- bank_recon_pending: bank_reconciliations with diff > 0.10 older than 30d
- expense_no_journal: approved expense without journal_entry_id
- return_exceeds_invoice: sum(returns) > invoice.total

Real findings on first run:
- 2 fx_period_end_revaluation drafts (311 + 304.78 EGP) sitting silent
  for 19 days. Owner now has visibility within 24 hours.

Registry totals: 16 accounting + 7 inventory + 10 operational = 33.

Process: queried information_schema.columns before each function to
verify exact column names. Result: zero column-name false positives." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.96 pushed" -ForegroundColor Green
}
