$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.430.ps1") { Remove-Item -LiteralPath "push_v3.74.430.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.431"') {
    Write-Host "+ 3.74.431" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000431_v3_74_431_hotfix_notifications_category.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 431 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AE\. ?HOTFIX notifications.category') {
    Write-Host "X CONTRACTS.md missing Section AE" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AE" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_431.txt"
    $msgLines = @(
        'fix(notifications): v3.74.431 HOTFIX - allow branch_activity + accountant_action',
        '',
        'Owner caught it on the first PO save after the test-company',
        'cleanup: HTTP 400 with "فشل في إنشاء أمر الشراء". Postgres',
        'logs showed the new FYI trigger from v3.74.428 violating the',
        'notifications_category_check CHECK constraint (the original',
        'allowed set did not include branch_activity).',
        '',
        'Because the PO INSERT and the FYI INSERT share a transaction,',
        'the PO save rolled back. Same trap would have hit on first',
        'invoice creation (accountant_action from v3.74.429).',
        '',
        'Fix: drop and re-add the CHECK with the two new tokens.',
        '',
        'Baseline (Section AE) verifies the CHECK includes both new',
        'tokens. Lesson recorded in CONTRACTS.md: any new category',
        'introduced by a trigger must be reflected in the CHECK.',
        '',
        'Files',
        '   supabase/migrations/20260630000431_v3_74_431_hotfix_notifications_category.sql',
        '   CONTRACTS.md (Section AE added)',
        '   lib/version.ts -> 3.74.431'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.431 pushed - PO save no longer blocked by category CHECK" -ForegroundColor Green
}
