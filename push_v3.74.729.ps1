$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.728.ps1") { Remove-Item -LiteralPath "push_v3.74.728.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.729"') {
    Write-Host "+ 3.74.729" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.729]")) { Write-Host "X CHANGELOG missing [3.74.729]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m1 = "supabase/migrations/20260719000730_v3_74_729_assert_company_access_batch2.sql"
$m2 = "supabase/migrations/20260719000731_v3_74_729_ic_recognises_assert_company_access.sql"
foreach ($m in @($m1, $m2)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}
$r1 = Get-Content -LiteralPath $m1 -Raw
$r2 = Get-Content -LiteralPath $m2 -Raw

# The service_role escape hatch is what keeps every API route working. Without
# it the guard rejects server-side calls and the system stops, rather than
# getting safer.
if ($r1 -notmatch "IF v_uid IS NULL THEN") {
    Write-Host "X the guard no longer allows server-side calls - every API route would break" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "company_members") {
    Write-Host "X the guard does not check membership at all" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "ERRCODE = '42501'") {
    Write-Host "X the guard no longer raises on a non-member" -ForegroundColor Red; exit 1
}
Write-Host "+ guard: server calls pass, outsiders raise" -ForegroundColor Green

# Anchor by position. A regex anchor could land inside a nested block, and a
# guard that sits in an inner branch never runs.
if ($r1 -notmatch [regex]::Escape('position(E''\nBEGIN'' in substr(v_def, v_start))')) {
    Write-Host "X the patcher stopped anchoring on the main BEGIN by position" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "ILIKE '%assert_company_access%' THEN") {
    Write-Host "X the patcher is no longer idempotent - re-running would stack duplicate guards" -ForegroundColor Red; exit 1
}
Write-Host "+ patcher anchors by position and is idempotent" -ForegroundColor Green

# If the watcher cannot see the new guard, the counter freezes and real progress
# reads as no progress.
if ($r2 -notmatch "NOT ILIKE '%assert_company_access%'") {
    Write-Host "X the watcher does not recognise assert_company_access - the counter would never move" -ForegroundColor Red; exit 1
}
Write-Host "+ watcher recognises the new guard" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$m1" "$m2" "push_v3.74.729.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.728.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_729.txt"
    $msgLines = @(
        'security: v3.74.729 - first real membership checks, 87 -> 81',
        '',
        'These functions are called two ways: from the browser, where auth.uid()',
        'returns the user, and from our own API routes as service_role, where it is',
        'null. A naive "must be a member" check would have rejected every',
        'server-side call and taken the system down. So the guard reads: if there',
        'is an end-user identity it must belong to the company; if there is none',
        'the call came through the API layer, which already authorised it. Closes',
        'the browser hole without touching the server path.',
        '',
        'Applied to the six worst: annual closing, dividend distribution, dividend',
        'payment, invoice payment, shareholder drawings, payroll posting.',
        '',
        'Injected by position, not regex: the first "\nBEGIN" after $function$ is',
        'the main block opener, nested ones always come later. A regex with .*',
        'could match a deeper block depending on greediness, and a guard sitting',
        'inside an inner branch is a guard that never runs.',
        '',
        'Verified behaviourally rather than by grepping for the text. Three paths,',
        'all as intended: a server call with no JWT passes; a real member passes;',
        'a logged-in user from another company is rejected. The third is the hole',
        'itself, and it is closed.',
        '',
        'One mistake caught before shipping: the watcher recognises a guard by',
        'looking for company_members or auth.uid() in the body. The new guard calls',
        'assert_company_access, which contains neither - so the six functions just',
        'secured would still have counted as exposed. That is the worst failure',
        'mode available here: the number refuses to move while the work is being',
        'done, and real progress reads as none. Watcher and guard ship together.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.729 pushed - six highest-risk functions now check membership" -ForegroundColor Green
}
