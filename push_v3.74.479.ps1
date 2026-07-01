$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.478.ps1") { Remove-Item -LiteralPath "push_v3.74.478.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.479"') {
    Write-Host "+ 3.74.479" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000479_v3_74_479_writeoffs_transfers.sql")) {
    Write-Host "X migration 479 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingWriteOff' -or $page -notmatch 'PendingInventoryTransfer') {
    Write-Host "X approvals page missing write-offs/transfers" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch 'inventory_write_off' -or $sb -notmatch 'inventory_transfer') {
    Write-Host "X sidebar missing new badges" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals + sidebar cover write-offs + transfers" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_479.txt"
    $msgLines = @(
        'feat(inbox): v3.74.479 - write-offs + inventory transfers surface as link-out cards',
        '',
        'Both types have multi-parameter actions that cant collapse into',
        'a single approve button. Cards surface the pending item + stage',
        'and link to the dedicated page for the actual action. Governance',
        'stays intact on the original pages.',
        '',
        'Sidebar rolls up inventory_write_off + inventory_transfer.',
        '',
        'Files',
        '   supabase/migrations/20260701000479_v3_74_479_writeoffs_transfers.sql',
        '   app/approvals/page.tsx',
        '   components/sidebar.tsx',
        '   CONTRACTS.md (Section BZ added)',
        '   lib/version.ts -> 3.74.479'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.479 pushed - write-offs + transfers surface in the unified inbox" -ForegroundColor Green
}
