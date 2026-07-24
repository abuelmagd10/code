$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.811.ps1") { Remove-Item -LiteralPath "push_v3.74.811.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.812"') {
    Write-Host "+ 3.74.812" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.812]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.812]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- job title follows the role, positively asserted ---------------------------
$mr = Get-Content -LiteralPath "app/api/member-role/route.ts" -Raw
foreach ($must in @("ROLE_LABELS_AR", "job_title: newJobTitle", "manufacturing_officer")) {
    if ($mr -notmatch [regex]::Escape($must)) {
        Write-Host "X member-role route: job_title sync missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ role changes now update the employee card's job title" -ForegroundColor Green

# --- manufacturing officer reads products (migration present) ------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260724000005_v3_74_812_manufacturing_officer_reads_products.sql" -Raw
if ($mig -notmatch [regex]::Escape("'manufacturing_officer', 'products', TRUE")) {
    Write-Host "X manufacturing-officer products migration incomplete" -ForegroundColor Red; exit 1
}
Write-Host "+ the BOM builder has components to show" -ForegroundColor Green

# --- every manufacturing page maps to a real resource --------------------------
$pc = Get-Content -LiteralPath "lib/permissions-context.tsx" -Raw
if ($pc -notmatch [regex]::Escape("'/manufacturing': 'manufacturing_boms'")) {
    Write-Host "X permissions map missing the /manufacturing umbrella entry" -ForegroundColor Red; exit 1
}
Write-Host "+ the whole manufacturing module opens for authorized roles" -ForegroundColor Green

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
    "app/api/member-role/route.ts" `
    "lib/permissions-context.tsx" `
    "supabase/migrations/20260724000005_v3_74_812_manufacturing_officer_reads_products.sql" `
    "push_v3.74.812.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.811.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

# v3.74.812b — the strict "must be staged" check failed on a RE-RUN: files
# pushed by the first run have no new diff, which is fine. Fail only when a
# required file has PENDING changes that somehow didn't stage.
foreach ($f in @("app/api/member-role/route.ts",
                 "lib/permissions-context.tsx",
                 "supabase/migrations/20260724000005_v3_74_812_manufacturing_officer_reads_products.sql")) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_812.txt"
    $msgLines = @(
        'fix(rbac): v3.74.812 - job title follows the role; manufacturing',
        'officer can read products',
        '',
        'Owner diagnosed it himself: changing a role in settings updates',
        'company_members.role (the real permission driver - it DID change)',
        'but never touched employees.job_title, which is what the employees',
        'list displays - so the change looked like it never happened. The',
        'member-role route now syncs the job title to the new role''s Arabic',
        'label (best-effort; a sync failure never fails the role change).',
        '',
        'Also: the manufacturing_officer role had approvals + BOMs + reports',
        'but NO products read - the BOM builder would have shown an empty',
        'component picker. Migration 20260724000005 grants read-only',
        'products (applied to both DBs at discovery time).',
        '',
        'Third catch, same session: the sidebar showed the manufacturing',
        'module but NO page would open. The path->resource map knew only',
        '3 manufacturing routes; the rest fell through to a phantom',
        '''manufacturing'' resource no role owns, so the route guard evicted',
        'even authorized users. One umbrella entry (/manufacturing ->',
        'manufacturing_boms) covers the whole module; the more specific',
        'entries above it keep direct-match priority.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.812 pushed - what you see is now what the system believes" -ForegroundColor Green
}
