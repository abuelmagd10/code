$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.696.ps1") { Remove-Item -LiteralPath "push_v3.74.696.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.697"') {
    Write-Host "+ 3.74.697" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.697]")) { Write-Host "X CHANGELOG missing [3.74.697]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260718000697_v3_74_697_single_accountant_notification_per_bill.sql")) { Write-Host "X 697 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "v3\.74\.697") { Write-Host "X functions.sql missing the 697 dedupe rule" -ForegroundColor Red; exit 1 }
# the v3.74.695 role guard must survive this rewrite
if ($fn -notmatch "assigned_to_role IS NOT DISTINCT FROM NEW\.assigned_to_role") {
    Write-Host "X the v3.74.695 role guard was lost - aborting" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot: 697 dedupe rule present and 695 role guard intact" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/migrations/20260718000697_v3_74_697_single_accountant_notification_per_bill.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.697.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.696.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_697.txt"
    $msgLines = @(
        'fix(notifications): v3.74.697 - one accountant notification per purchase bill',
        '',
        '- Approving a PO sent the accountant two notifications for the same bill.',
        '  The existing dedupe rule only worked if the approvals broadcast was',
        '  inserted first, but the accountant_action copy is emitted ~1.4s earlier.',
        '- Keeps the role-targeted, branch-scoped "awaiting your approval" request',
        '  and archives the accountant_action copy, in both insert orders.',
        '- An accountant_action with no approvals counterpart (sales invoices) is',
        '  untouched. The v3.74.695 role guard is preserved.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.697 pushed - single accountant notification per bill" -ForegroundColor Green
}
