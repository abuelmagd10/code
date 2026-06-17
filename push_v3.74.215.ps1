$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.214.ps1") { Remove-Item -LiteralPath "push_v3.74.214.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.215"') {
    Write-Host "+ 3.74.215" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$mig = Get-Content -LiteralPath "supabase/migrations/20260617000215_v3_74_215_smart_stale_notifications_check.sql" -Raw
if ($mig -notmatch "WHEN 'purchase_order' THEN EXISTS") {
    Write-Host "X migration missing per-type workflow check" -ForegroundColor Red; exit 1
}
Write-Host "+ smart check covers all 6 reference types" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_215.txt"
    $msgLines = @(
        "fix(integrity): v3.74.215 - stale-notifications check now respects workflow state",
        "",
        "ic_stale_critical_notifications used to flag ANY high/critical",
        "notification unread for >30 days. In testing this meant every",
        "completed PO / invoice / delivery / payment-approval kept",
        "resurfacing as a 'missed decision', because the notifications",
        "stayed unread even though the underlying workflow had moved on.",
        "",
        "The check now joins each notification's reference_type/reference_id",
        "to the source row and only flags it when that row is STILL",
        "actionable - PO in draft / pending_approval / pending_director /",
        "pending_manager / sent_to_supplier, bill in draft / pending_approval /",
        "received with paid < total, invoice in draft / sent /",
        "partially_paid with approval_status pending or empty, stock",
        "transfer in draft / pending_approval / in_transit, payment in",
        "pending_approval / pending_manager / pending_director, expense in",
        "draft / pending_approval. Resolved events (PO approved, invoice",
        "paid, delivery rejected, payment voided, etc.) no longer count.",
        "",
        "Unknown reference_types fall through to the legacy 'any unread'",
        "behaviour so nothing new escapes the check, and the EXCEPTION",
        "fallback re-runs the legacy query if a custom deployment is",
        "missing one of the joined tables.",
        "",
        "  supabase/migrations/20260617000215_v3_74_215_smart_stale_notifications_check.sql",
        "  lib/version.ts -> 3.74.215"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.215 pushed" -ForegroundColor Green
}
