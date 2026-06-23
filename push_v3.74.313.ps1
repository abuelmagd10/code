$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.312.ps1") { Remove-Item -LiteralPath "push_v3.74.312.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.313"') {
    Write-Host "+ 3.74.313" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw

if ($page -notmatch [regex]::Escape('اعتماد (التسجيل يدوي بموقع ${shippingFailureDialog.providerName})')) {
    Write-Host "X new Arabic button label missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch [regex]::Escape('Approve (manual entry on ${shippingFailureDialog.providerName})')) {
    Write-Host "X new English button label missing" -ForegroundColor Red; exit 1
}
# الاسم القديم لازم يكون اتشال (مع السماح إنه يفضل فى التعليقات)
if ($page -match "appLang === 'en' \? 'Approve without shipment' : 'اعتماد بدون شحنة'") {
    Write-Host "X old button label still used" -ForegroundColor Red; exit 1
}
Write-Host "+ button label updated to include provider name" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_313.txt"
    $msgLines = @(
        'ux(dispatch): v3.74.313 - clearer fallback button label naming the carrier',
        '',
        'Owner pointed out that "اعتماد بدون شحنة" did not tell the',
        'storekeeper what to do next - what does "without shipment" mean,',
        'and how does the package actually get shipped after this?',
        '',
        'Renamed the fallback button in the shipping-failure dialog to',
        'spell out the responsibility:',
        '  Arabic: "اعتماد (التسجيل يدوي بموقع bosta)"',
        '  English: "Approve (manual entry on bosta)"',
        '',
        'The carrier name is interpolated from shippingFailureDialog.',
        'providerName, so the same string works for aramex, dhl, or any',
        'future API-integrated provider - the operator always sees the',
        'exact dashboard they need to open.',
        '',
        'Behavior is unchanged: clicking the button still closes the',
        'failure dialog and routes to the regular approve modal',
        '(handleActionClick(row, "approve")). Only the label changed.',
        '',
        'Files',
        '  app/inventory/dispatch-approvals/page.tsx',
        '  lib/version.ts -> 3.74.313'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.313 pushed" -ForegroundColor Green
}
