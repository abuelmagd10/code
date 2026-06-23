$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.309.ps1") { Remove-Item -LiteralPath "push_v3.74.309.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.310"') {
    Write-Host "+ 3.74.310" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ep = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts" -Raw

# تأكد إن area اتشال من الـ select الفعلى
if ($ep -match '\.select\([^)]*\barea\b') {
    Write-Host "X customers.area still in select - will fail again" -ForegroundColor Red; exit 1
}
# تأكد من الـ select الجديد
if ($ep -notmatch '\.select\("name, phone, address, city, country"\)') {
    Write-Host "X customer select line missing or modified" -ForegroundColor Red; exit 1
}
if ($ep -notmatch 'v3\.74\.310 — dropped `area`') {
    Write-Host "X v3.74.310 marker comment missing" -ForegroundColor Red; exit 1
}
Write-Host "+ approve+shipping route: customer select fixed (area removed)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_310.txt"
    $msgLines = @(
        'fix(shipping): v3.74.310 - drop non-existent customers.area column',
        '',
        'Root cause for "تعذّر إنشاء الشحنة فى bosta - الفاتورة غير موجودة"',
        'reported on the new "اعتماد + إرسال" button. v3.74.308 split the',
        'single embedded-relationship select into three queries so the',
        'real Supabase error would bubble up, and on the next attempt the',
        'failure dialog showed exactly what was wrong:',
        '',
        '  "تعذر تحميل بيانات العميل (column customers.area does not exist)"',
        '',
        'The customers table on this project only has',
        '  name, phone, address, city, country',
        '',
        'I had included `area` in the original v3.74.305 select on a',
        'guess — it''s present in some other ERP schemas but not here.',
        'Dropped it from the select; address + city already give Bosta',
        'enough information for the Egyptian delivery zones.',
        '',
        'No behavior change beyond fixing the failing query. The',
        'createShipment payload never referenced `area` so the Bosta',
        'side is unaffected.',
        '',
        'Files',
        '  app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts',
        '  lib/version.ts -> 3.74.310'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.310 pushed" -ForegroundColor Green
}
