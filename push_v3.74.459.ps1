$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.458.ps1") { Remove-Item -LiteralPath "push_v3.74.458.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.459"') {
    Write-Host "+ 3.74.459" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260630000459_v3_74_459_sync_no_totals.sql")) {
    Write-Host "X migration 459 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 459 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BF\. ?sync_bill/invoice') {
    Write-Host "X CONTRACTS.md missing Section BF" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BF" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_459.txt"
    $msgLines = @(
        'fix(sync): v3.74.459 - stop mirroring totals from bill/invoice back to PO/SO',
        '',
        'Owner edited a draft bill while testing the v3.74.458 amendment',
        'guard. Save failed with:',
        '  "لا يمكن تعديل الخصم أو الإجماليات على أمر شراء معتمد."',
        '',
        'Root cause: sync_bill_to_purchase_order_safe was writing',
        'NEW.subtotal / tax_amount / total back to the parent PO on',
        'every bill UPDATE. po_protect_approved_trg (v3.74.425) rightly',
        'refuses those changes on an approved PO.',
        '',
        'Architectural fix: the parent PO/SO totals are the baseline the',
        'owner approved. Child edits must not propagate back. Both sync',
        'functions now mirror only:',
        '   status (billing/shipping progress)',
        '   returned_amount / return_status (returns lifecycle)',
        'Removed from the sync: subtotal, tax_amount, total.',
        '',
        'Bill/invoice edits still amend their own totals; v3.74.458',
        'cancels the child-level discount_approval and opens a fresh',
        'cycle. The parent stays as-approved.',
        '',
        'Files',
        '   supabase/migrations/20260630000459_v3_74_459_sync_no_totals.sql',
        '   CONTRACTS.md (Section BF added)',
        '   lib/version.ts -> 3.74.459'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.459 pushed - sync no longer touches PO/SO totals" -ForegroundColor Green
}
