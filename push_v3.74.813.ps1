$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.812.ps1") { Remove-Item -LiteralPath "push_v3.74.812.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.813"') {
    Write-Host "+ 3.74.813" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.813]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.813]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- (a) BOM validity-window guard ---------------------------------------------
$bom = Get-Content -LiteralPath "components/manufacturing/bom/bom-detail-page.tsx" -Raw
if ($bom -notmatch [regex]::Escape("effective_to <= createVersionForm.effective_from")) {
    Write-Host "X BOM page: client-side window validation missing" -ForegroundColor Red; exit 1
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260724000006_v3_74_813_bom_version_window_guard.sql" -Raw
if ($mig -notmatch [regex]::Escape("v3.74.813 window guard")) {
    Write-Host "X window-guard migration missing its marker" -ForegroundColor Red; exit 1
}
Write-Host "+ zero-width validity windows are refused in words, both layers" -ForegroundColor Green

# --- (b) routing submit-for-approval button ------------------------------------
$rui = Get-Content -LiteralPath "lib/manufacturing/routing-ui.ts" -Raw
if ($rui -notmatch [regex]::Escape("export async function submitRoutingVersion")) {
    Write-Host "X routing-ui: submitRoutingVersion helper missing" -ForegroundColor Red; exit 1
}
$rpg = Get-Content -LiteralPath "components/manufacturing/routing/routing-detail-page.tsx" -Raw
foreach ($must in @("submitRoutingVersion", "submit_approval_button", 'OP-${String(nextOperationNo * 10)')) {
    if ($rpg -notmatch [regex]::Escape($must)) {
        Write-Host "X routing page missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ draft routing versions can be submitted; operation codes auto-number" -ForegroundColor Green

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
    "components/manufacturing/bom/bom-detail-page.tsx" `
    "components/manufacturing/routing/routing-detail-page.tsx" `
    "lib/manufacturing/routing-ui.ts" `
    "supabase/migrations/20260724000006_v3_74_813_bom_version_window_guard.sql" `
    "push_v3.74.813.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.812.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in @("components/manufacturing/bom/bom-detail-page.tsx",
                 "components/manufacturing/routing/routing-detail-page.tsx",
                 "lib/manufacturing/routing-ui.ts",
                 "supabase/migrations/20260724000006_v3_74_813_bom_version_window_guard.sql")) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_813.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.813 - three live-test catches in the',
        'manufacturing module',
        '',
        '(a) BOM version validity window: from==to died at the table check',
        '    constraint with an opaque 23514. The atomic function now fails',
        '    fast with a clear bilingual message (anchor-patched on both DBs,',
        '    migration documents it idempotently) and the client validates',
        '    before sending.',
        '(b) The routing screen had NO "submit for approval" button while the',
        '    server rightly refused activation before submission (409) - the',
        '    submit-approval API existed with no caller. Button added for',
        '    draft versions + submitRoutingVersion client helper. The stuck',
        '    ROUT-001 v1 was submitted via the same atomic RPC to unblock',
        '    live testing.',
        '(c) Owner request: operation codes auto-generate as OP-010/OP-020',
        '    (industry-style tens gaps), still editable.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.813 pushed - the routing line now flows draft -> approval -> active" -ForegroundColor Green
}
