$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.311.ps1") { Remove-Item -LiteralPath "push_v3.74.311.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.312"') {
    Write-Host "+ 3.74.312" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "lib/shipping/base-adapter.ts" -Raw
foreach ($n in @(
    'v3.74.312 — log failure details on the server',
    'keyTail=...'
)) {
    if ($ba -notmatch [regex]::Escape($n)) {
        Write-Host "X base-adapter missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ base-adapter: verbose error logging wired" -ForegroundColor Green

$bo = Get-Content -LiteralPath "lib/shipping/adapters/bosta-adapter.ts" -Raw
foreach ($n in @(
    'AUTH_INVALID',
    'بوسطة رفضت الـ API key',
    'Create Delivery'
)) {
    if ($bo -notmatch [regex]::Escape($n)) {
        Write-Host "X bosta-adapter missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ bosta-adapter: actionable Arabic message on 401/403" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_312.txt"
    $msgLines = @(
        'fix(shipping): v3.74.312 - clearer Bosta auth-failure message',
        '',
        'Owner saw "تعذّر إنشاء الشحنة فى bosta - Invalid authorization',
        'token or API key" on a key whose testConnection was reporting',
        '"Connection successful". The mismatch is real but the root cause',
        'is on the Bosta side: /cities (the ping endpoint we use for',
        'testConnection) does not actually require authentication, so a',
        '200 there proves the URL but does NOT prove the key is allowed',
        'to create deliveries. Bosta tier-gates write permission',
        'separately from read.',
        '',
        'Changes',
        '  - base-adapter: log every HTTP failure (provider, method,',
        '    endpoint, status, keyTail, keyLen, raw response snippet)',
        '    to the server console. We can read Bosta''s real error',
        '    from Vercel runtime logs without redeploying.',
        '  - bosta-adapter: when createShipment hits 401/403 or any',
        '    "invalid token" wording, return a fixed Arabic message',
        '    that explains the actual fix path: open Bosta dashboard,',
        '    Settings > API, and either grant Create Delivery permission',
        '    to the existing key or generate a new one with full access.',
        '',
        'Files',
        '  lib/shipping/base-adapter.ts',
        '  lib/shipping/adapters/bosta-adapter.ts',
        '  lib/version.ts -> 3.74.312'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.312 pushed" -ForegroundColor Green
}
