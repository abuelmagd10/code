$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.198.ps1") { Remove-Item -LiteralPath "push_v3.74.198.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.199"') {
    Write-Host "+ 3.74.199" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$svc = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($svc -notmatch '\.in\("status",\s*\["active",\s*"partially_used"\]\)') {
    Write-Host "X service still filters status='active' only" -ForegroundColor Red; exit 1
}
if ($svc -notmatch 'partially_used.*"\s*:\s*"active"') {
    if ($svc -notmatch 'consumed\s*>\s*0\s*\?\s*"partially_used"') {
        Write-Host "X service missing partially_used branch in newStatus" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ refund service catches partially_used" -ForegroundColor Green

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_199.txt"
    $msgLines = @(
        "fix(customer-refund): v3.74.199 - executor missed partially_used credits",
        "",
        "Symptom: accountant submits a 3 EGP customer credit refund, owner",
        "approves it, the JE posts (Dr customer_credits / Cr cash) - but the",
        "customer_credits.used_amount on the source row stays at 0. The",
        "customers page keeps showing the pre-refund available + disbursed",
        "until the next time a refund consumes the row.",
        "",
        "Root cause: CustomerRefundCommandService.applyCustomerCredits()",
        "filtered the credits to consume with .eq('status','active'). Once",
        "a credit row had been touched once (the auto-fill trigger flips it",
        "to 'partially_used'), it became invisible to the executor: the GL",
        "side ran on the cash account but the credit row stayed put. This",
        "is the exact bug class fixed for the read path in v3.74.121 -",
        "the write path was missed.",
        "",
        "Fix:",
        "  - lib/services/customer-refund-command.service.ts",
        "    * .eq('status','active') -> .in('status', ['active','partially_used'])",
        "      so rows mid-consumption are eligible again.",
        "    * newStatus branch grows a 'partially_used' middle case so a",
        "      row that started partially_used does not flip back to",
        "      'active' after consumption.",
        "",
        "Data fix: the 3 EGP refund executed on 2026-06-17 left the source",
        "row at used_amount=0. A one-off UPDATE caught it up to used_amount=3",
        "(status stays partially_used because 3 + 5 < 10). An audit_logs",
        "entry traces the manual correction. The GL is unchanged.",
        "",
        "lib/version.ts -> 3.74.199."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.199 pushed" -ForegroundColor Green
}
