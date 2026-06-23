$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.298.ps1") { Remove-Item -LiteralPath "push_v3.74.298.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.299"') {
    Write-Host "+ 3.74.299" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Sidebar: FX revaluation must be inside the Accounting group, and NOT inside Settings
$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
$accChunkPattern = "key: 'accounting'[\s\S]*?fx-revaluation[\s\S]*?key: 'fixed_assets'"
if ($sb -notmatch $accChunkPattern) {
    Write-Host "X sidebar: FX revaluation is not inside the Accounting group" -ForegroundColor Red; exit 1
}
$settingsChunkPattern = "key: 'settings'[\s\S]*?fx-revaluation"
if ($sb -match $settingsChunkPattern) {
    Write-Host "X sidebar: FX revaluation still appears inside the Settings group" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar: FX revaluation moved to Accounting group" -ForegroundColor Green

# Role permissions resource list: new resource added
$up = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($up -notmatch "vendor_payment_correction_requests") {
    Write-Host "X users page: vendor_payment_correction_requests not added to resourceCategories" -ForegroundColor Red; exit 1
}
Write-Host "+ users page: vendor_payment_correction_requests added to purchases category" -ForegroundColor Green

# authz: fallback page list contains both new entries
$az = Get-Content -LiteralPath "lib/authz.ts" -Raw
foreach ($n in @('fx_revaluation','vendor_payment_correction_requests')) {
    if ($az -notmatch [regex]::Escape($n)) {
        Write-Host "X authz fallback pages missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ authz: fallback pages updated" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_299.txt"
    $msgLines = @(
        'chore(nav): v3.74.299 - relocate FX Revaluation + close resource-list gap',
        '',
        'The owner pointed out that FX Revaluation is an accounting',
        'period-end task, not a system setting, so it belongs in the',
        'Accounting sidebar group. While verifying the related',
        'role-permissions list we also found a real page',
        '(/vendor-payment-correction-requests) that had no matching',
        'entry in the resourceCategories picker - so it was impossible',
        'to grant or restrict access to it through the UI.',
        '',
        'components/sidebar.tsx',
        '  - Moved "إعادة تقييم العملات" out of the Settings group and',
        '    into the Accounting group, positioned between',
        '    "Period Closing" and "Annual Closing" because it is part',
        '    of the same period-end workflow.',
        '',
        'app/settings/users/page.tsx',
        '  - Added vendor_payment_correction_requests to the purchases',
        '    category in resourceCategories so the role-permission UI',
        '    can show / toggle it.',
        '',
        'lib/authz.ts',
        '  - Backfilled the FALLBACK_PAGES list with the two missing',
        '    routes (fx_revaluation under finance, the new vendor',
        '    correction-requests under purchases). Keeps the',
        '    "first allowed page" redirect aware of them.',
        '',
        'Five resources remain in resourceCategories with no matching',
        'page (permission_sharing, permission_transfers,',
        'user_branch_access, role_permissions, company_settings).',
        'Left in place pending a separate decision from the owner',
        'about whether to ship those pages or remove the entries.',
        '',
        'Files',
        '  components/sidebar.tsx',
        '  app/settings/users/page.tsx',
        '  lib/authz.ts',
        '  lib/version.ts -> 3.74.299'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.299 pushed" -ForegroundColor Green
}
