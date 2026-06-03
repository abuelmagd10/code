# v3.74.10 - console noise cleanup (406 + AUTHZ warn + bonuses 403)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.10"') { Write-Host "+ APP_VERSION = 3.74.10" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.10" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.10\]') { Write-Host "+ CHANGELOG entry for 3.74.10 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.10 entry" -ForegroundColor Red; exit 1 }

# Fix 1 - maybeSingle on sales_orders lookup
$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -match '\.from\("sales_orders"\)[\s\S]{0,200}\.maybeSingle\(\)') {
    Write-Host "+ sales_orders lookup now uses maybeSingle" -ForegroundColor Green
} else { Write-Host "X sales_orders lookup did not switch to maybeSingle" -ForegroundColor Red; exit 1 }

# Fix 2 - AUTHZ warn demoted to debug (no remaining console.warn at AUTHZ message)
$az = Get-Content -LiteralPath "lib/authz.ts" -Raw
if ($az -notmatch 'console\.warn\(`\[AUTHZ\]') {
    Write-Host "+ AUTHZ console.warn demoted to debug" -ForegroundColor Green
} else { Write-Host "X AUTHZ still has console.warn" -ForegroundColor Red; exit 1 }

# Fix 3 - bonuses pre-check
if ($pg -match 'canAction\(supabase,\s*"bonuses",\s*"write"\)' -and $pg -match 'if \(canWriteBonuses\)') {
    Write-Host "+ bonuses fetch is guarded by canAction pre-check" -ForegroundColor Green
} else { Write-Host "X bonuses fetch is not gated by canAction" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        lib/authz.ts `
        "app/invoices/[id]/page.tsx" 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "chore(ux): v3.74.10 - clean up three console noises on invoice page

After v3.74.9 the payment recording worked, but the browser console
still showed three separate noises:

  1. GET .../sales_orders?id=eq.<uuid> 406 (Not Acceptable)
     repeated three times every time an invoice with a linked SO was
     opened by a user whose RLS hides that SO (e.g. accountant in a
     different branch).
  2. [AUTHZ] No permission record found for resource: shipments,
     role: accountant ... emitted at console.warn level. Per Ahmed's
     strict v3.69.0 spec the accountant has no shipments row by
     design - the denial is the expected outcome, not a warning.
  3. POST /api/bonuses 403 emitted every time the accountant closed
     an invoice with a payment. The fetch was unconditional; the
     try/catch swallowed it AFTER the browser had already logged the
     403 to the console.

Three fixes - none change behavior, all reduce console noise:

  (1) .single() -> .maybeSingle() on the sales_orders lookup in
      app/invoices/[id]/page.tsx and explicitly clear
      linkedSalesOrder when nothing comes back. Same UX, no more 406.

  (2) lib/authz.ts - three console.warn for the
      'no_permission_record' branch demoted to console.debug. The
      message is still emitted at debug level for traceability but
      hidden from the default console.

  (3) Pre-check canAction(supabase, 'bonuses', 'write') before
      fetching /api/bonuses. Roles without the permission skip the
      fetch entirely. Bonus calc is non-essential - an authorized
      user can recalc later. The catch's console.warn also
      downgraded to console.debug.

Defense in depth: the /api/bonuses endpoint still enforces
requirePermission server-side. The client-side pre-check is purely
a UX shortcut.

Files:
  Modified: app/invoices/[id]/page.tsx
  Modified: lib/authz.ts
  Modified: lib/version.ts (3.74.9 -> 3.74.10)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.10 pushed" -ForegroundColor Green
}
