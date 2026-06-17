$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.210.ps1") { Remove-Item -LiteralPath "push_v3.74.210.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.211"') {
    Write-Host "+ 3.74.211" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($page -notmatch "'اسم العميل'") {
    Write-Host "X customer column header missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch "'الحساب \(نقد/بنك\)'") {
    Write-Host "X account column header missing" -ForegroundColor Red; exit 1
}
if ($page -notmatch "accountLabel") {
    Write-Host "X accountLabel rendering missing" -ForegroundColor Red; exit 1
}
Write-Host "+ customer name + cash/bank columns wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_211.txt"
    $msgLines = @(
        "feat(payments): v3.74.211 - add Customer + Cash/Bank account columns to customer payments table",
        "",
        "User asked for two extra columns on the customer payments table:",
        "the customer name and the cash/bank account each payment was",
        "deposited into. Both are pulled from data the page already loads",
        "(customers list + accounts list), so this is a UI-only change with",
        "no extra round-trips.",
        "",
        "  app/payments/page.tsx",
        "    - New <th>: اسم العميل / Customer (after Date)",
        "    - New <th>: الحساب (نقد/بنك) / Account (after Amount)",
        "    - The map callback was reshaped into an arrow body so the row",
        "      can compute customerName + accountLabel once instead of",
        "      inlining the lookups in JSX.",
        "    - Both columns fall back to '—' when the lookup fails (e.g.",
        "      shared visibility hid the customer or the account row).",
        "",
        "  lib/version.ts -> 3.74.211"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.211 pushed" -ForegroundColor Green
}
