$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.262.ps1") { Remove-Item -LiteralPath "push_v3.74.262.ps1" -Force }

# ── 1. الإصدار ────────────────────────────────────────────────────
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.263"') {
    Write-Host "+ 3.74.263" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ── 2. الـ migration ──────────────────────────────────────────────
$mig = Get-Content -LiteralPath "supabase/migrations/20260621000263_v3_74_263_fix_contribution_rpc_columns.sql" -Raw
foreach ($c in @(
    "CREATE OR REPLACE FUNCTION public.check_journal_entry_balance",
    "CREATE OR REPLACE FUNCTION public.update_capital_contribution_amount",
    "reference_type = 'capital_contribution'",
    "AND reference_id   = p_contribution_id",
    "original_total_debit  = p_new_amount",
    "original_total_credit = p_new_amount",
    "Post-edit imbalance"
)) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration fixes JE lookup + header columns + balance trigger bypass + final audit" -ForegroundColor Green

# ── 3. فحص TypeScript ─────────────────────────────────────────────
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

# ── 4. git add / commit / push ───────────────────────────────────
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_263.txt"
    $msgLines = @(
        "fix(shareholders): v3.74.263 - the v3.74.262 RPC silently failed to update the JE",
        "",
        "Bug",
        "  After v3.74.262 deployed, the contribution amount on the row got",
        "  updated correctly, but the linked journal entry stayed at the old",
        "  amount. Three separate root causes were stacked inside the new",
        "  RPC, all of which were assumptions about the schema that turned",
        "  out to be wrong:",
        "",
        "  1. The RPC located the JE by reading",
        "       v_contribution.journal_entry_id",
        "     but capital_contributions has no such column. PL/pgSQL late-",
        "     binds %ROWTYPE field access, so the function compiled fine",
        "     and just returned NULL for that lookup at runtime - which",
        "     then raised the 'Linked journal entry not found' error. The",
        "     contribution row had already been written by the OLD route",
        "     code (pre-v3.74.262 multi-PATCH path), which is why Notniche",
        "     ended up with contribution=62300 but JE lines=60000.",
        "",
        "  2. The RPC updated journal_entries.total_amount, but that column",
        "     does not exist either. The header carries",
        "       original_total_debit / original_total_credit",
        "     (matched to currency_code / exchange_rate). When the entry",
        "     is in the company's base currency these equal the new amount.",
        "",
        "  3. check_journal_entry_balance() is FOR EACH ROW and fires after",
        "     the first line's UPDATE while the second line still holds",
        "     the old value - so it saw temporary imbalance (62300 vs",
        "     60000) and raised P0001 before the second UPDATE could run.",
        "",
        "Fix",
        "  Migration 20260621000263_v3_74_263_fix_contribution_rpc_columns.sql:",
        "",
        "  - check_journal_entry_balance() now honours the same",
        "    app.allow_direct_post opt-in flag as the other JE governance",
        "    triggers (added in v3.74.262). The audited RPC opts in, makes",
        "    its two updates, and is then responsible for ending the",
        "    transaction balanced.",
        "",
        "  - update_capital_contribution_amount(...) is rewritten:",
        "      * locates the JE via",
        "          reference_type = 'capital_contribution'",
        "          AND reference_id = p_contribution_id,",
        "      * updates journal_entries.original_total_debit/credit (not",
        "        total_amount),",
        "      * does a final SELECT SUM(debit) / SUM(credit) on the JE's",
        "        lines and raises if they're off by more than 1 cent. This",
        "        makes the temporary trigger bypass safe: governance still",
        "        guarantees a balanced JE at COMMIT.",
        "",
        "Reconciliation",
        "  After deploying the fix on the live database, the contribution",
        "  that the user reported (Notniche, contribution",
        "  ad6eb002-8d7b-4273-a9e8-54a0d6eaf000) was repaired by calling",
        "  the new RPC directly:",
        "",
        "      SELECT update_capital_contribution_amount(",
        "        'ad6eb002-8d7b-4273-a9e8-54a0d6eaf000', 62300);",
        "",
        "  Post-check confirms:",
        "      contrib_amount = 62300.00",
        "      je_dr_total    = 62300.00",
        "      je_cr_total    = 62300.00",
        "      lines_dr       = 62300.00",
        "      lines_cr       = 62300.00",
        "      original_amount stayed 60000.00 (audit trail).",
        "",
        "What didn't change",
        "  - The /api/shareholders/contributions/[id] route is the same",
        "    shape from v3.74.262; only the SQL function it calls changed.",
        "  - All other governance triggers continue to block unaudited",
        "    edits of posted JEs.",
        "  - The reverse-and-recreate workflow is unaffected.",
        "",
        "Files",
        "  supabase/migrations/20260621000263_v3_74_263_fix_contribution_rpc_columns.sql (new)",
        "  lib/version.ts -> 3.74.263"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.263 pushed" -ForegroundColor Green
}
