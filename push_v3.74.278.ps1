$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.277.ps1") { Remove-Item -LiteralPath "push_v3.74.277.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.278"') {
    Write-Host "+ 3.74.278" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# material-issue page
$mi = Get-Content -LiteralPath "app/manufacturing/material-issue/page.tsx" -Raw
foreach ($c in @(
    'صرف الخامات لخط الإنتاج',
    'إزاى يشتغل صرف الخامات',
    'ابعت طلب صرف الخامات',
    'أوامر تنتظر الصرف'
)) {
    if ($mi -notmatch [regex]::Escape($c)) { Write-Host "X material-issue missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ material-issue: friendlier header, workflow banner, plain Arabic button" -ForegroundColor Green

# product-receive page
$pr = Get-Content -LiteralPath "app/manufacturing/product-receive/page.tsx" -Raw
foreach ($c in @(
    'استلام المنتج الجاهز',
    'إزاى يشتغل استلام المنتج',
    'اطلب استلام المنتج',
    'أوامر تنتظر الاستلام'
)) {
    if ($pr -notmatch [regex]::Escape($c)) { Write-Host "X product-receive missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ product-receive: friendlier header, workflow banner, plain Arabic button" -ForegroundColor Green

# MRP removed from Hub copy + sidebar
$copy = Get-Content -LiteralPath "lib/manufacturing/manufacturing-ui.ts" -Raw
if ($copy -match 'href: "/manufacturing/mrp"') {
    Write-Host "X HUB_COPY still references /manufacturing/mrp" -ForegroundColor Red; exit 1
}
$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match "href: ``/manufacturing/mrp") {
    Write-Host "X sidebar still has the MRP menu link" -ForegroundColor Red; exit 1
}
Write-Host "+ MRP removed from Hub & sidebar (placeholder page kept on disk)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_278.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.278 - Phase 2e - material-issue & product-receive pages in plain Arabic',
        '',
        'Closes the manufacturing UX work for the execution pages and tidies',
        'up the menu by removing a placeholder destination the user does not',
        'need yet.',
        '',
        'app/manufacturing/material-issue/page.tsx',
        '  - Header rewritten:',
        '      "صرف الخامات لخط الإنتاج" (was: "صرف المواد الخام")',
        '      Subtitle: "أوامر الإنتاج جاهزة لاستلام الخامات من المخزن"',
        '  - New blue intro banner with a 3-step explainer:',
        '      اضغط طلب صرف الخامات -> مسؤول المخزن يوافق -> الخامات تتخصم',
        '      تلقائياً والأمر يبقى قيد التنفيذ',
        '  - Tab labels:',
        '      🟠 أوامر تنتظر الصرف / 📋 سجل طلبات الصرف السابقة',
        '  - Action button: "ابعت طلب صرف الخامات" (was: "طلب اعتماد الصرف")',
        '  - Card description rewritten in conversational Arabic.',
        '',
        'app/manufacturing/product-receive/page.tsx',
        '  - Header: "استلام المنتج الجاهز" + "خلص التصنيع؟ ابعت طلب لمسؤول',
        '    المخزن يستلم المنتج النهائى ويضيفه للرصيد."',
        '  - New green intro banner: enter actual quantity -> approval ->',
        '    stock auto-updated.',
        '  - Tab labels: 🟢 أوامر تنتظر الاستلام / 📋 سجل طلبات الاستلام.',
        '  - Action button: "اطلب استلام المنتج" (was: "طلب اعتماد الاستلام")',
        '  - Card description rewritten.',
        '',
        'lib/manufacturing/manufacturing-ui.ts',
        '  - Drops the MRP card from the Hub "Plan Production" section in',
        '    both Arabic and English. Production Orders is now the single',
        '    primary CTA there.',
        '',
        'components/sidebar.tsx',
        '  - Removes the MRP link from the Manufacturing menu.',
        '  - The Hub Home + Work Centers + BOMs + Routings + Production',
        '    Orders + Material Issue + Receive Finished Product links all',
        '    stay.',
        '',
        'Files',
        '  app/manufacturing/material-issue/page.tsx',
        '  app/manufacturing/product-receive/page.tsx',
        '  lib/manufacturing/manufacturing-ui.ts',
        '  components/sidebar.tsx',
        '  lib/version.ts -> 3.74.278'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.278 pushed" -ForegroundColor Green
}
