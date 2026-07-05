$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.549"') { Write-Host "+ 3.74.549" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000549_v3_74_549_daily_movement_inflow_outflow_split.sql')) {
    Write-Host "X doc-stamp migration missing" -ForegroundColor Red; exit 1
}
Write-Host "+ doc-stamp migration present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_549.txt"
    $msgLines = @(
        'feat(dashboard): v3.74.549 - daily movement card shows in/out/net split',
        '',
        'Card renamed from "Daily Income" to "Net Daily Movement" because',
        'the number was a net (debit - credit) and can be negative on days',
        'dominated by payments. To make the sign meaningful we now surface',
        'the two halves alongside it:',
        '',
        '  Cash-in-Treasury    Bank Deposits         Net Total',
        '  ---------------     ---------------       ---------',
        '  In  Out  Net        In  Out  Net',
        '',
        'The Net Total column is colored (green >= 0, red < 0) so the',
        'sign is obvious at a glance.',
        '',
        'Governance unchanged - branch isolation and the v3.74.548',
        'reversal/void filters remain intact.',
        '',
        'Files',
        '  lib/dashboard-daily-income.ts        (returns 6 extra fields)',
        '  components/DashboardDailyIncomeCard.tsx (new header, sub-cols)',
        '  supabase/migrations/20260706000549_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.549'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.549 pushed" -ForegroundColor Green }
