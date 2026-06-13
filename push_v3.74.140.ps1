$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.139.ps1") { Remove-Item -LiteralPath "push_v3.74.139.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.140"') { Write-Host "+ 3.74.140" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(sales): v3.74.140 - extend empty-items guard from PO to entire sales cycle

After v3.74.139 patched the empty-items vulnerability in the
purchase order flow, an audit confirmed the SAME class of bug
existed in four sales-cycle entry points. The most dangerous one
(invoices POST) wrote directly to the general ledger, so a junk
zero-amount invoice could be created and post a zero JE.

Fixes (all follow the same pattern as v3.74.139: server-side
unconditional empty check + per-row product_id/quantity/unit_price
guard, plus client-side mirror so the user gets an instant message):

  app/api/invoices/route.ts (CRITICAL - GL writer)
    - Unconditional items.length > 0 guard before the
      create_sales_invoice_atomic RPC. Per-row check on
      product_id, quantity > 0, unit_price >= 0. Returns the
      1-based row numbers that failed.

  app/api/sales-orders/route.ts (HIGH)
    - Same unconditional + per-row check. Previously a normal user
      could POST { items: [] } and silently insert a sales-order
      header with no items, or rows with product_id=null that were
      filtered out further down the pipeline.

  app/sales-orders/[id]/edit/page.tsx (MEDIUM)
    - Edit page writes directly to Supabase (no API gateway). Added
      the same per-row check so the edit path matches the create
      path. Was silently dropping bad rows before.

  app/estimates/page.tsx (MEDIUM)
    - Estimates have NO API route at all - the page writes directly
      to estimates / estimate_items. Added the only available
      defense: client-side empty + per-row check. Important
      because estimates feed forward into sales-orders via
      convertToSO; junk rows here would propagate.

Already covered (verified during audit, no change needed):
  - lib/services/sales-invoice-update-command.service.ts already
    validates items.length, product_id, quantity > 0 and
    unit_price >= 0 (lines 84-90). This is the path for the
    invoice EDIT button.
  - sales_return_requests POST validates items at route:67 and
    filters at lib/sales-return-requests.ts:149.
  - customer_refund_requests has no items concept (single amount
    field with a DB CHECK > 0).
  - sales-returns POST takes no items[] payload.

Manual cleanup: none required. This is a forward fix; no
historical empty invoices were found.

Note: DB-level safety net (CHECK constraints / triggers) was
intentionally NOT added in this release. Parent header and items
arrive in separate INSERT statements so a column-level check
would need to be DEFERRED across the transaction, which would
complicate every legitimate insert path. The two-tier API+client
coverage is sufficient." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.140 pushed" -ForegroundColor Green
}
