$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.750.ps1") { Remove-Item -LiteralPath "push_v3.74.750.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.751"') {
    Write-Host "+ 3.74.751" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.751]")) { Write-Host "X CHANGELOG missing [3.74.751]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m1 = "supabase/migrations/20260720000009_v3_74_751_guard_final_five.sql"
$m2 = "supabase/migrations/20260720000010_v3_74_751_guard_recompute_balances.sql"
foreach ($f in @($m1, $m2)) {
    if (-not (Test-Path $f)) { Write-Host "X missing migration: $f" -ForegroundColor Red; exit 1 }
}
$r1 = Get-Content -LiteralPath $m1 -Raw
$r2 = Get-Content -LiteralPath $m2 -Raw

# The three-argument helper is what let the last five be guarded at all: their
# key column is transaction_id / reference_id, not id.
if ($r1 -notmatch "p_key_column text") {
    Write-Host "X the key-column overload is gone - functions keyed on anything but id become unguardable" -ForegroundColor Red; exit 1
}
# Single-quoted: in a double-quoted PowerShell string "$1" interpolates to an
# empty variable, which silently mangled this pattern and failed correct code.
# Thirteenth time in this work that something matched a rendering rather than
# the thing itself - this time PowerShell's own variable expansion.
# Check the part that carries the meaning: both identifiers passed through %I.
if ($r1 -notmatch 'public\.%I WHERE %I') {
    Write-Host "X the helper no longer quotes both identifiers with %I" -ForegroundColor Red; exit 1
}
Write-Host "+ key-column helper present and quoting properly" -ForegroundColor Green

# The two I wrongly called unresolvable.
foreach ($pair in @(
    @('restore_fifo_lots_on_return', 'products'),
    @('reverse_fifo_consumption',    'fifo_lot_consumptions'))) {
    if ($r1 -notmatch "'$($pair[0])',\s*'$($pair[1])'") {
        Write-Host "X $($pair[0]) is unmapped again - it IS resolvable, via $($pair[1])" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the FIFO pair mapped, not written off" -ForegroundColor Green

# The one that escaped every sweep because of how its parameter is spelled.
if ($r2 -notmatch "assert_company_access\(target_company\)") {
    Write-Host "X recompute_account_balances_for_date is unguarded again" -ForegroundColor Red; exit 1
}
if ($r2 -notmatch "FROM PUBLIC, anon") {
    Write-Host "X recompute_account_balances_for_date is reachable by anon again" -ForegroundColor Red; exit 1
}
# And the watcher must no longer depend on parameter spelling at all.
if ($r2 -notmatch "ILIKE '%uuid%'") {
    Write-Host "X the watcher narrowed back to specific parameter names - target_company would hide again" -ForegroundColor Red; exit 1
}
if ($r2 -match "~ '_id uuid'") {
    Write-Host "X the watcher is back to requiring _id-suffixed parameters" -ForegroundColor Red; exit 1
}
Write-Host "+ watcher no longer depends on how a parameter is spelled" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }
if ($testsLine -match "(\d+)\s+passed" -and [int]$Matches[1] -gt 60) {
    Write-Host "X $($Matches[1]) passed, expected ~50" -ForegroundColor Red; exit 1
}
Write-Host "+ critical tests as expected" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

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

Write-Host "Refreshing the schema snapshots (guards changed 100+ function bodies)..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X function dump failed" -ForegroundColor Red; exit 1 }
node scripts/dump-db-schema.js
if ($LASTEXITCODE -ne 0) { Write-Host "X schema dump failed" -ForegroundColor Red; exit 1 }

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "$m1" `
    "$m2" `
    "supabase/schema/functions.sql" `
    "supabase/schema/schema.sql" `
    "push_v3.74.751.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.750.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_751.txt"
    $msgLines = @(
        'security: v3.74.751 - unguarded writers reach zero, and a correction',
        '',
        'First the correction. In v3.74.750 I said restore_fifo_lots_on_return and',
        'reverse_fifo_consumption "cannot be resolved to a single table by',
        'construction" because they take a polymorphic reference. That was wrong,',
        'and wrong in the worse direction: it turned "I have not looked hard',
        'enough" into "this is impossible", which is how work gets abandoned',
        'instead of finished.',
        '',
        'restore_fifo_lots_on_return also takes p_product_id, and products carries',
        'company_id. reverse_fifo_consumption writes to fifo_lot_consumptions,',
        'which carries both company_id AND reference_id - the company is one lookup',
        'away on the very table it modifies. The polymorphic parameter never',
        'mattered; I had fixed on it and stopped reading.',
        '',
        'The other three needed a key column other than id (transaction_id,',
        'tenant_id), so the helper gained a three-argument form. tenant_id was',
        'confirmed to BE company_id by matching every distinct value against',
        'companies, rather than inferred from the name.',
        '',
        'Then, because a clean report is only worth as much as the question behind',
        'it, I widened the audit after the watcher said CLEAN. 30 candidates came',
        'back. 29 were already restricted to service_role in v3.74.728 and',
        'genuinely unreachable. One was real:',
        '',
        '  recompute_account_balances_for_date(target_company uuid, target_date date)',
        '',
        'It rewrites account balances and was reachable by anon. Every sweep missed',
        'it: v3.74.727 matched arguments containing "company_id", v3.74.746 matched',
        '"_id uuid", and the watcher inherited both. The parameter means precisely',
        'what those patterns were hunting for - it just is not spelled that way,',
        'and three checks agreed with each other because they shared one',
        'assumption. Twelfth time in this work that matching a name instead of a',
        'shape hid something real.',
        '',
        'The watcher now accepts any uuid argument, so spelling no longer decides',
        'what gets examined.',
        '',
        'Counter 48 to 0, clean under the widest definition I can write. Ledger',
        'writers 19 of 19. Schema snapshots refreshed - over a hundred function',
        'bodies changed across this work and the repo copy has to match.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.751 pushed - 48 down to 0" -ForegroundColor Green
}
