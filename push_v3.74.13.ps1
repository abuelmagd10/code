# v3.74.13 hotfix - store_manager 403 on sales-return-requests workflow
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.13"') { Write-Host "+ APP_VERSION = 3.74.13" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.13" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.13\]' -and $cl -match 'store_manager 403') {
    Write-Host "+ CHANGELOG entry for 3.74.13 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.13 entry" -ForegroundColor Red; exit 1 }

# Three endpoints - generic requirePermission removed
$gt = Get-Content -LiteralPath "app/api/sales-return-requests/route.ts" -Raw
if ($gt -notmatch 'requirePermission:.*"invoices",\s*action:\s*"read"') {
    Write-Host "+ GET list no longer requires invoices:read" -ForegroundColor Green
} else { Write-Host "X GET still requires invoices:read" -ForegroundColor Red; exit 1 }

$wa = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/warehouse-approve/route.ts" -Raw
if ($wa -notmatch 'requirePermission:.*"invoices",\s*action:\s*"write"') {
    Write-Host "+ warehouse-approve no longer requires invoices:write" -ForegroundColor Green
} else { Write-Host "X warehouse-approve still requires invoices:write" -ForegroundColor Red; exit 1 }

$wr = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/warehouse-reject/route.ts" -Raw
if ($wr -notmatch 'requirePermission:.*"invoices",\s*action:\s*"write"') {
    Write-Host "+ warehouse-reject no longer requires invoices:write" -ForegroundColor Green
} else { Write-Host "X warehouse-reject still requires invoices:write" -ForegroundColor Red; exit 1 }

# Sanity: the role allowlist below is STILL present in each file
if ($gt -match 'allowedRoles\.has\(member\.role\)') {
    Write-Host "+ GET still has role-allowlist gate" -ForegroundColor Green
} else { Write-Host "X GET lost its role-allowlist gate (DANGEROUS)" -ForegroundColor Red; exit 1 }

if ($wa -match 'SALES_RETURN_WAREHOUSE_ROLES') {
    Write-Host "+ warehouse-approve still has SALES_RETURN_WAREHOUSE_ROLES gate" -ForegroundColor Green
} else { Write-Host "X warehouse-approve lost its role gate (DANGEROUS)" -ForegroundColor Red; exit 1 }

if ($wr -match 'SALES_RETURN_WAREHOUSE_ROLES') {
    Write-Host "+ warehouse-reject still has SALES_RETURN_WAREHOUSE_ROLES gate" -ForegroundColor Green
} else { Write-Host "X warehouse-reject lost its role gate (DANGEROUS)" -ForegroundColor Red; exit 1 }

# Other two endpoints (level-1 approve/reject + POST) UNCHANGED
$po = Get-Content -LiteralPath "app/api/sales-return-requests/route.ts" -Raw
if ($po -match 'requirePermission:.*"invoices",\s*action:\s*"write"') {
    Write-Host "+ POST (create) keeps its invoices:write check (correct)" -ForegroundColor Green
} else { Write-Host "X POST lost its invoices:write check" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/approve/route.ts" -Raw
if ($ap -match 'requirePermission:.*"invoices",\s*action:\s*"write"') {
    Write-Host "+ level-1 approve keeps its invoices:write check (correct)" -ForegroundColor Green
} else { Write-Host "X level-1 approve lost its check" -ForegroundColor Red; exit 1 }

$rj = Get-Content -LiteralPath "app/api/sales-return-requests/[id]/reject/route.ts" -Raw
if ($rj -match 'requirePermission:.*"invoices",\s*action:\s*"write"') {
    Write-Host "+ level-1 reject keeps its invoices:write check (correct)" -ForegroundColor Green
} else { Write-Host "X level-1 reject lost its check" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        CHANGELOG.md `
        "app/api/sales-return-requests/route.ts" `
        "app/api/sales-return-requests/[id]/warehouse-approve/route.ts" `
        "app/api/sales-return-requests/[id]/warehouse-reject/route.ts" 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(rbac): v3.74.13 - store_manager 403 on sales-return workflow endpoints

Ahmed reported: after level-1 approves a sales return, the notification
reaches the store manager. Clicking 'fath al-mu raja' lands them on
/sales-return-requests but the page shows 'fasal tahmil al-talabat'.

Root cause: three workflow endpoints under /api/sales-return-requests
had a generic requirePermission: invoices:read|write check on top of
the SALES_RETURN_*_ROLES allowlist that already authorizes the workflow:

  GET /api/sales-return-requests          required invoices:read
  PATCH /[id]/warehouse-approve           required invoices:write
  PATCH /[id]/warehouse-reject            required invoices:write

The store_manager role in Ahmed's strict v3.69.0 spec is
  inventory, inventory_transfers, third_party_inventory,
  write_offs, dispatch_approvals, inventory_goods_receipt
  -- no invoices.

So the generic check 403'd every store_manager hitting these endpoints,
blocking the very role those endpoints exist to serve.

Same shape as v3.74.7 (where store_manager couldn't see customer names
on dispatch approvals because resource-aware RLS denied them customers).

Fix: removed the generic requirePermission from those three endpoints.
The role-allowlist check (SALES_RETURN_WAREHOUSE_ROLES / LEVEL1_APPROVER)
was already present right after the secureApiRequest call - it is the
correct workflow-scoped gate. secureApiRequest still enforces auth +
company; only the misplaced generic resource check was dropped.

NOT changing the other endpoints in this group:
  POST /api/sales-return-requests              -- requires invoices:write
  PATCH /[id]/approve   (level-1 review)       -- requires invoices:write
  PATCH /[id]/reject    (level-1 review)       -- requires invoices:write

These are reached by management roles (owner / admin / general_manager /
manager / accountant) who DO have invoices in the strict spec, so the
generic check is harmless and remains as defense in depth.

Files:
  Modified: app/api/sales-return-requests/route.ts (GET)
  Modified: app/api/sales-return-requests/[id]/warehouse-approve/route.ts
  Modified: app/api/sales-return-requests/[id]/warehouse-reject/route.ts
  Modified: lib/version.ts (3.74.12 -> 3.74.13)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.13 pushed" -ForegroundColor Green
}
