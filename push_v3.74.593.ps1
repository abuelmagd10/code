$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.592.ps1") { Remove-Item -LiteralPath "push_v3.74.592.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.593"') {
    Write-Host "+ 3.74.593" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pss = Get-Content -LiteralPath "components/ProductSearchSelect.tsx" -Raw
if ($pss -notmatch "avoidCollisions") {
    Write-Host "X avoidCollisions override missing" -ForegroundColor Red; exit 1
}
Write-Host "+ forced-side placement (avoidCollisions off when side set)" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "components/ProductSearchSelect.tsx" `
    "lib/version.ts" `
    "push_v3.74.593.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.592.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(ui): v3.74.593 - force explicit side placement in ProductSearchSelect (avoidCollisions off when side requested; radix was overriding side=top back to bottom)" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.593 pushed" -ForegroundColor Green
}
