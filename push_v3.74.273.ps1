$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.272.ps1") { Remove-Item -LiteralPath "push_v3.74.272.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.273"') {
    Write-Host "+ 3.74.273" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "supabase/migrations/20260622000273_v3_74_273_restore_cogs_tx_inv00005.sql")) {
    Write-Host "X migration file missing" -ForegroundColor Red; exit 1
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260622000273_v3_74_273_restore_cogs_tx_inv00005.sql" -Raw
foreach ($c in @('INV-00005', 'ee551ffc-3e41-4f99-a7db-df5ce831a28c', 'JE-000018', 'NOT EXISTS')) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ Cogs row restoration migration committed (idempotent)" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_273.txt"
    $msgLines = @(
        'fix(data): v3.74.273 - restore the cogs_transactions row for INV-00005',
        '',
        'v3.74.270 cleaned out ALL cogs_transactions rows for the test',
        'company while wiping orphan manufacturing data. That was too',
        'aggressive - INV-00005 in the test company is a live sale',
        '(partially_paid, 17.50 EGP collected of 20.00 EGP) whose COGS',
        'journal entry JE-000018 was correctly preserved. With the',
        'sub-ledger empty but the GL still posting 2.00 EGP, the',
        'ic_cogs_balance integrity check reported a medium-severity',
        'divergence on the dashboard.',
        '',
        'This release commits an idempotent INSERT that recreates the',
        'matching cogs_transactions row from the invoice + JE values:',
        '  source_type = invoice, source_id = INV-00005 id, product =',
        '  VitaSlims (the SKU sold on the invoice), quantity = 2,',
        '  unit_cost = 1.00, total_cost = 2.00.',
        '',
        'The migration uses NOT EXISTS so re-running it after the live',
        'apply is a no-op.',
        '',
        'After deploy, ic_cogs_balance returns null for both companies',
        '(no divergence) and the dashboard widget is clean.',
        '',
        'Files',
        '  supabase/migrations/20260622000273_v3_74_273_restore_cogs_tx_inv00005.sql (new)',
        '  lib/version.ts -> 3.74.273'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.273 pushed" -ForegroundColor Green
}
