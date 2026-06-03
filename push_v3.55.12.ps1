# v3.55.12 - estimates <-> sales_orders link + delete-with-governance
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est   = Get-Content "app\estimates\page.tsx" -Raw
$soNew = Get-Content "app\sales-orders\new\page.tsx" -Raw

# /estimates side
if ($est -match "converted_so_id\?: string \| null;") {
    Write-Host "  + Estimate type has converted_so_id" -ForegroundColor Green
} else { Write-Host "  X Estimate type missing converted_so_id" -ForegroundColor Red; exit 1 }

if ($est -match "canDeleteEstimate") {
    Write-Host "  + canDeleteEstimate function present" -ForegroundColor Green
} else { Write-Host "  X canDeleteEstimate missing" -ForegroundColor Red; exit 1 }

if ($est -match "deleteEstimate") {
    Write-Host "  + deleteEstimate function present" -ForegroundColor Green
} else { Write-Host "  X deleteEstimate missing" -ForegroundColor Red; exit 1 }

if ($est -match "لا يمكن حذف عرض مُحَوَّل") {
    Write-Host "  + Delete-when-linked guard message present" -ForegroundColor Green
} else { Write-Host "  X Guard message missing" -ForegroundColor Red; exit 1 }

if ($est -match "converted_so_id") {
    $cnt = ([regex]::Matches($est, "converted_so_id")).Count
    Write-Host ("  + converted_so_id referenced " + $cnt + " times in /estimates") -ForegroundColor Green
} else { Write-Host "  X converted_so_id never referenced" -ForegroundColor Red; exit 1 }

# /sales-orders/new side
if ($soNew -match "sourceEstimateId") {
    Write-Host "  + sourceEstimateId state in /sales-orders/new" -ForegroundColor Green
} else { Write-Host "  X sourceEstimateId missing" -ForegroundColor Red; exit 1 }

if ($soNew -match "source_estimate_id: sourceEstimateId") {
    Write-Host "  + source_estimate_id sent in POST body" -ForegroundColor Green
} else { Write-Host "  X source_estimate_id not in body" -ForegroundColor Red; exit 1 }

if ($soNew -match 'update\(\{ status: "converted", converted_so_id: soData\.id \}\)') {
    Write-Host "  + Estimate flipped to converted after SO save" -ForegroundColor Green
} else { Write-Host "  X Estimate post-save update missing" -ForegroundColor Red; exit 1 }

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
git commit -m "feat(estimates): link to SO + delete-with-governance

DB migration (applied via Supabase MCP):
- sales_orders.source_estimate_id UUID REFERENCES estimates(id)
- estimates.converted_so_id UUID REFERENCES sales_orders(id)
- ON DELETE SET NULL on both (no cascade) so deleting an SO frees
  the estimate to be edited/deleted/re-converted

/sales-orders/new:
- sourceEstimateId state pulled from sessionStorage prefill
- POST body now sends source_estimate_id
- After successful SO save: UPDATE estimates SET status='converted',
  converted_so_id=soData.id WHERE id=sourceEstimateId

/estimates:
- Estimate type adds converted_so_id?: string | null
- All SELECT queries now fetch converted_so_id
- canDeleteEstimate(e):
  * returns false if e.converted_so_id is set
  * true for owner/admin/general_manager
  * true for other roles only if e.created_by_user_id === current user
- deleteEstimate(e) cascades estimate_items, then deletes estimate
- Actions cell:
  * Edit button disabled if linked
  * Convert button shows 'مُحَوَّل' + disabled if linked
  * Delete button rendered only when canDeleteEstimate returns true

Governance:
- Privileged can delete any unlinked estimate
- Other roles can only delete their own unlinked estimates
- No-one can delete or convert a linked estimate
- Deleting an SO frees the estimate again (DB ON DELETE SET NULL)" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.12 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  1. /estimates -> create draft estimate -> Delete button visible -> works" -ForegroundColor White
    Write-Host "  2. Convert estimate to SO -> save SO -> back to /estimates" -ForegroundColor White
    Write-Host "     -> estimate row shows مُحَوَّل + Edit/Convert/Delete all hidden/disabled" -ForegroundColor White
    Write-Host "  3. As staff/sales user: can only delete own estimates" -ForegroundColor White
    Write-Host "  4. As owner/admin: can delete any unlinked estimate" -ForegroundColor White
}
