$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.792.ps1") { Remove-Item -LiteralPath "push_v3.74.792.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.793"') {
    Write-Host "+ 3.74.793" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.793]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.793]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- resend produces a fresh dispatch notification, positively asserted ---------
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-posting-command.service.ts" -Raw
if ($svc -notmatch [regex]::Escape('p_category: "approvals",')) {
    Write-Host "X the dispatch notification category fix is missing" -ForegroundColor Red; exit 1
}
# Anchor on the method DEFINITION, not its first mention (the call site) —
# the auto-dispatch-failure notification above it legitimately keeps 'inventory'.
$defIdx = $svc.IndexOf("private async notifyWarehouseManagers")
if ($defIdx -lt 0) { Write-Host "X notifyWarehouseManagers definition not found" -ForegroundColor Red; exit 1 }
$dispatchBlock = $svc.Substring($defIdx)
if ($dispatchBlock -match [regex]::Escape('p_category: "inventory"')) {
    Write-Host "X the dispatch notification still carries the dedup-forever category" -ForegroundColor Red; exit 1
}
Write-Host "+ dispatch notification uses the approvals category (archive stale + fresh unread)" -ForegroundColor Green

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
    "lib/services/sales-invoice-posting-command.service.ts" `
    "push_v3.74.793.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.792.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_793.txt"
    $msgLines = @(
        'fix(notifications): v3.74.793 - a re-send produces a FRESH dispatch notification',
        '',
        'Live-caught by the owner on INV-00003''s second send: after the first',
        'rejection and the accountant''s re-send, the warehouse manager received',
        'NO new notification - only the first round''s stale one was visible.',
        '',
        'create_notification''s dedup has two behaviours: for the ''inventory''',
        'category (which the dispatch notification carried) an existing row',
        'under the same event_key - even an actioned one - blocks any new',
        'notification FOREVER. The ''approvals'' category branch instead',
        'ARCHIVES the stale copy and creates a fresh unread one: exactly the',
        'semantics of an approval request that legitimately repeats every',
        'rejection/edit/resend round.',
        '',
        'The dispatch notification is an approval request, so it now carries',
        'the approvals category - truthful AND functional. Handover: audit the',
        'purchases twin (goods-receipt approval notification) for the same',
        'family; live realtime delivery still pending the owner''s console',
        'evidence.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.793 pushed - every send round summons the warehouse manager afresh" -ForegroundColor Green
}
