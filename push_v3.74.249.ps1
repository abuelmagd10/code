$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.248.ps1") { Remove-Item -LiteralPath "push_v3.74.248.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.249"') {
    Write-Host "+ 3.74.249" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/inventory/dispatch-approvals/page.tsx" -Raw
if ($page -match [regex]::Escape("['sent', 'paid', 'partially_paid']")) {
    Write-Host "+ dispatch queue includes partially_paid invoices" -ForegroundColor Green
} else {
    Write-Host "X dispatch queue still filters partially_paid out" -ForegroundColor Red
    exit 1
}

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_249.txt"
    $msgLines = @(
        "fix(dispatch-approvals): v3.74.249 - show partially_paid invoices in the queue",
        "",
        "Reported: company notniche, invoice INV-00005. Customer paid 1500",
        "of 1600. status flipped to 'partially_paid', warehouse_status was",
        "'pending'. The dispatch officer opened the approvals page and the",
        "invoice was missing - no row to approve, no path to ship the",
        "remaining stock against the partial payment.",
        "",
        "Root cause: app/inventory/dispatch-approvals/page.tsx filters the",
        "invoices query with",
        "  .eq('warehouse_status', 'pending')",
        "  .in('status', ['sent', 'paid'])",
        "Anything in 'partially_paid' fell through both branches and the",
        "queue silently dropped it. Other parts of the codebase (the AI",
        "context-builder in lib/ai/context-builder.ts at lines 426, 769,",
        "1213) already treat partially_paid as shippable. The dispatch",
        "queue was the outlier.",
        "",
        "Fix: add 'partially_paid' to the status whitelist so the queue",
        "matches the rest of the codebase. A partially-paid invoice still",
        "needs warehouse approval before stock leaves; the unpaid",
        "remainder is recognised as AR on the books, which is the right",
        "primitive (the accountant collects it, the warehouse ships).",
        "",
        "Files",
        "  app/inventory/dispatch-approvals/page.tsx",
        "  lib/version.ts -> 3.74.249"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.249 pushed" -ForegroundColor Green
}
