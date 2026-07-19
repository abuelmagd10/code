$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.716.ps1") { Remove-Item -LiteralPath "push_v3.74.716.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.717"') {
    Write-Host "+ 3.74.717" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.717]")) { Write-Host "X CHANGELOG missing [3.74.717]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/services/payment-approval-notification.service.ts" -Raw

# The trigger's copy carries reference_type 'approval_request' and no event_key,
# so the event_key-based archive never reached it and it stayed live with
# approve/reject buttons after the payment was already decided.
if ($svc -notmatch '"reference_type", "approval_request"') {
    Write-Host "X the service no longer retires the DB-trigger notification copy" -ForegroundColor Red; exit 1
}
Write-Host "+ trigger copy is retired alongside the service copy" -ForegroundColor Green

# It must run on BOTH the request and the decision path - archiveApprovalNotifications
# is called from each, which is why the cleanup lives inside it rather than beside
# one call site.
if ($svc -notmatch "archiveApprovalNotifications") {
    Write-Host "X archiveApprovalNotifications is gone - the cleanup would only cover one path" -ForegroundColor Red; exit 1
}
Write-Host "+ cleanup sits inside the shared archive routine" -ForegroundColor Green

# Losing the early return would skip the legacy cleanup whenever there was
# nothing of our own to archive - exactly the first-request case.
if ($svc -match "if \(ids\.length === 0\) return\s*\r?\n\s*const \{ error: updateError \}") {
    Write-Host "X early return still short-circuits before the legacy cleanup" -ForegroundColor Red; exit 1
}
Write-Host "+ legacy cleanup runs even when nothing of ours needs archiving" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "lib/services/payment-approval-notification.service.ts" `
    "push_v3.74.717.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.716.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_717.txt"
    $msgLines = @(
        'fix(notifications): v3.74.717 - one payment approval produced two notices, one of which never closed',
        '',
        'The owner reported two notifications for the same payment approval. In',
        'v3.74.691 I assumed duplication and was wrong - those two opened different',
        'pages for two different approvals - so this time the destination was',
        'checked first.',
        '',
        'They do differ: payment_approval opens /payments, approval_request opens',
        '/approvals. But unlike the purchase-order case, both pages approve the SAME',
        'single payment. Same reference id, same category, same recipient, one',
        'action. Two layers announce it: this service (role-targeted, with an',
        'event_key) and a database trigger on payments (user-targeted, no event_key).',
        '',
        'The lingering half mattered more than the duplication. The archive step',
        'filters on reference_type=payment_approval AND a known event_key, and the',
        'trigger copy has neither, so it was never closed. After approving, it',
        'stayed unread with live approve/reject buttons pointing at an',
        'already-approved payment. Six had accumulated.',
        '',
        'The trigger is kept, not dropped: it is the only notifier if a supplier',
        'payment ever reaches pending_approval outside this service. Since it fires',
        'on insert and the service runs afterwards, its copy already exists and is',
        'retired by the service, leaving exactly one live notification per approval.',
        '',
        'The cleanup lives inside archiveApprovalNotifications, which both the',
        'request and the decision path already call, so one change covers both. The',
        'early return was moved so the cleanup still runs when there is nothing of',
        'our own to archive - the first-request case.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.717 pushed - one live notification per approval" -ForegroundColor Green
}
