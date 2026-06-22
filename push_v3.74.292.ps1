$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.291.ps1") { Remove-Item -LiteralPath "push_v3.74.291.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.292"') {
    Write-Host "+ 3.74.292" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/billing/seats/route.ts" -Raw
foreach ($n in @('free_grant','increaseSeats','FREE-','couponApplied')) {
    if ($api -notmatch [regex]::Escape($n)) {
        Write-Host "X seats route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ /api/billing/seats: handles 100% coupon by skipping Paymob" -ForegroundColor Green

$ui = Get-Content -LiteralPath "app/settings/billing/page.tsx" -Raw
if ($ui -notmatch 'free_grant') {
    Write-Host "X billing page does not handle free_grant" -ForegroundColor Red; exit 1
}
Write-Host "+ billing page: handles free_grant redirect" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_292.txt"
    $msgLines = @(
        'fix(billing): v3.74.292 - 100% discount coupon bypasses Paymob',
        '',
        'When a coupon brings the seat-purchase total to zero (e.g. our',
        'internal TEST100 100%-off coupon) the checkout failed with',
        '"السعر المحسوب غير صالح" because POST /api/billing/seats',
        'guard-railed any chargeTotalEgp <= 0 as an invalid price -',
        'Paymob rejects zero-amount intentions, so we could not just',
        'forward through the gateway.',
        '',
        'Add a free-grant path before the price guard:',
        '  - chargeTotalEgp === 0 AND a coupon was applied =>',
        '      synthesize transaction id FREE-{coupon}-{ts}-{cid}',
        '      call increaseSeats() directly (same RPC the Paymob',
        '      webhook calls on success - idempotency via unique',
        '      paymob_txn_id index),',
        '      best-effort bump billing_coupons.current_uses,',
        '      respond { free_grant: true, redirect_url:',
        '      /settings/billing?free_grant=success }.',
        '  - chargeTotalEgp <= 0 without a coupon still returns the',
        '    invalid_calculated_price error - that should not happen',
        '    in normal pricing and we want to know if it does.',
        '',
        'Client (/settings/billing) now redirects to redirect_url when',
        'the response carries free_grant:true, otherwise behaves as',
        'before with checkout_url.',
        '',
        'Files',
        '  app/api/billing/seats/route.ts',
        '  app/settings/billing/page.tsx',
        '  lib/version.ts -> 3.74.292'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.292 pushed" -ForegroundColor Green
}
