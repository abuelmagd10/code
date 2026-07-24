$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.806.ps1") { Remove-Item -LiteralPath "push_v3.74.806.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.807"') {
    Write-Host "+ 3.74.807" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.807]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.807]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the seat gate checks the right company, positively asserted ---------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260724000001_v3_74_807_seat_gate_checks_the_right_company.sql" -Raw
foreach ($must in @(
    "AND csl.company_id = v_company_id",
    "ORDER BY (c.user_id = p_user_id) DESC",
    "ORDER BY (csl.expires_at > NOW()) DESC, csl.expires_at DESC"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X seat-gate migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ license lookup scoped to the gated company; membership pick deterministic" -ForegroundColor Green

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
    "supabase/migrations/20260724000001_v3_74_807_seat_gate_checks_the_right_company.sql" `
    "push_v3.74.807.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.806.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_807.txt"
    $msgLines = @(
        'fix(billing): v3.74.807 - the seat gate checks the right company',
        '',
        'Owner catch: a purchasing officer (member of two companies) was',
        'locked out of company A with "seat expired July 22" while the',
        'seats admin page truthfully showed his seat valid until July 29.',
        '',
        'get_user_company_status had two unordered LIMIT 1 reads: the',
        'membership pick was arbitrary, and the seat-license lookup was',
        'not scoped by company at all - it grabbed the expired license',
        'from his OTHER company and gated the wrong session with it.',
        '',
        'Fix: membership pick is deterministic (owner, then valid license,',
        'then oldest) so a user active anywhere can log in; the license',
        'lookup is scoped to the gated company. get_user_seat_license',
        '(same pattern, unused) hardened too. Verified on the test DB',
        'first (incl. an all-expired rollback probe), then live on prod:',
        'the officer resolves to the right company, unsuspended.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.807 pushed - the gate now reads the license of the company it guards" -ForegroundColor Green
}
