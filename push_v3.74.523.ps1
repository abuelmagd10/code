$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.522.ps1") { Remove-Item -LiteralPath "push_v3.74.522.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.523"') {
    Write-Host "+ 3.74.523" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw

# Guard 1: allocations batch must be present
if ($ap -notmatch 'from\("payment_allocations"\)') {
    Write-Host "X approvals not batch-fetching payment_allocations" -ForegroundColor Red
    exit 1
}
Write-Host "+ payment_allocations batch present" -ForegroundColor Green

# Guard 2: bill select must now include purchase_order_id AND be scoped by allocBillIds
# (formatted across multiple lines, so check the two pieces independently)
if ($ap -notmatch 'select\("id, bill_number, total_amount, paid_amount, currency_code, purchase_order_id"\)') {
    Write-Host "X bills select missing purchase_order_id" -ForegroundColor Red
    exit 1
}
if ($ap -notmatch '\.in\("id", allocBillIds\)') {
    Write-Host "X bills select not scoped to allocBillIds" -ForegroundColor Red
    exit 1
}
Write-Host "+ bills select includes purchase_order_id, scoped by allocBillIds" -ForegroundColor Green

# Guard 3: purchase_orders lookup must be present
if ($ap -notmatch 'from\("purchase_orders"\)\.select\("id, po_number"\)') {
    Write-Host "X purchase_orders batch missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ purchase_orders batch present" -ForegroundColor Green

# Guard 4: card must render PO number
if ($ap -notmatch 'أمر شراء') {
    Write-Host "X card missing PO label" -ForegroundColor Red
    exit 1
}
Write-Host "+ PO label rendered on card" -ForegroundColor Green

# Guard 5: multi-allocation hint
if ($ap -notmatch 'فاتورة أخرى') {
    Write-Host "X multi-allocation hint missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ multi-allocation hint present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_523.txt"
    $msgLines = @(
        'fix(approvals): v3.74.523 - read bill link from payment_allocations, not payments.bill_id',
        '',
        'The card said "on-account (no bill)" for a payment that the',
        '/payments page correctly listed as tied to BILL-0001 / PO-0001.',
        'Root cause: payments.bill_id is NULL for allocated payments in',
        'this app. The real link is in the payment_allocations table',
        '(payment_id, bill_id, invoice_id, allocated_amount). Bill.PO',
        'lives on bills.purchase_order_id, not on payments.',
        '',
        'Loader now:',
        '  1. Batch-fetches payment_allocations for these payments',
        '  2. Folds the discovered bill_ids into the bills batch',
        '  3. Batch-fetches purchase_orders for the bills PO ids',
        '  4. Picks the "primary" allocation = largest allocated_amount',
        '  5. Carries allocation_count so the card can flag splits',
        '',
        'Card now shows:',
        '  🧾 BILL-0001 · 📄 PO-0001 (+ "+N فاتورة أخرى" if multi)',
        'The "on-account" label is now reserved for payments with ZERO',
        'allocations, i.e. real advances / open-balance settlements.',
        '',
        'Files',
        '  app/approvals/page.tsx (interface + loader + card)',
        '  supabase/migrations/20260703000523_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.523'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.523 pushed - bill + PO now surfaced via allocations" -ForegroundColor Green
}
