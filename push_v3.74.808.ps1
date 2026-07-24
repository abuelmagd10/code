$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.807.ps1") { Remove-Item -LiteralPath "push_v3.74.807.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.808"') {
    Write-Host "+ 3.74.808" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.808]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.808]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the creator's note travels to the approver, positively asserted -----------
$svc = Get-Content -LiteralPath "lib/services/purchase-order-notification.service.ts" -Raw
foreach ($must in @('noteClauseAr', 'notes?: string | null')) {
    if ($svc -notmatch [regex]::Escape($must)) {
        Write-Host "X notification service missing: $must" -ForegroundColor Red; exit 1
    }
}
$rt1 = Get-Content -LiteralPath "app/api/purchase-orders/[id]/notifications/route.ts" -Raw
if ($rt1 -notmatch [regex]::Escape('notes: (po as any).notes || null')) {
    Write-Host "X [id]/notifications route does not pass notes" -ForegroundColor Red; exit 1
}
$rt2 = Get-Content -LiteralPath "app/api/purchase-orders/route.ts" -Raw
if ($rt2 -notmatch [regex]::Escape('notes: newOrder.notes || null')) {
    Write-Host "X creation route does not pass notes" -ForegroundColor Red; exit 1
}
$pg = Get-Content -LiteralPath "app/purchase-orders/[id]/page.tsx" -Raw
if ($pg -notmatch [regex]::Escape('creator_note_card')) {
    Write-Host "X PO page missing the creator-note card" -ForegroundColor Red; exit 1
}
Write-Host "+ the creator's note is quoted in notifications and rendered on the PO page" -ForegroundColor Green

# --- realtime init promise must not outlive its attempt ------------------------
$rtm = Get-Content -LiteralPath "lib/realtime-manager.ts" -Raw
if ($rtm -notmatch [regex]::Escape('this.initializationPromise = null')) {
    Write-Host "X realtime-manager: stale init promise fix missing" -ForegroundColor Red; exit 1
}
if ($rtm -notmatch [regex]::Escape('.finally(')) {
    Write-Host "X realtime-manager: finally-clear pattern missing" -ForegroundColor Red; exit 1
}
Write-Host "+ a failed realtime init can retry - live notifications no longer need a reload" -ForegroundColor Green

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
    "lib/services/purchase-order-notification.service.ts" `
    "app/api/purchase-orders/[id]/notifications/route.ts" `
    "app/api/purchase-orders/route.ts" `
    "app/purchase-orders/[id]/page.tsx" `
    "lib/realtime-manager.ts" `
    "push_v3.74.808.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.807.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_808.txt"
    $msgLines = @(
        'fix(purchasing): v3.74.808 - the creator''s note travels to the approver',
        '',
        'Owner catch: the purchasing officer justified his discount in the',
        'PO notes field - and neither the approval notification nor the PO',
        'page ever showed it. The owner/GM decided blind.',
        '',
        'Mirror of the sales-side fix (v3.74.795):',
        '- approval-request / re-approval notifications now quote the',
        '  creator''s note (truncated at 200 chars), on both the creation',
        '  and the edit paths',
        '- the PO detail page renders a "creator''s note" card - the field',
        '  was fetched (select *) but never displayed',
        '- notifyPOApprovalRequest in notification-helpers is dead code',
        '  (no callers) and was left untouched',
        '',
        'Second fix, same version - the live-notifications mystery from',
        'the handover ledger, finally caught in the owner''s console: an',
        'aborted first RealtimeManager init (auth fetch aborted during a',
        'fast route change) left its settled promise cached forever, so',
        'every later initialize() got the same dead promise back and',
        'realtime never subscribed until a full reload. The init promise',
        'is now cleared in finally() - failed attempts can retry.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.808 pushed - approvers now read the why, not just the how much" -ForegroundColor Green
}
