$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.371.ps1") { Remove-Item -LiteralPath "push_v3.74.371.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.372"') {
    Write-Host "+ 3.74.372" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260626000372_v3_74_372_discount_approvals_infrastructure.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 372: discount_approvals infrastructure" -ForegroundColor Green
} else { Write-Host "X missing migration 372" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'discount_approvals',
    'can_approve_discount',
    'request_discount_approval',
    'decide_discount_approval',
    'cancel_discount_approval'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all expected objects present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_372.txt"
    $msgLines = @(
        'feat(approvals): v3.74.372 - discount approval foundation (Stage 1 of 5)',
        '',
        'Owner asked for management approval on every discount across',
        'four surfaces: sales invoices, purchase invoices, booking',
        'orders, and the invoices auto-generated when bookings are',
        'executed. No threshold - any non-zero discount needs sign-off',
        'from the owner or general manager.',
        '',
        'This first stage is pure infrastructure with zero gates wired',
        'up. Existing modules continue to behave exactly as before.',
        'Nothing reads or writes discount_approvals yet. That keeps',
        'the blast radius at zero while the foundation lands.',
        '',
        'DB',
        '  enum discount_document_type (sales_invoice, purchase_invoice, booking)',
        '  enum discount_approval_status (pending, approved, rejected, cancelled)',
        '  table discount_approvals',
        '    + indexes on company+pending, document, requester',
        '    + updated_at trigger',
        '    + RLS: company-scoped read, requester-only insert,',
        '      approver-or-requester update',
        '  fn can_approve_discount(company, user) -> bool',
        '    matches owner column on companies + roles {owner, admin,',
        '    general_manager} on company_members',
        '  fn request_discount_approval(...) -> approval_id',
        '  fn decide_discount_approval(id, decision, note) -> jsonb',
        '  fn cancel_discount_approval(id) -> jsonb',
        '',
        'Next stages (each safely shippable on its own)',
        '  v3.74.373 - approver inbox UI + realtime notifications',
        '  v3.74.374 - wire booking activation gate (تنفيذ الخدمة)',
        '  v3.74.375 - wire sales invoice posting gate',
        '  v3.74.376 - wire purchase invoice posting gate',
        '',
        'Files',
        '  supabase/migrations/20260626000372_v3_74_372_discount_approvals_infrastructure.sql',
        '  lib/version.ts -> 3.74.372',
        '',
        'Note',
        '  Migration already applied to live DB via Supabase MCP.',
        '  Committing the SQL file so future supabase db reset stays',
        '  consistent with prod.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.372 pushed" -ForegroundColor Green
}
