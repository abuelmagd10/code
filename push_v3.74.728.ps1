$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.727.ps1") { Remove-Item -LiteralPath "push_v3.74.727.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.728"') {
    Write-Host "+ 3.74.728" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.728]")) { Write-Host "X CHANGELOG missing [3.74.728]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m = "supabase/migrations/20260719000729_v3_74_728_phase2_batch1_revoke_authenticated.sql"
if (-not (Test-Path $m)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$r = Get-Content -LiteralPath $m -Raw

if ($r -notmatch "FROM PUBLIC, anon, authenticated") {
    Write-Host "X batch 1 no longer revokes authenticated" -ForegroundColor Red; exit 1
}
if ($r -notmatch "GRANT EXECUTE ON FUNCTION.*TO service_role") {
    Write-Host "X batch 1 revokes without granting service_role - server calls would fail" -ForegroundColor Red; exit 1
}
Write-Host "+ batch 1 revokes authenticated, keeps service_role" -ForegroundColor Green

# create_audit_log was deliberately held back: test_audit_trail calls it as
# SECURITY INVOKER, so revoking would depend on the caller's own grants.
if ($r -match "'create_audit_log'") {
    Write-Host "X create_audit_log is in the batch - it has a SECURITY INVOKER caller and was held back on purpose" -ForegroundColor Red; exit 1
}
Write-Host "+ create_audit_log still excluded" -ForegroundColor Green

# Every name in the batch must be absent from app code. If one turns up, the
# app calls it directly and revoking authenticated WOULD break that call.
$names = [regex]::Matches($r, "'([a-z0-9_]+)'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$appFiles = Get-ChildItem -Path "app","lib","components","hooks" -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue
$appText  = ($appFiles | Get-Content -Raw -ErrorAction SilentlyContinue) -join "`n"
$leaked = @()
foreach ($n in $names) {
    if ($n.Length -lt 8) { continue }
    if ($appText -match [regex]::Escape($n)) { $leaked += $n }
}
if ($leaked.Count -gt 0) {
    Write-Host "X these are called from app code and must NOT lose authenticated:" -ForegroundColor Red
    $leaked | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
    exit 1
}
Write-Host "+ none of the batch is referenced in app code ($($names.Count) checked)" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$m" "push_v3.74.728.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.727.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_728.txt"
    $msgLines = @(
        'security: v3.74.728 - phase 2 batch 1, unguarded writers 116 -> 87',
        '',
        'The correct fix for the remaining exposure is a membership check inside',
        'each function. That means editing 116 live accounting function bodies at',
        'once, which is exactly the kind of sweeping change that breaks one thing',
        'while fixing another. So I looked for a smaller piece that could be done',
        'safely first.',
        '',
        'Some of these functions are internal helpers no application code calls;',
        'they are invoked by other database functions and triggers. A SECURITY',
        'DEFINER function runs as its owner, so those internal calls never consult',
        'the caller''s grants - revoking authenticated changes nothing about how',
        'they behave, and removes them from the attack surface entirely.',
        '',
        'List built in three passes: the 116 unguarded writers; drop any name',
        'appearing ANYWHERE in app/lib/components/hooks .ts/.tsx - deliberately',
        'wider than matching rpc() calls, so a dynamically-built call site cannot',
        'slip past (82 matched, 30 did not); then check for SECURITY INVOKER',
        'callers inside the database, which would depend on the caller''s grants.',
        'One turned up: create_audit_log, called by test_audit_trail. Held back',
        'rather than assumed harmless - a deferred function is cheaper than a',
        'broken one.',
        '',
        'The remaining 29 are now service_role only. The dashboard counter falls',
        'from 116 to 87, verified against the live database.',
        '',
        'The 87 left ARE called by the application, so they cannot be fixed by',
        'revoking a grant - each needs a membership check, in batches. The pattern',
        'has to respect that many are invoked server-side as service_role, where',
        'auth.uid() is null: if there is an end-user identity it must belong to the',
        'company; if there is none the call came from the API layer, which already',
        'checked.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.728 pushed - 29 internal-only writers locked to service_role" -ForegroundColor Green
}
