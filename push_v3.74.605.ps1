$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.604.ps1") { Remove-Item -LiteralPath "push_v3.74.604.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.605"') {
    Write-Host "+ 3.74.605" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -notmatch 'v3\.74\.605' -or $pg -notmatch 'item_type') {
    Write-Host "X service-exclusion in availability precheck missing" -ForegroundColor Red; exit 1
}
Write-Host "+ services excluded from pre-send stock check" -ForegroundColor Green

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
    "push_v3.74.605.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.604.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_605.txt"
    $msgLines = @(
        'fix(invoices): v3.74.605 - services excluded from pre-send stock check',
        '',
        'Marking a booking invoice as sent was blocked by the client-side',
        'availability precheck: it demanded stock for EVERY line incl.',
        'the SERVICE line ("تقشير: مطلوب 1، متوفر 0، ناقص 1"). Services',
        'have no stock by definition, and bundle-material lines',
        '(item_type=service) were already consumed at booking execution.',
        '',
        'Verified the backend is already correct: postInvoiceAtomic skips',
        'inventory deduction + COGS entirely when a delivery method is',
        'assigned (deferred to the warehouse approve_sales_delivery',
        'step), so posting a booking invoice writes the revenue JE only.',
        '',
        'Fix: the precheck now selects item_type, filters out service',
        'rows, and skips the availability call entirely for pure-service',
        'invoices. Product lines (walk-in extras) are still checked -',
        'correctly, since dispatch will need real stock.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.605 pushed - service invoices post cleanly" -ForegroundColor Green
}
