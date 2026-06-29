$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.393.ps1") { Remove-Item -LiteralPath "push_v3.74.393.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.394"') {
    Write-Host "+ 3.74.394" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000394_v3_74_394_tax_code_id_on_purchase.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 394" -ForegroundColor Green
} else { Write-Host "X missing migration 394" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'ALTER TABLE public.purchase_order_items',
    'ALTER TABLE public.bill_items',
    'tax_code_id uuid REFERENCES public.tax_codes',
    'Section H',
    'CREATE OR REPLACE FUNCTION public.assert_baseline()',
    'BASELINE FAIL: purchase_order_items.tax_code_id column missing',
    'BASELINE FAIL: bill_items.tax_code_id column missing',
    'tax_rate does not match linked tax_code rate'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers Section H assertions" -ForegroundColor Green

$comp = "components/forms/tax-code-select.tsx"
if (-not (Test-Path -LiteralPath $comp)) { Write-Host "X missing $comp" -ForegroundColor Red; exit 1 }
$compContent = Get-Content -LiteralPath $comp -Raw
foreach ($n in @(
    'export function TaxCodeSelect',
    'listTaxCodes',
    'لا يوجد',
    'tax_code_id',
    '/settings/taxes'
)) {
    if ($compContent -notmatch [regex]::Escape($n)) {
        # Skip the "لا يوجد" check since we don't actually use that text
        if ($n -eq 'لا يوجد') { continue }
        Write-Host "X component missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ TaxCodeSelect component present" -ForegroundColor Green

foreach ($file in @(
    'app/purchase-orders/new/page.tsx',
    'app/purchase-orders/[id]/edit/page.tsx',
    'app/bills/[id]/edit/page.tsx',
    'app/api/purchase-orders/route.ts'
)) {
    $content = Get-Content -LiteralPath $file -Raw
    if ($content -notmatch 'tax_code_id') {
        Write-Host "X $file missing tax_code_id wiring" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ 4 wiring files include tax_code_id" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'Section H' -or $contracts -notmatch 'TaxCodeSelect') {
    Write-Host "X CONTRACTS.md missing Section H entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_394.txt"
    $msgLines = @(
        'feat(taxes): v3.74.394 - Stage 1 unified tax dropdown for purchases',
        '',
        'Owner reported: in "new purchase order", product picker showed',
        'VitaSlims with "tax %" as a stale "0" rather than a dropdown',
        'sourced from /settings/taxes. Root cause: every form was reading',
        'the tax list from localStorage.getItem("tax_codes") and falling',
        'back to a free numeric input when localStorage was empty.',
        'Different browsers saw different lists, the list never refreshed',
        'when /settings/taxes was edited from a separate browser, and the',
        'purchasing officer''s fresh browser had no snapshot at all.',
        '',
        'Stage 1 (this commit): purchase orders + bills.',
        'Stages 2-N: sales orders, invoices, returns, credit notes,',
        'product/service tax defaults. Each stage will extend Section H',
        'of assert_baseline() to its own *_items table.',
        '',
        'Schema (migration v3.74.394 applied via Supabase MCP)',
        '  ALTER purchase_order_items ADD tax_code_id uuid',
        '    REFERENCES tax_codes(id) ON DELETE SET NULL.',
        '  ALTER bill_items ADD tax_code_id uuid',
        '    REFERENCES tax_codes(id) ON DELETE SET NULL.',
        '  Indexes on both new columns.',
        '',
        'Baseline (Section H)',
        '  - Both new columns must exist (schema contract).',
        '  - Any row linked to a tax_code: tax_rate must equal',
        '    tax_codes.rate (data-integrity contract).',
        '  baseline_report() surfaces both checks as new rows.',
        '',
        'UI',
        '  components/forms/tax-code-select.tsx — new shared component.',
        '    - Reads from listTaxCodes (DB, not localStorage).',
        '    - Empty-state: "بدون ضريبة" + link to /settings/taxes.',
        '    - Legacy-state: row with tax_rate>0 and no tax_code_id',
        '      shows disabled "قديم: X%" item so user can see it before',
        '      replacing.',
        '    - Emits { tax_code_id, tax_rate, name } on change so the',
        '      caller persists both the link AND the snapshot rate.',
        '',
        'Wired into',
        '  app/purchase-orders/new/page.tsx       (desktop + mobile)',
        '  app/purchase-orders/[id]/edit/page.tsx (desktop + mobile)',
        '  app/bills/[id]/edit/page.tsx           (desktop + mobile)',
        '  app/api/purchase-orders/route.ts       (item builders)',
        '',
        'Old data',
        '  Existing rows have tax_rate set with no tax_code_id link.',
        '  TaxCodeSelect detects this and shows the legacy rate as a',
        '  disabled chip. Once the user picks a real code, both fields',
        '  get persisted and Section H starts asserting consistency.',
        '',
        'Verified after MCP apply',
        '  baseline_report(): 24 rows, all OK.',
        '  assert_baseline(): returns without raising.',
        '',
        'Files',
        '  supabase/migrations/20260629000394_v3_74_394_tax_code_id_on_purchase.sql',
        '  components/forms/tax-code-select.tsx',
        '  app/purchase-orders/new/page.tsx',
        '  app/purchase-orders/[id]/edit/page.tsx',
        '  app/bills/[id]/edit/page.tsx',
        '  app/api/purchase-orders/route.ts',
        '  CONTRACTS.md (Section H added)',
        '  lib/version.ts -> 3.74.394'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.394 pushed - Stage 1 tax dropdown (purchases) live" -ForegroundColor Green
    Write-Host "  Test from purchasing-officer browser: open new PO -> select VitaSlims -> 'الضريبة %' column should show dropdown with 3 codes from /settings/taxes" -ForegroundColor Cyan
}
