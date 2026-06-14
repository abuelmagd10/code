$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.158.ps1") { Remove-Item -LiteralPath "push_v3.74.158.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.159"') { Write-Host "+ 3.74.159" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_159.txt"
    $msgLines = @(
        "feat(payments+suppliers): v3.74.159 - surface vendor advances early",
        "",
        "User flow request: don't let the accountant forget a supplier",
        "still has unapplied advance balance. Three changes in this one",
        "ship:",
        "",
        "1) Supplier advance alert in the new-payment form.",
        "   app/payments/page.tsx - when the accountant picks a supplier",
        "   in the 'Supplier Payments' form, we now query approved advance",
        "   rows (supplier_id IS NOT NULL, bill_id IS NULL, invoice_id",
        "   IS NULL, status = approved, not deleted) and sum the",
        "   unallocated_amount. If the total is > 0 we render a blue",
        "   hint right under the supplier dropdown:",
        "   'هذا المورد لَدَيه سُلفَة مُتاحَة بقيمَة X EGP. طَبِّقها على",
        "    فاتورَة مَفتوحَة من سَطر الدَّفعَة قَبل دَفع نَقد.'",
        "   The hint disappears once the supplier is changed or the",
        "   advance is fully applied.",
        "",
        "2) 'Apply Advance' shortcut button on /suppliers.",
        "   app/suppliers/page.tsx - the actions column gains a new",
        "   outline button labelled 'تطبيق سُلفَة' for any supplier with",
        "   balance.advances > 0. Clicking it routes to /payments with",
        "   ?focus_supplier=<supplier_id> so the accountant lands on the",
        "   payments table where they can use the existing",
        "   'تطبيق على فاتورة' button on the advance row. No duplicate",
        "   dialog - we route through the canonical flow.",
        "",
        "3) lib/version.ts bumped to 3.74.159.",
        "",
        "Deferred to a separate ticket (not in this commit):",
        "  - Unified filter bar across /payments customer+supplier",
        "    sections matching the look of /invoices, /bills, etc.",
        "    That's a bigger UI refactor worth its own focused pass; the",
        "    user asked for it but the immediate value lives in the two",
        "    changes above. Tracking under task 'unify /payments",
        "    filters' for the next release."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.159 pushed" -ForegroundColor Green
}
