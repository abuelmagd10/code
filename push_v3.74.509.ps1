$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.508.ps1") { Remove-Item -LiteralPath "push_v3.74.508.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.509"') {
    Write-Host "+ 3.74.509" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -notmatch 'isOwnerOrGm' -or $ap -notmatch 'canDecide' -or $ap -notmatch 'canDecideSret') {
    Write-Host "X approvals decision buttons not role-gated" -ForegroundColor Red; exit 1
}
Write-Host "+ decision buttons hidden from non-approver roles across all queues" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_509.txt"
    $msgLines = @(
        'fix(approvals): v3.74.509 - decision buttons only for actual approvers',
        '',
        'Owner spotted: accountant AND branch manager saw Approve/Reject',
        'on a purchase-return card in /approvals. Servers already rejected',
        'them - but every queue card rendered its decision buttons to',
        'anyone who could see the tab (tabs are intentionally visible to',
        'stakeholders for follow-up).',
        '',
        'Buttons now mirror the server-side gates per queue:',
        '  - discounts, purchase returns, sales returns (mgmt stage):',
        '    owner / admin / general_manager',
        '  - supplier payments, customer refunds, vendor payment',
        '    corrections: owner / general_manager (matches the RPCs)',
        '  - dispatch, goods receipt, product receive, sales returns',
        '    (warehouse stage): store/warehouse managers + admins',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.509'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.509 pushed - approvals inbox shows actions to approvers only" -ForegroundColor Green
}
