$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.737.ps1") { Remove-Item -LiteralPath "push_v3.74.737.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.738"') {
    Write-Host "+ 3.74.738" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.738]")) { Write-Host "X CHANGELOG missing [3.74.738]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$a = Get-Content -LiteralPath "app/api/audit-log/route.ts" -Raw

# The session must be established BEFORE the insert. The original bug was pure
# ordering: the service-role branch returned before reaching the auth check
# written below it, making that check dead code in production.
$authIdx   = $a.IndexOf("auth.getUser")
$insertIdx = $a.IndexOf("audit_logs').insert")
if ($authIdx -lt 0) { Write-Host "X audit-log no longer establishes a session" -ForegroundColor Red; exit 1 }
if ($insertIdx -ge 0 -and $authIdx -gt $insertIdx) {
    Write-Host "X audit-log inserts before authenticating - the auth check is dead code again" -ForegroundColor Red; exit 1
}
Write-Host "+ audit-log authenticates before writing" -ForegroundColor Green

# Identity must come from the session, never the request body.
if ($a -match "user_id:\s*userId") {
    Write-Host "X audit-log takes user_id from the request body - entries become forgeable" -ForegroundColor Red; exit 1
}
if ($a -match "company_id:\s*companyId\s*\|\|") {
    Write-Host "X audit-log trusts the caller's companyId without verifying membership" -ForegroundColor Red; exit 1
}
if ($a -notmatch "company_members") {
    Write-Host "X audit-log no longer verifies membership of the claimed company" -ForegroundColor Red; exit 1
}
Write-Host "+ identity derived from the session, company verified" -ForegroundColor Green

# The rule must stay shape-based. Name-based matching is what rejected my own
# fix, and before that three guards rejected their own documentation.
$js = Get-Content -LiteralPath "scripts/check-service-role-scoping.js" -Raw
if ($js -match "authUser\\.id|\\\\buserId\\\\b") {
    Write-Host "X the membership rule matches variable NAMES again" -ForegroundColor Red; exit 1
}
if ($js -notmatch [regex]::Escape('.eq\(\s*["' + "'" + ']user_id["' + "'" + ']\s*,/')) {
    Write-Host "X the membership rule no longer checks for a user_id filter" -ForegroundColor Red; exit 1
}
Write-Host "+ membership rule matches shape, not names" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }
Write-Host "+ check passes" -ForegroundColor Green

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
    "app/api/audit-log/route.ts" `
    "scripts/check-service-role-scoping.js" `
    "push_v3.74.738.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.737.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_738.txt"
    $msgLines = @(
        'security: v3.74.738 - the audit log accepted forged entries from anyone',
        '',
        'POST /api/audit-log inserted the row and returned before reaching the',
        'session check written below it. In production, where the URL and service',
        'key are always present, that check was unreachable code. An',
        'unauthenticated request could write action, company_id, user_id,',
        'user_email, old_data and new_data of its choosing into any company''s',
        'audit trail.',
        '',
        'That is worse than it first sounds. The audit log is what you consult when',
        'there is a dispute about who did what. A log anyone can write to is not',
        'evidence, and a forged entry blaming a real employee is indistinguishable',
        'from a true one.',
        '',
        'The session is now established first, user_id comes from it, and a claimed',
        'company is only honoured after checking membership. Identity fields in the',
        'body are ignored rather than trusted. Logging failures still never block',
        'the caller''s workflow, as before.',
        '',
        'Six other flagged routes were my rule being wrong, not the code:',
        'account-lines, billing/preview, billing/seats, bonuses/settings,',
        'company-logo and send-purchase-order all scope correctly, via',
        '.eq("id", companyId) on the companies row or a joined path. I widened the',
        'rule rather than touching them. False positives are not merely annoying -',
        'they are how a check becomes something nobody reads.',
        '',
        'And then the script rejected my own fix, because the membership rule',
        'required the session variable to be called user, authUser or userId, and I',
        'had called it sessionUser. Fifth time in two days that a rule of mine',
        'matched a NAME rather than a SHAPE: three guards rejected their own',
        'comments, one counter counted the word TRIGGER in GRANT lines, and now',
        'this. The shape that matters is a company_members lookup filtered by both',
        'company and user. What the variable is called is nobody''s business.',
        '',
        'Ratchet: 11 -> 4.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.738 pushed - audit log entries are attributable again" -ForegroundColor Green
}
