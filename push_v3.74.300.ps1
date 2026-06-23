$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.299.ps1") { Remove-Item -LiteralPath "push_v3.74.299.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.300"') {
    Write-Host "+ 3.74.300" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "lib/shipping/adapters/bosta-adapter.ts" -Raw
foreach ($n in @("'GET', '/deliveries?limit=1'",'[bosta-adapter] testConnection','keyTail')) {
    if ($ba -notmatch [regex]::Escape($n)) {
        Write-Host "X bosta-adapter missing: $n" -ForegroundColor Red; exit 1
    }
}
if ($ba -match "'/users/me'") {
    Write-Host "X bosta-adapter still calls /users/me" -ForegroundColor Red; exit 1
}
Write-Host "+ bosta-adapter: testConnection uses /deliveries?limit=1 + diagnostic log" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_300.txt"
    $msgLines = @(
        'fix(shipping): v3.74.300 - Bosta testConnection uses /deliveries instead of /users/me',
        '',
        'Owner pasted a fresh valid Bosta API key into the shipping settings,',
        '"Test connection" returned: "Invalid authorization token or API key".',
        'The key was confirmed correct end-to-end (64-char hex ending in 54d,',
        'status "active" / scope "full control" in the Bosta dashboard).',
        '',
        'Root cause: the Bosta adapter called GET /users/me to verify auth.',
        'Bosta v2 returns the "Invalid authorization token or API key"',
        'message for that endpoint when the key is a *business* key (which',
        'is what every Bosta merchant has). The endpoint expects a user',
        'session, not a business API key, so it rejects the key as',
        'unauthorised even though the key is valid for the business API.',
        '',
        'lib/shipping/adapters/bosta-adapter.ts',
        '  - testConnection now hits GET /deliveries?limit=1, which is',
        '    the canonical "any read" call for a business account. It',
        '    returns 200 with an (often empty) list when auth is OK and',
        '    a 401 / auth error when the key is wrong.',
        '  - Added a redacted diagnostic console.log: URL, last 4 chars',
        '    of the key, key length, success boolean, error code, error',
        '    message. Lets us read auth failures from Vercel runtime',
        '    logs the next time this comes up without redeploying.',
        '',
        'No code in createShipment / trackShipment / cancelShipment / etc.',
        'changed - those already hit the right endpoints. Only the test',
        'gate at provider-add time was broken.',
        '',
        'Files',
        '  lib/shipping/adapters/bosta-adapter.ts',
        '  lib/version.ts -> 3.74.300'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.300 pushed" -ForegroundColor Green
}
