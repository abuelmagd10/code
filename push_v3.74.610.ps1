$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.609.ps1") { Remove-Item -LiteralPath "push_v3.74.609.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.610"') {
    Write-Host "+ 3.74.610" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -notmatch 'isServiceOnlyInvoice' -or $pg -notmatch 'إلغاء الخدمة') {
    Write-Host "X service-cancel label missing" -ForegroundColor Red; exit 1
}
Write-Host "+ service-only invoices show 'Cancel Service' label" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "app/invoices/[id]/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.610.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.609.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_610.txt"
    $msgLines = @(
        'feat(returns): v3.74.610 - service-only invoices label the button "Cancel Service"',
        '',
        'Owner-approved cosmetic refinement closing the service-invoice',
        'returns design: the SAME full-return engine (owner/GM express',
        'lane, service lines never restock per v3.74.606, revenue',
        'reversal + customer credit for paid amounts) is presented on',
        'PURE-SERVICE invoices as "إلغاء الخدمة / Cancel Service" -',
        'matching the user mental model: nothing physical comes back,',
        'purely a financial reversal. Mixed/product invoices keep',
        '"Full Return". isServiceOnlyInvoice = every line item_type =',
        'service.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.610 pushed - service invoices speak the user's language" -ForegroundColor Green
}
