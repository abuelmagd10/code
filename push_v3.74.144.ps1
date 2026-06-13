$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.143.ps1") { Remove-Item -LiteralPath "push_v3.74.143.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.144"') { Write-Host "+ 3.74.144" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(payments): v3.74.144 - smart correction button + amount-shown bug fix

User report during testing:
  1. Accountant recorded a vendor payment (3 EGP)
  2. Owner rejected it
  3. Accountant clicked 'Request correction' on the rejected row
  4. A new correction REQUEST was filed (formal workflow that
     produces an accounting reversal), even though the payment had
     never been approved or posted - so there was nothing to reverse
  5. The notification to the owner read 'بقيمَة 0' instead of the
     actual amount (3 EGP)

Two issues here:

  A. Wrong button behavior for the pre-approval scenario. A rejected
     payment hasn't touched the GL yet, so it should just be EDITED
     and re-submitted for approval - not routed through the formal
     correction workflow.

  B. Amount printed as 0 in the notification because vendor payments
     are stored with NEGATIVE amount (signed: -3 means 'paid 3 to
     vendor'). The code did Number(amount || 0).toLocaleString()
     which kept the sign or printed 0 depending on locale.

Fixes:

  app/api/payments/[id]/resubmit-after-reject/route.ts (NEW)
    - Dedicated endpoint for the pre-approval case.
    - Validates: payment is rejected + vendor payment + reason >= 5
      chars + caller is creator or owner/manager.
    - Edits the payment in place (amount/date/account/method/ref/
      notes), sets status = 'pending_approval', clears the
      rejection_reason, appends an audit stamp to notes.
    - Notifies owner + manager with 'دَفعَة مُعَدَّلَة بَعد رَفض —
      تَنتَظِر اعتمادكم' using Math.abs(amount).
    - Includes Date.now() in the event_key so a second resubmission
      fires a fresh ping rather than getting dedupped.

  app/payments/page.tsx
    - Smart button label and tooltip:
        rejected payment → 'تَعديل وإِعادَة الإِرسال'
        otherwise       → 'طَلَب تَصحيح' (unchanged)
    - Dialog submit handler now branches:
        vendor + rejected → POST /resubmit-after-reject
        vendor + other    → POST /vendor-request-correction
        customer          → POST /request-correction
    - Toast wording reflects which path ran.

  app/api/payments/[id]/vendor-request-correction/route.ts
    - amountStr now uses Math.abs(...) so the notification message
      shows the magnitude, not zero/negative.
    - Recipient roles: owner + manager (was owner +
      general_manager - same v3.74.133-class duplicate via role
      inheritance).

Same approval flow continues to fire only owner + manager (not the
full admin/general_manager fanout that v3.74.143 already cleaned up
in payment-approval-notification.service)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.144 pushed" -ForegroundColor Green
}
