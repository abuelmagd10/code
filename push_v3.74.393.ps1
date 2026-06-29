$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.392.ps1") { Remove-Item -LiteralPath "push_v3.74.392.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.393"') {
    Write-Host "+ 3.74.393" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000393_v3_74_393_inventory_column_consistency.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 393" -ForegroundColor Green
} else { Write-Host "X missing migration 393" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    "UPDATE products",
    "36babbef-e709-4848-b1a8-535a79dc9d1d",
    'CREATE OR REPLACE FUNCTION public.assert_baseline()',
    'CREATE OR REPLACE FUNCTION public.baseline_report()',
    'v_drift_cnt',
    'inventory_drift',
    'BASELINE inventory drift',
    'quantity_on_hand IS DISTINCT FROM',
    'BASELINE OK: all contracts intact'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration includes VitaSlims fix + Section G check" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch [regex]::Escape("G. اتساق عمود quantity_on_hand")) {
    Write-Host "X CONTRACTS.md missing Section G" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated with Section G" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_393.txt"
    $msgLines = @(
        'fix(inventory): v3.74.393 - stale VitaSlims qty + Section G check',
        '',
        'Owner observed: purchasing officer opened "new purchase order",',
        'product picker showed "VitaSlims contains 4". But the ledger',
        'was empty:',
        '  inventory_transactions    : 0 rows',
        '  fifo_cost_lots            : 0 rows',
        '  cogs_transactions         : 0 rows',
        '  bill_items / PO items     : 0 rows',
        '  GL inventory account net  : 0',
        '',
        'The 4 was a stale value on products.quantity_on_hand only -',
        'no backing in any ledger. Probably a leftover from before we',
        'enforced "every inventory movement must produce an inventory_',
        'transactions row + JE", or a residue from an earlier test-data',
        'cleanup that truncated ledgers but skipped this column.',
        '',
        'Fix (data)',
        '  UPDATE products SET quantity_on_hand = 0',
        '   WHERE id = 36babbef-e709-... (VitaSlims).',
        '  Scoped the UPDATE with IS DISTINCT FROM 0 so re-running the',
        '  migration is a no-op once corrected.',
        '',
        'Prevention (Section G on assert_baseline)',
        '  New assertion block: any physical product whose quantity_',
        '  on_hand differs from sum(inventory_transactions.quantity_',
        '  change) raises EXCEPTION. baseline_report() surfaces the',
        '  same drifts as rows for diagnostics.',
        '',
        '  This means: next time a stale column value sneaks in, the',
        '  very next migration that runs assert_baseline() refuses to',
        '  proceed until somebody explains the drift. The exact bug',
        '  the owner caught manually today gets caught automatically',
        '  going forward.',
        '',
        'Initial run on live DB',
        '  baseline_report(): 22 rows, all OK (Section G found 0',
        '  drifts after the UPDATE).',
        '  assert_baseline(): returns without raising.',
        '',
        'Files',
        '  supabase/migrations/20260629000393_v3_74_393_inventory_column_consistency.sql',
        '  CONTRACTS.md       -> added Section G',
        '  lib/version.ts     -> 3.74.393',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.',
        '  baseline_report + assert_baseline both verified green.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.393 pushed - VitaSlims fixed + inventory drift check live" -ForegroundColor Green
}
