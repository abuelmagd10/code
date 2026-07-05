$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.542"') { Write-Host "+ 3.74.542" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$nr = Get-Content -LiteralPath 'lib/notification-routing.ts' -Raw
if ($nr -notmatch '/approvals\?tab=cref&highlight=') { Write-Host "X customer refund notification not rerouted" -ForegroundColor Red; exit 1 }
if ($nr -notmatch '/approvals\?tab=vcor&highlight=') { Write-Host "X vendor correction notification not rerouted" -ForegroundColor Red; exit 1 }
Write-Host "+ correction notifications route to /approvals" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_542.txt"
    $msgLines = @(
        'refactor(notifications): v3.74.542 - correction workflows route to unified /approvals inbox',
        '',
        'Owner: why are correction requests still routing to standalone',
        'pages when every other approval workflow is unified into',
        '/approvals?',
        '',
        'The /approvals card already handled both approve and execute',
        'since v3.74.476 (button switches to Execute Correction when',
        'status is approved). Only the notification routes were still',
        'pointing at the standalone pages.',
        '',
        'Fix (Node only):',
        '  customer_refund_request        -> /approvals?tab=cref&highlight',
        '  vendor_payment_correction_request -> /approvals?tab=vcor&highlight',
        '',
        'Standalone pages stay reachable as a fallback (same policy as',
        'v3.74.490-492 with the retired inventory pages).',
        '',
        'Files',
        '  lib/notification-routing.ts',
        '  supabase/migrations/20260706000542_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.542'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.542 pushed - correction workflows unified" -ForegroundColor Green }
