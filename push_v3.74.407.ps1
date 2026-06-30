$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.406.ps1") { Remove-Item -LiteralPath "push_v3.74.406.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.407"') {
    Write-Host "+ 3.74.407" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000407_v3_74_407_po_approval_gm_only.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X missing migration" -ForegroundColor Red; exit 1 }

$ui = Get-Content -LiteralPath "app/purchase-orders/[id]/page.tsx" -Raw
if ($ui -match "userContext\?\.role === 'manager'") {
    Write-Host "X UI still grants approve to BRANCH manager" -ForegroundColor Red; exit 1
}
if ($ui -notmatch "userContext\?\.role === 'general_manager'") {
    Write-Host "X UI does not check general_manager" -ForegroundColor Red; exit 1
}
Write-Host "+ UI gate corrected" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'v3\.74\.407 — ثغرة مدير الفرع') {
    Write-Host "X CONTRACTS.md missing v3.74.407 entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_407.txt"
    $msgLines = @(
        'security(po): v3.74.407 - branch managers no longer approve POs',
        '',
        'Owner found a privilege-escalation gap: a user with role',
        '"manager" (BRANCH manager) was seeing the Approve / Reject',
        'buttons on a pending_approval purchase order. The DB RPC',
        'allowed it too — both the UI condition and the RPC IN-list',
        'said ("owner", "manager") when policy was always',
        '("owner", "general_manager").',
        '',
        'Fix in two places',
        '  app/purchase-orders/[id]/page.tsx',
        '    userContext.role === manager -> userContext.role === general_manager',
        '  approve_purchase_order_atomic (Supabase MCP)',
        '    IN ("owner", "manager") -> IN ("owner", "general_manager")',
        '',
        'Baseline guard',
        '  assert_baseline now refuses to pass if the RPC body re-',
        '  introduces the "manager" string in the role IN-list. So',
        '  the regression is fenced for the future.',
        '',
        'Files',
        '  supabase/migrations/20260629000407_v3_74_407_po_approval_gm_only.sql',
        '  app/purchase-orders/[id]/page.tsx',
        '  CONTRACTS.md (Section M annotated with v3.74.407)',
        '  lib/version.ts -> 3.74.407'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.407 pushed - PO approval restricted to owner + general_manager" -ForegroundColor Green
}
