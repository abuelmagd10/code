$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.137.ps1") { Remove-Item -LiteralPath "push_v3.74.137.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.138"') { Write-Host "+ 3.74.138" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(procurement): v3.74.138 - end-to-end notification flow per product spec

User-supplied procurement spec (Arabic):
  Step 1 PO created    -> owner + manager
  Step 2 PO approved   -> creator + accountant (dedup if creator==accountant)
  Step 3 PO rejected   -> creator only
  Step 4 Bill edited   -> owner + manager (every edit, no caching)
  Step 5 Bill approved -> same as Step 2
  Step 6 Bill rejected -> creator only (PO creator, not bill creator)
  Step 7 Submit recpt  -> store_manager of bill branch
  Step 8 Receipt OK    -> owner + manager + accountant + PO creator
  Step 9 Receipt NO    -> owner + manager + accountant + PO creator, loop to 4

Audit found 9 deviations and 5 systemic risks. This release closes
all of them in a single pass.

Changes by file:

  lib/services/purchase-order-notification.service.ts
    - notifyApprovalRequested: manager dispatch is now company-wide
      (was branch + cost_center, which silently filtered out managers
      whose member.cost_center diverged from the PO's).
    - notifyApprovedWorkflow: dropped the 'Incoming Goods' admin-only
      leadership-visibility ping (out of spec, caused inbox dup via
      owner-inherits-admin). Dropped cost_center from accountant
      role scope. Added creator-vs-accountant dedup: if PO creator
      is themselves an accountant, suppress the user-level ping and
      let the role-level draft-bill ping reach them once.

  lib/services/bill-receipt-notification.service.ts
    - notifySubmittedForReceipt: dropped cost_center filter on the
      store_manager role (latent v3.74.136 silent-filter pattern).
    - notifyReceiptRejected: spec list (owner + manager + accountant
      + PO creator). Dropped admin and general_manager. Owner and
      manager pings go company-wide; accountant scoped to branch +
      warehouse (no cost_center). PO creator resolved from the
      purchase_orders table directly (not bills.created_by_user_id,
      which is the owner who approved the PO at auto-create time).
    - buildBillReceiptConfirmedNotificationIntents: same cleanup
      for Step 8. Dropped general_manager. Dropped cost_center
      from accountant scope. Owner + manager go company-wide.
    - notifyBillApprovedToPurchaseOrderCreator: now also pings the
      branch accountant role (Step 5 = Step 2 per spec). Skips the
      role ping when PO creator is themselves an accountant so they
      don't get two rows.
    - notifyBillAdminRejected: now uses the ACTUAL PO creator (not
      bill.created_by_user_id) and removes the role-level accountant
      ping (Step 6 spec is 'creator only').

  app/api/bills/[id]/restart-approval-notifications/route.ts
    - Added per-edit nonce to the idempotency key so a second
      accountant edit fires a fresh 'بانتظار اعتمادكم' ping. Before,
      the trace layer returned cached and the spec-required
      'every edit re-pings' behavior never fired.

  app/bills/[id]/edit/page.tsx
    - Client now sends a per-save nonce in both the Idempotency-Key
      header and the JSON body, matching the route's new key shape.

Manual cleanup: none needed - this is a forward fix. The next time
the accountant edits a bill or the workflow advances a step, the
correct recipient list will apply. Existing notifications stay as-is.

Audit checked all 9 spec steps against the actual code. See
v3.74.137 commit message for the deeper 'archive-orders-eat-pings'
fix that this release builds on." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.138 pushed" -ForegroundColor Green
}
