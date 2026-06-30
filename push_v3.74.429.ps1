$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.428.ps1") { Remove-Item -LiteralPath "push_v3.74.428.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.429"') {
    Write-Host "+ 3.74.429" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000429_v3_74_429_notify_accountant_on_new_bill.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 429 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AC\. ?إشعار المحاسب بفواتير') {
    Write-Host "X CONTRACTS.md missing Section AC" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AC" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_429.txt"
    $msgLines = @(
        'feat(notifications): v3.74.429 - accountant notification on new bill',
        '',
        'Bills appeared silently. Accountants had to poll the bills list',
        'to discover new work. trigger bill_notify_accountant fires',
        'AFTER INSERT on bills and pushes one notification per matching',
        'accountant:',
        '   - branch-scoped accountants when at least one exists for the',
        '     bill branch',
        '   - all company accountants as fallback when no branch-scoped',
        '     accountant is configured',
        '',
        'Actor (creator) is skipped so accountants who create bills',
        'themselves do not get self-pings. category=accountant_action',
        'lets the inbox UI group the items.',
        '',
        'Baseline (Section AC) verifies the trigger function targets',
        'role=accountant and uses the accountant_action category.',
        '',
        'Files',
        '   supabase/migrations/20260630000429_v3_74_429_notify_accountant_on_new_bill.sql',
        '   CONTRACTS.md (Section AC added)',
        '   lib/version.ts -> 3.74.429'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.429 pushed - accountants get pinged on new bills" -ForegroundColor Green
}
