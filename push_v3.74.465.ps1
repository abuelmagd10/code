$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.464.ps1") { Remove-Item -LiteralPath "push_v3.74.464.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.465"') {
    Write-Host "+ 3.74.465" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000465_v3_74_465_bill_approval_precedence.sql")) {
    Write-Host "X migration 465 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 465 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BL\. ?HOTFIX') {
    Write-Host "X CONTRACTS.md missing Section BL" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BL" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_465.txt"
    $msgLines = @(
        'fix(gate): v3.74.465 - bill/invoice approval wins over PO/SO in the discount gate',
        '',
        'Owner tested v3.74.464 and reported: the approve button on the',
        'bill view is NOT locked, even though the amendment is pending.',
        '',
        'Root cause: /api/bills/[id]/discount-approval and the invoice',
        'mirror checked the parent PO/SO approval FIRST. Since the PO',
        'was still approved (from the original PO approval), the gate',
        'came back as open regardless of the pending bill-level',
        'amendment approval.',
        '',
        'Fix: swap the order.',
        '   1. Bill-level approval (if any) wins:',
        '      approved -> open, pending -> blocked_pending,',
        '      rejected -> blocked_rejected',
        '   2. PO approval is only the fallback when there is no',
        '      bill-level approval row (fresh auto-created bill).',
        '',
        'Same fix on the sales side (invoice-level over SO).',
        '',
        'Files',
        '   app/api/bills/[id]/discount-approval/route.ts',
        '   app/api/invoices/[id]/discount-approval/route.ts',
        '   supabase/migrations/20260701000465_v3_74_465_bill_approval_precedence.sql',
        '   CONTRACTS.md (Section BL added)',
        '   lib/version.ts -> 3.74.465'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.465 pushed - bill approval wins the gate" -ForegroundColor Green
}
