$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.613.ps1") { Remove-Item -LiteralPath "push_v3.74.613.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.614"') {
    Write-Host "+ 3.74.614" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Confirm the production console-strip is wired into next.config.mjs
$cfg = Get-Content -LiteralPath "next.config.mjs" -Raw
if ($cfg -notmatch 'removeConsole') {
    Write-Host "X removeConsole missing from next.config.mjs" -ForegroundColor Red; exit 1
}
Write-Host "+ production console strip present (keeps error/warn)" -ForegroundColor Green

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
    "next.config.mjs" `
    "lib/version.ts" `
    "push_v3.74.614.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.613.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_614.txt"
    $msgLines = @(
        'perf(build): v3.74.614 - strip console.* (except error/warn) in production',
        '',
        'Reduces main-thread work during interactions (helps the INP',
        '"blocked UI updates" warnings) and keeps the browser console clean',
        'in front of clients. Uses Next.js compiler.removeConsole, applied to',
        'production builds ONLY - local dev keeps all logs, and',
        'console.error / console.warn are preserved so real diagnostics and',
        'Sentry keep working.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.614 pushed - quiet production console" -ForegroundColor Green
}
