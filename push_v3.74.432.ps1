$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.431.ps1") { Remove-Item -LiteralPath "push_v3.74.431.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.432"') {
    Write-Host "+ 3.74.432" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AF\. ?إصلاح focus textarea رفض الخصم') {
    Write-Host "X CONTRACTS.md missing Section AF" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AF" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch 'const DiscountApprovalCard = \(\{ d, ctx \}') {
    Write-Host "X DiscountApprovalCard not at module level" -ForegroundColor Red; exit 1
}
Write-Host "+ DiscountApprovalCard hoisted to module level" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_432.txt"
    $msgLines = @(
        'fix(approvals): v3.74.432 - hoist DiscountApprovalCard to module level',
        '',
        'Reject textarea on the approvals page accepted only one',
        'character at a time and then lost focus. Cause: the card',
        'was a function defined inside ApprovalsContent. Each',
        'keystroke -> parent re-render -> new function identity ->',
        'React unmounts the subtree -> textarea DOM node is replaced',
        '-> focus is gone.',
        '',
        'Fix: move DiscountApprovalCard out of ApprovalsContent to',
        'module-level. Stable identity, React preserves the subtree,',
        'textarea keeps focus across keystrokes.',
        '',
        'Closure values (t, appLang, fmtMoney, rejectId, rejectReason,',
        'setRejectReason, runningId, handleApprove, handleReject, ...)',
        'are passed via a single ctx prop to keep the call site clean.',
        '',
        'Same pattern is still present in the manufacturing cards',
        '(BomCard, RoutingCard, MaterialIssueCard, ProductionOrderCard);',
        'fix them only if the same bug appears there.',
        '',
        'Files',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section AF added)',
        '   lib/version.ts -> 3.74.432'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.432 pushed - reject textarea keeps focus" -ForegroundColor Green
}
