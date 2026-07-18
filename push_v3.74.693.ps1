$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.692.ps1") { Remove-Item -LiteralPath "push_v3.74.692.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.693"') {
    Write-Host "+ 3.74.693" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.693]")) { Write-Host "X CHANGELOG missing [3.74.693]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$pg = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
# strict admin match must be in place (no lenient "h.branch_id &&" on the admin path)
if ($pg -notmatch "historyBranchFilter !== ""all"" && h\.branch_id !== historyBranchFilter") {
    Write-Host "X strict branch match missing on the admin filter path" -ForegroundColor Red; exit 1
}
# the six previously-missing categories must now carry a branch
$need = @('category: "supplier_payment",','category: "customer_refund",','category: "write_off",','category: "material_issue",','category: "product_receive",','category: "sales_return_request",')
foreach ($n in $need) {
    $idx = $pg.IndexOf($n)
    if ($idx -lt 0) { Write-Host "X missing block: $n" -ForegroundColor Red; exit 1 }
    $window = $pg.Substring($idx, [Math]::Min(220, $pg.Length - $idx))
    if ($window -notmatch "branch_id:") { Write-Host "X block does not set branch_id: $n" -ForegroundColor Red; exit 1 }
}
Write-Host "+ strict filter + all six history categories carry branch scope" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/approvals/page.tsx" `
    "push_v3.74.693.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.692.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_693.txt"
    $msgLines = @(
        'fix(approvals): v3.74.693 - decision-log branch/warehouse filter actually filters',
        '',
        '- Six history categories (supplier payments, customer refunds, write-offs,',
        '  material issues, product receives, sales return requests) never carried',
        '  branch_id/warehouse_id, so they slipped through every filter.',
        '- The admin filter also used a lenient guard that let any row without a',
        '  branch pass. Admin scope now matches strictly; company-level rows show',
        '  under "all branches". Non-admin scope unchanged.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.693 pushed - decision-log filtering fixed" -ForegroundColor Green
}
