$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.263.ps1") { Remove-Item -LiteralPath "push_v3.74.263.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.264"') {
    Write-Host "+ 3.74.264" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260621000264_v3_74_264_fix_cogs_integrity_check.sql" -Raw
foreach ($c in @(
    "CREATE OR REPLACE FUNCTION public.ic_cogs_balance",
    "sub_type IN ('cost_of_goods_sold', 'cogs')",
    "reference_type IN ('invoice_cogs', 'invoice_cogs_reversal', 'sale_return_cogs')"
)) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ ic_cogs_balance: sub_type classification + scoped to COGS-engine JE refs" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_264.txt"
    $msgLines = @(
        "fix(integrity): v3.74.264 - ic_cogs_balance false high-severity alert",
        "",
        "Bug",
        "  The dashboard raised:",
        "    'COGS sub-ledger and GL account diverged. difference: -2300'",
        "  in Notniche, with severity 'high'. The data behind it:",
        "    cogs_transactions_total = 5100  (FIFO sub-ledger)",
        "    account_5000_net        = 7400  (GL net the check summed)",
        "    diff                    = -2300",
        "",
        "  Two layered bugs in ic_cogs_balance:",
        "",
        "    1. Hard-coded account_code='5000' as a COGS marker. That's",
        "       the COGS account in some chart-of-accounts templates,",
        "       but in the Arabic CoA used by Notniche, 5000 is the",
        "       general 'المصروفات' parent and the real COGS account",
        "       is 5100 (sub_type='cogs'). An expense booked to 5000",
        "       got wrongly counted as COGS.",
        "",
        "    2. The 'GL side' of the reconciliation summed EVERY journal",
        "       line on a COGS-classified account, even those produced",
        "       by manual postings (e.g. an EXP-... booking categorised",
        "       to the COGS account, which is accounting-valid). But",
        "       cogs_transactions is built ONLY from the FIFO engine on",
        "       invoice deliveries - so comparing it against the whole",
        "       GL net can never balance once a human has hand-posted",
        "       anything against a COGS account. The check by design",
        "       compares apples to oranges.",
        "",
        "Fix",
        "  Migration 20260621000264_v3_74_264_fix_cogs_integrity_check.sql:",
        "    - Drop the '5000' code rule; classify COGS purely by sub_type",
        "      ('cost_of_goods_sold' / 'cogs'). Account codes vary per",
        "      CoA template; sub_type is the canonical classification.",
        "    - Scope the GL aggregation to JE.reference_type IN",
        "      ('invoice_cogs','invoice_cogs_reversal','sale_return_cogs')",
        "      so the check compares the FIFO sub-ledger against the GL",
        "      postings produced by the same FIFO engine.",
        "",
        "Outcome after deploy",
        "  - ic_cogs_balance returns no row for either Notniche or 'تست'",
        "    (the only companies with COGS transactions today).",
        "  - The EXP-0003 'labels' expense (2300, on account 5100) stays",
        "    on the books exactly where it was - the fix only changes",
        "    what the integrity check considers in-scope.",
        "",
        "What didn't change",
        "  - No journal entry was rewritten.",
        "  - The FIFO engine, the COGS RPCs, and the expense flow are",
        "    untouched.",
        "  - run_all_integrity_checks() still calls ic_cogs_balance;",
        "    its return shape is unchanged.",
        "",
        "Files",
        "  supabase/migrations/20260621000264_v3_74_264_fix_cogs_integrity_check.sql (new)",
        "  lib/version.ts -> 3.74.264"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.264 pushed" -ForegroundColor Green
}
