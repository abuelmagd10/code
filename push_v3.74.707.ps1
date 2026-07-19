$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.706.ps1") { Remove-Item -LiteralPath "push_v3.74.706.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.707"') {
    Write-Host "+ 3.74.707" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.707]")) { Write-Host "X CHANGELOG missing [3.74.707]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$inv = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw

# The request button must carry the service-only wording.
if ($inv -notmatch "طلب إلغاء خدمة") {
    Write-Host "X the request button does not use the service-cancellation wording" -ForegroundColor Red; exit 1
}
Write-Host "+ request button uses the service-cancellation wording" -ForegroundColor Green

# It must be driven by the SAME flag as the direct-return button, not a copy of
# the condition - that is the whole point, so the two cannot drift apart.
$flagUses = ([regex]::Matches($inv, "isServiceOnlyInvoice")).Count
if ($flagUses -lt 4) {
    Write-Host "X expected isServiceOnlyInvoice to drive both buttons (found $flagUses uses)" -ForegroundColor Red; exit 1
}
Write-Host "+ both buttons driven by the same flag ($flagUses uses)" -ForegroundColor Green

# Sold-product invoices must keep the plain wording.
if ($inv -notmatch "'Request Return' : 'طلب مرتجع'") {
    Write-Host "X the plain return wording is gone - product invoices would be mislabelled" -ForegroundColor Red; exit 1
}
Write-Host "+ product invoices keep the plain return wording" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/invoices/[id]/page.tsx" `
    "push_v3.74.707.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.706.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_707.txt"
    $msgLines = @(
        'ui(invoices): v3.74.707 - say "cancel service" when no goods come back',
        '',
        'The owner spotted a Request Return button on a booking invoice holding no',
        'sold goods - every line was material the technician consumed.',
        '',
        'The behaviour was already correct. The button exists for the SERVICE line',
        'itself (reversing revenue and receivable if the service is cancelled), and',
        'consumed materials never return to stock: the v3.74.606 guard excludes',
        'item_type=service lines from return inventory movements. Their cost stays',
        'booked, which is right - the oil was used and is not coming back.',
        '',
        'Only the wording was wrong. The page already knows the invoice is service',
        'only and shows owners and general managers "Cancel Service" (v3.74.610),',
        'but the request path used by branch accountants kept the generic wording,',
        'which reads as if stock were being restocked.',
        '',
        'The request button now reads from the same isServiceOnlyInvoice flag that',
        'drives the direct-return button, so the two cannot drift apart. The flag',
        'is items.every(item_type === service), so a single sold-product line makes',
        'it false and the wording stays "return" - accurate, because that product',
        'really does come back while the consumed materials stay excluded.',
        '',
        'Display text only: no change to logic, inventory movements, journals,',
        'permissions, the approval cycle, or the database.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.707 pushed - service-only invoices say cancel, not return" -ForegroundColor Green
}
