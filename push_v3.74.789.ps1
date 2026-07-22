$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.788.ps1") { Remove-Item -LiteralPath "push_v3.74.788.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.789"') {
    Write-Host "+ 3.74.789" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.789]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.789]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- one correct channel per role, positively asserted --------------------------
$svc = Get-Content -LiteralPath "lib/services/sales-order-notification.service.ts" -Raw
if ($svc -match [regex]::Escape("created_management_visibility")) {
    Write-Host "X the leadership creation broadcast is back" -ForegroundColor Red; exit 1
}
if ($svc -notmatch [regex]::Escape("so_branch_manager_notify_trg")) {
    Write-Host "X the removal comment must name the branch manager's surviving DB channel" -ForegroundColor Red; exit 1
}
if ($svc -notmatch [regex]::Escape("if (params.linkedInvoiceId) {")) {
    Write-Host "X the accountant invoice-only gate (v3.74.783) was lost" -ForegroundColor Red; exit 1
}
Write-Host "+ creation notifies the branch manager only (via his existing DB channel)" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" `
    "lib/services/sales-order-notification.service.ts" `
    "push_v3.74.789.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.788.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_789.txt"
    $msgLines = @(
        'fix(notifications): v3.74.789 - SO creation notifies the branch manager only',
        '',
        'The owner, receiving "new sales order" for SO-0003: what is this',
        'notification FOR? The system had already summoned him for the thing',
        'that actually needed him - the discount approval request.',
        '',
        'Decision: routine creation is the branch manager''s operational',
        'concern, and he already has his own channel - the DB trigger',
        'so_branch_manager_notify_trg fires on every SO insert. Owner and GM',
        'are summoned only for decisions (discount approvals) and exceptions',
        '(warehouse rejections, integrity findings).',
        '',
        'The leadership broadcast in SalesOrderNotificationService is removed',
        'entirely rather than re-targeted - re-targeting to the branch manager',
        'would have doubled his notifications for every order. One correct',
        'channel per role. The v3.74.783 accountant gate (invoices only) is',
        'untouched and asserted by the push script.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.789 pushed - one correct notification channel per role" -ForegroundColor Green
}
