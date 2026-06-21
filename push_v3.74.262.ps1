$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.261.ps1") { Remove-Item -LiteralPath "push_v3.74.261.ps1" -Force }

# ── 1. الإصدار ────────────────────────────────────────────────────
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.262"') {
    Write-Host "+ 3.74.262" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ── 2. الـ migration ──────────────────────────────────────────────
$mig = Get-Content -LiteralPath "supabase/migrations/20260621000262_v3_74_262_fix_contribution_edit.sql" -Raw
foreach ($c in @(
    "CREATE OR REPLACE FUNCTION public.enforce_posted_entry_no_edit",
    "CREATE OR REPLACE FUNCTION public.update_capital_contribution_amount",
    "app.allow_direct_post",
    "set_config('app.allow_direct_post', 'true', true)",
    "GRANT EXECUTE ON FUNCTION public.update_capital_contribution_amount"
)) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration: header trigger honours app.allow_direct_post + new RPC update_capital_contribution_amount" -ForegroundColor Green

# ── 3. API route ─────────────────────────────────────────────────
$api = Get-Content -LiteralPath "app/api/shareholders/contributions/[id]/route.ts" -Raw
foreach ($c in @(
    'supabase.rpc(',
    'update_capital_contribution_amount',
    'p_contribution_id: id',
    'p_new_amount: newAmount',
    'p_new_date: newDate || null'
)) {
    if ($api -notmatch [regex]::Escape($c)) { Write-Host "X API route missing $c" -ForegroundColor Red; exit 1 }
}
# Make sure we removed the direct .update() on journal_entry_lines
if ($api -match 'from\("journal_entry_lines"\)\s*\r?\n\s*\.update') {
    Write-Host "X API still does direct journal_entry_lines.update()" -ForegroundColor Red; exit 1
}
Write-Host "+ /api/shareholders/contributions/[id] uses RPC update_capital_contribution_amount; no more direct lines update" -ForegroundColor Green

# ── 4. فحص TypeScript ─────────────────────────────────────────────
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

# ── 5. git add / commit / push ───────────────────────────────────
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_262.txt"
    $msgLines = @(
        "fix(shareholders): v3.74.262 - editing a contribution amount no longer hits P0001",
        "",
        "Bug",
        "  Editing a shareholder contribution's amount returned HTTP 400 with",
        "  PostgREST error code P0001. Root cause: the contribution-edit flow",
        "  does three separate PATCHes (capital_contributions row, debit line,",
        "  credit line, +optional JE header date) and the two governance",
        "  triggers (enforce_posted_entry_lines_no_edit on journal_entry_lines",
        "  + enforce_posted_entry_no_edit on journal_entries) both refused the",
        "  update because the parent JE is 'posted'. The lines trigger had",
        "  already gained an opt-in bypass via app.allow_direct_post in",
        "  20260325163000_fix_allow_direct_post_on_lines.sql, but the header",
        "  trigger never got the same treatment - and the previous PATCH route",
        "  couldn't set the flag from PostgREST anyway because each REST call",
        "  is its own transaction.",
        "",
        "Fix",
        "  Migration 20260621000262_v3_74_262_fix_contribution_edit.sql:",
        "    1. enforce_posted_entry_no_edit() now also honours",
        "       current_setting('app.allow_direct_post', true) = 'true'.",
        "       Same opt-in semantics as the lines trigger - no behaviour",
        "       change for any caller that doesn't explicitly set the flag.",
        "    2. New RPC update_capital_contribution_amount(",
        "         p_contribution_id, p_new_amount, p_new_date, p_new_notes,",
        "         p_user_id)",
        "       which:",
        "         - validates the input,",
        "         - locks the contribution row,",
        "         - sets LOCAL app.allow_direct_post = 'true',",
        "         - finds the Dr and Cr lines and rewrites them in lockstep,",
        "         - updates total_amount + (optional) entry_date on the JE",
        "           header,",
        "         - then rewrites the contribution row (amount, date, notes,",
        "           original_amount, last_edited_at, last_edited_by).",
        "       SECURITY DEFINER + GRANT to authenticated and service_role.",
        "",
        "  app/api/shareholders/contributions/[id]/route.ts:",
        "    Replaces the three separate .update() calls with a single",
        "    supabase.rpc('update_capital_contribution_amount', ...). The",
        "    PRIVILEGED_ROLES + open-period guard checks at the top of the",
        "    handler are unchanged.",
        "",
        "Why this is safe for governance",
        "  - app.allow_direct_post is SESSION LOCAL. It dies with the",
        "    transaction and can't leak across requests.",
        "  - Only SECURITY DEFINER RPCs can set it for the wrapped query;",
        "    a regular PostgREST PATCH cannot smuggle it in.",
        "  - The new RPC is the only contribution-edit path now; the API",
        "    route does no direct writes to journal_entry_lines or the JE",
        "    header.",
        "  - All other update flows on posted JEs continue to be blocked.",
        "",
        "Files",
        "  supabase/migrations/20260621000262_v3_74_262_fix_contribution_edit.sql (new)",
        "  app/api/shareholders/contributions/[id]/route.ts",
        "  lib/version.ts -> 3.74.262"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.262 pushed" -ForegroundColor Green
}
