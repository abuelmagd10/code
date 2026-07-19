$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.713.ps1") { Remove-Item -LiteralPath "push_v3.74.713.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.714"') {
    Write-Host "+ 3.74.714" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.714]")) { Write-Host "X CHANGELOG missing [3.74.714]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$inv = Get-Content -LiteralPath "app/inventory/page.tsx" -Raw

# Every movement type that leaves the warehouse must land in a bucket, or the
# row stops reconciling: stock changes while no column explains it.
foreach ($t in @("service_consumption", "booking_custody_out", "booking_custody_return")) {
    if ($inv -notmatch [regex]::Escape($t)) {
        Write-Host "X the inventory breakdown has no bucket for '$t'" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ service consumption and custody are categorised" -ForegroundColor Green

if ($inv -notmatch "serviceUseTotals" -or $inv -notmatch "custodyTotals") {
    Write-Host "X the new columns are not wired to state" -ForegroundColor Red; exit 1
}
Write-Host "+ both columns wired" -ForegroundColor Green

# Custody must be signed, not absolute: out minus return is what is still held.
# Math.abs here would make a returned custody look permanently outstanding.
if ($inv -match "custodyAgg\[pid\] = \(custodyAgg\[pid\] \|\| 0\) \+ Math\.abs\(q\)") {
    Write-Host "X custody is summed with Math.abs - returned custody would never clear" -ForegroundColor Red; exit 1
}
Write-Host "+ custody nets out to zero on return" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "app/inventory/page.tsx" "push_v3.74.714.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.713.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_714.txt"
    $msgLines = @(
        'fix(inventory): v3.74.714 - the stock table did not reconcile with itself',
        '',
        'Spotted by the owner on BKG-2026-00006: a product row read "purchases 1,',
        'sales 0, no returns, no write-offs, no transfers" and then "available 0".',
        'The arithmetic did not close and there was no way to find out where the',
        'unit went.',
        '',
        'The movement classifier is an if/else chain covering purchase, sale,',
        'write_off, sale_return and purchase_return. The types introduced by the',
        'booking and custody model - service_consumption, booking_custody_out and',
        'booking_custody_return - fall through every branch. They were counted in',
        'the stock total, which sums all movements regardless of type, but landed',
        'in no column. The balance was right; the breakdown just did not lead to it.',
        '',
        'Two columns close the equation:',
        '',
        '- Service Use: materials consumed performing a service. Gone for good like',
        '  a sale, but not a sale - there is no revenue against it - so folding it',
        '  into the sales column would have been wrong.',
        '- In Custody: summed SIGNED, not absolute. Out is negative, return is',
        '  positive, so the figure is what a technician still physically holds, and',
        '  it clears to zero on execution or return. Kept separate from consumption',
        '  because that stock is still owned - it left the shelf, it was not used up.',
        '',
        'Verified against the booking: oil - purchases 1, service use 1, custody 0',
        '(one out, one back) - available 0. The row now explains itself.',
        '',
        'Display only: no change to any movement, journal or balance. The numbers',
        'were already correct; they are now legible.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.714 pushed - the stock breakdown reconciles" -ForegroundColor Green
}
