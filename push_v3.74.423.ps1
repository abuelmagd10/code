$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.422.ps1") { Remove-Item -LiteralPath "push_v3.74.422.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.423"') {
    Write-Host "+ 3.74.423" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000423_v3_74_423_cancel_discount_on_doc_status.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 423 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'W\. ?إلغاء اعتماد الخصم تلقائياً') {
    Write-Host "X CONTRACTS.md missing Section W" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section W" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_423.txt"
    $msgLines = @(
        'fix(approvals): v3.74.423 - auto-cancel pending discount when parent doc is rejected',
        '',
        'Owner rejected PO-0001 directly without acting on its discount',
        'approval first. PO status moved to rejected but the discount',
        'approval stayed pending, so the /approvals page kept showing',
        'an Approve/Reject card for a dead document.',
        '',
        'Two new triggers fix this:',
        '   po_cancel_discount_on_status on purchase_orders',
        '   so_cancel_discount_on_status on sales_orders',
        '',
        'AFTER UPDATE OF status: when the new status is rejected or',
        'cancelled and actually changed, every pending discount_approval',
        'row for that document moves to cancelled with an Arabic',
        'decision_note. Approved and rejected discount rows are left',
        'untouched for audit.',
        '',
        'A one-shot UPDATE in the migration catches up any pre-existing',
        'stale rows (PO-0001 in particular).',
        '',
        'Re-open path still works: if the user reverts the PO back to',
        'draft, po_evaluate_discount_approval (Section U) opens a new',
        'pending row automatically.',
        '',
        'Baseline (Section W)',
        '   po_cancel_discount_on_status_trg + so_cancel_discount_on_status_trg',
        '     functions exist and reference both rejected and cancelled',
        '   triggers po_cancel_discount_on_status + so_cancel_discount_on_status present',
        '',
        'Files',
        '   supabase/migrations/20260630000423_v3_74_423_cancel_discount_on_doc_status.sql',
        '   CONTRACTS.md (Section W added)',
        '   lib/version.ts -> 3.74.423'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.423 pushed - rejected docs auto-cancel pending discount approvals" -ForegroundColor Green
}
