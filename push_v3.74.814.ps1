$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.813.ps1") { Remove-Item -LiteralPath "push_v3.74.813.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.814"') {
    Write-Host "+ 3.74.814" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.814]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.814]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- (a) management-stage columns migration ------------------------------------
$m7 = Get-Content -LiteralPath "supabase/migrations/20260724000007_v3_74_814_material_issue_management_stage_columns.sql" -Raw
foreach ($must in @("management_approved_at timestamptz", "'management_approved'")) {
    if ($m7 -notmatch [regex]::Escape($must)) {
        Write-Host "X management-stage migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ each approval stage signs its own columns" -ForegroundColor Green

# --- (b) duplicate receipt poster dropped --------------------------------------
$m8 = Get-Content -LiteralPath "supabase/migrations/20260724000008_v3_74_814_drop_duplicate_receipt_poster.sql" -Raw
if ($m8 -notmatch [regex]::Escape("DROP TRIGGER IF EXISTS trg_production_receipt_post_je")) {
    Write-Host "X duplicate-poster migration incomplete" -ForegroundColor Red; exit 1
}
Write-Host "+ one poster per production receipt - the zombie is dropped, not disabled" -ForegroundColor Green

# --- (c) production order submit button ----------------------------------------
$po = Get-Content -LiteralPath "components/manufacturing/production-order/production-order-detail-page.tsx" -Raw
foreach ($must in @("submit_approval_button", "submit-approval")) {
    if ($po -notmatch [regex]::Escape($must)) {
        Write-Host "X production-order page: submit button missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ draft production orders can be submitted from the page" -ForegroundColor Green

# --- (d) routing submit button reads approval_status ---------------------------
$rp = Get-Content -LiteralPath "components/manufacturing/routing/routing-detail-page.tsx" -Raw
if ($rp -notmatch [regex]::Escape('approval_status ?? "draft"')) {
    Write-Host "X routing submit button still ignores approval_status" -ForegroundColor Red; exit 1
}
Write-Host "+ the routing submit button hides itself once submitted or approved" -ForegroundColor Green

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
    "components/manufacturing/production-order/production-order-detail-page.tsx" `
    "components/manufacturing/routing/routing-detail-page.tsx" `
    "supabase/migrations/20260724000007_v3_74_814_material_issue_management_stage_columns.sql" `
    "supabase/migrations/20260724000008_v3_74_814_drop_duplicate_receipt_poster.sql" `
    "push_v3.74.814.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.813.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in @("components/manufacturing/production-order/production-order-detail-page.tsx",
                 "components/manufacturing/routing/routing-detail-page.tsx",
                 "supabase/migrations/20260724000007_v3_74_814_material_issue_management_stage_columns.sql",
                 "supabase/migrations/20260724000008_v3_74_814_drop_duplicate_receipt_poster.sql")) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_814.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.814 - the first production cycle closes',
        'clean: two structural defects, two missing buttons',
        '',
        'The first live production run completed end-to-end (raw materials',
        '-> approved BOM -> approved routing -> approved order -> two-stage',
        'material issue -> finished receipt -> SOLD at exactly its 60.00',
        'manufactured cost, 440 gross profit) and caught on the way:',
        '',
        '(a) Migration 20260724000007: the management-approve route wrote to',
        '    management_approved_by/at/notes columns that never existed, and',
        '    the status check did not know ''management_approved''. Both fixed',
        '    on both DBs at discovery.',
        '(b) Migration 20260724000008: the first finished-goods receipt',
        '    posted TWICE (legacy trigger + modern MFG-RECV path) - finished',
        '    inventory 120 vs a single 60 FIFO lot, negative WIP. The zombie',
        '    trigger is DROPPED (lesson 804), the duplicate reversed with a',
        '    documented reversal entry through app.allow_direct_post,',
        '    respecting the posted-entry guard that rightly blocked deletion.',
        '    Verified after: WIP 0.00, inventory GL = FIFO valuation.',
        '(c) Production-order page gets its missing submit-for-approval',
        '    button (same pattern as the routing fix in 813).',
        '(d) The routing submit button now reads approval_status, so it',
        '    disappears once submitted/approved (owner catch).'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.814 pushed - cost travels true: 60 in materials, 60 out as COGS" -ForegroundColor Green
}
