$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.416.ps1") { Remove-Item -LiteralPath "push_v3.74.416.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.417"') {
    Write-Host "+ 3.74.417" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000417_v3_74_417_discount_document_type_enum_values.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @('purchase_order', 'sales_order', 'ADD VALUE IF NOT EXISTS')) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration adds both enum values" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'R\. قيم enum discount_document_type') {
    Write-Host "X CONTRACTS.md missing Section R" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section R" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_417.txt"
    $msgLines = @(
        'hotfix(approvals): v3.74.417 - missing enum values blocked every PO insert',
        '',
        'Owner traced this from the postgres logs while testing a fresh',
        'PO right after the data cleanup. Every attempt failed with',
        'HTTP 400 from /rest/v1/purchase_orders and the postgres log',
        'said:',
        '  ERROR: invalid input value for enum discount_document_type:',
        '         "purchase_order"',
        '',
        'Root cause',
        '  v3.74.401 added po_request_discount_approval_trg, which',
        '  INSERTs into discount_approvals.document_type with the',
        '  literal "purchase_order". v3.74.404 added the parallel',
        '  trigger writing "sales_order". The enum',
        '  public.discount_document_type was never extended; it still',
        '  only carried (booking, sales_invoice, purchase_invoice).',
        '  As soon as the trigger fired on a PO with discount > 0 the',
        '  whole INSERT INTO purchase_orders rolled back.',
        '',
        'Fix',
        '  ALTER TYPE public.discount_document_type',
        '    ADD VALUE IF NOT EXISTS purchase_order;',
        '  ALTER TYPE public.discount_document_type',
        '    ADD VALUE IF NOT EXISTS sales_order;',
        '  Both applied to the live DB via Supabase MCP. Idempotent.',
        '',
        'Baseline (Section R)',
        '  assert_baseline now enumerates pg_enum for',
        '  discount_document_type and fails the migration if any of',
        '  (booking, sales_invoice, purchase_invoice, purchase_order,',
        '  sales_order) is missing. Same gap cannot reopen silently.',
        '',
        'Files',
        '  supabase/migrations/20260630000417_v3_74_417_discount_document_type_enum_values.sql',
        '  CONTRACTS.md (Section R added)',
        '  lib/version.ts -> 3.74.417'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.417 pushed - PO + SO inserts unblocked" -ForegroundColor Green
    Write-Host "  Test: purchasing officer creates a new PO with a discount; should now succeed." -ForegroundColor Cyan
}
