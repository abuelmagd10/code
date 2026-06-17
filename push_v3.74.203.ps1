$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.202.ps1") { Remove-Item -LiteralPath "push_v3.74.202.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.203"') {
    Write-Host "+ 3.74.203" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -notmatch "z-\[100\] flex items-center justify-center bg-black/50") {
    Write-Host "X apply-credit overlay not bumped to z-[100]" -ForegroundColor Red
    exit 1
}
Write-Host "+ apply-credit overlay raised above Radix Dialog" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_203.txt"
    $msgLines = @(
        "fix(invoice): v3.74.203 - apply-credit dialog must sit above Record-Payment",
        "",
        "v3.74.202 surfaced the apply-credit button inside the Record-Payment",
        "Radix dialog. Clicking it appeared to do nothing because the apply-",
        "credit overlay used z-50, the same level Radix Dialog uses for its",
        "overlay+content. The payment dialog stayed on top and swallowed every",
        "click on the apply-credit dialog underneath it.",
        "",
        "Fix: the apply-credit overlay is now z-[100], so it opens cleanly",
        "above the payment dialog. After the credit is applied, loadInvoice()",
        "fires (existing behaviour) and the payment dialog underneath shows",
        "the fresh remaining balance.",
        "",
        "  app/invoices/[id]/page.tsx (z-50 -> z-[100] on the apply-credit overlay)",
        "  lib/version.ts -> 3.74.203"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.203 pushed" -ForegroundColor Green
}
