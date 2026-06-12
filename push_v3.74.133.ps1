$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.132.ps1") { Remove-Item -LiteralPath "push_v3.74.132.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.133"') { Write-Host "+ 3.74.133" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(procurement): v3.74.133 - drop duplicate PO approval notifications

User reported: 'وصل اشعار الى المالك كما ترى مكرر' - the Owner inbox
showed two identical 'طلب موافقة على أمر شراء PO-0002' rows for a
single PO submission.

Root cause: notifyApprovalRequested was fanning out via
resolveLevel1ApproverRecipients which returns owner + admin +
general_manager. The Owner role visually inherits notifications
assigned to admin and general_manager, so the single
'approval requested' event produced 2-3 inbox rows for the same user.

Per v3.74.131, only owner + manager (المالك + المُدير العام) can act
on PO approval. So the dispatch list is now narrowed to match the
approver list - owner (company-wide) + manager (branch-scoped). The
branch-scoped manager block was already there and stays.

Manual cleanup: also deleted the existing duplicate admin /
general_manager rows for the in-flight PO so the user can re-test
right away without seeing the old duplicates." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.133 pushed" -ForegroundColor Green
}
