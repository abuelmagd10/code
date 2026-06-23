$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.304.ps1") { Remove-Item -LiteralPath "push_v3.74.304.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.305"') {
    Write-Host "+ 3.74.305" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts")) {
    Write-Host "X new approve+shipping API endpoint missing" -ForegroundColor Red; exit 1
}
$ep = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts" -Raw
foreach ($n in @('createShipmentRequest','API_INTEGRATED_PROVIDER_CODES','approveDelivery','shipment_status_logs','provider_create_failed')) {
    if ($ep -notmatch [regex]::Escape($n)) {
        Write-Host "X approve+shipping API missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ approve+shipping API: provider-first ordering wired" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw
foreach ($n in @(
    'handleApproveWithShipping',
    'shippingFailureDialog',
    '/api/invoices/${row.id}/warehouse-approve-with-shipping',
    'اعتماد + إرسال لـ',
    'اعتماد بدون شحنة',
    'فتح منصة'
)) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X dispatch-approvals page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ dispatch-approvals page: new button + failure dialog wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_305.txt"
    $msgLines = @(
        'feat(dispatch): v3.74.305 - "Approve + create shipment" button on Dispatch Approvals',
        '',
        'Closes the loop on the shipping integration. Before this, the',
        'invoice -> warehouse approval flow only deducted stock and posted',
        'the COGS journal entry; it never called the configured shipping',
        'provider, so the shipments table stayed empty and the tracking',
        'card we shipped in v3.74.303-304 had nothing to render.',
        '',
        'The owner asked specifically for an opt-in path: keep the regular',
        'Approve button exactly as it is (it is the project''s stable',
        'happy path), and add a NEW button next to it for API-integrated',
        'providers. New button does the provider call first; if the',
        'provider rejects, the local DB is untouched and the user can fall',
        'back to either the manual Approve button or the provider''s own',
        'dashboard.',
        '',
        'NEW: app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts',
        '  Provider-first ordering, by design:',
        '    1) load invoice + customer + provider',
        '    2) reject if provider isn''t API-integrated',
        '    3) reject if customer name/phone/city/address is missing',
        '       (returns structured "missing" payload so the UI lists',
        '        the exact fields to fix)',
        '    4) call adapter.createShipment(...)',
        '    5) ON FAILURE: return 422 with stage=provider_create_failed.',
        '       Stock + COGS untouched.',
        '    6) ON SUCCESS: insert shipments row + initial',
        '       shipment_status_logs entry, then call the SAME',
        '       SalesInvoiceWarehouseCommandService.approveDelivery that',
        '       /api/invoices/[id]/warehouse-approve uses. Same idempotency',
        '       key, same archive-notifications behavior.',
        '    7) Rare edge case: provider succeeded but approval service',
        '       threw (e.g. stock shortage discovered late). We mark the',
        '       shipment cancelled with error_message so the operator',
        '       sees what happened, and bubble up shortages array so the',
        '       page can show the existing shortage modal.',
        '',
        'CHANGED: app/inventory/dispatch-approvals/page.tsx',
        '  - Extended the invoice SELECT to pull provider id / code /',
        '    auth_type so the page can decide locally whether the new',
        '    button should appear.',
        '  - Added the third button between Approve and Reject. Label is',
        '    dynamic: "اعتماد + إرسال لـ {provider_name}". Shows only',
        '    for bosta / aramex with auth_type set.',
        '  - handleApproveWithShipping(): calls the new endpoint, opens',
        '    a friendly failure dialog when the provider rejects.',
        '  - Failure dialog explains in plain Arabic what happened, lists',
        '    any missing customer fields, reassures the user that stock /',
        '    journals were not touched, and offers three actions:',
        '      * Close',
        '      * Open the provider dashboard (bosta.co / aramex.com)',
        '      * Approve without shipment (calls the existing Approve',
        '        modal — the classic stable path)',
        '',
        'Zero change to the regular Approve / Reject buttons or to any',
        'other approval flow (manufacturing, transfers).',
        '',
        'Files',
        '  app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts (NEW)',
        '  app/inventory/dispatch-approvals/page.tsx',
        '  lib/version.ts -> 3.74.305'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.305 pushed" -ForegroundColor Green
}
