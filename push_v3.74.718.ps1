$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.717.ps1") { Remove-Item -LiteralPath "push_v3.74.717.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.718"') {
    Write-Host "+ 3.74.718" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.718]")) { Write-Host "X CHANGELOG missing [3.74.718]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$est = Get-Content -LiteralPath "app/estimates/page.tsx" -Raw

if ($est -match 'DialogContent className="max-w-3xl"') {
    Write-Host "X the estimate dialog is narrow again - eight columns will not fit" -ForegroundColor Red; exit 1
}
Write-Host "+ dialog is wide enough for the line-item row" -ForegroundColor Green

# min-w plus overflow-x is what makes a narrow screen SCROLL instead of crushing
# the columns together. Losing either brings the overlap straight back.
if ($est -notmatch "min-w-\[880px\]" -or $est -notmatch "overflow-x-auto") {
    Write-Host "X the items table would compress instead of scrolling on a narrow screen" -ForegroundColor Red; exit 1
}
Write-Host "+ table scrolls rather than compresses" -ForegroundColor Green

if ($est -notmatch "<colgroup>") {
    Write-Host "X column widths are unspecified - the browser will distribute them at random" -ForegroundColor Red; exit 1
}
Write-Host "+ column widths are defined" -ForegroundColor Green

# The page is RTL; text-left inverted the header alignment.
if ($est -match '<tr className="text-left">') {
    Write-Host "X header row still uses text-left on an RTL page" -ForegroundColor Red; exit 1
}
Write-Host "+ header alignment respects RTL" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "app/estimates/page.tsx" "push_v3.74.718.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.717.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_718.txt"
    $msgLines = @(
        'ui(estimates): v3.74.718 - line-item row was unreadably cramped',
        '',
        'The owner hit this creating a quotation: the headers ran into each other -',
        '"discount %" and "tax %" read as one word - and the number inputs were',
        'clipped mid-digit.',
        '',
        'Four causes together:',
        '- the dialog was max-w-3xl for eight columns of inputs',
        '- no colgroup, so the browser distributed widths arbitrarily',
        '- no cell padding at all, which is why the headers touched',
        '- w-full forced the table to shrink inside the dialog, so the existing',
        '  overflow wrapper never scrolled',
        '',
        'Widened to max-w-5xl, added a colgroup weighted toward product and',
        'description, and set min-w-[880px] with overflow-x-auto so a narrow screen',
        'scrolls instead of compressing. Added cell padding and nowrap headers.',
        '',
        'Two things fixed along the way: the header row used text-left on an RTL',
        'page, so alignment was inverted; and the delete action spelled out the word',
        'in every row, spending a full column on a secondary action - now an icon',
        'with aria-label and title. The totals column is right-aligned with',
        'tabular-nums so digits line up.',
        '',
        'Display only - no change to logic, calculation or data.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.718 pushed - estimate line items are readable" -ForegroundColor Green
}
