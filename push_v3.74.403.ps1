$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.402.ps1") { Remove-Item -LiteralPath "push_v3.74.402.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.403"') {
    Write-Host "+ 3.74.403" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000403_v3_74_403_tax_code_id_on_sales.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration 403 missing" -ForegroundColor Red; exit 1 }

$wired = @(
    'app/invoices/new/page.tsx',
    'app/invoices/[id]/edit/page.tsx',
    'app/sales-orders/new/page.tsx',
    'app/sales-orders/[id]/edit/page.tsx',
    'app/vendor-credits/new/page.tsx'
)
foreach ($f in $wired) {
    $content = Get-Content -LiteralPath $f -Raw
    if ($content -notmatch 'TaxCodeSelect') {
        Write-Host "X $f missing TaxCodeSelect import" -ForegroundColor Red; exit 1
    }
    if ($content -notmatch 'tax_code_id') {
        Write-Host "X $f missing tax_code_id wiring" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ $($wired.Count) sales forms wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_403.txt"
    $msgLines = @(
        'feat(taxes): v3.74.403 - Stage A sales-module catch-up',
        '',
        'Extends the unified tax dropdown (v3.74.394) to every sales-',
        'side form. Until now invoices, sales orders, and vendor',
        'credits still read tax codes from localStorage, falling back',
        'to a free numeric input when the snapshot was empty - same',
        'bug owner originally hit on purchase orders.',
        '',
        'Schema (applied via Supabase MCP)',
        '  ALTER invoice_items + sales_order_items + vendor_credit_items',
        '        + estimate_items + customer_debit_note_items',
        '    ADD tax_code_id uuid REFERENCES tax_codes(id) ON DELETE SET NULL.',
        '  Indexes on each new column.',
        '',
        'Baseline (Section H expanded)',
        '  - All 7 items tables (purchases + bills + 5 sales-side)',
        '    must carry tax_code_id.',
        '  - Any row linked to a tax_code: tax_rate must equal',
        '    tax_codes.rate (snapshot consistency).',
        '',
        'UI',
        '  app/invoices/new/page.tsx          (desktop + mobile)',
        '  app/invoices/[id]/edit/page.tsx    (desktop + mobile)',
        '  app/sales-orders/new/page.tsx      (desktop + mobile)',
        '  app/sales-orders/[id]/edit/page.tsx (desktop + mobile)',
        '  app/vendor-credits/new/page.tsx',
        '  All wired to <TaxCodeSelect supabase scope="sales" ...> with',
        '  tax_code_id persisted alongside tax_rate on save.',
        '',
        'Next stages (remaining sales-module catch-up)',
        '  Stage B: void_invoice_atomic + UI (mirrors v3.74.402)',
        '  Stage C: SO discount approval + notification (mirrors v3.74.401)',
        '  Stage D: SO -> Invoice carryover (mirrors v3.74.398)',
        '',
        'Files',
        '  supabase/migrations/20260629000403_v3_74_403_tax_code_id_on_sales.sql',
        '  5 sales-side form pages',
        '  CONTRACTS.md (Section H expanded)',
        '  lib/version.ts -> 3.74.403'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.403 pushed - sales tax dropdown unified" -ForegroundColor Green
}
