$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.760.ps1") { Remove-Item -LiteralPath "push_v3.74.760.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.761"') {
    Write-Host "+ 3.74.761" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.761]")) { Write-Host "X CHANGELOG missing [3.74.761]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The mirrored stub must be the neutralised one, not the original. If a future
# edit restores the deleting body, this refuses to ship it.
$stub = Get-Content -LiteralPath "supabase/functions/delete-non-vitaslims-users/index.ts" -Raw
foreach ($forbidden in @("auth\.admin\.deleteUser", "auth\.admin\.listUsers", "SUPABASE_SERVICE_ROLE_KEY")) {
    if ($stub -match $forbidden) {
        Write-Host "X the mirrored edge function still contains: $forbidden" -ForegroundColor Red
        Write-Host "  This file must stay a refusal stub." -ForegroundColor Red
        exit 1
    }
}
if ($stub -notmatch "status: 410") {
    Write-Host "X the stub must answer 410" -ForegroundColor Red; exit 1
}
Write-Host "+ delete-non-vitaslims-users is mirrored as a refusal stub" -ForegroundColor Green

# All three deployed edge functions must now have a folder here. The whole point
# of this release is that the unmirrored one was the dangerous one.
foreach ($fnDir in @("delete-non-vitaslims-users", "notification-escalation", "update-exchange-rates")) {
    if (-not (Test-Path "supabase/functions/$fnDir/index.ts")) {
        Write-Host "X edge function not mirrored in the repo: $fnDir" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all three deployed edge functions are mirrored" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/functions/delete-non-vitaslims-users/index.ts" `
    "push_v3.74.761.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.760.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_761.txt"
    $msgLines = @(
        'security(edge): v3.74.761 - a public endpoint that deleted every user account',
        '',
        'delete-non-vitaslims-users was deployed with verify_jwt = false and no',
        'authentication check in the body. It ignored the request entirely, built a',
        'service-role client, listed every user in the project and deleted all of',
        'them except five hardcoded ids.',
        '',
        'One unauthenticated HTTP request to a predictable URL destroyed every',
        'customer account, irreversibly. Almost certainly a one-off development',
        'cleanup script that was never removed.',
        '',
        'Neutralised immediately rather than after asking: account deletion cannot',
        'be undone and there was no upside to leaving it live. Redeployed with',
        'verify_jwt = true AND a 410 body, so it is closed twice. The owner should',
        'still delete the function outright in the dashboard.',
        '',
        'Why nothing caught it. It was never in this repository - deployed straight',
        'to production, so it was never reviewed by anyone. The other two edge',
        'functions are both mirrored here and both are written defensively; that is',
        'not a coincidence. And every sweep run this week examined Postgres',
        'functions. An edge function is not a Postgres function, so all of them',
        'reported clean while this sat live.',
        '',
        'Exactly the lesson of v3.74.760, in a second place: what is not in the',
        'repository does not get looked at. There the gap would have restored three',
        'dropped functions from a stale snapshot; here it hid a total account wipe.',
        '',
        'Two smaller notes, both the familiar shape of protection that is described',
        'but not implemented:',
        '',
        '  notification-escalation says "only Cron or authenticated requests" and',
        '  checks the HTTP method. Low impact - it only creates escalation',
        '  notifications, guarded by event keys and a 3-level cap.',
        '',
        '  update-exchange-rates checks its secret with if (expectedSecret), so it',
        '  fails open when the secret is unset. Low impact - it takes no rates from',
        '  the caller. CRON_SECRET should be verified as set.',
        '',
        'The push script now refuses this release if the mirrored stub ever regains',
        'listUsers, deleteUser or a service-role key, and requires all three',
        'deployed functions to have a folder in the repo.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.761 pushed - the account-wipe endpoint is closed and mirrored" -ForegroundColor Green
}
