$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.114.ps1") { Remove-Item -LiteralPath "push_v3.74.114.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.115"') { Write-Host "+ 3.74.115" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(refund-requests): v3.74.115 - requester executes after approval

User report on v3.74.114:
  1) After approve, the requester did not get a 'please execute now'
     notification (the existing one said 'now under execution from
     accounting', which is wrong under the new SoD model).
  2) The Execute button did not appear for the requester, only for
     the board. So the workflow stalled after approval.
  3) Notifications all opened /customer-refund-requests on the
     Pending filter, even when the recipient was a requester
     looking at an Approved row.

Segregation of duties model (v3.74.115):
  - Requester  proposes the correction
  - Owner/GM  approves or rejects
  - Requester  executes the approved correction
  The approver is now blocked from also being the executor (DB-side
  RPC will run regardless of caller, but the HTTP route rejects the
  approver), so the request cannot be silently push-button completed
  by one person.

Changes:
  - /api/customer-refund-requests/[id]/execute now allows the
    requester (and owner/GM as back-office fallback), but rejects
    the approver to enforce SoD.
  - /api/customer-refund-requests/[id]/approve sends the requester
    a high-priority notification saying 'approved - click Execute',
    with event_key suffix ':approved_requester'.
  - /customer-refund-requests page:
      - reads ?status= from the URL so notification deep links land
        on the correct filter (Pending, Approved, Executed).
      - per-row gating: approve/reject only for board (canApprove),
        Execute for the requester (canExecuteRow), with an
        'Awaiting requester' hint shown to the approver in their
        own row to make the SoD rule visible.
  - lib/notification-routing.ts: customer_refund_request route now
    derives the status filter from the event_key suffix
    (:approved_/:executed:/:rejected:/:requested:).
  - /customer-refund-requests page: subscribes to Supabase Realtime
    on customer_refund_requests filtered by company_id, so the status
    cards (pending/approved/executed) refresh the moment anyone in
    the company touches a request — no manual reload needed." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.115 pushed" -ForegroundColor Green
}
