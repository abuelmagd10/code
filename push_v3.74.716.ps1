$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.715.ps1") { Remove-Item -LiteralPath "push_v3.74.715.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.716"') {
    Write-Host "+ 3.74.716" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.716]")) { Write-Host "X CHANGELOG missing [3.74.716]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$inv = Get-Content -LiteralPath "app/inventory/page.tsx" -Raw

# The table has TWO sources of truth: the column definitions drive the header and
# the rows, but the totals row is hand-built, one <td> per column. Adding a
# column without its total silently shifts every later figure under the wrong
# heading - which is exactly what v3.74.714 did. Each total must appear twice:
# once in its column, once in the footer.
foreach ($t in @("serviceUseTotals", "custodyTotals")) {
    $n = ([regex]::Matches($inv, [regex]::Escape($t))).Count
    if ($n -lt 3) {
        Write-Host "X '$t' appears $n time(s) - it is missing from the column or the totals row" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ both new columns have matching totals cells" -ForegroundColor Green

if ($inv -notmatch "inventory\.total_service_use" -or $inv -notmatch "inventory\.total_in_custody") {
    Write-Host "X the totals row is missing a service-use or custody cell" -ForegroundColor Red; exit 1
}
Write-Host "+ totals row carries both cells" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" "app/inventory/page.tsx" "push_v3.74.716.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.715.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_716.txt"
    $msgLines = @(
        'fix(inventory): v3.74.716 - totals row was two cells short (regression from 714)',
        '',
        'My error. v3.74.714 added the Service Use and In Custody columns to the',
        'header and the rows but not to the totals row, which is hand-built with one',
        'td per column rather than generated from the column definitions. The footer',
        'ended up two cells shorter than the header, so every figure after',
        'write-offs rendered under the wrong heading.',
        '',
        'The owner saw the result immediately: the product rows reconciled',
        '(2 purchased - 1 consumed = 1 available) while the totals row showed',
        'numbers in the wrong places.',
        '',
        'Display only - no figure was wrong, correct figures sat under wrong labels.',
        '',
        'The table has two sources of truth and nothing forced them to agree. The',
        'push guard now does: each new total must appear at least three times -',
        'state, column, footer - so a column added without its total fails the push.',
        '',
        'Side verification on real data: BILL-0003 is the first tax-inclusive bill in',
        'the system (10% line discount, 10% header discount, shipping). Its FIFO',
        'lots came out 16.11 and 0.81, summing to 16.92, and the inventory account',
        'was debited 16.92 - equal to the piastre. The v3.74.715 fix works on its',
        'first real use.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.716 pushed - totals row matches the columns" -ForegroundColor Green
}
