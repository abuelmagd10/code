$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.492.ps1") { Remove-Item -LiteralPath "push_v3.74.492.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.493"') {
    Write-Host "+ 3.74.493" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000493_v3_74_493_reroute_notifications_and_cleanup.sql")) {
    Write-Host "X migration 493 missing" -ForegroundColor Red; exit 1
}

$nr = Get-Content -LiteralPath "lib/notification-routing.ts" -Raw
if ($nr -notmatch '/approvals\?tab=sret' -or $nr -notmatch '/approvals\?tab=mi' -or $nr -notmatch '/approvals\?tab=pr') {
    Write-Host "X notification-routing missing new /approvals routes" -ForegroundColor Red; exit 1
}
if ($nr -match "/sales-return-requests\?highlight=" -or $nr -match "/inventory/dispatch-approvals/") {
    Write-Host "X notification-routing still points to retired pages" -ForegroundColor Red; exit 1
}
Write-Host "+ notification-routing points at the unified inbox" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_493.txt"
    $msgLines = @(
        'chore(notif+db): v3.74.493 - notifications land on /approvals; clean up retired resources',
        '',
        'Notification routing (lib/notification-routing.ts)',
        '  sales_return_request                     -> /approvals?tab=sret',
        '  manufacturing_material_issue_approval     -> /approvals?tab=mi',
        '  manufacturing_product_receive_approval    -> /approvals?tab=pr',
        '  (bill + invoice were redirected in v3.74.484.)',
        '',
        'DB cleanup: company_role_permissions rows for the retired',
        'resources (inventory_goods_receipt, dispatch_approvals,',
        'sales_return_requests) are removed.',
        '',
        'The retired pages still exist as URL fallbacks. A future',
        'release can delete the page files after production usage',
        'confirms no external links remain.',
        '',
        'Files',
        '  supabase/migrations/20260701000493_v3_74_493_reroute_notifications_and_cleanup.sql',
        '  lib/notification-routing.ts',
        '  CONTRACTS.md (Section CN added)',
        '  lib/version.ts -> 3.74.493'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.493 pushed - notifications + grid + DB cleaned" -ForegroundColor Green
}
