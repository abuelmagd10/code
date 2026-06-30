$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.424.ps1") { Remove-Item -LiteralPath "push_v3.74.424.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.425"') {
    Write-Host "+ 3.74.425" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000425_v3_74_425_lock_approved_docs.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 425 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'Y\. ?القفل الصارم') {
    Write-Host "X CONTRACTS.md missing Section Y" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section Y" -ForegroundColor Green

$poView = Get-Content -LiteralPath "app/purchase-orders/[id]/page.tsx" -Raw
if ($poView -notmatch 'locked_banner') {
    Write-Host "X PO view missing strict-lock banner" -ForegroundColor Red; exit 1
}
if ($poView -notmatch "'draft', 'pending_approval', 'rejected'") {
    Write-Host "X PO view edit button condition not updated" -ForegroundColor Red; exit 1
}
Write-Host "+ PO view wired up correctly" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_425.txt"
    $msgLines = @(
        'feat(approvals): v3.74.425 - strict lock on approved POs and posted bills',
        '',
        'Owner spotted a follow-up gap after v3.74.424:',
        '   po_evaluate_discount_approval was guarded to only run while',
        '   the PO was in draft or pending_approval. Anyone with edit',
        '   rights (owner/admin/gm) could amend discount or items on an',
        '   approved PO without a fresh approval cycle. Same on bills',
        '   past draft.',
        '',
        'Four BEFORE triggers now refuse tampering at DB level:',
        '   po_protect_approved on purchase_orders',
        '   po_item_protect_approved on purchase_order_items',
        '   bill_protect_posted on bills',
        '   bill_item_protect_posted on bill_items',
        '',
        'Each lets status transitions through, so void_bill_atomic still',
        'works (it moves PO back to pending_approval; once unlocked, the',
        'evaluator opens a new approval cycle for any edited discount).',
        '',
        'Skip token (app.skip_po_lock) is honored on the items triggers',
        'for future system flows that need to legitimately rewrite items.',
        '',
        'UI: PO view hides Edit when status is approved/sent/received',
        'and shows a blue banner explaining the lock + the void path.',
        '',
        'Baseline (Section Y)',
        '   po_protect_approved_trg + po_item_protect_approved_trg',
        '   bill_protect_posted_trg + bill_item_protect_posted_trg',
        '   four matching triggers on the four tables',
        '',
        'Files',
        '   supabase/migrations/20260630000425_v3_74_425_lock_approved_docs.sql',
        '   app/purchase-orders/[id]/page.tsx',
        '   CONTRACTS.md (Section Y added)',
        '   lib/version.ts -> 3.74.425'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.425 pushed - approved docs locked at DB" -ForegroundColor Green
}
