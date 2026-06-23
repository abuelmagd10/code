$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.297.ps1") { Remove-Item -LiteralPath "push_v3.74.297.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.298"') {
    Write-Host "+ 3.74.298" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "app/api/cron/fx-revaluation-reminder/route.ts")) {
    Write-Host "X cron route missing" -ForegroundColor Red; exit 1
}
$cron = Get-Content -LiteralPath "app/api/cron/fx-revaluation-reminder/route.ts" -Raw
foreach ($n in @('isLastDayOfMonth','fx_period_end_revaluation','fx_reval_reminder')) {
    if ($cron -notmatch [regex]::Escape($n)) {
        Write-Host "X cron route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ fx-revaluation-reminder cron in place" -ForegroundColor Green

$vc = Get-Content -LiteralPath "vercel.json" -Raw
if ($vc -notmatch '/api/cron/fx-revaluation-reminder') {
    Write-Host "X vercel.json does not schedule fx-revaluation-reminder" -ForegroundColor Red; exit 1
}
Write-Host "+ vercel.json: fx-revaluation-reminder scheduled" -ForegroundColor Green

$lock = Get-Content -LiteralPath "app/api/accounting-periods/lock/route.ts" -Raw
foreach ($n in @('fx_period_end_revaluation','ولسة ما اتعملش إعادة تقييم','body.force === true')) {
    if ($lock -notmatch [regex]::Escape($n)) {
        Write-Host "X lock route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ accounting-periods/lock: FX revaluation pre-check (force override)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_298.txt"
    $msgLines = @(
        'feat(fx): v3.74.298 - smart monthly reminder + period-close guard for FX revaluation',
        '',
        'IAS 21 requires foreign-currency monetary balances to be revalued at',
        'the reporting date. The system already supports it (Settings -> FX',
        'Revaluation), but it relied entirely on the accountant remembering',
        'to run it. Two guard rails now:',
        '',
        '== End-of-month reminder cron ==',
        '',
        'app/api/cron/fx-revaluation-reminder/route.ts (NEW)',
        '  - Vercel cron at 09:00 daily (see vercel.json).',
        '  - Idle on every day EXCEPT the last calendar day of the month;',
        '    we want the reminder to feel scarce so it gets read.',
        '  - For each company:',
        '      * count open FC invoices + bills as of period end',
        '      * skip if zero (no FC exposure - reminder would be noise)',
        '      * check journal_entries for an fx_period_end_revaluation',
        '        booked inside this month',
        '      * skip if already booked',
        '      * skip if a reminder with event_key = fx_reval_reminder:',
        '        {company}:{periodEnd} already exists (dedup)',
        '      * otherwise: insert a high-priority warning notification on',
        '        the owner with a one-sentence pointer to the page.',
        '',
        'The cron returns a summary {processed, notified, skippedNoFx,',
        'skippedAlreadyReval, skippedDup} for visibility in Vercel logs.',
        '',
        '== Period close guard ==',
        '',
        'app/api/accounting-periods/lock/route.ts',
        '  - Before invoking close_accounting_period RPC, look up the',
        '    period range and apply the same FC / revaluation logic as',
        '    the cron.',
        '  - If open FC docs exist in the period AND no revaluation JE',
        '    was booked inside the period, refuse with a friendly Arabic',
        '    message pointing the accountant to the right page.',
        '  - Owner can pass body.force === true to bypass (e.g. amounts',
        '    are immaterial). The override is logged in the same audit',
        '    trail as the close.',
        '',
        'These are non-destructive: they only block / nudge, never write FX',
        'accounting entries on their own. The accountant remains in charge',
        'of which closing rate to use and when to post.',
        '',
        'Files',
        '  app/api/cron/fx-revaluation-reminder/route.ts (NEW)',
        '  app/api/accounting-periods/lock/route.ts',
        '  vercel.json',
        '  lib/version.ts -> 3.74.298'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.298 pushed" -ForegroundColor Green
}
