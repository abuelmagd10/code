# v3.74.11 - server-side bonus trigger (correct salesperson attribution)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.11"') { Write-Host "+ APP_VERSION = 3.74.11" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.11" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.11\]' -and $cl -match 'bonus-calculator.service') {
    Write-Host "+ CHANGELOG entry for 3.74.11 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.11 entry" -ForegroundColor Red; exit 1 }

# New service file exists
if (Test-Path -LiteralPath "lib/services/bonus-calculator.service.ts") {
    Write-Host "+ bonus-calculator.service.ts created" -ForegroundColor Green
} else { Write-Host "X bonus-calculator.service.ts missing" -ForegroundColor Red; exit 1 }

# Service file exports the function
$bs = Get-Content -LiteralPath "lib/services/bonus-calculator.service.ts" -Raw
if ($bs -match 'export\s+(async\s+)?function\s+calculateBonusForPaidInvoice') {
    Write-Host "+ calculateBonusForPaidInvoice exported" -ForegroundColor Green
} else { Write-Host "X export missing" -ForegroundColor Red; exit 1 }

# Payment service calls the bonus service on paid transition
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-payment-command.service.ts" -Raw
if ($svc -match 'result\.new_status\s*===\s*"paid"' -and $svc -match 'calculateBonusForPaidInvoice') {
    Write-Host "+ payment service triggers bonus on paid transition" -ForegroundColor Green
} else { Write-Host "X payment service does not trigger bonus" -ForegroundColor Red; exit 1 }

# /api/bonuses POST delegates to the shared service
$rt = Get-Content -LiteralPath "app/api/bonuses/route.ts" -Raw
if ($rt -match 'calculateBonusForPaidInvoice' -and $rt -notmatch 'invoice\.status\s*!==\s*"paid"') {
    Write-Host "+ /api/bonuses POST delegates to shared service (no duplicate logic)" -ForegroundColor Green
} else { Write-Host "X /api/bonuses still has inline logic" -ForegroundColor Red; exit 1 }

# Client-side bonus fetch is gone
$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -notmatch 'fetch\("/api/bonuses"' -and $pg -notmatch 'canAction\(supabase,\s*"bonuses"') {
    Write-Host "+ client-side bonus fetch removed" -ForegroundColor Green
} else { Write-Host "X client still calls /api/bonuses" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        "lib/services/bonus-calculator.service.ts" `
        "lib/services/sales-invoice-payment-command.service.ts" `
        "app/api/bonuses/route.ts" `
        "app/invoices/[id]/page.tsx" 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(bonus): v3.74.11 - server-side trigger so the salesperson always gets paid

Ahmed asked after v3.74.10: 'is the bonus now being calculated correctly
for the sales-order creator?' Honest answer was NO. v3.74.10 fixed the
console noise from the /api/bonuses 403 by skipping the call entirely
when the current user lacked bonuses:write. But the bonus is supposed
to go to the SALESPERSON who created the sales order, not whoever
pressed Record Payment. Skipping the call meant the salesperson
silently lost their commission every time an accountant or warehouse
manager closed the invoice for them.

Same governance gap as before v3.74.10, just dressed up nicer.

Architecture:

  New: lib/services/bonus-calculator.service.ts
    calculateBonusForPaidInvoice({ admin, invoiceId, companyId,
      actorUserId }) -> typed result envelope:
      { ok: true, bonus, configSource, creatorSource, beneficiaryUserId }
      { ok: false, skipped: true, reason }
      { ok: false, skipped: false, error }
    All original rules preserved: salesperson-first attribution,
    per-employee config override, monthly cap, idempotency.

  Updated: SalesInvoicePaymentCommandService.recordPayment
    After the atomic payment RPC succeeds and result.new_status='paid',
    it dynamically imports the service and calls it with the admin
    (service-role) client. Failures are logged but never bubble up -
    the payment is already committed.

  Updated: POST /api/bonuses
    Refactored to delegate to the same service. Same translated Arabic
    error messages for the skip reasons (already_calculated -> 409,
    monthly_cap_reached -> 400, etc). Still gated by
    requirePermission: bonuses:write for manual UI callers.

  Updated: app/invoices/[id]/page.tsx
    Removed the client-side fetch entirely. Now there's only a comment
    pointing at the server-side trigger.

Why server-side is the correct architecture (not a workaround):

  - The bonus is NOT the requesting user's bonus. There's no business
    rule that says 'you can only generate a commission if you have
    bonuses:write.' The actor is incidental; the beneficiary is on
    the sales order.
  - Previous client-side design conflated two distinct permissions:
    'can record a payment' (every cashier needs this) and
    'can manage the bonuses dashboard' (manager-only). The atomic
    payment workflow shouldn't require the second to do the first.
  - Defense in depth preserved: POST /api/bonuses STILL requires
    bonuses:write - that gate exists for the manual UI, not for the
    implicit lifecycle hook.

Files:
  New:    lib/services/bonus-calculator.service.ts
  Modified:
    lib/services/sales-invoice-payment-command.service.ts
    app/api/bonuses/route.ts
    app/invoices/[id]/page.tsx
    lib/version.ts (3.74.10 -> 3.74.11)
    CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.11 pushed" -ForegroundColor Green
}
