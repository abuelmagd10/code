$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.209.ps1") { Remove-Item -LiteralPath "push_v3.74.209.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.210"') {
    Write-Host "+ 3.74.210" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
$count = ([regex]::Matches($page, "is_deleted\.is\.null,is_deleted\.eq\.false")).Count
if ($count -lt 4) {
    Write-Host "X expected at least 4 is_deleted filters, found $count" -ForegroundColor Red
    exit 1
}
Write-Host "+ payments page filters soft-voided rows ($count occurrences)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_210.txt"
    $msgLines = @(
        "fix(payments): v3.74.210 - hide soft-voided payments from the list",
        "",
        "v3.74.209 added a compensating soft-void path for createPayment",
        "failures (is_deleted=true + status='rejected') and cleaned up the",
        "one orphan row from before the deploy. After the deploy the user",
        "reported the same row was still on the payments page.",
        "",
        "Cause: the page's four payments queries (customer initial load,",
        "supplier initial load, customer realtime refresh, supplier",
        "realtime refresh) never filtered is_deleted. The row was hidden",
        "in the DB sense but still surfaced visually.",
        "",
        "Fix: every payments SELECT on /payments now adds",
        "  .or('is_deleted.is.null,is_deleted.eq.false')",
        "Null is treated as not-deleted so historical rows that pre-date",
        "the column keep showing.",
        "",
        "  app/payments/page.tsx (4 queries patched)",
        "  lib/version.ts -> 3.74.210"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.210 pushed" -ForegroundColor Green
}
