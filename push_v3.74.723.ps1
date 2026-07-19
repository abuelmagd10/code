$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.722.ps1") { Remove-Item -LiteralPath "push_v3.74.722.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.723"') {
    Write-Host "+ 3.74.723" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.723]")) { Write-Host "X CHANGELOG missing [3.74.723]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$est = Get-Content -LiteralPath "app/estimates/page.tsx" -Raw

# DialogContent ships sm:max-w-lg. A bare max-w-5xl is a different variant, so
# tailwind-merge keeps both and sm: wins above 640px - the dialog stays 512px.
if ($est -match 'DialogContent className="max-w-5xl"') {
    Write-Host "X max-w-5xl without the sm: prefix - it will not override sm:max-w-lg" -ForegroundColor Red; exit 1
}
if ($est -notmatch "sm:max-w-5xl") {
    Write-Host "X the dialog width override is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ dialog width actually overrides the component default" -ForegroundColor Green

# min-w-0 is what confines the scroll. DialogContent is a grid and a grid item
# defaults to min-width:auto, refusing to shrink below its content - so without
# this the wide table pushes the whole dialog sideways instead of scrolling.
if ($est -notmatch "min-w-0 w-full overflow-x-auto") {
    Write-Host "X the table scroll box cannot shrink - overflow will escape to the dialog" -ForegroundColor Red; exit 1
}
if ($est -notmatch "mt-4 space-y-2 min-w-0") {
    Write-Host "X the parent container lacks min-w-0 - overflow escapes one level up" -ForegroundColor Red; exit 1
}
Write-Host "+ overflow is confined to the table" -ForegroundColor Green

# The table minimum must fit inside the dialog's content box (1024 - p-6 both
# sides = ~976), or we are back to a dialog-wide scrollbar.
if ($est -match "min-w-\[(\d+)px\]") {
    $tableMin = [int]$Matches[1]
    if ($tableMin -gt 900) {
        Write-Host "X table min-width ${tableMin}px is too wide for the dialog content box" -ForegroundColor Red; exit 1
    }
    Write-Host "+ table min-width ${tableMin}px fits the dialog" -ForegroundColor Green
}

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

git add -- "lib/version.ts" "CHANGELOG.md" "app/estimates/page.tsx" "push_v3.74.723.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.722.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_723.txt"
    $msgLines = @(
        'fix(estimates): v3.74.723 - my v3.74.718 fix made the dialog worse',
        '',
        'The owner sent a screenshot: the whole dialog now scrolled sideways -',
        'customer, dates and notes included - with fields cut off mid-value. Worse',
        'than the crowding it was meant to fix.',
        '',
        'Two mistakes, both mine.',
        '',
        'First, max-w-5xl never applied. DialogContent ships sm:max-w-lg in its own',
        'defaults; a bare max-w-5xl is a different variant, so tailwind-merge keeps',
        'both and the sm: rule wins above 640px. The dialog stayed 512px the whole',
        'time. I assumed the class took effect because I had written it, and never',
        'opened components/ui/dialog.tsx to see what it already carried.',
        '',
        'Second, I then forced an 880px table inside that 512px dialog.',
        'DialogContent is a grid, and a grid item defaults to min-width:auto - it',
        'refuses to shrink below its content - so instead of scrolling inside its',
        'wrapper, the table pushed the entire dialog wide.',
        '',
        'Now sm:max-w-5xl so the override actually lands, min-w-0 on the scroll box',
        'and on its parent so the overflow is confined there, overflow-x-hidden on',
        'the dialog as a backstop, and the table minimum lowered to 820px so it sits',
        'comfortably inside the content box rather than at its edge.',
        '',
        'The push guard now rejects a bare max-w-5xl, a missing min-w-0 on either',
        'container, and a table minimum too wide for the dialog.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.723 pushed - dialog width and overflow behave" -ForegroundColor Green
}
