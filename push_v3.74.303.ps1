$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.302.ps1") { Remove-Item -LiteralPath "push_v3.74.302.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.303"') {
    Write-Host "+ 3.74.303" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$inv = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
foreach ($n in @(
    'shipmentStatusLogs',
    'from("shipment_status_logs")',
    'Shipment Tracking',
    'تتبع الشحنة',
    'inventory/third-party?invoice_id=',
    'آخر التحديثات'
)) {
    if ($inv -notmatch [regex]::Escape($n)) {
        Write-Host "X invoice page missing: $n" -ForegroundColor Red; exit 1
    }
}
if ($inv -match "/shipments/\$\{existingShipment.id\}") {
    Write-Host "X invoice page still links to /shipments/[id] (404)" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice page: shipment tracking card + fixed broken /shipments link" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_303.txt"
    $msgLines = @(
        'feat(invoice): v3.74.303 - shipment tracking card on the invoice page',
        '',
        'Owner asked where shipment webhook updates ("picked up / in',
        'transit / delivered / returned") actually surface in the UI.',
        'Truthfully: nowhere. The webhook /api/shipping/webhook/[provider]',
        'wrote status changes into shipment_status_logs, and the invoice',
        'screen had a "View Shipment" button pointing at /shipments/{id}',
        '- a route that does not exist, so the link was a 404.',
        '',
        'Step 1 of the planned fix (the dedicated /inventory/third-party',
        'enhancement comes next). Embed a tracking card inline in the',
        'invoice page so the owner sees status without leaving the screen.',
        '',
        'app/invoices/[id]/page.tsx',
        '  - State: shipmentStatusLogs[] (last 5 events).',
        '  - Load them inside the existing loadInvoice() after the',
        '    shipment row resolves, ordered desc by created_at.',
        '  - Render a new Card just before the Payments table:',
        '      header: Truck icon + "تتبع الشحنة" + colored status',
        '              badge for the current internal_status, plus a',
        '              "عرض كامل" button pointing at',
        '              /inventory/third-party?invoice_id=<this>',
        '      meta:   shipment_number, tracking_number (linkable to',
        '              bosta.co/track/<number>), carrier name',
        '      timeline: vertical, newest first, dot+date+optional',
        '              location/notes. Empty-state copy explains that',
        '              the carrier will push updates over time.',
        '  - Replaced the broken /shipments/{id} link on the legacy',
        '    "View Shipment" button with /inventory/third-party?invoice_id=',
        '    so clicking it now actually lands somewhere useful.',
        '',
        'The webhook handler, the shipments / shipment_status_logs',
        'schema, and the dispatch-approval flow all stay unchanged.',
        '',
        'Files',
        '  app/invoices/[id]/page.tsx',
        '  lib/version.ts -> 3.74.303'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.303 pushed" -ForegroundColor Green
}
