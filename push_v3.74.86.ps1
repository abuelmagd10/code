# v3.74.86 - DB-only fix: drop uuid::text cast in apply_customer_credit_to_invoice
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.86"') { Write-Host "+ APP_VERSION = 3.74.86" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.86" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.86]')) { Write-Host "+ CHANGELOG 3.74.86" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.86" -ForegroundColor Red; exit 1 }

# This is a DB-only fix. No code paths changed. TypeScript sanity check only.
Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; $tsc | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(customer-credit): v3.74.86 - drop uuid::text cast in apply_customer_credit_to_invoice

Applying customer credit to INV-00005 (and any invoice) failed with:
column 'reference_id' is of type uuid but expression is of type text
(PostgREST error 42804)

Root cause: the INSERT INTO journal_entries inside the RPC had
'credit_applied', p_invoice_id::text - but journal_entries.reference_id
is uuid. Casting uuid -> text -> uuid makes Postgres reject the insert.

The second p_invoice_id::text occurrence (inside the description string
concatenation) is legitimate and stays.

DB-only migration v3_74_86_fix_apply_customer_credit_uuid_cast.
Function signature unchanged. Verified:
- bug substring 'credit_applied', p_invoice_id::text, -> not found
- fix substring 'credit_applied', p_invoice_id,        -> present" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.86 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.85.ps1') { Remove-Item -LiteralPath 'push_v3.74.85.ps1' -Force }
}
