$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.568"') { Write-Host "+ 3.74.568" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_568.txt"
    $msgLines = @(
        'feat(finalize): v3.74.566-568 - FX revaluation + JE SoD + recurring journals',
        '',
        'Final wave of the systematic sweep. Closes the remaining IAS',
        '21 gap and adds automated posting infrastructure.',
        '',
        '#1 (566) run_fx_revaluation() — IAS 21 closing-rate revaluation',
        '   for FC monetary accounts. SoD + period lock.',
        '#2 (567) Manual JE SoD — non-privileged manual JEs go to draft;',
        '   post_manual_journal_draft() moves to posted with SoD check.',
        '#3 (568) Recurring journals — templates + lines + executor RPC',
        '   with balance CONSTRAINT trigger and end-date auto-deactivate.',
        '#4 Consolidated FS — verified reports aggregate at company level',
        '   by default (no branch filter present in the flow). No change.',
        '#5 Payroll — stub table surfaced; deferred pending broader design.',
        '',
        'Files',
        '  lib/services/manual-journal-command.service.ts (SoD downgrade)',
        '  supabase/migrations/20260706000566_...sql (doc stamp)',
        '  supabase/migrations/20260706000567_...sql (doc stamp)',
        '  supabase/migrations/20260706000568_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.568'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.568 pushed" -ForegroundColor Green }
