$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.129.ps1") { Remove-Item -LiteralPath "push_v3.74.129.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.130"') { Write-Host "+ 3.74.130" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(purchases): v3.74.130 - auto-created bill starts draft+pending, not approved

After tracing the full Procure-to-Pay cycle with the user we found
that the bills auto-created by approve_purchase_order_atomic were
inserted with status='approved' + approval_status='approved' on the
same line as PO approval. That meant:

1) The branch accountant had nothing to approve - the bill was
   marked as financially approved the second the owner/GM said yes
   to the PO. The v3.74.129 'please approve this draft bill'
   notification arrived on a row already labelled as approved,
   defeating the workflow.

2) bills.status='approved' is not in the UI label map (we read
   app/bills/page.tsx:287, getStatusLabel only maps draft / received
   / sent / partially_paid / paid / cancelled / fully_returned /
   partially_returned). The bill rendered with the raw English token.

3) No journal entry was posted at any point until confirm-receipt,
   which is the warehouse step. So AP showed a -4 deviation
   throughout the window between PO approval and warehouse receipt -
   the integrity check that flagged it on BILL-0002 was correct.

Two-part fix in this release; no schema change.

DB (migration v3_74_130_bill_starts_draft_pending):
- Replaces approve_purchase_order_atomic so the new bill is inserted
  with status='draft', approval_status='pending', approved_by=NULL,
  approved_at=NULL. Everything else in the RPC is byte-for-byte the
  same (role/branch checks, audit row, bill_items copy, PO bill_id
  link). The downstream chain - approveBill (sets approval_status=
  approved while keeping status=draft), submitForReceipt (status=
  sent), confirm-receipt (status=received + JE + inventory) - keeps
  working exactly as before.

UI (app/bills/page.tsx getStatusLabel):
- Added 'approved' and 'rejected' to both labelsAr and labelsEn, and
  changed 'sent' from 'مستلمة' / 'Received' to 'مرسلة للاستلام' /
  'Sent for Receipt' so the warehouse-pending state reads correctly.

Manual data fix on BILL-0002 (no script needed in the repo):
- Deleted the JE-BF0002-* backfill journal entry I had posted earlier
  in this thread - that was the wrong call once we understood the
  full workflow. JE posts at confirm-receipt, not at any earlier step.
- Reset BILL-0002 to status='draft' + approval_status='pending' so it
  re-enters the new correct workflow that the accountant has to drive." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.130 pushed" -ForegroundColor Green
}
