$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.237.ps1") { Remove-Item -LiteralPath "push_v3.74.237.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.238"') {
    Write-Host "+ 3.74.238" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$route = Get-Content -LiteralPath "app/api/contact/route.ts" -Raw
if ($route -notmatch '7esab\.erb@gmail\.com') {
    Write-Host "X SUPPORT_EMAIL default still points at info@7esab.com (not a real inbox)" -ForegroundColor Red; exit 1
}
Write-Host "+ SUPPORT_EMAIL default is now a real Gmail inbox" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_238.txt"
    $msgLines = @(
        "fix(contact): v3.74.238 - inquiries reach a real mailbox",
        "",
        "Bug report: test submission on the contact form shows 'Sent' in",
        "Resend's log for both the support email and the user auto-reply,",
        "but nothing actually arrives at info@7esab.com.",
        "",
        "Root cause: the 7esab.com domain is wired into Resend for",
        "OUTBOUND email only. There is no MX record pointing at a real",
        "info@7esab.com inbox, so every inquiry was being accepted by",
        "Resend and then black-holed at the destination. Resend's 'Sent'",
        "status only confirms upstream acceptance, not delivery.",
        "",
        "Fix: change the SUPPORT_EMAIL default in",
        "app/api/contact/route.ts from 'info@7esab.com' to the owner's",
        "live Gmail inbox '7esab.erb@gmail.com'. The env var still wins,",
        "so once a real info@ mailbox is set up the production override",
        "in Vercel can flip it back without another deployment.",
        "",
        "  app/api/contact/route.ts",
        "  lib/version.ts -> 3.74.238"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.238 pushed" -ForegroundColor Green
}
