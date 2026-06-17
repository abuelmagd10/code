$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.211.ps1") { Remove-Item -LiteralPath "push_v3.74.211.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.212"') {
    Write-Host "+ 3.74.212" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($page -notmatch "'اسم المورد'") {
    Write-Host "X supplier column header missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch "const supplierName = suppliers\.find") {
    Write-Host "X supplierName lookup missing" -ForegroundColor Red; exit 1
}
Write-Host "+ supplier name column wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_212.txt"
    $msgLines = @(
        "feat(payments): v3.74.212 - add Supplier name column to supplier payments table",
        "",
        "Mirrors v3.74.211 on the supplier side. Pulled from the already",
        "loaded suppliers list - no extra round-trip.",
        "",
        "  app/payments/page.tsx",
        "    - New <th>: اسم المورد / Supplier (after Date)",
        "    - supplierName looked up from suppliers state; falls back to",
        "      '—' when the row references a supplier we cannot resolve",
        "      (e.g. shared visibility).",
        "",
        "  lib/version.ts -> 3.74.212"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.212 pushed" -ForegroundColor Green
}
