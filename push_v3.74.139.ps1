$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.138.ps1") { Remove-Item -LiteralPath "push_v3.74.138.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.139"') { Write-Host "+ 3.74.139" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(procurement): v3.74.139 - block empty / placeholder line items on PO save

User reported: it was possible to save a purchase order with no
product picked. Investigation confirmed two paths into the bug:

  1) The mandatory-items check on POST /api/purchase-orders only
     fired for material-shortage POs and for privileged-role linked-
     bill creates. A normal purchasing_officer or accountant could
     POST { items: [] } directly to the API and end up with an empty
     PO. The form's 'items.length === 0' guard helped one path but
     not the API.

  2) The form's Add Item button injects a placeholder row with
     product_id=null and quantity=0. The save path then mapped this
     to the API as { product_id: null, quantity: 0 } and the API
     accepted it (the row was inserted into purchase_order_items but
     orphan from any real product), producing a PO with junk lines.

Fixes:

  app/api/purchase-orders/route.ts (server, authoritative)
    - Unconditional 'commandItems.length > 0' check at the top of
      validation, regardless of role or source.
    - Per-row guard: every item must have product_id, quantity > 0
      and unit_price >= 0. Returns the 1-based row numbers that
      failed so the UI can highlight them. 422 with Arabic error.

  app/purchase-orders/new/page.tsx (client UX)
    - Same per-row check before fetch. The user gets an instant
      message naming the bad row instead of a 422 round-trip.

  app/purchase-orders/[id]/edit/page.tsx (client UX, edit path)
    - Same per-row check. The edit page writes to Supabase directly
      so the server-side guard above doesn't apply here; without
      this an edit could still save placeholder rows.

DB-layer guard intentionally not added: the row-level constraint
would need a DEFERRED trigger because purchase_orders and
purchase_order_items are inserted in two separate statements. The
two-tier (API + edit client) coverage is sufficient because the
edit path is the only writer that bypasses the API, and both writers
are now validated." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.139 pushed" -ForegroundColor Green
}
