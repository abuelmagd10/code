$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.573"') { Write-Host "+ 3.74.573" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_573.txt"
    $msgLines = @(
        'feat(bookings): v3.74.573 - bundle system + walk-in extras backend',
        '',
        'Two parallel tables tracked "products used in a service" but only',
        'service_products was wired to complete_booking_atomic while the',
        'Bundle Items settings screen wrote to product_bundle_items.',
        'Bundles saved via the UI never applied to real bookings.',
        '',
        'Fix (DDL applied via mcp__apply_migration, doc-stamped here)',
        '  * booking_bundle_selections + booking_extra_items tables',
        '    with RLS + editable-only-when-not-completed guard.',
        '  * get_booking_line_additions() canonical view: mandatory',
        '    bundle children auto-included, optional children opted-in,',
        '    walk-in extras. Applies price_handling + auto_deduct_inventory.',
        '  * complete_booking_atomic() rewritten: iterates the view,',
        '    inserts one invoice_item per row, deducts inventory,',
        '    recomputes totals + booking status.',
        '',
        'UI panels (optional-bundle checklist + walk-in editor) come',
        'in a follow-up client-side change.',
        '',
        'Files',
        '  supabase/migrations/20260706000573_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.573'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.573 pushed" -ForegroundColor Green }
