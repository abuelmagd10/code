$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.419.ps1") { Remove-Item -LiteralPath "push_v3.74.419.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.420"') {
    Write-Host "+ 3.74.420" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000420_v3_74_420_redirect_discount_notifications.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 420 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'T\. ?تجربة اعتماد PO \+ توجيه إشعار الخصم') {
    Write-Host "X CONTRACTS.md missing Section T" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section T" -ForegroundColor Green

$poView = Get-Content -LiteralPath "app/purchase-orders/[id]/page.tsx" -Raw
if ($poView -notmatch 'discountApproval') {
    Write-Host "X PO view page missing discountApproval state" -ForegroundColor Red; exit 1
}
if ($poView -notmatch '/approvals\?highlight=') {
    Write-Host "X PO view page missing /approvals?highlight= link" -ForegroundColor Red; exit 1
}
if ($poView -notmatch 'blockedByDiscount') {
    Write-Host "X PO view page missing blockedByDiscount gating" -ForegroundColor Red; exit 1
}
Write-Host "+ PO view page wired up correctly" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_420.txt"
    $msgLines = @(
        'feat(approvals): v3.74.420 - PO approval UX + discount notification routing',
        '',
        '1) Discount-approval-request notifications now route to the central',
        '   approvals page. The po/so_request_discount_approval triggers',
        '   used to emit reference_type=purchase_order/sales_order so the',
        '   bell click sent the approver to the document. They now emit',
        '   reference_type=approval_request + the discount_approval row id',
        '   so the routing map sends them to /approvals?highlight=<id>.',
        '   Decision notifications still route to the document so the',
        '   requester lands where they can edit / re-submit.',
        '',
        '2) Purchase order view page now shows a discount-status banner',
        '   when discount_value > 0:',
        '   - pending  yellow + link to /approvals',
        '   - rejected red + reason + link to /edit',
        '   POs without a discount (discount_value = 0 or null) show no',
        '   banner at all and behave exactly as before.',
        '',
        '3) Approve button on the PO view is now disabled while the',
        '   linked discount approval is pending or rejected, with an',
        '   Arabic tooltip explaining why. Reject button stays enabled.',
        '   POs without a discount keep the button enabled normally.',
        '',
        'Baseline (Section T)',
        '   - po_request_discount_approval_trg body contains ''approval_request''',
        '   - so_request_discount_approval_trg body contains ''approval_request''',
        '',
        'Files',
        '   supabase/migrations/20260630000420_v3_74_420_redirect_discount_notifications.sql',
        '   app/purchase-orders/[id]/page.tsx',
        '   CONTRACTS.md (Section T added)',
        '   lib/version.ts -> 3.74.420'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.420 pushed - discount approval UX wired up" -ForegroundColor Green
}
