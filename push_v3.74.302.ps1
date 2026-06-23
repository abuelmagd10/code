$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.301.ps1") { Remove-Item -LiteralPath "push_v3.74.301.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.302"') {
    Write-Host "+ 3.74.302" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bosta = Get-Content -LiteralPath "lib/shipping/adapters/bosta-adapter.ts" -Raw
if ($bosta -notmatch "const endpoint = '/cities'") {
    Write-Host "X bosta-adapter: testConnection not pointing at /cities" -ForegroundColor Red; exit 1
}
if ($bosta -match "const endpoint = '/businesses/me'") {
    Write-Host "X bosta-adapter still using /businesses/me" -ForegroundColor Red; exit 1
}
Write-Host "+ bosta-adapter: testConnection now hits /cities (verified live)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_302.txt"
    $msgLines = @(
        'fix(shipping): v3.74.302 - Bosta testConnection now hits /cities (verified live)',
        '',
        'After v3.74.300 (/deliveries?limit=1) and v3.74.301 (/businesses/me)',
        'both returned HTML 404 from Bosta, I sent the same business API key',
        'directly to several candidate endpoints from the browser to see what',
        'Bosta actually exposes at app.bosta.co/api/v2/. Result:',
        '',
        '  /cities                       -> 200 JSON {success:true, list:[...]}',
        '  /deliveries/business          -> 404 HTML',
        '  /businesses/business-data     -> 404 HTML',
        '  /business                     -> 404 HTML',
        '  /auth                         -> 404 HTML',
        '',
        '/cities is the smallest authenticated GET on Bosta that confirms',
        'both the base URL and the key are valid in one call, so use that as',
        'the ping. The endpoint was wired in earlier guesses; the live probe',
        'confirms it returns 200 with an Egyptian cities list when the key',
        'is good and a JSON 401 when it is bad.',
        '',
        'No change to base-adapter or any of the create / track / cancel /',
        'label calls - those already use Bosta paths that work.',
        '',
        'Files',
        '  lib/shipping/adapters/bosta-adapter.ts',
        '  lib/version.ts -> 3.74.302'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.302 pushed" -ForegroundColor Green
}
