$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.452.ps1") { Remove-Item -LiteralPath "push_v3.74.452.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.453"') {
    Write-Host "+ 3.74.453" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AZ\. ?عرض خصم البنود') {
    Write-Host "X CONTRACTS.md missing Section AZ" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AZ" -ForegroundColor Green

$poView = Get-Content -LiteralPath "app/purchase-orders/[id]/page.tsx" -Raw
if ($poView -notmatch 'خصم البنود') {
    Write-Host "X PO view missing 'خصم البنود' row" -ForegroundColor Red; exit 1
}
if ($poView -notmatch 'Line discount') {
    Write-Host "X PO view missing English label" -ForegroundColor Red; exit 1
}
Write-Host "+ PO view shows line discount separately" -ForegroundColor Green

$soView = Get-Content -LiteralPath "app/sales-orders/[id]/page.tsx" -Raw
if ($soView -notmatch 'خصم البنود') {
    Write-Host "X SO view missing 'خصم البنود' row" -ForegroundColor Red; exit 1
}
Write-Host "+ SO view shows line discount separately" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_453.txt"
    $msgLines = @(
        'feat(purchase-orders): v3.74.453 - separate line and overall discount in info card',
        '',
        'The PO info card only displayed po.discount_value (document-',
        'level discount). If a PO had per-item discount_percent, that',
        'was invisible in the summary. Owner saw "10% discount" and',
        'thought that was the whole picture, but there was more hidden',
        'in the lines. Approval already aggregates both (v3.74.421); the',
        'view now shows both too.',
        '',
        'The info card now renders two rows when applicable:',
        '   خصم البنود (على كل صنف)  computed as',
        '     Σ (quantity × unit_price × discount_percent / 100)',
        '   الخصم العام (قبل/بعد الضريبة)  = po.discount_value',
        '',
        'The old ambiguous "الخصم" label is replaced with',
        'the two more specific ones.',
        '',
        'Files',
        '   app/purchase-orders/[id]/page.tsx',
        '   CONTRACTS.md (Section AZ added)',
        '   lib/version.ts -> 3.74.453'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.453 pushed - line discount visible in PO info card" -ForegroundColor Green
}
