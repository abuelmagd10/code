$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.405.ps1") { Remove-Item -LiteralPath "push_v3.74.405.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.406"') {
    Write-Host "+ 3.74.406" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

foreach ($f in @(
    'supabase/migrations/20260629000406_v3_74_406_void_invoice_atomic.sql',
    'app/api/invoices/[id]/void/route.ts'
)) {
    if (-not (Test-Path -LiteralPath $f)) {
        Write-Host "X missing: $f" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration + API route present" -ForegroundColor Green

$detail = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
foreach ($n in @('handleVoid', '/api/invoices/${encodeURIComponent(invoice.id)}/void', 'v3.74.406')) {
    if ($detail -notmatch [regex]::Escape($n)) {
        Write-Host "X detail page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ invoices/[id]/page.tsx wired to handleVoid" -ForegroundColor Green

$list = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
if ($list -match '/api/invoices/\$\{id\}/delete') {
    Write-Host "X list page still calls /delete" -ForegroundColor Red; exit 1
}
if ($list -notmatch '/api/invoices/\$\{encodeURIComponent\(id\)\}/void') {
    Write-Host "X list page does not call /void" -ForegroundColor Red; exit 1
}
Write-Host "+ invoices/page.tsx routes through /void" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'P\. إلغاء فاتورة المبيعات') {
    Write-Host "X CONTRACTS.md missing Section P" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section P" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_406.txt"
    $msgLines = @(
        'feat(invoices): v3.74.406 - sales invoice void + SO unlink',
        '',
        'Owner asked what happens to linked orders when a bill is',
        'voided, and confirmed sales invoices should get the same',
        'treatment. v3.74.402 covered purchases; this commit mirrors',
        'it on sales.',
        '',
        'DB (applied via Supabase MCP)',
        '  ALTER invoices ADD voided_by / voided_at / voided_reason.',
        '  void_invoice_atomic(invoice_id, user_id, company_id, reason):',
        '    * gate: status=draft + no payments + no JE + no inventory',
        '    * roles: owner / admin / general_manager / accountant',
        '    * sets invoices.status=voided + voided_by/at/reason',
        '    * cancels pending discount_approvals on the invoice',
        '    * clears sales_orders.invoice_id (SO status unchanged',
        '      because SO has no approval workflow today)',
        '    * audit_logs row with action=VOID',
        '  Section P added to assert_baseline (mirrors Section N).',
        '',
        'API',
        '  app/api/invoices/[id]/void/route.ts -> calls void_invoice_atomic',
        '',
        'UI',
        '  app/invoices/[id]/page.tsx - new Void button + AlertDialog,',
        '    visible only when status=draft and permDelete is true.',
        '  app/invoices/page.tsx - handleDelete now POSTs to /void',
        '    instead of /delete; confirm dialog text updated to "إلغاء',
        '    الفاتورة" with the SO-unlink explanation.',
        '',
        'Files',
        '  supabase/migrations/20260629000406_v3_74_406_void_invoice_atomic.sql',
        '  app/api/invoices/[id]/void/route.ts',
        '  app/invoices/[id]/page.tsx',
        '  app/invoices/page.tsx',
        '  CONTRACTS.md (Section P added)',
        '  lib/version.ts -> 3.74.406'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.406 pushed - sales invoice void live" -ForegroundColor Green
}
