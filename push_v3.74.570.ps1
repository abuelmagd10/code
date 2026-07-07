$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.570"') { Write-Host "+ 3.74.570" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_570.txt"
    $msgLines = @(
        'fix(layout): v3.74.570 - restore sidebar spacing on 5 pages',
        '',
        'Fixed Assets Reports (and 4 other pages) rendered with the title',
        'clipped to a couple of letters because the <main> element was',
        'missing md:mr-64 (sidebar margin) and pt-20 md:pt-8 (mobile',
        'hamburger clearance). Standardised on the same layout every',
        'other list page uses.',
        '',
        'Files',
        '  app/fixed-assets/reports/page.tsx',
        '  app/fixed-assets/page.tsx',
        '  app/fixed-assets/[id]/edit/page.tsx',
        '  app/admin/apply-governance/page.tsx',
        '  app/settings/commissions/runs/[id]/page.tsx',
        '  supabase/migrations/20260706000570_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.570'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.570 pushed" -ForegroundColor Green }
