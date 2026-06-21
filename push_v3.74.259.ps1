$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.258.ps1") { Remove-Item -LiteralPath "push_v3.74.258.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.259"') {
    Write-Host "+ 3.74.259" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/invoices/route.ts" -Raw
foreach ($c in @("AUTO_SO_ROLES",'sales_orders','sales_order_items','invoiceData.sales_order_id = newSO.id')) {
    if ($api -notmatch [regex]::Escape($c)) { Write-Host "X API missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ /api/invoices auto-creates SO + items when owner/GM skip it" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/invoices/new/page.tsx" -Raw
foreach ($c in @("_canSkipSO","'owner','general_manager'","هيتم إنشاء أمر بيع تلقائياً")) {
    if ($page -notmatch [regex]::Escape($c)) { Write-Host "X /invoices/new missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ /invoices/new makes SO optional for owner/GM with hint" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_259.txt"
    $msgLines = @(
        "feat(invoices): v3.74.259 - owner/GM can create an invoice without a sales order; SO auto-created",
        "",
        "Sales side only in this version. Purchases side (bills) is being",
        "tracked separately because /bills/new + POST /api/bills are both",
        "intentionally disabled in the project today and need their own",
        "fresh form + endpoint.",
        "",
        "What changed",
        "  app/api/invoices/route.ts (POST):",
        "    When body.sales_order_id is missing AND the actor is owner or",
        "    general_manager, the route now creates a sales_orders row +",
        "    sales_order_items mirroring the invoice totals/items, then",
        "    sets invoiceData.sales_order_id to the new id and proceeds.",
        "    Status of the auto-created SO mirrors the invoice status (draft",
        "    on creation; the existing trg_sync_invoice_to_sales_order then",
        "    keeps both rows in step as the invoice moves through sent /",
        "    partially_paid / paid). On items insert failure we delete the",
        "    orphan SO to keep state clean. Normal roles still get the 'SO",
        "    is required' guard.",
        "",
        "  app/invoices/new/page.tsx:",
        "    Reads userContext.role and skips the 'SO required' toast +",
        "    red border + warning when the role is owner or general_manager.",
        "    Replaces the warning with a green hint so the user knows the",
        "    SO will be created automatically.",
        "",
        "What didn't change",
        "  - Normal roles see the original behaviour: SO is still required.",
        "  - SO auto-creation runs only when the invoice is being created;",
        "    we don't touch any existing invoice's sales_order_id.",
        "  - trg_sync_invoice_to_sales_order / trg_sync_sales_order_to_invoice",
        "    keep doing their job; we just let them have a SO to sync with.",
        "",
        "Files",
        "  app/api/invoices/route.ts",
        "  app/invoices/new/page.tsx",
        "  lib/version.ts -> 3.74.259"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.259 pushed" -ForegroundColor Green
}
