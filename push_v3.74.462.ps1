$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.461.ps1") { Remove-Item -LiteralPath "push_v3.74.461.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.462"') {
    Write-Host "+ 3.74.462" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000462_v3_74_462_editor_name_in_notice.sql")) {
    Write-Host "X migration 462 missing" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "components/bills/BillAmendmentBanner.tsx")) {
    Write-Host "X BillAmendmentBanner.tsx missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration + banner component present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BI\. ?اسم المعدّل') {
    Write-Host "X CONTRACTS.md missing Section BI" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BI" -ForegroundColor Green

$apiFile = Get-Content -LiteralPath "app/api/discount-approvals/route.ts" -Raw
if ($apiFile -notmatch 'documentIdParam') {
    Write-Host "X API missing document_id filter" -ForegroundColor Red; exit 1
}

$billPage = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($billPage -notmatch 'BillAmendmentBanner') {
    Write-Host "X bill view missing BillAmendmentBanner" -ForegroundColor Red; exit 1
}
$invPage = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($invPage -notmatch 'BillAmendmentBanner') {
    Write-Host "X invoice view missing BillAmendmentBanner" -ForegroundColor Red; exit 1
}
Write-Host "+ bill + invoice views render BillAmendmentBanner" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_462.txt"
    $msgLines = @(
        'feat(notifications+banner): v3.74.462 - editor name + change summary + amendment banner on bill/invoice view',
        '',
        'Owner asked: the reapproval notification says the bill was',
        'edited but not WHO edited it or WHAT changed; and when I open',
        'the bill view from the notification there is no context.',
        '',
        'Notification',
        '   enforce_governance_on_insert now resolves editor via',
        '   last_edited_by_user_id -> employees.full_name ->',
        '   auth.users.email -> uuid prefix, and appends a short',
        '   summary line: which of {total, shipping, discount,',
        '   tax_inclusive, discount_position} changed and by how much.',
        '   Message reads:',
        '     "قام foodcana@... بتعديل فاتورة مشتريات رقم BILL-0001',
        '      وتحتاج إلى إعادة اعتماد إداري.',
        '      التغييرات: الإجمالى 45.60 -> 145.60، الشحن 0.00 -> 100.00"',
        '',
        '   The trigger was bills-only; now attached to invoices too',
        '   with the same summary + notification pair on the sales side.',
        '',
        'View banner',
        '   New BillAmendmentBanner component. Fetches',
        '   /api/discount-approvals?document_id=<id> (new filter),',
        '   finds the latest pending amendment approval with a',
        '   supersedes_approval_id, and shows: editor email, before/',
        '   after total (with delta sign), and item counts (added,',
        '   removed, modified). Link to /approvals for the full diff.',
        '   Rendered by bills/[id]/page.tsx and invoices/[id]/page.tsx.',
        '   Silent 403 when the viewer is not an approver.',
        '',
        'Files',
        '   supabase/migrations/20260701000462_v3_74_462_editor_name_in_notice.sql',
        '   components/bills/BillAmendmentBanner.tsx',
        '   app/api/discount-approvals/route.ts',
        '   app/bills/[id]/page.tsx',
        '   app/invoices/[id]/page.tsx',
        '   CONTRACTS.md (Section BI added)',
        '   lib/version.ts -> 3.74.462'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.462 pushed - editor name + change summary + view banner" -ForegroundColor Green
}
