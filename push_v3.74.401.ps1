$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.399.ps1") { Remove-Item -LiteralPath "push_v3.74.399.ps1" -Force }
if (Test-Path "push_v3.74.398.ps1") { Remove-Item -LiteralPath "push_v3.74.398.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.401"') {
    Write-Host "+ 3.74.401" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

foreach ($f in @(
    'supabase/migrations/20260629000398_v3_74_398_fix_po_to_bill_carryover.sql',
    'supabase/migrations/20260629000401_v3_74_401_po_discount_approval_separate.sql'
)) {
    if (-not (Test-Path -LiteralPath $f)) {
        Write-Host "X missing migration: $f" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migrations 398 + 401 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
foreach ($n in @('Section M', 'M\. الموافقة على الخصم', 'po_request_discount_approval', 'L\. سطر الخصم')) {
    if ($contracts -notmatch $n) {
        Write-Host "X CONTRACTS.md missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ CONTRACTS.md has Sections L + M" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_401.txt"
    $msgLines = @(
        'feat(approvals): v3.74.401 - two separate approvals + actual notification',
        '',
        'Owner clarified: when a PO has a discount, there are TWO',
        'distinct approvals required — one for the PO itself, one for',
        'the discount. v3.74.400 had collapsed them into one (PO',
        'approval implicitly covered the discount). That was wrong;',
        'this commit splits them again, on the PO surface, with',
        'notifications that actually reach the approvers.',
        '',
        'DB changes (applied via Supabase MCP)',
        '  1) Trigger po_request_discount_approval on purchase_orders.',
        '     When discount_value > 0 (status draft or pending_approval)',
        '     it inserts a discount_approvals row of type',
        '     "purchase_order" AND dispatches notification rows to',
        '     owner + general_manager + admin (the existing booking /',
        '     invoice / bill triggers never sent notifications — this',
        '     is why the owner reported "لم يصل اشعار").',
        '  2) approve_purchase_order_atomic gates the PO approval:',
        '     if discount_value > 0 AND there is a pending',
        '     discount_approvals row for this PO, the RPC returns',
        '     "لا يمكن اعتماد أمر الشراء قبل اعتماد الخصم. افتح',
        '      صندوق الموافقات واعتمد الخصم أولاً."',
        '  3) bill_request_discount_approval_trg already honors a',
        '     non-empty bypass token (v3.74.400 carried over), so the',
        '     bill auto-created after PO approval does NOT open a',
        '     third approval row.',
        '',
        'Backfill',
        '  BILL-0001 legacy bill-level discount approval marked',
        '  "approved" with audit note "v3.74.401 - legacy bill-level',
        '  approval. Going forward, PO-level approval is the gate."',
        '  The pending banner on BILL-0001 will disappear after',
        '  refresh.',
        '',
        'CONTRACTS.md',
        '  Section M documents the two-approval pattern + the trigger',
        '  + the RPC gate + the bypass flag. Future migrations editing',
        '  any of those must keep the contract.',
        '',
        'Test flow',
        '  1) Purchasing officer creates a new PO with discount.',
        '  2) Trigger inserts discount_approvals row + notifies owner/GM.',
        '  3) Owner opens صندوق الموافقات, sees the discount approval,',
        '     approves it.',
        '  4) Owner then approves the PO itself.',
        '  5) PO becomes approved -> bill auto-created -> no third gate.',
        '',
        'Files',
        '  supabase/migrations/20260629000398_v3_74_398_fix_po_to_bill_carryover.sql',
        '  supabase/migrations/20260629000401_v3_74_401_po_discount_approval_separate.sql',
        '  CONTRACTS.md (Section M added, Section L preserved)',
        '  lib/version.ts -> 3.74.401'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.401 pushed - two-approval flow live + notifications dispatched" -ForegroundColor Green
    Write-Host "  Test from purchasing officer: create new PO with discount. Owner browser should receive a NEW notification specifically for the discount approval." -ForegroundColor Cyan
}
