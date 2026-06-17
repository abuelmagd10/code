$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.204.ps1") { Remove-Item -LiteralPath "push_v3.74.204.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.205"') {
    Write-Host "+ 3.74.205" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "supabase/migrations/20260617000205_v3_74_205_apply_customer_credit_unique_ref.sql")) {
    Write-Host "X missing migration file" -ForegroundColor Red; exit 1
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260617000205_v3_74_205_apply_customer_credit_unique_ref.sql" -Raw
if ($mig -notmatch "v_journal_ref_id\s+uuid\s+:=\s+gen_random_uuid") {
    Write-Host "X migration missing per-call UUID" -ForegroundColor Red; exit 1
}
if ($mig -notmatch "status IN \('active', 'partially_used'\)") {
    Write-Host "X migration FIFO loop still status='active' only" -ForegroundColor Red; exit 1
}
Write-Host "+ migration carries the per-call UUID + partially_used fix" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_205.txt"
    $msgLines = @(
        "fix(credit): v3.74.205 - second credit application on the same invoice no longer collides",
        "",
        "Symptom: applying customer credit to an invoice that already received",
        "a credit application raised DUPLICATE_JOURNAL_VIOLATION with",
        "reference_type=credit_applied and reference_id=<invoice id>.",
        "",
        "Same bug class as v3.74.182 (vendor refund), now fixed for credit",
        "application. The RPC apply_customer_credit_to_invoice was writing",
        "the invoice id as the JE reference_id, so the unique guard",
        "(company, reference_type, reference_id) rejected the second call.",
        "",
        "Fix:",
        "  - v_journal_ref_id := gen_random_uuid() is the JE reference_id now.",
        "    Each application has its own JE reference; the invoice link is",
        "    preserved via customer_credit_ledger.source_id (still the",
        "    invoice id), the payments row's invoice_id, and the JE",
        "    description.",
        "  - FIFO consumption loop now reads status IN ('active','partially_used').",
        "    Once a credit lot's status had ever flipped to partially_used",
        "    (the auto-fill trigger does this on the very first touch), the",
        "    old filter would skip it and v_remaining_to_apply could not",
        "    drain. Same bug class as v3.74.121 / v3.74.199.",
        "  - status terminal value normalised to 'used' / 'partially_used' /",
        "    'active' to match the rest of the codebase ('exhausted' was a",
        "    dead branch).",
        "",
        "  supabase/migrations/20260617000205_v3_74_205_apply_customer_credit_unique_ref.sql",
        "  lib/version.ts -> 3.74.205"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.205 pushed" -ForegroundColor Green
}
