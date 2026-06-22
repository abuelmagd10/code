$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.271.ps1") { Remove-Item -LiteralPath "push_v3.74.271.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.272"') {
    Write-Host "+ 3.74.272" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bill = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($bill -notmatch [regex]::Escape('{bill && (')) {
    Write-Host "X guard wrapper missing" -ForegroundColor Red; exit 1
}
Write-Host "+ trailing Dialogs are wrapped in `{bill && (..)}` so JSX inside them is not evaluated when bill is null" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_272.txt"
    $msgLines = @(
        'fix(bills): v3.74.272 - bill detail still crashed with `paid_amount` null',
        '',
        'After v3.74.271 (.maybeSingle everywhere) the bill detail page',
        'still threw TypeError: Cannot read properties of null (reading',
        'paid_amount) when navigating to a bill that exists but has been',
        'lazily loaded.',
        '',
        'Root cause: four Dialog components live AFTER </main>, outside',
        'the ternary that guards on `bill`. One of them (the pre-receipt',
        'refund dialog) reads (bill as any).paid_amount inside its JSX.',
        'Radix UI Dialog defers mounting via a portal but the JSX',
        'expressions inside the Dialog tree are still evaluated by',
        'Reacts reconciler before that decision is made - so when bill',
        'is null, accessing .paid_amount blows up the whole page.',
        '',
        'Fix: wrap the four trailing Dialogs in `{bill && (<>...</>)}`',
        'so the JSX inside them is never evaluated when bill is null.',
        'When the user opens a valid bill, the dialogs behave exactly',
        'as before.',
        '',
        'Files',
        '  app/bills/[id]/page.tsx',
        '  lib/version.ts -> 3.74.272'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.272 pushed" -ForegroundColor Green
}
