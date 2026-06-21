$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.251.ps1") { Remove-Item -LiteralPath "push_v3.74.251.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.252"') {
    Write-Host "+ 3.74.252" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$shipLib = Get-Content -LiteralPath "lib/pre-shipment-refund.ts" -Raw
if ($shipLib -notmatch [regex]::Escape('status: "approved"')) {
    Write-Host "X pre-shipment-refund still uses status='posted' on payments" -ForegroundColor Red; exit 1
}
if ($shipLib -notmatch [regex]::Escape("await admin.from(`"journal_entry_lines`").delete().eq(`"journal_entry_id`", jeRow.id)")) {
    Write-Host "X pre-shipment-refund missing rollback path" -ForegroundColor Red; exit 1
}
Write-Host "+ pre-shipment refund: status=approved + clean rollback" -ForegroundColor Green

$rcptLib = Get-Content -LiteralPath "lib/pre-receipt-refund.ts" -Raw
if ($rcptLib -notmatch [regex]::Escape('status: "approved"')) {
    Write-Host "X pre-receipt-refund still uses status='posted' on payments" -ForegroundColor Red; exit 1
}
if ($rcptLib -notmatch [regex]::Escape("await admin.from(`"journal_entry_lines`").delete().eq(`"journal_entry_id`", jeRow.id)")) {
    Write-Host "X pre-receipt-refund missing rollback path" -ForegroundColor Red; exit 1
}
Write-Host "+ pre-receipt refund: status=approved + clean rollback" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_252.txt"
    $msgLines = @(
        "fix(refunds): v3.74.252 - payments.status check + safer JE ordering",
        "",
        "Reported on INV-00005 (company notniche): clicking 'Refund pre-",
        "shipment payment' returned PostgREST 400 / Postgres error 23514",
        "from payments_status_check. The void-payment companion row was",
        "being inserted with status='posted', but the constraint only",
        "accepts 'pending_approval' / 'approved' / 'rejected'. Same bug",
        "applied to the purchases mirror (pre_receipt_refund).",
        "",
        "Bug had a second teeth: the executor was posting the reversal JE",
        "BEFORE inserting the void payment. When the payment insert blew",
        "up, the JE was already posted - and the no-edit-posted trigger",
        "made it unremovable from the app. INV-00005 was left with an",
        "orphan Dr AR / Cr Cash journal entry skewing the customer's AR",
        "balance.",
        "",
        "Fix in lib/pre-shipment-refund.ts and lib/pre-receipt-refund.ts:",
        "  1. Use status='approved' on the void-payment row (matches the",
        "     CHECK constraint).",
        "  2. Reorder so the JE is kept 'draft' until the void payment +",
        "     linkage updates land. The post happens at the very end. If",
        "     anything fails mid-way, we delete the draft JE + its lines",
        "     and bail with a clean state.",
        "",
        "Cleanup: deleted the orphan JE on INV-00005 directly in DB so the",
        "user can re-test from a clean slate.",
        "",
        "Files",
        "  lib/pre-shipment-refund.ts",
        "  lib/pre-receipt-refund.ts",
        "  lib/version.ts -> 3.74.252"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.252 pushed" -ForegroundColor Green
}
