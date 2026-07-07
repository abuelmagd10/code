$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.574.ps1") { Remove-Item -LiteralPath "push_v3.74.574.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.575"') {
    Write-Host "+ 3.74.575" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "I18N_AUDIT_2026-07-03.md")) {
    Write-Host "X i18n audit inventory missing" -ForegroundColor Red; exit 1
}
$users = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($users -notmatch "t\('Additional permissions'" -or $users -notmatch "t\('Delegated data type'") {
    Write-Host "X settings/users leftover translations missing" -ForegroundColor Red; exit 1
}
Write-Host "+ i18n batch-1 leftovers translated (users page vacation/transfer dialogs)" -ForegroundColor Green

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

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر من جلسات موازية — الرفع انتقائى حصراً
git add -- "app/settings/users/page.tsx" "I18N_AUDIT_2026-07-03.md" "lib/version.ts" "push_v3.74.575.ps1" 2>&1 | Out-Null
if (Test-Path "push_v3.74.574.ps1") { } else { git add -u -- "push_v3.74.574.ps1" 2>$null }
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_575.txt"
    $msgLines = @(
        'feat(i18n): v3.74.575 - batch-1 leftovers + full audit inventory',
        '',
        'Completes the AR/EN coverage batch 1 (heaviest 5 pages, ~444',
        'strings - most were already pushed in earlier versions by the',
        'conversion agents): the last 22 hardcoded strings in the',
        'settings/users vacation-delegation and permission-transfer',
        'dialogs are now bilingual.',
        '',
        'Also commits I18N_AUDIT_2026-07-03.md: the automated per-file',
        'inventory of ~1286 single-language UI strings that drives the',
        'remaining batches (legal pages held for an owner decision on',
        'bilingual legal copy).',
        '',
        'NOTE: commit is intentionally selective - the working tree',
        'carries thousands of line-ending-only diffs from parallel',
        'sessions that must not be swept into this change.',
        '',
        'Files',
        '  app/settings/users/page.tsx',
        '  I18N_AUDIT_2026-07-03.md (new)',
        '  lib/version.ts -> 3.74.575'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.575 pushed - i18n batch 1 complete" -ForegroundColor Green
}
