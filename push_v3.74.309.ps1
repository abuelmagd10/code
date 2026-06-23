$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.308.ps1") { Remove-Item -LiteralPath "push_v3.74.308.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.309"') {
    Write-Host "+ 3.74.309" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# v3.74.308 — تصحيح زر الاعتماد+الشحنة (لسة جزء من نفس النشر)
$ep = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts" -Raw
foreach ($n in @(
    'v3.74.308 — split the load into 3 separate queries',
    'stage: "load_provider"',
    'stage: "load_customer"',
    '[warehouse-approve-with-shipping] load_invoice'
)) {
    if ($ep -notmatch [regex]::Escape($n)) {
        Write-Host "X approve+shipping route missing: $n" -ForegroundColor Red; exit 1
    }
}
if ($ep -match '\.select\([^)]*customers!invoices_customer_id_fkey') {
    Write-Host "X old embedded customers relationship still used in select" -ForegroundColor Red; exit 1
}
if ($ep -match '\.select\([^)]*shipping_providers:shipping_provider_id\(\*\)') {
    Write-Host "X old embedded shipping_providers relationship still used in select" -ForegroundColor Red; exit 1
}
Write-Host "+ v3.74.308 approve+shipping route: 3-query load wired" -ForegroundColor Green

# v3.74.309 — AR integrity correctness
$mig = "supabase/migrations/20260623000309_v3_74_309_ar_integrity_match_actual_journals.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'CREATE OR REPLACE FUNCTION public.ic_ar_balance',
    "EXISTS (",
    "je.reference_type = 'invoice'",
    "je.status         = 'posted'",
    'Supersedes v3.74.307'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ v3.74.309 AR integrity: EXISTS posted invoice journal filter" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_309.txt"
    $msgLines = @(
        'fix(integrity+shipping): v3.74.309 - AR check matches actual journals + clearer shipping errors',
        '',
        'Two fixes, both surfaced from testing INV-00006 on Test Company /',
        'Nasr City branch.',
        '',
        '1) AR integrity check (Supabase function, supersedes v3.74.307)',
        '',
        '   v3.74.307 excluded invoices with approval_status=pending,',
        '   assuming the AR journal is posted at warehouse-approval time.',
        '   In reality this codebase auto-posts the revenue+AR journal',
        '   the moment the invoice transitions to status=sent (legacy',
        '   trigger). On Test Company INV-00006 we saw a -10 drift: the',
        '   journal HAD been posted, but our pending filter dropped the',
        '   invoice from the outstanding sum.',
        '',
        '   New rule: count an invoice on the outstanding side only if a',
        '   POSTED invoice journal entry actually exists for it. The',
        '   filter is now independent of approval_status and works for',
        '   any workflow column the project might switch to later.',
        '',
        '2) Approve+ship endpoint (route.ts, v3.74.308)',
        '',
        '   Owner saw "تعذّر إنشاء الشحنة فى bosta - الفاتورة غير موجودة"',
        '   on an invoice that does exist. The embedded-relationship',
        '   query (`customers!fkey, shipping_providers:fkey`) was failing',
        '   inside PostgREST and the route reported the generic 404',
        '   stage=load_invoice for every join-time failure.',
        '   Split the load into 3 separate queries (invoice / provider /',
        '   customer), each returning the real Supabase error and a',
        '   distinct stage. Added a server-side console.error and a',
        '   debug field on the 404 response so the next failure points',
        '   straight at the real cause.',
        '',
        'Files',
        '  supabase/migrations/20260623000309_v3_74_309_ar_integrity_match_actual_journals.sql (NEW)',
        '  app/api/invoices/[id]/warehouse-approve-with-shipping/route.ts',
        '  lib/version.ts -> 3.74.309',
        '',
        'Migration was applied directly to the production database before',
        'this push; integrity dashboard on Test Company returned to zero.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.309 pushed" -ForegroundColor Green
}
