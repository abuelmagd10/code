$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.453.ps1") { Remove-Item -LiteralPath "push_v3.74.453.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.454"') {
    Write-Host "+ 3.74.454" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000454_v3_74_454_cross_category_notif_dedup.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 454 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BA\. ?Cross-category dedup') {
    Write-Host "X CONTRACTS.md missing Section BA" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BA" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_454.txt"
    $msgLines = @(
        'fix(notifications): v3.74.454 - cross-category dedup for user-assigned cards',
        '',
        'Accountant saw two cards for the same BILL-0001 after PO',
        'approval: one approvals broadcast from the app RPC layer, one',
        'accountant_action from bill_notify_accountant_trg. Category',
        'matched exactly under v3.74.452, so both survived.',
        '',
        'When assigned_to_user is set on a new actionable notification,',
        'the supersede rule now archives every older unread card the',
        'same user has for the same (reference_type, reference_id)',
        'across approvals + accountant_action + branch_activity.',
        '',
        'Broadcasts (null assignee) keep the strict category match so',
        'unrelated broadcasts do not clobber each other.',
        '',
        'One-shot UPDATE archived pre-existing stacks. Accountant inbox',
        'now shows one card per bill.',
        '',
        'Baseline (Section BA) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000454_v3_74_454_cross_category_notif_dedup.sql',
        '   CONTRACTS.md (Section BA added)',
        '   lib/version.ts -> 3.74.454'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.454 pushed - cross-category dedup live" -ForegroundColor Green
}
