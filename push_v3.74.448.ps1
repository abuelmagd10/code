$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.447.ps1") { Remove-Item -LiteralPath "push_v3.74.447.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.448"') {
    Write-Host "+ 3.74.448" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AU\. ?HOTFIX تعديل PO') {
    Write-Host "X CONTRACTS.md missing Section AU" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AU" -ForegroundColor Green

$hook = Get-Content -LiteralPath "hooks/use-order-permissions.ts" -Raw
if ($hook -notmatch "document_type', 'purchase_order'") {
    Write-Host "X hook missing purchase_order discount check" -ForegroundColor Red; exit 1
}
if ($hook -notmatch "document_type', 'sales_order'") {
    Write-Host "X hook missing sales_order discount check" -ForegroundColor Red; exit 1
}
Write-Host "+ hook checks discount_approvals for both PO and SO" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_448.txt"
    $msgLines = @(
        'fix(orders): v3.74.448 HOTFIX - allow edit of PO/SO with rejected discount',
        '',
        'Owner caught it during testing. Purchasing officer created a PO',
        'with discount, submitted for approval, discount got rejected.',
        'Notification told the creator "edit the document to reopen the',
        'approval cycle" but the edit page showed "Read-only mode".',
        '',
        'Cause: checkPurchaseOrderPermissions (and the sales equivalent)',
        'only allowed edit when status was draft or rejected. When the',
        'DISCOUNT is rejected the PO stays at pending_approval (the PO',
        'itself was never rejected, only its discount). The creator was',
        'stuck.',
        '',
        'Fix: the hook now checks the latest discount_approval for a PO',
        'or SO in pending_approval. If discount_status is rejected, treat',
        'the document as rejected for edit purposes. Creator can amend',
        'and save. po_evaluate_discount_approval (v3.74.421) opens a new',
        'discount approval cycle automatically on save.',
        '',
        'Why UI-only: the DB triggers from v3.74.425 only lock approved+',
        'documents. pending_approval was never blocked at DB level. The',
        'gate was purely in the client hook.',
        '',
        'Files',
        '   hooks/use-order-permissions.ts',
        '   CONTRACTS.md (Section AU added)',
        '   lib/version.ts -> 3.74.448'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.448 pushed - edit unlocked for rejected-discount case" -ForegroundColor Green
}
