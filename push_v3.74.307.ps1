$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.306.ps1") { Remove-Item -LiteralPath "push_v3.74.306.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.307"') {
    Write-Host "+ 3.74.307" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260623000307_v3_74_307_fix_ar_integrity_exclude_unapproved.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'CREATE OR REPLACE FUNCTION public.ic_ar_balance',
    "COALESCE(approval_status, 'approved') = 'approved'",
    'v3.74.307'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ AR integrity migration: pending invoices excluded" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_307.txt"
    $msgLines = @(
        'fix(integrity): v3.74.307 - AR check now excludes un-approved invoices',
        '',
        'Reported on Test Company / Nasr City branch: creating a sales',
        'order auto-generates a draft invoice (status=invoiced,',
        'approval_status=pending). The AR integrity check immediately',
        'flagged a phantom drift equal to that invoice''s total, even',
        'though no AR journal entry had been posted yet.',
        '',
        'Why it happened',
        '  ic_ar_balance previously excluded only status IN',
        '  (''draft'',''cancelled'') on the invoice side. But the project''s',
        '  workflow sets the invoice status to ''invoiced'' the moment',
        '  the document is issued, while the actual revenue + AR journal',
        '  entry is created at warehouse approval time. So any invoice',
        '  waiting on the warehouse step was double-counted: present in',
        '  the invoice-remaining sum, but absent from the GL side.',
        '',
        'Fix',
        '  Mirror the v3.74.135 pattern used in ic_ap_balance. Add',
        '  COALESCE(approval_status,''approved'') = ''approved'' to the',
        '  invoice filter, so the check only counts invoices that have',
        '  actually crossed the GL boundary. The COALESCE preserves',
        '  legacy rows whose approval_status was never populated.',
        '',
        'Migration',
        '  supabase/migrations/20260623000307_v3_74_307_fix_ar_integrity_exclude_unapproved.sql',
        '  Applied to production via apply_migration; integrity dashboard',
        '  on Test Company now reports zero drifts.',
        '',
        'Files',
        '  supabase/migrations/20260623000307_v3_74_307_fix_ar_integrity_exclude_unapproved.sql (NEW)',
        '  lib/version.ts -> 3.74.307'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.307 pushed" -ForegroundColor Green
}
