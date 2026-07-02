$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.504.ps1") { Remove-Item -LiteralPath "push_v3.74.504.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.505"') {
    Write-Host "+ 3.74.505" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$wf = Get-Content -LiteralPath "lib/services/bill-receipt-workflow.service.ts" -Raw
if ($wf -match '"owner", "manager"' -or $wf -match 'SUBMISSION_ROLES[^\n]*"manager"') {
    Write-Host "X workflow service still grants branch manager execution" -ForegroundColor Red; exit 1
}
if ($wf -notmatch '"owner", "general_manager"') {
    Write-Host "X ADMIN_APPROVAL_ROLES missing general_manager fix" -ForegroundColor Red; exit 1
}

$srr = Get-Content -LiteralPath "lib/sales-return-requests.ts" -Raw
if ($srr -match "APPROVER_ROLES = \[[^\]]*'manager'") {
    Write-Host "X sales return approvers still include branch manager" -ForegroundColor Red; exit 1
}

$billPage = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($billPage -notmatch 'permReturn') {
    Write-Host "X bills page return buttons not permission-gated" -ForegroundColor Red; exit 1
}

$banking = Get-Content -LiteralPath "app/banking/page.tsx" -Raw
if ($banking -match 'role === "manager"') {
    Write-Host "X banking page still grants branch manager execution" -ForegroundColor Red; exit 1
}
Write-Host "+ branch manager is view-only: bills approve/submit, sales returns, banking, return buttons" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_505.txt"
    $msgLines = @(
        'fix(governance): v3.74.505 - branch manager is a VIEW-ONLY role',
        '',
        'Owner spec: the branch manager (role key "manager") observes his',
        'branch; he never executes. The central company_role_permissions',
        'table already said so (read-only rows), but hardcoded role checks',
        'bypassed it:',
        '',
        '1. bill-receipt-workflow ADMIN_APPROVAL_ROLES was ["owner",',
        '   "manager"] - v3.74.132 comment says the INTENT was owner +',
        '   GENERAL manager. Branch managers could admin-approve bills;',
        '   real general managers were rejected. Fixed to',
        '   ["owner","general_manager"], and the bill page approve button',
        '   now matches (admin removed - it was 403ing server-side anyway).',
        '2. SUBMISSION_ROLES: manager could send bills to the warehouse.',
        '   Removed.',
        '3. SALES_RETURN_LEVEL1_APPROVER_ROLES: manager moved to the',
        '   viewer tier - keeps page + notifications, loses Approve/Reject',
        '   and 403s at the action APIs.',
        '4. bills/[id] partial/full return buttons had NO permission gate',
        '   at all - now behind canAction(purchase_returns, write), so',
        '   accountants keep them and view-only roles do not see them.',
        '5. banking page: manager removed from transfer/deposit sections',
        '   and now branch-scoped like other non-admin roles.',
        '',
        'Data fix (applied in prod): manager/services row had',
        'write/update/delete=true - zeroed. Supplier payment approval was',
        'already safe (DB RPC restricts to owner/general_manager).',
        '',
        'Files',
        '  lib/services/bill-receipt-workflow.service.ts',
        '  lib/sales-return-requests.ts',
        '  app/bills/[id]/page.tsx',
        '  app/banking/page.tsx',
        '  lib/version.ts -> 3.74.505'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.505 pushed - branch manager locked to view-only" -ForegroundColor Green
}
