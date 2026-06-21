$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.257.ps1") { Remove-Item -LiteralPath "push_v3.74.257.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.258"') {
    Write-Host "+ 3.74.258" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath "supabase/migrations/20260620000258_v3_74_258_exclude_cancelled_invoices_receivables_and_badge.sql")) {
    Write-Host "X migration missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_258.txt"
    $msgLines = @(
        "fix(reports): v3.74.258 - cancelled invoices stop polluting receivables + dispatch badge",
        "",
        "Two RPC bugs found while testing the pre-shipment refund fix from",
        "v3.74.257 against INV-00005 in notniche:",
        "",
        "1) get_customers_overview.inv_agg summed receivables across ALL",
        "   invoices including 'cancelled'. After v3.74.257 zeroed paid_amount",
        "   on the cancelled INV-00005, the receivables for that customer",
        "   jumped to 1600 (= total - 0 paid - 0 returned). Cancelled / fully_",
        "   returned / draft invoices now contribute zero.",
        "",
        "2) get_user_approval_badges.dispatch_approval counted any invoice",
        "   with warehouse_status='pending' as a pending dispatch approval,",
        "   including cancelled ones. INV-00005's warehouse_status never",
        "   reset on cancel, so the sidebar showed 1 while the page (filtered",
        "   by status IN sent/paid/partially_paid) was empty. The badge now",
        "   matches the page filter. The bills badge gets the same treatment.",
        "",
        "Both fixes applied directly to the live RPCs and committed as a",
        "documentation migration so the history reads cleanly.",
        "",
        "Files",
        "  supabase/migrations/20260620000258_v3_74_258_exclude_cancelled_invoices_receivables_and_badge.sql",
        "  lib/version.ts -> 3.74.258"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.258 pushed" -ForegroundColor Green
}
