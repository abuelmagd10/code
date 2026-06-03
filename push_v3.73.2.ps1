# v3.73.2 - Hybrid transfer execution (snapshot vs dynamic)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.73.2"') { Write-Host "+ APP_VERSION = 3.73.2" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.73.2" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.73.2\]') { Write-Host "+ CHANGELOG entry for 3.73.2 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.73.2 entry" -ForegroundColor Red; exit 1 }

$tr = Get-Content -LiteralPath "app/api/permissions/transfer/route.ts" -Raw
if ($tr -match 'snapshot_customer_ids' -and $tr -match 'snapshot_sales_order_ids') {
    Write-Host "+ transfer POST captures snapshot IDs at submit" -ForegroundColor Green
} else { Write-Host "X transfer POST snapshot capture missing" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/api/permissions/transfer/[id]/approve/route.ts" -Raw
if ($ap -match "p_mode: mode" -and $ap -match "body\?\.mode === ""dynamic""") {
    Write-Host "+ approve endpoint accepts body.mode + forwards to RPC" -ForegroundColor Green
} else { Write-Host "X approve endpoint mode wiring missing" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -match 'get_transfer_scope_counts' -and $usr -match 'has_drift') {
    Write-Host "+ /settings/users: drift-aware approve UI present" -ForegroundColor Green
} else { Write-Host "X drift-aware approve UI missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/api/permissions/transfer/route.ts `
        "app/api/permissions/transfer/[id]/approve/route.ts" `
        app/settings/users/page.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(transfers): v3.73.2 - hybrid execution (snapshot vs dynamic)

Ahmed noticed v3.73.0's executor operated on what source user
owns at approve time, not at submit time. If A submits with 12
customers then creates 5 more, the approver silently transfers
17 - different from what A requested. This was a real audit gap.

Fix:
  - At submit time, capture exact list of customer/sales_order
    IDs source user owns into transfer_data.snapshot_*_ids
  - New RPC get_transfer_scope_counts(transfer_id) returns
    snapshot_total, current_total, has_drift
  - Rewrote execute_permission_transfer(id, mode) to support:
      snapshot mode: only the captured IDs are re-owned
      dynamic mode: all current source records (legacy behavior)
  - approve API accepts body.mode (snapshot default)
  - Approve UI consults get_transfer_scope_counts before showing
    confirmation:
      no drift: single confirm (mode irrelevant)
      with drift: two confirms - first offers snapshot (N at
        submit), second offers dynamic (M now)
  - transfer_data.execution_mode stamped on completion so audit
    trail shows which mode ran

Verify:
  1. Submit transfer with 12 customers - snapshot_customer_ids
     length = 12
  2. No drift -> single confirm
  3. Drift -> two confirms, pick either, count matches
  4. transfer_data.execution_mode = snapshot or dynamic
  5. audit_logs description includes mode

Files:
  DB migration: v3_73_2_hybrid_transfer_snapshot_mode
  Modified: app/api/permissions/transfer/route.ts
  Modified: app/api/permissions/transfer/[id]/approve/route.ts
  Modified: app/settings/users/page.tsx
  Modified: lib/version.ts (3.73.1 -> 3.73.2)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.73.2 pushed" -ForegroundColor Green
}
