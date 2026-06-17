$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.203.ps1") { Remove-Item -LiteralPath "push_v3.74.203.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.204"') {
    Write-Host "+ 3.74.204" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -notmatch "z-\[100\] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto") {
    Write-Host "X overlay missing pointer-events-auto" -ForegroundColor Red; exit 1
}
if ($page -notmatch "max-w-md mx-4 pointer-events-auto") {
    Write-Host "X inner card missing pointer-events-auto" -ForegroundColor Red; exit 1
}
Write-Host "+ apply-credit dialog now accepts pointer events while payment dialog is open" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_204.txt"
    $msgLines = @(
        "fix(invoice): v3.74.204 - apply-credit dialog must accept pointer events while Record-Payment is open",
        "",
        "v3.74.203 raised the apply-credit overlay above the Record-Payment",
        "Radix dialog with z-[100]. Visually it appeared on top, but the",
        "Apply Credit button still did nothing - the user reported the same",
        "click-swallow.",
        "",
        "Root cause: Radix Dialog disables pointer events on the document body",
        "while it is open and only re-enables them on the Radix portal content.",
        "Our apply-credit overlay lives outside that portal, so the body-level",
        "rule cascaded down and blocked the clicks even at z-[100].",
        "",
        "Fix: pointer-events-auto on BOTH the overlay AND the inner card",
        "guarantees the Tailwind utility wins over Radix's body restriction.",
        "Buttons inside the apply-credit dialog now work whether it was",
        "launched from the outer banner or from the inner v3.74.202 banner",
        "inside the payment dialog.",
        "",
        "  app/invoices/[id]/page.tsx (pointer-events-auto on both layers)",
        "  lib/version.ts -> 3.74.204"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.204 pushed" -ForegroundColor Green
}
