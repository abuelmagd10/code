$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.265.ps1") { Remove-Item -LiteralPath "push_v3.74.265.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.266"') {
    Write-Host "+ 3.74.266" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$wc = Get-Content -LiteralPath "app/manufacturing/work-centers/page.tsx" -Raw
foreach ($c in @(
    'nextAutoCode',
    'codeToSubmit',
    'branchToSubmit',
    'إعدادات تشغيلية متقدمة',
    'حسابات التكلفة',
    'اسم المحطة',
    'ورشة يدوية'
)) {
    if ($wc -notmatch [regex]::Escape($c)) { Write-Host "X work-centers missing $c" -ForegroundColor Red; exit 1 }
}
if ($wc -match 'IAS 2' -or $wc -match 'Manufacturing Overhead' -or $wc -match 'Labor \+ Manufacturing') {
    Write-Host "X work-centers still contains accountant jargon" -ForegroundColor Red; exit 1
}
Write-Host "+ work-centers form: name+type+desc visible; advanced & cost rates collapsed; no IAS 2/Overhead jargon" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_266.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.266 - Phase 2a - simplified Work Center form',
        '',
        'User feedback: the module is unusable because every form throws',
        '12 fields at the user, half of which use accounting jargon',
        '(Labor, Manufacturing Overhead, IAS 2). The owner himself could',
        'not understand the Work Center form.',
        '',
        'Work Center dialog now shows ONLY three fields by default:',
        '  1. اسم المحطة (Name) - the only required field.',
        '  2. نوع المحطة (Type) - dropdown with friendly labels:',
        '       آلة / خط إنتاج / ورشة يدوية, each with an emoji + hint.',
        '  3. شرح مختصر (Description) - optional one-liner.',
        '',
        'Everything else is hidden behind two collapsible sections:',
        '  Advanced operational settings - code, branch, status, capacity',
        '    UOM, capacity/hour, daily hours, efficiency %. Each input',
        '    gets a plain-Arabic hint underneath.',
        '  Cost calculations - 4 cost-rate inputs renamed:',
        '      تكلفة العامل / تكلفة تشغيل الآلة / مصاريف متغيرة /',
        '      مصاريف ثابتة. No more IAS 2 or Labor + Manufacturing',
        '      Overhead anywhere.',
        '',
        'Auto-fill so the user never thinks about codes:',
        '  - nextAutoCode() picks the next free WC-NN from the existing',
        '    list and pre-fills it when openAdd() runs.',
        '  - openAdd() also pre-fills branch_id to the first available',
        '    branch.',
        '  - handleSave() falls back to the auto code + first branch if',
        '    the user clears them. Only اسم المحطة is strictly required.',
        '',
        'API and schema untouched - same /api/manufacturing/work-centers',
        'endpoint, same payload shape. Existing rows are unaffected.',
        '',
        'Files',
        '  app/manufacturing/work-centers/page.tsx',
        '  lib/version.ts -> 3.74.266'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.266 pushed" -ForegroundColor Green
}
