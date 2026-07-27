$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.853.ps1") { Remove-Item -LiteralPath "push_v3.74.853.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.854"') {
    Write-Host "+ 3.74.854" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.854]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.854]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$aud = "scripts/ai-governance-audit.js"
$files = @("lib/version.ts", "CHANGELOG.md", $aud,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.854.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.853.ps1" 2>$null

$a = Get-Content -LiteralPath $aud -Raw

# ── 1. the two auth patterns must be RECOGNISED, and the baseline zeroed ───
# Both flagged routes turned out to be authenticated: one through
# enforceGovernance (session -> company -> branch), one through a device token
# matched against biometric_devices.api_token. The scanner simply did not know
# either pattern.
foreach ($marker in @("enforceGovernance", "api_token")) {
    if ($a -notmatch ("hasAuthMarker[\s\S]{0,400}" + [regex]::Escape($marker))) {
        Write-Host "X '$marker' is not among the recognised auth markers" -ForegroundColor Red; exit 1
    }
}
if ($a -notmatch 'const CRITICAL_BASELINE = 0') {
    Write-Host "X the critical baseline is not 0 - a non-zero constant trains people to ignore it" -ForegroundColor Red; exit 1
}
Write-Host "+ both auth patterns recognised, critical baseline 0" -ForegroundColor Green

# ── 2. the stale comment must be corrected, not left contradicting the code ─
# The header claimed the biometric route pushes attendance "with no device
# secret" and the bills route "exposes any invoice's entry id by guessing".
# Both descriptions are false, and they were read as fact for months while
# holding the baseline up.
if ($a -match 'جهاز البصمة يدفع حضوراً بلا سرّ جهاز' -and $a -notmatch 'تصحيح ٨٥٤') {
    Write-Host "X the stale description is still there without the correction beside it" -ForegroundColor Red; exit 1
}
if ($a -notmatch [regex]::Escape("ليس دليلاً")) {
    Write-Host "X the lesson - a description in a comment is not evidence - is not recorded" -ForegroundColor Red; exit 1
}
Write-Host "+ the false description is corrected in place, with the reason" -ForegroundColor Green

# ── 3. TAUGHT, NOT SILENCED - proven by planting a real hole ───────────────
# Adding markers to an auth scanner is exactly how one silences it by accident.
# The only honest proof is that a genuinely unauthenticated service-role route
# still fails the audit. Note --ci: without that flag the audit reports and
# exits 0 regardless, so a probe run without it proves nothing.
Write-Host "Proving the audit still fails on a REAL unauthenticated route..." -ForegroundColor Cyan
$probeDir = "app/api/probe-unauth-tmp"
New-Item -ItemType Directory -Force -Path $probeDir | Out-Null
@'
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
export async function POST() {
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from("companies").select("*")
  return NextResponse.json({ data })
}
'@ | Set-Content -LiteralPath "$probeDir/route.ts" -Encoding UTF8
node scripts/ai-governance-audit.js --ci *> $null
$probeExit = $LASTEXITCODE
Remove-Item -LiteralPath $probeDir -Recurse -Force -ErrorAction SilentlyContinue
if ($probeExit -eq 0) {
    Write-Host "X the audit did NOT fail on a planted unauthenticated service-role route - it was silenced, not taught" -ForegroundColor Red; exit 1
}
Write-Host "+ the audit fails on a real hole (exit $probeExit)" -ForegroundColor Green
if (Test-Path $probeDir) { Write-Host "X the probe directory was not cleaned up" -ForegroundColor Red; exit 1 }

Write-Host "Running the governance audit for real..." -ForegroundColor Cyan
node scripts/ai-governance-audit.js --ci
if ($LASTEXITCODE -ne 0) { Write-Host "X governance audit failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking finished-goods conversion cost..." -ForegroundColor Cyan
node scripts/check-finished-goods-conversion-cost.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X finished-goods costing check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking inventory movement coverage..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Counting duplicate-audience notifications..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

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
git add -u -- "push_v3.74.853.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env")  { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "probe")  { Write-Host "X a probe file leaked into the commit" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_854.txt"
    $msgLines = @(
        'fix(security): v3.74.854 - the two remaining "unauthenticated" routes were',
        'authenticated all along; critical baseline 2 -> 0',
        '',
        'I told the owner the last item on the list was two service-role routes with',
        'no authentication, and called it the security risk worth doing first. I was',
        'repeating the scanner label. Reading the two routes line by line:',
        '',
        '  bills/[id]/journal-entry-id calls enforceGovernance(), which runs',
        '  supabase.auth.getUser() and throws "Unauthorized: No active session" when',
        '  there is none, then resolves company membership. The route scopes the',
        '  bill lookup to governance.companyId and refuses branches outside',
        '  governance.branchIds.',
        '',
        '  biometric/attendance/push requires Bearer <token>, matches it against',
        "  biometric_devices.api_token, rejects a device that is not online, and",
        '  scopes everything after that to the device company and branch. There is',
        '  no user session BY DESIGN - a turnstile is not a user. And there are zero',
        '  devices registered, so every request to it currently returns 401.',
        '',
        'The scanner looks for a fixed list of auth markers and knew neither',
        'pattern. Both are added now - after reading the code, not to quiet it. That',
        'distinction is the whole point, so the push script proves it: it plants a',
        'genuinely unauthenticated service-role route that reads the companies table',
        'and requires the audit to fail (exit 1), then removes it and requires a',
        'pass. Taught, not silenced.',
        '',
        'Worth noting for anyone testing this locally: the audit only enforces the',
        'baseline under --ci. Without the flag it reports and exits 0 whatever it',
        'finds, which is how my first probe run looked like a pass.',
        '',
        'A stale comment also had to go. The audit header described the biometric',
        'route as pushing attendance "with no device secret" and the bills route as',
        '"exposing any invoice entry id by guessing". Both descriptions are false;',
        'the code says otherwise and has for a long time. They sat there being read',
        'as fact, and they were the reason the baseline stayed at 2. A description',
        'written in a comment is not evidence.',
        '',
        'The baseline is 0 now, and that matters beyond tidiness: a constant',
        'non-zero number trains everyone to skip past it, so the next real hole',
        'arrives as noise between two known false positives. At zero, anything that',
        'appears is real and breaks the build.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.854 pushed - zero critical findings, and the audit still bites" -ForegroundColor Green
}
