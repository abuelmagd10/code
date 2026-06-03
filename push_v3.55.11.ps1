# v3.55.11 - Simplified: convertToSO opens /sales-orders/new with prefilled data
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw
$soNew = Get-Content "app\sales-orders\new\page.tsx" -Raw

# /estimates side
if ($est -match "so_prefill_from_estimate") {
    Write-Host "  + estimates page writes prefill to sessionStorage" -ForegroundColor Green
} else { Write-Host "  X estimates prefill write missing" -ForegroundColor Red; exit 1 }

if ($est -match "/sales-orders/new\?from=estimate") {
    Write-Host "  + estimates navigates to /sales-orders/new with from=estimate" -ForegroundColor Green
} else { Write-Host "  X navigation to /sales-orders/new missing" -ForegroundColor Red; exit 1 }

if ($est -notmatch "from\(.sales_orders.\)\.insert") {
    Write-Host "  + estimates no longer inserts into sales_orders directly" -ForegroundColor Green
} else { Write-Host "  X estimates still inserts into sales_orders" -ForegroundColor Red; exit 1 }

# /sales-orders/new side
if ($soNew -match "Prefill from /estimates") {
    Write-Host "  + /sales-orders/new has prefill loader" -ForegroundColor Green
} else { Write-Host "  X prefill loader missing in /sales-orders/new" -ForegroundColor Red; exit 1 }

if ($soNew -match 'sessionStorage\.getItem\("so_prefill_from_estimate"\)') {
    Write-Host "  + /sales-orders/new reads sessionStorage payload" -ForegroundColor Green
} else { Write-Host "  X sessionStorage read missing" -ForegroundColor Red; exit 1 }

if ($soNew -match 'sessionStorage\.removeItem\("so_prefill_from_estimate"\)') {
    Write-Host "  + /sales-orders/new clears sessionStorage after read" -ForegroundColor Green
} else { Write-Host "  X sessionStorage clear missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/estimates/page.tsx app/sales-orders/new/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(estimates): convertToSO now opens /sales-orders/new with prefilled data

Previous behavior:
convertToSO did a direct INSERT into sales_orders, which kept failing
because sales_orders has NOT NULL columns (branch_id, cost_center_id,
warehouse_id) and required complex branch-default lookups. Plus it
duplicated logic that already exists in /sales-orders/new.

New behavior:
- estimates page: stashes prefill payload in
  sessionStorage['so_prefill_from_estimate'] (customer_id, notes,
  branch_id, cost_center_id, items[]) then navigates to
  /sales-orders/new?from=estimate&estimate_id=...
- /sales-orders/new: on mount, reads the sessionStorage payload,
  prefills formData.customer_id + branchId + costCenterId + soItems,
  then clears the sessionStorage entry. User reviews and saves
  through the normal SO flow.

Benefits:
- No more 400 errors -- all validation runs in the SO page
- User reviews before save (can add shipping, change warehouse, etc.)
- Single source of truth for SO creation logic
- All SO features (bundles, currency, tax codes, shipping) work
  automatically
- Governance is enforced by the SO page itself" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.11 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  /estimates -> click 'Convert to Sales Order'" -ForegroundColor White
    Write-Host "  -> redirects to /sales-orders/new?from=estimate&estimate_id=..." -ForegroundColor White
    Write-Host "  -> customer + items + branch + cost_center prefilled" -ForegroundColor White
    Write-Host "  -> user reviews + clicks Save -> SO created normally" -ForegroundColor White
}
