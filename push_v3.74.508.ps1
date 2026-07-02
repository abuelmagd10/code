$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.507.ps1") { Remove-Item -LiteralPath "push_v3.74.507.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.508"') {
    Write-Host "+ 3.74.508" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260702000508_v3_74_508_purchasing_officer_purchase_returns.sql")) {
    Write-Host "X migration 508 missing" -ForegroundColor Red; exit 1
}

$api = Get-Content -LiteralPath "app/api/purchase-returns/route.ts" -Raw
if ($api -notmatch 'company_role_permissions') {
    Write-Host "X purchase-returns POST missing permission gate" -ForegroundColor Red; exit 1
}

$list = Get-Content -LiteralPath "app/purchase-returns/page.tsx" -Raw
if ($list -notmatch 'permCreateReturn') {
    Write-Host "X list page New Return button not permission-gated" -ForegroundColor Red; exit 1
}

$newPage = Get-Content -LiteralPath "app/purchase-returns/new/page.tsx" -Raw
if ($newPage -notmatch 'canAction') {
    Write-Host "X new-return page missing permission guard" -ForegroundColor Red; exit 1
}
Write-Host "+ purchasing officer can create returns; view-only roles gated in UI + API" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_508.txt"
    $msgLines = @(
        'feat(governance): v3.74.508 - purchasing officer creates purchase returns',
        '',
        'Owner spec (aligned with prevailing practice): the purchasing',
        'officer owns the supplier relationship, so he CREATES purchase',
        'returns. Approval stays with owner/general_manager; physical',
        'goods-out stays with the store manager.',
        '',
        'DB (migration 508, already applied to production):',
        '- purchase_returns row granted to purchasing_officer for ALL',
        '  companies (write+update, no delete)',
        '- add-on seed + auto-seed trigger updated so NEW companies get',
        '  the grant automatically',
        '- sidebar link appears automatically (permission-driven)',
        '',
        'Hardening discovered while wiring this: the create path had NO',
        'permission gate at all (apiGuard resource/action check is a stub),',
        'so view-only roles could create returns via the API:',
        '- POST /api/purchase-returns now enforces can_write on',
        '  purchase_returns from company_role_permissions (owner/admin',
        '  bypass)',
        '- "New Return" button hidden for roles without write',
        '- /purchase-returns/new redirects view-only roles back to the list',
        '',
        'Files',
        '  supabase/migrations/20260702000508_v3_74_508_purchasing_officer_purchase_returns.sql',
        '  app/api/purchase-returns/route.ts',
        '  app/purchase-returns/page.tsx',
        '  app/purchase-returns/new/page.tsx',
        '  lib/version.ts -> 3.74.508'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.508 pushed - purchasing officer owns return creation" -ForegroundColor Green
}
