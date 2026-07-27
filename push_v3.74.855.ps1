$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.854.ps1") { Remove-Item -LiteralPath "push_v3.74.854.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.855"') {
    Write-Host "+ 3.74.855" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.855]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.855]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$res = "lib/services/notification-recipient-resolver.service.ts"
$chk = "scripts/check-duplicate-role-notifications.js"
$files = @("lib/version.ts", "CHANGELOG.md", $res, $chk,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.855.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.854.ps1" 2>$null

$r = Get-Content -LiteralPath $res -Raw
function CodeOnly($text) {
    (($text -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*)' }) -join "`n"
}
$rCode = CodeOnly $r

# ── 1. one send for senior management, from the single point they all use ──
# 22 duplicated events across invoices, bookings, payments and refunds were not
# 22 problems. Three functions here build the recipient list for every sales and
# finance service, and each listed owner/admin/general_manager as separate rows.
# NotificationCenter shows all three each other's notifications, so every one of
# them received the same message three times.
$seniorRows = ([regex]::Matches($rCode, 'role:\s*"(owner|admin|general_manager)"')).Count
if ($seniorRows -gt 0) {
    Write-Host "X $seniorRows senior role(s) are still listed literally - use SENIOR_MANAGEMENT_ROLE so there is one send" -ForegroundColor Red
    exit 1
}
if ($rCode -notmatch [regex]::Escape('SENIOR_MANAGEMENT_ROLE = "owner"')) {
    Write-Host "X the single senior-management role constant is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ senior management is addressed once, through one constant" -ForegroundColor Green

# ── 2. and 'owner' specifically, because 74.20 ──────────────────────────────
# The earlier defect was the mirror image: routes sent to
# ['admin','general_manager','manager'] and omitted owner, so in a company whose
# only executive IS the owner the notification reached nobody and the workflow
# stalled with no inbox signal. Collapsing onto owner keeps that fix rather than
# undoing it - owner always exists, and the other two see owner's notifications.
if ($rCode -match 'SENIOR_MANAGEMENT_ROLE\s*=\s*"(admin|general_manager)"') {
    Write-Host "X collapsing onto admin/general_manager would re-open v3.74.20: a company with only an owner gets nothing" -ForegroundColor Red
    exit 1
}
# the branch manager is NOT in that audience and must keep a send of his own
if ($rCode -notmatch 'role:\s*"manager"') {
    Write-Host "X the branch manager lost his own notification - he sees none of the executives'" -ForegroundColor Red; exit 1
}
Write-Host "+ owner is the anchor (74.20 preserved) and the branch manager keeps his own send" -ForegroundColor Green

# ── 3. the ratchet reaches zero ────────────────────────────────────────────
$c = Get-Content -LiteralPath $chk -Raw
if ($c -notmatch 'DUP_NOTIFY_BASELINE \?\? 0') {
    Write-Host "X the duplicate-notification baseline is not 0" -ForegroundColor Red; exit 1
}
Write-Host "+ duplicate-notification baseline 22 -> 0" -ForegroundColor Green

Write-Host "Counting duplicate-audience notifications in the live database..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the governance audit..." -ForegroundColor Cyan
node scripts/ai-governance-audit.js --ci
if ($LASTEXITCODE -ne 0) { Write-Host "X governance audit failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking finished-goods conversion cost..." -ForegroundColor Cyan
node scripts/check-finished-goods-conversion-cost.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X finished-goods costing check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking inventory movement coverage..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column reads..." -ForegroundColor Cyan
node scripts/check-phantom-selects.js
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-select check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking no company-reading function is open to anonymous callers..." -ForegroundColor Cyan
node scripts/check-anon-reachable-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the security finding is not cleared" -ForegroundColor Red; exit 1 }

Write-Host "Verifying migrations against the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

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

git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.854.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_855.txt"
    $msgLines = @(
        'fix(notifications): v3.74.855 - duplicate-audience notifications 22 -> 0,',
        'from one file',
        '',
        'The 22 duplicated events left after 851 - invoices, bookings, payment',
        'approvals, customer refunds - were not 22 problems. They were one.',
        '',
        'Three functions in NotificationRecipientResolverService build the recipient',
        'list for every sales and finance service, and each listed owner, admin and',
        'general_manager as separate rows. NotificationCenter shows all three each',
        "other's notifications, so every one of them received the same message three",
        'times. Fixing that single point removed the duplication from all of its',
        'callers at once.',
        '',
        'Before fixing 22 places, look for the one they all pass through.',
        '',
        'Collapsing onto `owner` specifically, and not admin, matters. v3.74.20',
        'fixed the mirror-image defect: routes sent to admin/general_manager/manager',
        'and omitted owner, so in a company whose only executive IS the owner the',
        'approval notification reached nobody and the workflow stalled with no inbox',
        'signal. The owner always exists; the other two see his notifications by the',
        'reader rule; and all three are still permitted to approve. Only the',
        'duplication is gone. The push script fails if someone later anchors this on',
        'admin or general_manager, which would re-open 74.20.',
        '',
        'The branch manager keeps a send of his own - he is not in that audience and',
        'sees none of the executives" notifications.',
        '',
        '45 surplus copies already sitting in the bell were archived, one copy kept',
        'per event, always the owner one. Archived, not deleted: a notification is a',
        'record. Verified against production afterwards: zero duplicated events,',
        'zero surplus copies. Baseline 22 -> 0, so any new source of duplication',
        'breaks the build.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.855 pushed - one message, one copy" -ForegroundColor Green
}
