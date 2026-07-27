$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.850.ps1") { Remove-Item -LiteralPath "push_v3.74.850.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.851"') {
    Write-Host "+ 3.74.851" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.851]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.851]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$req = "app/api/manufacturing/production-orders/[id]/request-material-issue/route.ts"
$mga = "app/api/manufacturing/material-issue-approvals/[id]/management-approve/route.ts"

$files = @("lib/version.ts", "CHANGELOG.md", $req,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.851.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.850.ps1" 2>$null

$r = Get-Content -LiteralPath $req -Raw
$m = Get-Content -LiteralPath $mga -Raw
function CodeOnly($text) {
    (($text -split "`n") | Where-Object { $_.TrimStart() -notmatch '^(//|\*|/\*)' }) -join "`n"
}
$rCode = CodeOnly $r

# ── 1. stage 1 must notify the people who hold the button ──────────────────
# The request is created as `pending`, which means AWAITING MANAGEMENT. The
# warehouse cannot act yet, so telling them "requires your approval" sends them
# to a screen with no button and leaves the decision-makers unaware.
if ($rCode -match 'notifyWarehouseStaff') {
    Write-Host "X the request stage still notifies warehouse staff - they cannot act until management approves" -ForegroundColor Red; exit 1
}
foreach ($role in @("admin", "owner", "general_manager", "manager")) {
    if ($rCode -notmatch ('"' + $role + '"')) {
        Write-Host "X the request stage does not notify the '$role' role" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the request notifies management, not the warehouse" -ForegroundColor Green

# ── 2. the notified roles must MATCH the roles the approver route accepts ──
# Otherwise someone is invited to act and then refused, or holds the power and
# never hears about it. Both halves are read from the code, not assumed.
$mgmtLine = ($m -split "`n" | Where-Object { $_ -match 'const MANAGEMENT_ROLES' } | Select-Object -First 1)
if (-not $mgmtLine) {
    Write-Host "X could not find MANAGEMENT_ROLES in the approver route" -ForegroundColor Red; exit 1
}
foreach ($role in @("admin", "owner", "general_manager", "manager")) {
    if ($mgmtLine -notmatch $role) {
        Write-Host "X '$role' is notified but the approver route does not accept it: $mgmtLine" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ notified roles match the roles allowed to approve" -ForegroundColor Green

# ── 3. stage 2 must still reach the warehouse ──────────────────────────────
# Fixing stage 1 by breaking stage 2 would just move the silence.
if ($m -notmatch 'notifyWarehouseStaff') {
    Write-Host "X the warehouse is no longer notified after management approves" -ForegroundColor Red; exit 1
}
Write-Host "+ the warehouse is still notified once management has approved" -ForegroundColor Green

# ── 4. the message must explain the order of events ────────────────────────
# The owner asked for messages that teach, not just refuse or ping.
if ($rCode -notmatch [regex]::Escape("بانتظار اعتماد الإدارة")) {
    Write-Host "X the message does not say the request is awaiting management" -ForegroundColor Red; exit 1
}
if ($rCode -notmatch [regex]::Escape("لن تُخصم المواد")) {
    Write-Host "X the message does not reassure that stock is not deducted yet" -ForegroundColor Red; exit 1
}
Write-Host "+ the message explains what happens next" -ForegroundColor Green

# ── 5. no unused import left behind ────────────────────────────────────────
if ($r -match 'import[^\n]*notifyWarehouseStaff') {
    Write-Host "X notifyWarehouseStaff is imported but no longer used" -ForegroundColor Red; exit 1
}
if ($rCode -notmatch [regex]::Escape('from "@/lib/governance-layer"')) {
    Write-Host "X createNotification is not imported from governance-layer" -ForegroundColor Red; exit 1
}
Write-Host "+ imports are correct and none left dangling" -ForegroundColor Green

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
git add -u -- "push_v3.74.850.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_851.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.851 - the material-issue request told the wrong',
        'person, and told nobody who could act',
        '',
        'Reported from live use. The warehouse keeper received "material issue',
        'request - requires your approval before production starts". The owner and',
        'general manager received nothing, and saw the item sitting in their',
        'approvals inbox marked "awaiting management".',
        '',
        'Material issue has two stages: management approves, then the warehouse',
        'executes and only then is stock deducted. The request is created as',
        'pending, which IS the management stage - so the notification was aimed one',
        'stage ahead. The warehouse keeper was invited to act on a screen where he',
        'has no button yet, and the people holding the decision did not know a',
        'decision was waiting for them.',
        '',
        'This is the third time in this series: 833 created a receipt request that',
        'could not be executed, 845 raised a costing error at approval where the',
        'owner could not fix it, and now a notification addressed to the wrong',
        'stage. The rule they all point at: at each step, ask who holds the button',
        'HERE - not who will hold it later, and not who happens to see the item on',
        'a screen.',
        '',
        'The request now notifies exactly the four roles the management-approve',
        'route accepts - admin, owner, general_manager, manager - so nobody is',
        'invited to act and then refused, and nobody holds the power without',
        'hearing about it. The push script reads both halves out of the code and',
        'fails if they drift apart. The warehouse is still notified at its own',
        'stage, after management approves, which was already correct.',
        '',
        'The message also says what happens next rather than just pinging: awaiting',
        'management approval, and stock will not be deducted until the warehouse',
        'executes after that approval.',
        '',
        'And the request already sitting in the system was repaired rather than',
        'left for the next one: MPO-202607-000030 had only the warehouse',
        'notification, so the four management notifications were created for it.',
        'The owner and general manager can see it now without waiting for a fresh',
        'request.',
        '',
        'Checked while there: notifyWarehouseStaff is no longer called anywhere',
        'except after management approval, and finished-goods receipt is a',
        'single-stage approval owned by the warehouse, so its notification was',
        'already correct and was left alone.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.851 pushed - the request reaches whoever can approve it" -ForegroundColor Green
}
