$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.196.ps1") { Remove-Item -LiteralPath "push_v3.74.196.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.197"') {
    Write-Host "+ 3.74.197" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/customer-refund-requests/page.tsx" -Raw
if ($page -notmatch 'rejected:\s+visibleRequests') {
    Write-Host "X counts.rejected missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'cancelled:\s+visibleRequests') {
    Write-Host "X counts.cancelled missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'value="rejected"') {
    Write-Host "X filter dropdown missing rejected" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'lg:grid-cols-5') {
    Write-Host "X stats grid not 5 columns" -ForegroundColor Red; exit 1
}
Write-Host "+ 5 status cards + filter complete" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_197.txt"
    $msgLines = @(
        "fix(customer-refund-requests): v3.74.197 - surface all five statuses",
        "",
        "The customer_refund_requests schema allows five statuses (pending,",
        "approved, executed, rejected, cancelled), but the page only showed",
        "three stat cards (pending / approved / executed) and the filter",
        "dropdown was missing 'rejected'. The user reported that rejected",
        "and cancelled requests effectively disappeared from the page.",
        "",
        "  app/customer-refund-requests/page.tsx",
        "    - counts now covers all five statuses.",
        "    - Stats grid: grid-cols-2 (mobile) / sm:grid-cols-3 / lg:grid-cols-5",
        "      so the two new cards fit on every breakpoint.",
        "    - Added cards: Rejected (red) + Cancelled (gray).",
        "    - Filter dropdown: added 'Rejected'.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.197."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.197 pushed" -ForegroundColor Green
}
