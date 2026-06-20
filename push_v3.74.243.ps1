$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.242.ps1") { Remove-Item -LiteralPath "push_v3.74.242.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.243"') {
    Write-Host "+ 3.74.243" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$svc = Get-Content -LiteralPath "lib/services/shareholder-capital-command.service.ts" -Raw
if ($svc -notmatch "ensureCapitalAccount") {
    Write-Host "X ensureCapitalAccount helper missing" -ForegroundColor Red; exit 1
}
if ($svc -match 'Capital account was not found for') {
    Write-Host "X service still throws the legacy 'Capital account was not found' error" -ForegroundColor Red; exit 1
}
Write-Host "+ shareholder capital service self-heals missing equity account" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_243.txt"
    $msgLines = @(
        "fix(shareholders): v3.74.243 - auto-create the capital account on first contribution",
        "",
        "Reported right after v3.74.242 went out: trying to record the new",
        "back-dated contribution for سيف الدين returned 500",
        "  Capital account was not found for سيف الدين",
        "",
        "Root cause: the v3.74.241 cleanup of the orphan JE-000001 also",
        "dropped the now-empty 'رأس مال - سيف الدين' equity account from",
        "chart_of_accounts (correct), but the shareholder row was kept (also",
        "correct). The contribution service used loadCapitalAccount which",
        "returns null when the per-shareholder equity row is missing, then",
        "threw a hard error. The UI page (app/shareholders/page.tsx) only",
        "creates that account when a shareholder is added, never on demand,",
        "so any later state where the account is missing wedges the form.",
        "",
        "Fix: introduce ensureCapitalAccount() in the service. It tries",
        "loadCapitalAccount first; if absent it picks the next equity",
        "code (max(existing)+1 or 3000), inserts a new",
        "  account_type = equity",
        "  normal_balance = credit",
        "  description = 'حساب رأس مال خاص بالمساهم'",
        "  is_active = true",
        "row, and returns it. Identical to the UI's create path, so the",
        "user can't tell whether the account was pre-existing or just made.",
        "",
        "recordContribution now calls ensureCapitalAccount instead of",
        "loadCapitalAccount and no longer throws the legacy 500.",
        "",
        "  lib/services/shareholder-capital-command.service.ts",
        "  lib/version.ts -> 3.74.243"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.243 pushed" -ForegroundColor Green
}
