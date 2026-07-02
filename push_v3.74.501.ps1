$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.500.ps1") { Remove-Item -LiteralPath "push_v3.74.500.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.501"') {
    Write-Host "+ 3.74.501" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$post = Get-Content -LiteralPath "lib/services/sales-invoice-posting-command.service.ts" -Raw
if ($post -notmatch 'pending_approval' -or $post -notmatch 'discount_approvals') {
    Write-Host "X posting service missing v3.74.501 gates" -ForegroundColor Red; exit 1
}

$wh = Get-Content -LiteralPath "lib/services/sales-invoice-warehouse-command.service.ts" -Raw
if ($wh -notmatch 'pending_approval' -or $wh -notmatch 'discount_approvals') {
    Write-Host "X warehouse service missing v3.74.501 gates" -ForegroundColor Red; exit 1
}
Write-Host "+ sales cycle gated: post + goods-issue require admin approval first" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_501.txt"
    $msgLines = @(
        'fix(sales): v3.74.501 - same approval gates as purchases (v3.74.500)',
        '',
        'Owner asked to verify the PO-0001 flaw does not exist on the sales',
        'side. Audit found the SAME class of holes:',
        '',
        '1. postInvoice had NO pending_approval / pending-amendment gate.',
        '   Worse: the isRepost branch (warehouse_status=rejected) force-set',
        '   status=sent and notified the warehouse ("dispatch pending")',
        '   without any check - bypassing a pending amendment approval.',
        '   The inv_block_post_unapproved_discount trigger only fires when',
        '   OLD.status=draft, so pending_approval slipped past it.',
        '',
        '2. approveDelivery (goods issue) had no gate either - bills got',
        '   theirs in v3.74.499, invoices did not.',
        '',
        'Both services now 409 with a clear Arabic message when the invoice',
        'is pending_approval or has a pending discount_approvals row.',
        'Both warehouse-approve routes (plain + with-shipping) share',
        'approveDelivery, so one gate covers both.',
        '',
        'No invoice baseline-loop fix needed: invoices have no',
        'force_reapproval_on_edit trigger comparing original_* snapshots.',
        '',
        'Files',
        '  lib/services/sales-invoice-posting-command.service.ts',
        '  lib/services/sales-invoice-warehouse-command.service.ts',
        '  lib/version.ts -> 3.74.501'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.501 pushed - sales cycle approval sequence enforced" -ForegroundColor Green
}
