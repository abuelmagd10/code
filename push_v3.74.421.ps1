$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.420.ps1") { Remove-Item -LiteralPath "push_v3.74.420.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.421"') {
    Write-Host "+ 3.74.421" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000421_v3_74_421_aggregate_line_doc_discounts.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 421 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'U\. ?تجميع خصم البنود') {
    Write-Host "X CONTRACTS.md missing Section U" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section U" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_421.txt"
    $msgLines = @(
        'feat(approvals): v3.74.421 - aggregate line + document discounts',
        '',
        'Closes a bypass: a purchasing officer could put 50% discount on',
        'every line, leave the document discount at 0, and the approval',
        'trigger never fired. Same gap was present on sales_orders.',
        '',
        'po_evaluate_discount_approval and so_evaluate_discount_approval',
        'now compute the effective total discount across all lines and',
        'the document and open one approval row with the sum. Edits',
        'anywhere (lines or document) re-trigger the evaluator: it',
        'cancels and re-opens or cancels when total returns to 0.',
        '',
        'New triggers',
        '   po_item_request_discount_approval on purchase_order_items',
        '   so_item_request_discount_approval on sales_order_items',
        '',
        'approve_purchase_order_atomic (v3.74.419) already reads this',
        'row to block approval on pending/rejected, so the gate extends',
        'to the new aggregated case without a code change.',
        '',
        'Baseline (Section U)',
        '   po_evaluate_discount_approval body references',
        '     purchase_order_items + ''approval_request''',
        '   so_evaluate_discount_approval body references',
        '     sales_order_items + ''approval_request''',
        '   triggers po_item_request_discount_approval +',
        '     so_item_request_discount_approval present',
        '',
        'Files',
        '   supabase/migrations/20260630000421_v3_74_421_aggregate_line_doc_discounts.sql',
        '   CONTRACTS.md (Section U added)',
        '   lib/version.ts -> 3.74.421'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.421 pushed - line+doc discount aggregation live" -ForegroundColor Green
}
