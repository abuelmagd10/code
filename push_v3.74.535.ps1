$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.535"') {
    Write-Host "+ 3.74.535" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/account-lines/route.ts" -Raw
if ($route -notmatch 'entry_date", \{ referencedTable: "journal_entries"') {
    Write-Host "X api route not ordering by entry_date" -ForegroundColor Red; exit 1
}
Write-Host "+ api route orders by entry_date" -ForegroundColor Green

$bank = Get-Content -LiteralPath 'app/banking/[id]/page.tsx' -Raw
if ($bank -notmatch 'entry_date", \{ referencedTable: "journal_entries"') {
    Write-Host "X banking page fallback not ordering by entry_date" -ForegroundColor Red; exit 1
}
Write-Host "+ banking page fallback orders by entry_date" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_535.txt"
    $msgLines = @(
        'fix(ledger): v3.74.535 - account ledger orders by entry_date (was random UUID)',
        '',
        'Owner spotted cash box ledger showing a 2026-07-03 payment',
        'sitting between two 2026-05-01 capital contributions, with a',
        'running balance implying the payment drained an account that',
        'only held 10,000 EGP at that time. In fact 30,000 had been',
        'contributed by 2026-05-02.',
        '',
        'Root cause: both /api/account-lines and the banking fallback',
        'ordered journal_entry_lines by .order("id", DESC). id is a',
        'random UUID, so the order was essentially random. The component',
        'then reversed to compute a running balance from oldest to',
        'newest - but oldest was UUID-first, not date-first.',
        '',
        'Fix: order by journal_entries.entry_date DESC then id DESC as a',
        'stable tiebreaker on both surfaces. Final total unchanged, per',
        'row running balance now moves along the real timeline.',
        '',
        'Files',
        '  app/api/account-lines/route.ts',
        '  app/banking/[id]/page.tsx',
        '  supabase/migrations/20260705000535_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.535'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.535 pushed - ledger orders by entry_date, running balance sane" -ForegroundColor Green
}
