$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.665.ps1") { Remove-Item -LiteralPath "push_v3.74.665.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.666"') {
    Write-Host "+ 3.74.666" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.666]")) { Write-Host "X CHANGELOG missing [3.74.666]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260715000666_v3_74_666_line_discount_governance_invoices_bills.sql")) { Write-Host "X 666 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "inv_evaluate_discount_approval" -or $fn -notmatch "bill_evaluate_discount_approval") {
    Write-Host "X functions.sql missing the aggregate discount evaluators (dump incomplete)" -ForegroundColor Red; exit 1
}
Write-Host "+ functions.sql captured the aggregate discount evaluators" -ForegroundColor Green

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

# DB-only release. Selective staging avoids the Windows-mount CRLF noise on app source.
git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/migrations/20260715000666_v3_74_666_line_discount_governance_invoices_bills.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.666.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.665.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_666.txt"
    $msgLines = @(
        'feat(approvals): v3.74.666 - close line-item discount bypass on invoices & bills',
        '',
        '- Aggregate evaluator (line + header discount) per document, mirroring',
        '  the sales_order / purchase_order model: inv_evaluate_discount_approval,',
        '  bill_evaluate_discount_approval.',
        '- Header trigger delegates to the evaluator; new per-item trigger',
        '  re-evaluates on line changes; block-post trigger recomputes the',
        '  aggregate and requires a matching approval.',
        '- Fix latent bug: invoice trigger referenced non-existent',
        '  last_edited_by_user_id; now created_by_user_id.',
        '- Verified live (rolled back): line-only 10% discount opens a pending',
        '  approval; posting blocked pre-approval, succeeds post-approval; no',
        '  regression for zero-discount invoices.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.666 pushed - line-item discount bypass closed" -ForegroundColor Green
}
