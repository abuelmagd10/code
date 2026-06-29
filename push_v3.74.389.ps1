$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.388.ps1") { Remove-Item -LiteralPath "push_v3.74.388.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.389"') {
    Write-Host "+ 3.74.389" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/send-invite/route.ts" -Raw
foreach ($n in @(
    'branch_id: invBranchId',
    'cost_center_id: invCostCenterId',
    'warehouse_id: invWarehouseId',
    'safeBranchId',
    'safeCostCenterId',
    'safeWarehouseId',
    'branch_id: safeBranchId',
    'cost_center_id: safeCostCenterId',
    'warehouse_id: safeWarehouseId'
)) {
    if ($route -notmatch [regex]::Escape($n)) {
        Write-Host "X send-invite missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ send-invite reads + validates + stores branch/cost/warehouse" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_389.txt"
    $msgLines = @(
        'fix(invite): v3.74.389 - send-invite was dropping branch/cost/warehouse',
        '',
        'Owner reported during invite testing: picked branch=مدينة نصر',
        'cost-center=مدينة نصر, warehouse=مخزن مدينة نصر in the new',
        'invitation form, but after the invitee accepted, the new',
        'member ended up on الفرع الرئيسي instead.',
        '',
        'Trace',
        '  /settings/users invite form: sends branch_id, cost_center_id,',
        '    warehouse_id in the JSON body (correct).',
        '  /api/send-invite: only destructured email/role/employeeName',
        '    — silently ignored the three context fields. INSERTed the',
        '    invitation with NULL on all three.',
        '  /api/accept-invite: reads invitation.branch_id; if NULL it',
        '    falls back to the company main branch. Hence everyone',
        '    landed on الفرع الرئيسي.',
        '',
        'Fix',
        '  /api/send-invite',
        '    - reads branch_id, cost_center_id, warehouse_id from body',
        '    - validates each one belongs to the active company (silently',
        '      null-outs anything that does not, so a stale id from the',
        '      form cannot smuggle a member onto the wrong tenant)',
        '    - stamps them on the company_invitations row',
        '  test data',
        '    - moved goldwallet31@gmail.com back to مدينة نصر in DB',
        '',
        'Files',
        '  app/api/send-invite/route.ts',
        '  lib/version.ts -> 3.74.389'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.389 pushed - invitations carry branch context" -ForegroundColor Green
}
