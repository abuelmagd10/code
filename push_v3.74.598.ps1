$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.596.ps1") { Remove-Item -LiteralPath "push_v3.74.596.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.598"') {
    Write-Host "+ 3.74.598" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$ship = Get-Content -LiteralPath "app/settings/shipping/page.tsx" -Raw
if ($ship -notmatch "branch_outlet") {
    Write-Host "X settings/shipping outlet handling missing" -ForegroundColor Red; exit 1
}
$api = Get-Content -LiteralPath "app/api/shipping-providers/route.ts" -Raw
if ($api -notmatch "v3\.74\.598" -and $api -notmatch "global") {
    Write-Host "X shipping-providers API role scoping missing" -ForegroundColor Red; exit 1
}
$inv = Get-Content -LiteralPath "app/invoices/new/page.tsx" -Raw
if ($inv -notmatch "ومنافذ البيع") {
    Write-Host "X invoices/new label rename missing" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260710000597_v3_74_597_branch_outlets_auto.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ branch outlets + role-scoped delivery lists markers present" -ForegroundColor Green

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
    "app/settings/shipping/page.tsx" `
    "app/api/shipping-providers/route.ts" `
    "app/invoices/new/page.tsx" `
    "app/invoices/[id]/page.tsx" `
    "app/invoices/[id]/edit/page.tsx" `
    "app/sales-orders/new/page.tsx" `
    "app/sales-orders/[id]/edit/page.tsx" `
    "supabase/migrations/20260710000597_v3_74_597_branch_outlets_auto.sql" `
    "lib/version.ts" `
    "push_v3.74.598.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.596.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_598.txt"
    $msgLines = @(
        'feat(shipping): v3.74.598 - auto branch outlets + role-scoped delivery lists',
        '',
        'Owner design: settings/shipping creates EXTERNAL couriers (and',
        'optional internal courier) only; per-branch sales outlets are',
        'AUTOMATIC. Selection fields in sales modules renamed to',
        '"Shipping Company & Sales Outlets" (AR/EN).',
        '',
        'DB (migrations v3_74_597 + 597b, already live via MCP):',
        '- outlet per branch (code branch_outlet), auto on branch insert',
        '  (covers the auto main branch of new companies), name-synced on',
        '  rename, deactivated with branch, UNDELETABLE; existing manual',
        '  outlet adopted; generic v3.74.596 pickup retired after',
        '  re-stamping draft invoices',
        '- provider visibility now PER PROVIDER: unmapped = global to all',
        '  branches; mapped = its branches only',
        '- booking invoices stamp their own branch outlet',
        '',
        'UI + API:',
        '- settings/shipping: updated how-to docs, automatic-outlet badge,',
        '  delete hidden + name/code locked for outlets, optional',
        '  branch-link field on courier create/edit (single-branch model)',
        '- /api/shipping-providers + the 4 sales forms + shipment dialog:',
        '  owner/admin/GM see all active providers; other roles see their',
        '  branch outlet + branch-linked couriers + global couriers;',
        '  inactive excluded everywhere',
        '- purchase-orders/bills deliberately untouched (label stays',
        '  "Shipping Company")'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.598 pushed - branch outlets model live" -ForegroundColor Green
}
