$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.238.ps1") { Remove-Item -LiteralPath "push_v3.74.238.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.239"') {
    Write-Host "+ 3.74.239" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$route = Get-Content -LiteralPath "app/api/contact/route.ts" -Raw
if ($route -notmatch 'SUPPORT_EMAIL = process\.env\.SUPPORT_EMAIL \|\| "info@7esab\.com"') {
    Write-Host "X SUPPORT_EMAIL default not info@7esab.com" -ForegroundColor Red; exit 1
}
Write-Host "+ SUPPORT_EMAIL default points at info@7esab.com (Zoho inbox)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_239.txt"
    $msgLines = @(
        "fix(contact): v3.74.239 - support inbox back on info@7esab.com",
        "",
        "Zoho Mail is now live for the 7esab.com domain:",
        "  - Vercel DNS: Amazon SES inbound MX deleted (was at priority 9,",
        "    intercepting inbound mail). Zoho MX records (mx/mx2/mx3.zoho.com)",
        "    are now the only inbound path.",
        "  - Public DNS lookup confirms Zoho-only MX, propagated.",
        "  - info@7esab.com user exists in Zoho and verified as super admin;",
        "    MX verification triggered manually in Zoho admin panel.",
        "  - End-to-end test: customer auto-reply still works, support",
        "    inquiry now reaches a real inbox.",
        "",
        "Code change: flip SUPPORT_EMAIL default in app/api/contact/route.ts",
        "from the temporary Gmail (7esab.erb@gmail.com, set in v3.74.238)",
        "back to info@7esab.com. The env var still wins, so production can",
        "still override either way without a deploy.",
        "",
        "  app/api/contact/route.ts",
        "  lib/version.ts -> 3.74.239"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.239 pushed" -ForegroundColor Green
}
