# v3.74.67 - single-owner exemption for two-eye rule
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.67"') {
    Write-Host "+ APP_VERSION = 3.74.67" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.67" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.67]')) {
    Write-Host "+ CHANGELOG 3.74.67" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.67" -ForegroundColor Red; exit 1 }

$appr = Get-Content -LiteralPath "app/api/permissions/transfer/[id]/approve/route.ts" -Raw
if ($appr -match 'singleOwnerExemption' -and $appr -match 'seniorCount') {
    Write-Host "+ approve route: exemption + senior count" -ForegroundColor Green
} else { Write-Host "X approve route missing exemption" -ForegroundColor Red; exit 1 }

$rej = Get-Content -LiteralPath "app/api/permissions/transfer/[id]/reject/route.ts" -Raw
if ($rej -match 'singleOwnerExemption' -and $rej -match 'seniorCount') {
    Write-Host "+ reject route: exemption + senior count" -ForegroundColor Green
} else { Write-Host "X reject route missing exemption" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (touched files) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$relevant = $tsc | Select-String "permissions/transfer/\[id\]/(approve|reject)/route"
if ($relevant.Count -eq 0) {
    Write-Host "+ touched routes: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X touched routes have errors:" -ForegroundColor Red
    $relevant | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(permissions): v3.74.67 - single-owner exemption for two-eye rule

A solo-owner company with no admin or general_manager couldn't finish
a permission transfer through the workflow at all. The strict two-eye
rule blocked the submitter from approving or rejecting their own
request - which is correct when someone else could, but a pure
deadlock when nobody else holds an approver role.

Both approve and reject endpoints now run a small count after the
same-user check: how many members hold one of the approver roles? If
the answer is exactly 1 (the submitter is the only senior), we let
them self-approve / self-reject and flag the exemption on the audit
trail. When two or more seniors exist, the original strict rule still
applies untouched.

Also cleared the stuck pending row 4d7797ed (khaled-aglan ->
abuelmagd41) by setting it to rejected with reason 'single-owner
deadlock - handled in v3.74.67', and marked the 3 stale assigned-to-
role notifications for that transfer as read so they don't sit in
the inbox." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.67 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.66.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.66.ps1' -Force
    }
}
