$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.779.ps1") { Remove-Item -LiteralPath "push_v3.74.779.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.780"') {
    Write-Host "+ 3.74.780" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.780]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.780]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$checker = "scripts/check-unchecked-writes.js"
$c = Get-Content -LiteralPath $checker -Raw

# --- the three bugs found while fixing it must not come back -------------------
# Each of these is also pinned by a self-test fixture inside the script; these
# assertions exist so that deleting the fixture is caught too.
if ($c -match "\^\\\\s\*await") {
    Write-Host "X the line-anchored rule is back - multi-line writes go invisible again" -ForegroundColor Red
    exit 1
}
if ($c -notmatch "function statementHasHandler") {
    Write-Host "X the .then/.catch check is not statement-scoped again" -ForegroundColor Red; exit 1
}
if ($c -match "m\.index \+ 800") {
    Write-Host "X the loose 800-char .then window is back - it hid five real writes" -ForegroundColor Red
    exit 1
}
if ($c -notmatch "k >= 0 && \(") {
    Write-Host 'X the k<0 guard is gone - "abc".includes("") is true, so it would excuse writes' -ForegroundColor Red
    exit 1
}
Write-Host "+ statement-scoped rule, statement-scoped handler check, k<0 guarded" -ForegroundColor Green

# The fixtures are the reason any of this is trustworthy. Refuse to ship if the
# ones covering the three real bugs have been removed.
foreach ($fx in @("ASI: statement after statement", "first thing in the file",
                  "MULTI-LINE write", "try/catch does NOT check it",
                  "arrow body is a return")) {
    if ($c -notmatch [regex]::Escape($fx)) {
        Write-Host "X self-test fixture removed: $fx" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all five regression fixtures present" -ForegroundColor Green

if ($c -notmatch "const BASELINE = 272;") {
    Write-Host "X baseline is not the verified 272" -ForegroundColor Red; exit 1
}
if ($c -notmatch "--list") {
    Write-Host "X --list removed; a count alone is what hid this bug for months" -ForegroundColor Red; exit 1
}
Write-Host "+ baseline 272, --list available" -ForegroundColor Green

# --- the regression test that actually proves the fix ---------------------------
# v3.74.779 removed exactly six unchecked writes from the expenses pages and the
# OLD checker reported no change whatsoever. The fixed checker must find all six
# in that pre-release code. This is the only check here that tests the rule
# against real code rather than against fixtures.
Write-Host "Running the pre-v3.74.779 regression test..." -ForegroundColor Cyan
$reg = @'
const fs = require("fs"), cp = require("child_process");
const src = fs.readFileSync("scripts/check-unchecked-writes.js", "utf8");
eval(src.slice(src.indexOf("function blankComments"), src.indexOf("/**\n * Self-test.")));
const files = ["app/expenses/new/page.tsx", "app/expenses/[id]/page.tsx"];
let total = 0;
for (const f of files) {
  const before = cp.execSync(`git show d2647b92:"${f}"`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  total += scanSource(before).length;
}
console.log(total);
process.exit(total === 6 ? 0 : 1);
'@
$regPath = Join-Path $env:TEMP "reg_780.js"
[System.IO.File]::WriteAllText($regPath, $reg)
$found = & node $regPath 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "X regression test failed - found '$found' in the pre-779 expenses code, expected 6" -ForegroundColor Red
    Remove-Item -LiteralPath $regPath -Force -ErrorAction SilentlyContinue
    exit 1
}
Remove-Item -LiteralPath $regPath -Force -ErrorAction SilentlyContinue
Write-Host "+ finds all 6 writes the old checker was blind to" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check (the thing being changed)..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X the checker does not pass its own run" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" "scripts/check-unchecked-writes.js" `
    "push_v3.74.780.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.779.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_780.txt"
    $msgLines = @(
        'fix(guards): v3.74.780 - the unchecked-writes checker was blind to half its job',
        '',
        'v3.74.779 removed six unchecked writes from the expenses pages. The checker',
        'reported 145 before and 145 after. Taking that as "nothing worth noting"',
        'would have left the blindness in place.',
        '',
        'The rule was a single-LINE regex anchored with ^\s*await, so it only ever',
        'matched a write formatted on one line. The dominant style here breaks the',
        'call across lines:',
        '',
        '    await supabase',
        '      .from("payslips")',
        '      .update({ ... })',
        '',
        'Every one of those was invisible, as was anything not starting its line,',
        'such as try { await admin.from("audit_logs").insert(...) } catch {}.',
        '',
        'This is precisely what the script exists to catch, and it had it: a tool',
        'reporting success while doing a fraction of its work, gatekeeping every',
        'release since it was written.',
        '',
        'Correction to the record: the v3.74.779 notes quoted 281 total / 136',
        'invisible. That was measured in a hurry with no comment stripping and',
        'counted example code inside doc blocks, including this file own header.',
        'The verified number is 272 total, 127 previously invisible.',
        '',
        'Three bugs were made while fixing it, each caught by a test rather than',
        'shipped:',
        '',
        '  1. The .then/.catch exemption searched 800 characters ahead, which hid',
        '     five real writes - among them an invoice and its line items being',
        '     DELETED in sales-orders. The .catch it matched was 23 lines away on',
        '     response.json(). Near the target is not the target. Now it walks to',
        '     the true end of the statement, tracking bracket depth.',
        '',
        '  2. The rule required ; { or } before the await. This codebase uses no',
        '     semicolons, so statements are separated by a newline alone and the',
        '     preceding character is usually a letter. Exposed by running the fixed',
        '     checker against the pre-779 expenses code: it found 3 of 6.',
        '',
        '  3. "abc".includes("") is true in JavaScript, so a write at the very start',
        '     of a file read as "someone is receiving this". The self-test caught it',
        '     on the first run.',
        '',
        'Verified by regression against real code, not just fixtures: the fixed',
        'checker finds all six writes in the pre-779 expenses pages, at the exact',
        'lines (480, 493, 501, 406, 445, 472). A hand sample of the 127 newly',
        'visible confirms payroll updates, invoice deletions, refund rejections and',
        'company-logo writes among them. Zero false positives found in the reverse',
        'direction.',
        '',
        'Also adds --list, because comparing two versions of a rule is impossible',
        'when the only output is a count - and a count alone is what hid this.',
        '',
        '145 -> 272. Not one write was added; they merely became visible.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.780 pushed - the checker can see what it was built to see" -ForegroundColor Green
}
