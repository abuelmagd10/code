$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.247.ps1") { Remove-Item -LiteralPath "push_v3.74.247.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.248"') {
    Write-Host "+ 3.74.248" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$mig = Get-Content -LiteralPath "supabase/migrations/20260620000248_v3_74_248_capital_contributions_audit_columns.sql" -Raw
foreach ($c in @('is_reversed', 'reversed_at', 'reversal_journal_entry_id', 'original_amount', 'last_edited_at')) {
    if ($mig -notmatch [regex]::Escape($c)) {
        Write-Host "X migration missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration adds audit columns to capital_contributions" -ForegroundColor Green

$edit = Get-Content -LiteralPath "app/api/shareholders/contributions/[id]/route.ts" -Raw
foreach ($c in @('PATCH', 'requireOpenFinancialPeriod', 'is_reversed', 'debit_amount', 'credit_amount', 'last_edited_at')) {
    if ($edit -notmatch [regex]::Escape($c)) {
        Write-Host "X edit route missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ PATCH /api/shareholders/contributions/[id] rewrites the JE in lockstep" -ForegroundColor Green

$rev = Get-Content -LiteralPath "app/api/shareholders/contributions/[id]/reverse/route.ts" -Raw
foreach ($c in @('capital_contribution_reversal', 'reversal_journal_entry_id', 'requireOpenFinancialPeriod', 'is_reversed = true|is_reversed: true')) {
    if ($rev -notmatch $c) {
        Write-Host "X reverse route missing $c" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ POST /api/shareholders/contributions/[id]/reverse posts opposing JE" -ForegroundColor Green

$ui = Get-Content -LiteralPath "app/shareholders/page.tsx" -Raw
foreach ($c in @('openContributionHistory', 'submitEditContrib', 'submitReverseContrib', 'سجل المساهمات', 'historyShareholder', 'FileText')) {
    if ($ui -notmatch [regex]::Escape($c)) {
        Write-Host "X shareholders page missing $c" -ForegroundColor Red; exit 1
    }
}
if ($ui -notmatch [regex]::Escape('select("shareholder_id, amount, is_reversed")')) {
    Write-Host "X shareholders page does not exclude reversed contributions from totals" -ForegroundColor Red; exit 1
}
Write-Host "+ shareholders page exposes the contributions log with edit + reverse" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_248.txt"
    $msgLines = @(
        "feat(shareholders): v3.74.248 - contributions log with edit + reverse",
        "",
        "Reported: a user created a shareholder, recorded a capital",
        "contribution, but entered the wrong amount. The bank account",
        "received the wrong number. There was no UI to fix it - the only",
        "API operation on capital_contributions was POST, the shareholder-",
        "delete guard (v3.74.241) blocked the brute-force workaround, and",
        "the user was stuck with manual SQL or starting over.",
        "",
        "Fix: surface a Contributions Log per shareholder with two recovery",
        "primitives that match how an accountant would think about it.",
        "",
        "Database (v3.74.248 migration)",
        "  capital_contributions gains is_reversed, reversed_at,",
        "  reversed_by, reversal_journal_entry_id, reversal_reason,",
        "  last_edited_at, last_edited_by, original_amount.",
        "  original_amount is backfilled from amount once.",
        "",
        "API",
        "  PATCH /api/shareholders/contributions/[id]",
        "    Rewrites the contribution amount AND its linked journal entry",
        "    in lockstep - the bank/cash debit line and the capital credit",
        "    line move together so the books never desync. Persists the",
        "    first-write amount in original_amount and stamps last_edited_at",
        "    / last_edited_by for audit. Refuses to edit a reversed row.",
        "    Respects requireOpenFinancialPeriod for the new date.",
        "",
        "  POST /api/shareholders/contributions/[id]/reverse",
        "    Posts an opposing JE (Dr capital_account / Cr cash/bank,",
        "    reference_type='capital_contribution_reversal') and flags the",
        "    original row as reversed. The original entry stays in the",
        "    books for audit trail. Refuses if already reversed.",
        "",
        "UI (app/shareholders/page.tsx)",
        "  - New 'Contributions log' button on each shareholder row.",
        "  - Dialog lists every contribution for that shareholder with",
        "    date, amount, status (Active / Reversed badge), and per-row",
        "    Edit + Reverse buttons. Edited rows show 'edited from X'",
        "    next to the new amount.",
        "  - Edit modal: amount + date + notes; posts to PATCH.",
        "  - Reverse modal: optional reason; posts to /reverse.",
        "  - loadShareholders now excludes reversed contributions from the",
        "    total-contribution column so equity stays accurate.",
        "",
        "Files",
        "  supabase/migrations/20260620000248_v3_74_248_capital_contributions_audit_columns.sql",
        "  app/api/shareholders/contributions/[id]/route.ts (new)",
        "  app/api/shareholders/contributions/[id]/reverse/route.ts (new)",
        "  app/shareholders/page.tsx",
        "  lib/version.ts -> 3.74.248"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.248 pushed" -ForegroundColor Green
}
