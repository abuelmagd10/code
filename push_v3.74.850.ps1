$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.849.ps1") { Remove-Item -LiteralPath "push_v3.74.849.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.850"') {
    Write-Host "+ 3.74.850" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.850]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.850]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$files = @("lib/version.ts", "CHANGELOG.md",
           "scripts/check-phantom-columns.js", "scripts/ai-governance-audit.js",
           "push_v3.74.850.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.849.ps1" 2>$null

# ── the whole point: the ratchets moved DOWN ───────────────────────────────
# A baseline left high after the debt is paid lets the same defect come back
# without failing anything. That is the only thing this release does, so it is
# the only thing worth checking hard.
$col = Get-Content -LiteralPath "scripts/check-phantom-columns.js" -Raw
$gov = Get-Content -LiteralPath "scripts/ai-governance-audit.js" -Raw
$sel = Get-Content -LiteralPath "scripts/check-phantom-selects.js" -Raw

if ($col -notmatch 'const BASELINE = 51') {
    Write-Host "X the phantom-write baseline is not 51" -ForegroundColor Red; exit 1
}
if ($gov -notmatch 'const CRITICAL_BASELINE = 2') {
    Write-Host "X the critical-security baseline is not 2" -ForegroundColor Red; exit 1
}
if ($sel -notmatch 'PHANTOM_SELECT_BASELINE \?\? 0') {
    Write-Host "X the phantom-read baseline is not 0" -ForegroundColor Red; exit 1
}
Write-Host "+ writes 55->51, critical 3->2, reads 0" -ForegroundColor Green

# Each guard must now sit EXACTLY on its baseline: one lower and the ratchet
# was not tightened enough, one higher and it would already be failing.
Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
$w = & node scripts/check-phantom-columns.js 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }
if ($w -notmatch 'Found:\s*51\s+Baseline:\s*51') {
    Write-Host "X the phantom-write count and baseline are not both 51:" -ForegroundColor Red
    Write-Host $w; exit 1
}
Write-Host "+ 51 writes, baseline 51 - no slack left in the ratchet" -ForegroundColor Green

Write-Host "Checking phantom column reads..." -ForegroundColor Cyan
node scripts/check-phantom-selects.js
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-select check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

# ── and the guards must still be able to FAIL ──────────────────────────────
Write-Host "Proving the guards can still fail..." -ForegroundColor Cyan
$probe1 = "scripts/phantom-probe.tmp.ts"
@'
import { createClient } from "@supabase/supabase-js"
const s = createClient("x", "y")
export const q = () => s.from("employees").select("id, definitely_not_a_real_column")
'@ | Set-Content -LiteralPath $probe1 -Encoding UTF8
node scripts/check-phantom-selects.js *> $null
$e1 = $LASTEXITCODE
Remove-Item -LiteralPath $probe1 -Force -ErrorAction SilentlyContinue

$probe2 = "scripts/acct-probe.tmp.ts"
'const q = { account_code: "9999" }
export default q' | Set-Content -LiteralPath $probe2 -Encoding UTF8
node scripts/check-hardcoded-account-codes.js *> $null
$e2 = $LASTEXITCODE
Remove-Item -LiteralPath $probe2 -Force -ErrorAction SilentlyContinue

if ($e1 -eq 0) { Write-Host "X the phantom-select guard is asleep" -ForegroundColor Red; exit 1 }
if ($e2 -eq 0) { Write-Host "X the account-code guard is asleep" -ForegroundColor Red; exit 1 }
Write-Host "+ both guards fail when they should" -ForegroundColor Green

Write-Host "Running the governance audit (this is the slow one)..." -ForegroundColor Cyan
$g = & node scripts/ai-governance-audit.js 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host "X governance audit failed:" -ForegroundColor Red
    Write-Host ($g -split "`n" | Select-Object -Last 20 | Out-String); exit 1
}
if ($g -notmatch '\(2 critical\)') {
    Write-Host "X the audit no longer reports exactly 2 critical findings:" -ForegroundColor Red
    Write-Host ($g -split "`n" | Where-Object { $_ -match 'critical' } | Out-String); exit 1
}
Write-Host "+ 2 critical findings, matching the new baseline" -ForegroundColor Green

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
git add -u -- "push_v3.74.849.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "probe")  { Write-Host "X a probe file leaked into the commit" -ForegroundColor Red; exit 1 }
if ((Test-Path $probe1) -or (Test-Path $probe2)) { Write-Host "X a probe file was not cleaned up" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_850.txt"
    $msgLines = @(
        'chore(guards): v3.74.850 - lower three baselines so the paid debt cannot',
        'come back',
        '',
        'Small release, one purpose. 849 removed code, and two guards immediately',
        'reported they were now sitting above the real number. A baseline left high',
        'after the debt is paid is not neutral - it is room for the same defect to',
        'return without failing anything.',
        '',
        '  phantom column writes                55 -> 51',
        '  service-role routes with no auth      3 -> 2',
        '  phantom column reads                       0  (done in 849)',
        '',
        'The four writes were not fixed one by one. The code that wrote them is',
        'gone: the cleanest repair for a write to a column that does not exist is',
        'for nothing to be writing it.',
        '',
        'The security one is worth recording for how it was found. Nobody went',
        'looking for it. app/api/subscription/create had no authentication of any',
        'kind while creating auth users with the service-role key, and it surfaced',
        'while checking whether the dead subscription duplicate was safe to delete',
        '- a check the owner insisted on before I removed anything.',
        '',
        'Verifying before deleting is not a formality. "Does anything call this?"',
        'found an open door that asking about open doors had not.',
        '',
        'The remaining two are named rather than left as a number:',
        'bills/[id]/journal-entry-id and biometric/attendance/push.',
        '',
        'The push script now also asserts that the phantom-write count and its',
        'baseline are both exactly 51, so the ratchet cannot be left with slack in',
        'it, and re-runs the governance audit to confirm the count is really 2.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.850 pushed - the ratchets sit on the real numbers" -ForegroundColor Green
}
