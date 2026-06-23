$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.300.ps1") { Remove-Item -LiteralPath "push_v3.74.300.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.301"') {
    Write-Host "+ 3.74.301" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "lib/shipping/base-adapter.ts" -Raw
foreach ($n in @('rawText','Provider returned HTTP')) {
    if ($ba -notmatch [regex]::Escape($n)) {
        Write-Host "X base-adapter missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ base-adapter: text-first response read + HTML-aware error" -ForegroundColor Green

$bosta = Get-Content -LiteralPath "lib/shipping/adapters/bosta-adapter.ts" -Raw
if ($bosta -notmatch "/businesses/me") {
    Write-Host "X bosta-adapter: testConnection no longer uses /businesses/me" -ForegroundColor Red; exit 1
}
if ($bosta -match "/deliveries\?limit=1") {
    Write-Host "X bosta-adapter still calls /deliveries?limit=1" -ForegroundColor Red; exit 1
}
Write-Host "+ bosta-adapter: testConnection switched to /businesses/me" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_301.txt"
    $msgLines = @(
        'fix(shipping): v3.74.301 - Bosta testConnection on /businesses/me + HTML-aware errors',
        '',
        'After v3.74.300 moved the Bosta ping from /users/me to',
        '/deliveries?limit=1, the test surfaced "Unexpected token <,',
        '<!DOCTYPE ... is not valid JSON" - meaning Bosta returned an',
        'HTML 404 page (the path doesn''t exist at v2 read level) and the',
        'adapter blew up trying to JSON.parse it.',
        '',
        'Two fixes:',
        '',
        '  lib/shipping/base-adapter.ts',
        '    Read the response body as text first, then attempt JSON.parse',
        '    inside a try / catch. When the body is non-JSON (HTML error',
        '    pages from the provider) the adapter now returns an error',
        '    that includes the HTTP status code and a short text snippet,',
        '    so the operator can see something like "Provider returned',
        '    HTTP 404 - <!DOCTYPE html>..." instead of a JS parse error.',
        '',
        '  lib/shipping/adapters/bosta-adapter.ts',
        '    Switch testConnection from /deliveries?limit=1 to',
        '    /businesses/me. This is the canonical ping path for a',
        '    business API key on Bosta v2: returns 200 with business',
        '    info on a good key, 401 with a JSON error on a bad one.',
        '',
        'Files',
        '  lib/shipping/base-adapter.ts',
        '  lib/shipping/adapters/bosta-adapter.ts',
        '  lib/version.ts -> 3.74.301'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.301 pushed" -ForegroundColor Green
}
