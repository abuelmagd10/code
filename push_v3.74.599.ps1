$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.598.ps1") { Remove-Item -LiteralPath "push_v3.74.598.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.599"') {
    Write-Host "+ 3.74.599" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260710000599_v3_74_599_retire_generic_pickup.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ generic pickup retirement mirrored" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "supabase/migrations/20260710000599_v3_74_599_retire_generic_pickup.sql" `
    "lib/version.ts" `
    "push_v3.74.599.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.598.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_599.txt"
    $msgLines = @(
        'chore(shipping): v3.74.599 - retire the generic onsite-pickup provider',
        '',
        'Owner spotted the superseded generic pickup option still listed',
        '(one company copy re-activated) after the per-branch outlets',
        'rollout. Verified zero invoice/shipment references across all 4',
        'company copies, then removed mappings + providers (guarded) and',
        'dropped the unused creator functions.',
        '',
        'DB already live via MCP (v3_74_598b). Post-cleanup for the test',
        'company: exactly bosta + the two branch outlets.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.599 pushed - shipping list fully clean" -ForegroundColor Green
}
