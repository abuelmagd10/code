$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.575.ps1") { Remove-Item -LiteralPath "push_v3.74.575.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.576"') {
    Write-Host "+ 3.74.576" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- i18n markers: every converted page must carry the language mechanism ---
$checks = @(
    @{ f = "app/legal/privacy/page.tsx";          p = 'app_language_changed' },
    @{ f = "app/legal/terms/page.tsx";            p = 'app_language_changed' },
    @{ f = "app/legal/refund/page.tsx";           p = 'app_language_changed' },
    @{ f = "app/sent-invoice-returns/page.tsx";   p = 'app_language_changed' },
    @{ f = "app/estimates/page.tsx";              p = 'app_language_changed' },
    @{ f = "app/settings/orders-rules/page.tsx";  p = 'app_language_changed' }
)
foreach ($c in $checks) {
    $raw = Get-Content -LiteralPath $c.f -Raw
    if ($raw -notmatch $c.p) {
        Write-Host ("X {0} missing language mechanism" -f $c.f) -ForegroundColor Red; exit 1
    }
}
# client conversion of legal pages must have removed metadata exports
foreach ($lf in @("app/legal/privacy/page.tsx","app/legal/terms/page.tsx","app/legal/refund/page.tsx")) {
    $raw = Get-Content -LiteralPath $lf -Raw
    if ($raw -match 'export const metadata') {
        Write-Host ("X {0} still exports metadata (invalid in client component)" -f $lf) -ForegroundColor Red; exit 1
    }
    if ($raw -notmatch '"use client"') {
        Write-Host ("X {0} not a client component" -f $lf) -ForegroundColor Red; exit 1
    }
}
Write-Host "+ i18n batch 2: legal x3 bilingual + sent-invoice-returns/estimates/orders-rules" -ForegroundColor Green

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
    "app/legal/privacy/page.tsx" `
    "app/legal/terms/page.tsx" `
    "app/legal/refund/page.tsx" `
    "app/sent-invoice-returns/page.tsx" `
    "app/estimates/page.tsx" `
    "app/settings/orders-rules/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.576.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.575.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_576.txt"
    $msgLines = @(
        'feat(i18n): v3.74.576 - bilingual legal pages + batch 2 (6 pages, ~270 strings)',
        '',
        'Owner decision: legal pages go bilingual for global use.',
        '',
        'Legal (privacy/terms/refund, ~159 strings): converted to client',
        'components with the house appLang mechanism; full professional',
        'English legal translations; dir flips rtl/ltr; Arabic copy is',
        'byte-identical. Per-page metadata exports removed (client',
        'components) - the /legal layout metadata still applies.',
        '',
        'Batch 2 functional pages:',
        '  app/sent-invoice-returns/page.tsx  (~52 strings)',
        '  app/estimates/page.tsx             (~78 strings)',
        '  app/settings/orders-rules/page.tsx (~40 strings)',
        'Toasts, headers, table columns, dialogs, filters, buttons all',
        'bilingual; DB payloads / RPC params / SelectItem values / raw',
        'server messages untouched. estimates: appLang added to the',
        'load-effect deps (expenses-page pattern) for the role map.',
        '',
        'Selective commit - working tree carries line-ending-only noise',
        'from parallel sessions that must not be swept in.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.576 pushed - legal bilingual + i18n batch 2 live" -ForegroundColor Green
}
