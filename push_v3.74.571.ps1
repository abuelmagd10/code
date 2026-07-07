$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.571"') { Write-Host "+ 3.74.571" -ForegroundColor Green }
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_571.txt"
    $msgLines = @(
        'fix(sidebar): v3.74.571 - approvals is a CORE module',
        '',
        'v3.74.569 opened the canAccessPage gate but a second gate lived',
        'in module-manifest: sidebar filters groups by isModuleEnabled,',
        'and "approvals" was not in the ModuleKey union at all. Any',
        'company with a non-null enabled_modules array got the group',
        'silently dropped, owners included.',
        '',
        'Fix: add "approvals" to ModuleKey, CORE_MODULES, and MODULE_LABELS.',
        'Core because the inbox unifies every workflow pending item -',
        'turning it off would leave approvers with no way in.',
        '',
        'Files',
        '  lib/module-manifest.ts',
        '  supabase/migrations/20260706000571_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.571'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.571 pushed" -ForegroundColor Green }
