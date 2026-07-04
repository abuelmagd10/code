$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.520.ps1") { Remove-Item -LiteralPath "push_v3.74.520.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.521"') {
    Write-Host "+ 3.74.521" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Guard: approvals page must have the enrichment fields on the payment card
$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
foreach ($needle in @(
    'payment_method: string | null',
    'account_name: string | null',
    'bill_outstanding: number | null',
    'exchange_rate: number | null',
    'متبقى الفاتورة',
    'الدفعة أكبر من المتبقى',
    'تحويل بنكى',
    'عملة الحساب',
    'تاريخ الدفع',
    'طلب الاعتماد'
)) {
    if ($ap -notmatch [regex]::Escape($needle)) {
        Write-Host "X approvals/page.tsx missing: $needle" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ supplier payment card enrichment present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_521.txt"
    $msgLines = @(
        'feat(approvals): v3.74.521 - supplier payment card carries the full decision context',
        '',
        'Owner report: the supplier payment card in /approvals showed only',
        'reference_number (usually null), supplier name, amount, branch and',
        'created_at. Not enough context to approve without opening the',
        'underlying payment record.',
        '',
        'Now the card also carries:',
        '  - bill outstanding vs. payment amount (red badge on overpayment)',
        '  - payment method + source account name',
        '  - amber warning when account currency != payment currency',
        '  - FX base amount + exchange rate for non-EGP payments',
        '  - actual payment_date next to the requested_at timestamp',
        '  - requester email (the accountant who asked for approval)',
        '  - accountant notes in an amber callout',
        '',
        'Purely a UI + client-loader enrichment - the payments table',
        'already stores every one of these fields, the loader was under-',
        'reading. Batch-fetches chart_of_accounts and user_profiles the',
        'same way v3.74.503 batches suppliers + bills (no FK on payments).',
        '',
        'Files',
        '  app/approvals/page.tsx (interface + loader + card)',
        '  supabase/migrations/20260703000521_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.521'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.521 pushed - owner sees the whole payment picture" -ForegroundColor Green
}
