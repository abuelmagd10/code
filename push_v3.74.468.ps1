$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @('push_v3.74.466.ps1','push_v3.74.467.ps1')) {
    if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.468"') {
    Write-Host "+ 3.74.468" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

foreach ($m in @('20260701000467_v3_74_467_item_trigger_refreshes.sql',
                 '20260701000468_v3_74_468_all_edits_visible.sql')) {
    if (-not (Test-Path "supabase/migrations/$m")) {
        Write-Host "X migration $m missing" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migrations 467 + 468 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BN\. ?item trigger' -or $contracts -notmatch 'BO\. ?DiffCard') {
    Write-Host "X CONTRACTS.md missing Section BN or BO" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Sections BN + BO" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'shipping_tax_rate_snapshot' -or $page -notmatch 'discount_position_snapshot') {
    Write-Host "X approvals page missing new snapshot fields" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page uses new snapshot fields" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_468.txt"
    $msgLines = @(
        'feat(diff): v3.74.467+468 - snapshot always live + DiffCard shows every possible edit (bill + invoice)',
        '',
        'Owner: يعرض اى تعديل - the diff card must surface any change.',
        '',
        'v3.74.467',
        '   bill_item + invoice_item amendment triggers switched from',
        '   cancel-and-reopen to in-place refresh of the pending',
        '   approval snapshots. Fixes the stale items_snapshot bug',
        '   caused by bills being updated before bill_items in the',
        '   same transaction.',
        '   DiffCard: new document-discount row (percent or amount',
        '   before / after). Modified-item entries now list each field',
        '   that changed with values.',
        '',
        'v3.74.468',
        '   Four new snapshot columns on discount_approvals:',
        '     shipping_tax_rate_snapshot',
        '     discount_position_snapshot',
        '     tax_inclusive_snapshot',
        '     supplier_name_snapshot',
        '   All four amendment triggers detect changes on the extra',
        '   fields and capture the new snapshot columns.',
        '   DiffCard shows the extra rows only when they changed:',
        '   shipping tax rate, discount position, tax inclusive, party.',
        '   Modified-item entries also surface tax_rate changes.',
        '   API: /api/discount-approvals returns the new columns and',
        '   joins them into prior_approval too.',
        '',
        'Full parity: every trigger + column + UI change is applied to',
        'both purchase invoices and sales invoices.',
        '',
        'Backfill: BILL-0001 pending approval snapshot recomputed to',
        'reflect the current bill_items state so owner sees the',
        'item-level 10% -> 5% discount change on ماتور.',
        '',
        'Files',
        '   supabase/migrations/20260701000467_v3_74_467_item_trigger_refreshes.sql',
        '   supabase/migrations/20260701000468_v3_74_468_all_edits_visible.sql',
        '   app/api/discount-approvals/route.ts',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Sections BN + BO added)',
        '   lib/version.ts -> 3.74.468'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.468 pushed - every edit is visible, sales matches purchases" -ForegroundColor Green
}
