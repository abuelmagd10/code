$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.738.ps1") { Remove-Item -LiteralPath "push_v3.74.738.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.739"') {
    Write-Host "+ 3.74.739" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.739]")) { Write-Host "X CHANGELOG missing [3.74.739]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$js = Get-Content -LiteralPath "scripts/check-service-role-scoping.js" -Raw

# The rule was widened six times. Without fixtures, the seventh widening turns
# it into decoration and nothing says so.
if ($js -notmatch "FIXTURES") {
    Write-Host "X the self-test fixtures are gone - the rule could be loosened to nothing unnoticed" -ForegroundColor Red; exit 1
}
if ($js -notmatch "fix-negative-payments incident") {
    Write-Host "X the fixture pinning the original incident is missing" -ForegroundColor Red; exit 1
}
if ($js -notmatch "The rule itself is broken") {
    Write-Host "X fixture failures no longer stop the run" -ForegroundColor Red; exit 1
}
Write-Host "+ self-test fixtures present" -ForegroundColor Green

# One definition of the rule. Two copies is how "the check passed but the
# fixture failed" happens.
$evalCount = ([regex]::Matches($js, "function evaluate\s*\(")).Count
if ($evalCount -ne 1) {
    Write-Host "X expected exactly one evaluate() definition, found $evalCount" -ForegroundColor Red; exit 1
}
if ($js -notmatch "const verdict = evaluate\(src\)") {
    Write-Host "X the main loop no longer uses evaluate() - the rule is written twice again" -ForegroundColor Red; exit 1
}
Write-Host "+ one rule, shared by the scan and the fixtures" -ForegroundColor Green

# Prove the fixtures actually bite, rather than trusting that they do: break
# the rule in a scratch copy and confirm the self-test rejects it.
Write-Host "Proving the self-test fails on a broken rule..." -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP "broken-scoping-check.js"
$broken = $js -replace [regex]::Escape("function companyFromTrustedSource(src) {"), "function companyFromTrustedSource(src) { return true;"
[System.IO.File]::WriteAllText($tmp, $broken)
$out = & node $tmp 2>&1 | Out-String
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
if ($out -notmatch "The rule itself is broken") {
    Write-Host "X a deliberately broken rule still passed the self-test - the fixtures are decorative" -ForegroundColor Red
    exit 1
}
Write-Host "+ self-test rejects a broken rule" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }
Write-Host "+ check passes, ratchet at zero" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "scripts/check-service-role-scoping.js" `
    "push_v3.74.739.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.738.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_739.txt"
    $msgLines = @(
        'security: v3.74.739 - ratchet reaches zero, and the rule proves it still bites',
        '',
        'The last four flagged routes are all sound. billing/invoices/[id]/pdf',
        'fetches the row then compares company_id against the session. ',
        'permissions/shared-with-me filters on grantee_user_id = the session user,',
        'so naming another company widens nothing. invoices/[id]/record-payment',
        'hands the derived companyId to a command service. billing/renew takes the',
        'company from a verified HMAC token.',
        '',
        'I stopped chasing shapes. Six rule revisions, six new shapes, and the',
        'question underneath all of them was always the same: did the company come',
        'from a source the caller cannot choose, and is it actually used? If yes,',
        'the route may express the scoping however it likes.',
        '',
        'Sixth name-not-shape mistake on the way: billing/renew calls the field',
        'payload.cid, and my rule required the spelling companyId - so it rejected a',
        'route whose company arrives inside a signed token, about the most',
        'trustworthy source available. The token IS the authorisation; what its',
        'field is called is not my business.',
        '',
        'Widening a rule six times risks ending with something that accepts',
        'everything and reports success forever. So the script now carries six',
        'fixtures that run on every invocation and pin both ends: the shape that',
        'caused the incident must still be rejected, and the shapes I wrongly',
        'flagged must still pass. I verified the fixtures actually bite by breaking',
        'the rule deliberately - two of them failed immediately. A test that does',
        'not fail when the thing it tests is broken is not a test, and the push',
        'guard now performs that same sabotage check before every release.',
        '',
        'Also collapsed a duplicate I had just created: the rule was written twice,',
        'once in the scan loop and once for the fixtures. That is precisely how you',
        'get "the check passed but the fixture failed", and it is the pattern I have',
        'been pointing at all day. One definition now.',
        '',
        'Final tally of the 13 original flags: 2 real holes (bonuses GET, audit-log),',
        '1 misclassification (public signup), 10 my rule being narrower than the',
        'codebase. List is empty; anything new fails the build.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.739 pushed - all 112 service-role routes reviewed" -ForegroundColor Green
}
