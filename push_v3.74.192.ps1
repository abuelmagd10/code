$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.191.ps1") { Remove-Item -LiteralPath "push_v3.74.191.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.192"') {
    Write-Host "+ 3.74.192" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$cfg = Get-Content -LiteralPath "sentry.client.config.ts" -Raw
if ($cfg -notmatch "signal is aborted without reason") {
    Write-Host "X sentry filter missing AbortError message" -ForegroundColor Red
    exit 1
}
if ($cfg -notmatch "Failed to update a ServiceWorker") {
    Write-Host "X sentry filter missing SW message" -ForegroundColor Red
    exit 1
}
if ($cfg -notmatch 'exType === "AbortError"') {
    Write-Host "X beforeSend missing AbortError type check" -ForegroundColor Red
    exit 1
}
Write-Host "+ sentry filters present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_192.txt"
    $msgLines = @(
        "fix(sentry): v3.74.192 - filter AbortError + ServiceWorker noise",
        "",
        "Two issues in the Sentry 7d view are not real bugs:",
        "",
        "1. AbortError 'signal is aborted without reason' on /customers",
        "   (41 events, 2 users since v3.71.0).",
        "   Fires whenever the user navigates away while PermissionsContext,",
        "   CurrencySync, or useServerPagination are mid-request. All three",
        "   sites already catch AbortError, but the rejection still bubbles",
        "   to window.onunhandledrejection in some downstream Supabase /",
        "   fetch promise chains we can't reach from app code.",
        "",
        "   ignoreErrors was matching the old wording 'The user aborted a",
        "   request' but missed the modern Chrome message 'signal is",
        "   aborted without reason' from controller.abort() without a",
        "   reason argument. Adding the modern message AND a type check",
        "   in beforeSend so future browser-version wording shifts don't",
        "   re-open this issue.",
        "",
        "2. ServiceWorker update failure on /bills/:id (1 event).",
        "   Browser-level transient failure fetching sw.js. Not actionable",
        "   from app code; filtering as noise.",
        "",
        "Defence in depth:",
        "  - ignoreErrors gains the modern AbortError messages + SW failure",
        "  - beforeSend now drops events whose exception type is AbortError",
        "    or whose value matches /signal is aborted/ - so we stay clean",
        "    even if a future browser renames the message again.",
        "",
        "lib/version.ts",
        "  - Bumped to 3.74.192."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.192 pushed" -ForegroundColor Green
}
