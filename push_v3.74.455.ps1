$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.454.ps1") { Remove-Item -LiteralPath "push_v3.74.454.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.455"') {
    Write-Host "+ 3.74.455" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000455_v3_74_455_archive_broadcast_on_targeted.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 455 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BB\. ?أرشفة broadcast') {
    Write-Host "X CONTRACTS.md missing Section BB" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BB" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_455.txt"
    $msgLines = @(
        'fix(notifications): v3.74.455 - archive broadcast when targeted accountant lands',
        '',
        'v3.74.454 dedups by (ref, assignee), so a null-assignee broadcast',
        'and an assignee-targeted notification for the same bill did not',
        'merge. The app-side path was still firing an approvals broadcast',
        'right after PO approval, seconds before bill_notify_accountant_trg',
        'sent the targeted one. Accountant saw two cards for BILL-0001.',
        '',
        'The supersede trigger now also archives any lingering broadcast',
        '(null assignee) in the approvals category about the same doc',
        'when a targeted accountant_action arrives. Broadcasts are',
        'someone-deal-with-this pings; once the specific someone has',
        'been notified directly, the broadcast is noise.',
        '',
        'One-shot cleaned the test-company backlog.',
        '',
        'No new baseline check needed - Section BA (v3.74.454) already',
        'verifies the full trigger body.',
        '',
        'Files',
        '   supabase/migrations/20260630000455_v3_74_455_archive_broadcast_on_targeted.sql',
        '   CONTRACTS.md (Section BB added)',
        '   lib/version.ts -> 3.74.455'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.455 pushed - broadcast archived on targeted arrival" -ForegroundColor Green
}
