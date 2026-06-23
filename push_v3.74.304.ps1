$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.303.ps1") { Remove-Item -LiteralPath "push_v3.74.303.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.304"') {
    Write-Host "+ 3.74.304" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$tp = Get-Content -LiteralPath "app/inventory/third-party/page.tsx" -Raw
foreach ($n in @(
    'shipmentsByInvoice',
    'shipmentStatusMeta',
    'openTrackingDialog',
    'filterShipmentStatus',
    'trackingDialogShipment',
    'useSearchParams',
    'urlInvoiceId',
    'حالة الشحنة',
    'رقم التتبع',
    'كل التحديثات'
)) {
    if ($tp -notmatch [regex]::Escape($n)) {
        Write-Host "X third-party page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ third-party: shipment columns + filter + dialog + URL filter wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_304.txt"
    $msgLines = @(
        'feat(third-party): v3.74.304 - shipment tracking columns + dialog',
        '',
        'Step 2 of the shipment-visibility plan (step 1 was v3.74.303, the',
        'inline card on the invoice page). Re-use the existing Third-Party',
        'Inventory page as the standalone shipment overview, since',
        'conceptually a row in this table IS a package sitting at a',
        'shipping company - the third party.',
        '',
        'app/inventory/third-party/page.tsx',
        '',
        '  Data',
        '    - shipmentsByInvoice: Map<invoice_id, shipment row>. Loaded',
        '      next to the existing third_party_inventory query, so we',
        '      hit the DB once for the shipments and reuse the lookup',
        '      everywhere on the page.',
        '',
        '  Table',
        '    - Two new columns appended after the existing Status column:',
        '        "حالة الشحنة" / Shipment   (hidden md:table-cell)',
        '        "رقم التتبع"  / Tracking   (hidden lg:table-cell)',
        '    - The status cell renders a coloured badge using a shared',
        '      shipmentStatusMeta() helper that maps the 9 internal',
        '      shipment statuses to Arabic + English labels + Tailwind',
        '      classes.',
        '    - The tracking cell renders the tracking number as a',
        '      monospace link to bosta.co/track/<number>.',
        '    - colSpan on the empty / total rows bumped from 11 to 13.',
        '',
        '  Action column',
        '    - Added a Navigation icon button beside the existing',
        '      "view invoice" button. Clicking it opens the new tracking',
        '      dialog for that shipment.',
        '',
        '  Filter bar',
        '    - New "حالة الشحنة" select with 10 options (all, pending,',
        '      created, picked_up, in_transit, out_for_delivery,',
        '      delivered, returned, failed, cancelled). Sits next to the',
        '      existing shipping-company filter.',
        '    - Active-filter count and "clear" button updated.',
        '',
        '  Deep-link filter',
        '    - useSearchParams() reads ?invoice_id=... from the URL. When',
        '      present, filteredItems narrows to that invoice only, so',
        '      clicking the "view full" button on the invoice card lands',
        '      directly on the matching row.',
        '',
        '  Tracking dialog',
        '    - Lazy-loads the full shipment_status_logs for the picked',
        '      shipment (up to 50 entries, newest first).',
        '    - Vertical timeline with dots, dates, location, notes. Same',
        '      visual language as the inline mini-timeline on the invoice',
        '      page so they read as one feature, not two.',
        '',
        'No backend / webhook / schema change.',
        '',
        'Files',
        '  app/inventory/third-party/page.tsx',
        '  lib/version.ts -> 3.74.304'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.304 pushed" -ForegroundColor Green
}
