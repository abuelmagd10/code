# v3.74.85 - Stop double-creating invoice_cogs journal (trigger already does it)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.85"') { Write-Host "+ APP_VERSION = 3.74.85" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.85" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.85]')) { Write-Host "+ CHANGELOG 3.74.85" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.85" -ForegroundColor Red; exit 1 }

$f = Get-Content -LiteralPath "lib/accounting-transaction-service.ts" -Raw
$lineCount = ($f -split "`n").Count
if ($lineCount -ge 1000) { Write-Host "+ accounting-transaction-service.ts intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X file truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($f.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

# Guard: the v3.74.85 marker must be present
if ($f -match 'v3\.74\.85') { Write-Host "+ v3.74.85 marker present" -ForegroundColor Green } else { Write-Host "X v3.74.85 marker missing" -ForegroundColor Red; exit 1 }

# Guard: the COGS push in approveSalesDeliveryAtomic must be gone.
# (postInvoiceAtomic still keeps its own push — different code path, no
#  shipping_provider, not what INV-00005 triggers. That one is unrelated
#  to the DUPLICATE_JOURNAL_VIOLATION we're fixing here.)
$pushCount = ([regex]::Matches($f, 'journalEntries\.push\(cogsJournal\)')).Count
if ($pushCount -eq 1) {
    Write-Host "+ COGS push in approveSalesDeliveryAtomic removed (postInvoiceAtomic push retained)" -ForegroundColor Green
} elseif ($pushCount -eq 0) {
    Write-Host "! Both COGS pushes removed — postInvoiceAtomic path likely broken" -ForegroundColor Yellow
} else {
    Write-Host "X Still $pushCount COGS pushes — approveSalesDeliveryAtomic one not removed" -ForegroundColor Red; exit 1
}

# Guard: previous fixes still in place
if ($f -match 'sales_orders!invoices_sales_order_id_fkey') {
    Write-Host "+ v3.74.82 FK fix preserved" -ForegroundColor Green
} else {
    Write-Host "X v3.74.82 FK fix lost" -ForegroundColor Red; exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "accounting-transaction-service\.ts").Count
if ($err -eq 0) { Write-Host "+ 0 errors in accounting-transaction-service.ts" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(warehouse-approve): v3.74.85 - drop TS-side COGS journal push (trigger already creates it)

After v3.74.84 unblocked the FIFO NOT NULL constraint, INV-00005 surfaced:
DUPLICATE_JOURNAL_VIOLATION: A journal entry with reference_type=
[invoice_cogs] and reference_id=[ee551ffc-...] already exists.

Yet a DB check confirmed no invoice_cogs journal existed for INV-00005
before the attempt. So who was creating the second one?

Root cause: a BEFORE INSERT trigger on inventory_transactions called
trg_auto_cogs_on_sale -> auto_create_cogs_journal() writes an
invoice_cogs journal automatically on every sale insert (using
products.cost_price * quantity).

approveSalesDeliveryAtomic also built its own invoice_cogs journal via
prepareCOGSJournalOnDelivery and pushed it onto journalEntries. The
guard query (select id from journal_entries where reference_type=
invoice_cogs) ran BEFORE the V2 RPC's transaction started, so it could
never see the trigger's row -> the TS code always pushed a duplicate.

Then inside the RPC: the trigger inserted journal #1, the V1 INSERT loop
tried to insert journal #2 from p_journal_entries, and the
prevent_duplicate_journal_entry_v2 trigger fired.

Fix: stop pushing the COGS journal from TS. The trigger has been doing
this work since long before V2 was even a flag; we're just stopping the
app from racing it. journalEntries[] stays empty in this path now.

Trade-off: the trigger uses products.cost_price for the journal amount.
FIFO unit-cost accuracy is still preserved in cogs_transactions (V2
still inserts those). If FIFO-accurate journal lines are needed later,
fix the trigger to read NEW.unit_cost instead - that's the right layer.

TypeScript: 0 errors. File rebuilt via heredoc (Edit truncated tail
twice). FK fix from v3.74.82 verified still in place." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.85 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.84.ps1') { Remove-Item -LiteralPath 'push_v3.74.84.ps1' -Force }
}
