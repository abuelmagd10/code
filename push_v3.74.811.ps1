$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.810.ps1") { Remove-Item -LiteralPath "push_v3.74.810.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.811"') {
    Write-Host "+ 3.74.811" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.811]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.811]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- apiGuard denial branches return real Responses (positive assertions) ------
$guard = Get-Content -LiteralPath "lib/core/security/api-guard.ts" -Raw
$wrapped = ([regex]::Matches($guard, [regex]::Escape("ErrorHandler.handle(ErrorHandler."))).Count
if ($wrapped -lt 3) {
    Write-Host "X apiGuard: expected >=3 denial branches wrapped in ErrorHandler.handle, found $wrapped" -ForegroundColor Red; exit 1
}
if ($guard -match "errorResponse: ErrorHandler\.(unauthorized|forbidden|validation)\(") {
    Write-Host "X apiGuard still returns a bare ERPError somewhere" -ForegroundColor Red; exit 1
}
Write-Host "+ permission denials now return clean 401/403 JSON, not empty 500s" -ForegroundColor Green

# --- manager can create products (data migration present) ----------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260724000004_v3_74_811_manager_creates_products.sql" -Raw
if ($mig -notmatch [regex]::Escape("SET can_write = TRUE, can_update = TRUE") -or
    $mig -notmatch [regex]::Escape("role = 'manager'")) {
    Write-Host "X manager-products migration incomplete" -ForegroundColor Red; exit 1
}
Write-Host "+ the two permission layers agree: branch manager creates products" -ForegroundColor Green

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
    "lib/core/security/api-guard.ts" `
    "supabase/migrations/20260724000004_v3_74_811_manager_creates_products.sql" `
    "push_v3.74.811.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.810.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

$missing = @("lib/core/security/api-guard.ts",
             "supabase/migrations/20260724000004_v3_74_811_manager_creates_products.sql") |
    Where-Object { $staged -notcontains $_ }
if ($missing) {
    Write-Host "X files failed to stage: $($missing -join ', ')" -ForegroundColor Red; exit 1
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_811.txt"
    $msgLines = @(
        'fix(security): v3.74.811 - permission denials return Responses;',
        'branch manager can create products',
        '',
        'Owner catch at the start of manufacturing testing: product creation',
        'succeeded for the owner but 500''d with an EMPTY body for the branch',
        'manager. Vercel logs named it: "Expected a Response object but',
        'received ''object''".',
        '',
        'Two defects, one scene:',
        '1) FLEET-WIDE: apiGuard''s three denial branches returned a bare',
        '   ERPError instead of a Response - every permission denial through',
        '   the guard crashed as an empty 500 instead of clean 401/403 JSON.',
        '   All three branches now wrap in ErrorHandler.handle().',
        '2) Layer mismatch: the route''s owner-approved allowlist (675)',
        '   includes the branch manager, but company_role_permissions had',
        '   manager/products can_write=false, so the guard denied him before',
        '   the allowlist was ever consulted. Migration 20260724000004',
        '   grants manager write+update on products (applied to both DBs,',
        '   verified: probe-created a product as the manager successfully).',
        '   Delete stays upper-management only.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.811 pushed - denials speak JSON, and the manager builds the catalog" -ForegroundColor Green
}
