$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.729.ps1") { Remove-Item -LiteralPath "push_v3.74.729.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.730"') {
    Write-Host "+ 3.74.730" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.730]")) { Write-Host "X CHANGELOG missing [3.74.730]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m1 = "supabase/migrations/20260719000732_v3_74_730_assert_company_access_batch3.sql"
$m2 = "supabase/migrations/20260719000733_v3_74_730_guard_cannot_be_swallowed.sql"
foreach ($m in @($m1, $m2)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}
$r1 = Get-Content -LiteralPath $m1 -Raw
$r2 = Get-Content -LiteralPath $m2 -Raw

# THE point of this release. 42501 is swallowed by the EXCEPTION WHEN OTHERS
# handlers that 15 of these functions carry; 57014 is not. Reverting this line
# silently reopens the hole in every one of them while everything still LOOKS
# guarded.
if ($r2 -notmatch "ERRCODE = '57014'") {
    Write-Host "X the guard no longer raises 57014 - WHEN OTHERS handlers would swallow it again" -ForegroundColor Red; exit 1
}
if ($r2 -match "ERRCODE = '42501'") {
    Write-Host "X 42501 is back - it is catchable and 15 callers catch it" -ForegroundColor Red; exit 1
}
Write-Host "+ guard raises an uncatchable errcode" -ForegroundColor Green

if ($r2 -notmatch "IF v_uid IS NULL THEN") {
    Write-Host "X server-side calls are no longer exempt - every API route would break" -ForegroundColor Red; exit 1
}
if ($r2 -notmatch "company_members") {
    Write-Host "X the guard does not check membership at all" -ForegroundColor Red; exit 1
}
Write-Host "+ server calls exempt, membership actually checked" -ForegroundColor Green

# Bootstrap and billing paths must stay out. Guarding create_branch_atomic
# rejects the first branch of a brand-new company, because membership is being
# created BY that very call.
foreach ($excluded in @('create_branch_atomic', 'seed_default_role_permissions', 'run_daily_reconciliation')) {
    if ($r1 -notmatch "'$excluded'") {
        Write-Host "X $excluded is no longer excluded - this breaks company signup or a system job" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ bootstrap and system-wide functions still excluded" -ForegroundColor Green

if ($r1 -notmatch [regex]::Escape('position(E''\nBEGIN'' in substr(v_def, v_start))')) {
    Write-Host "X the patcher stopped anchoring on the main BEGIN by position" -ForegroundColor Red; exit 1
}
Write-Host "+ patcher anchors by position" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$m1" "$m2" "push_v3.74.730.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.729.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_730.txt"
    $msgLines = @(
        'security: v3.74.730 - the guard was being swallowed, 81 -> 19',
        '',
        'Batch 3 applies the membership guard to every remaining writer taking',
        'p_company_id: 69 functions. Fifteen are deliberately excluded, because the',
        'guard bites whenever there is a browser session and these run before the',
        'caller is a member: company and branch bootstrap (membership is created BY',
        'those calls, so checking it first rejects the first branch of a new company',
        'and breaks signup), the system-wide reconciliation job, subscription and',
        'seat billing paths, and cross-cutting infrastructure. Guarding those the',
        'lazy way trades a security hole for a broken signup, which is not a trade.',
        '',
        'Then behavioural testing found what every structural check had passed:',
        'validate_three_way_matching let an outsider reach the business logic even',
        'though the guard was provably the first statement in its body. The function',
        'wraps its work in EXCEPTION WHEN OTHERS. The guard raised 42501, the',
        'handler caught it, and execution continued as if nothing happened. 15 of',
        'the 69 have such a handler.',
        '',
        'That is the worst available outcome: the dashboard counts them secured, the',
        'code reads secured, the hole is open. No amount of grepping for the guard',
        'would have found it - the guard is present, correctly placed, correctly',
        'written. Only calling the function as an outsider revealed it.',
        '',
        'Fixed with a documented PL/pgSQL rule, verified here rather than assumed:',
        'WHEN OTHERS does not trap query_canceled. 42501 is swallowed; 57014 passes',
        'through. The guard now raises 57014. Semantically that code means a',
        'cancelled query, not an authorisation refusal - a real cost, paid',
        'knowingly, because a guard some callers can switch off is not a guard.',
        '',
        'Re-tested after the fix: server call passes, member passes, outsider',
        'rejected in a function WITH a WHEN OTHERS handler, and outsider rejected in',
        'one without.',
        '',
        'Known follow-up: PostgREST maps 57014 to a timeout-ish HTTP status, so the',
        'Arabic message arrives with a misleading status code. Worth mapping in the',
        'client error handler.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.730 pushed - 69 functions guarded, guard now uncatchable" -ForegroundColor Green
}
