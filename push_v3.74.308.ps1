$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.307.ps1") { Remove-Item -LiteralPath "push_v3.74.307.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.308"') {
    Write-Host "+ 3.74.308" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ep = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts" -Raw
foreach ($n in @(
    'v3.74.308 — split the load into 3 separate queries',
    'stage: "load_provider"',
    'stage: "load_customer"',
    '[warehouse-approve-with-shipping] load_invoice'
)) {
    if ($ep -notmatch [regex]::Escape($n)) {
        Write-Host "X approve+shipping route missing: $n" -ForegroundColor Red; exit 1
    }
}
# تأكد إن الـ embedded relationships القديمة اتشالت من الـ select الفعلى
# (الـ pattern بيلتقط استخدام داخل .select(`...`) فقط، مش التعليقات)
if ($ep -match '\.select\([^)]*customers!invoices_customer_id_fkey') {
    Write-Host "X old embedded customers relationship still used in select" -ForegroundColor Red; exit 1
}
if ($ep -match '\.select\([^)]*shipping_providers:shipping_provider_id\(\*\)') {
    Write-Host "X old embedded shipping_providers relationship still used in select" -ForegroundColor Red; exit 1
}
Write-Host "+ approve+shipping route: 3-query load with per-stage diagnostics" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_308.txt"
    $msgLines = @(
        'fix(shipping): v3.74.308 - real error reason for "invoice not found"',
        '',
        'Owner saw "تعذّر إنشاء الشحنة فى bosta - الفاتورة غير موجودة"',
        'while testing the new "اعتماد + إرسال" button against an actual',
        'pending invoice that DOES exist. The endpoint was reporting',
        'stage=load_invoice because PostgREST''s single-query embedded-',
        'relationship select was failing silently (stale schema cache /',
        'RLS on a joined table / any join-time hiccup), and the route',
        'collapsed every failure mode into the same generic message.',
        '',
        'Change',
        '  Split the single query with embedded relationships',
        '    invoices ⤵ customers!fkey, shipping_providers:fkey',
        '  into three sequential queries, each with its own per-stage',
        '  error payload:',
        '    - load_invoice    (status 404, includes the actual error)',
        '    - load_provider   (status 400, includes the actual error)',
        '    - load_customer   (status 400, includes the actual error)',
        '',
        '  Also: added a console.error on load_invoice for the server',
        '  logs, and a debug field on the 404 response so the operator',
        '  sees the invoiceId / companyId / underlying error string in',
        '  the failure dialog. We can pinpoint the real cause on the',
        '  next attempt instead of guessing.',
        '',
        'No behavioral change on the success path. Idempotency key,',
        'provider ordering, archive logic — all untouched.',
        '',
        'Files',
        '  app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts',
        '  lib/version.ts -> 3.74.308'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.308 pushed" -ForegroundColor Green
}
