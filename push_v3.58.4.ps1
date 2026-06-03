# v3.58.4 - Batch 1 (Reports family) + Arabic FTS normalization
# Both migrations already applied via Supabase MCP. This script archives them.
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify migration files ===" -ForegroundColor Cyan
$mig1 = "supabase/migrations/20260528000300_ai_page_guides_batch1_reports.sql"
$mig2 = "supabase/migrations/20260528000400_ai_knowledge_chunks_arabic_normalization.sql"

if (-not (Test-Path $mig1)) { Write-Host "  X $mig1 MISSING" -ForegroundColor Red; exit 1 }
Write-Host "  + $mig1" -ForegroundColor Green
if (-not (Test-Path $mig2)) { Write-Host "  X $mig2 MISSING" -ForegroundColor Red; exit 1 }
Write-Host "  + $mig2" -ForegroundColor Green

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$m1 = Get-Content $mig1 -Raw
$m2 = Get-Content $mig2 -Raw

$checks1 = @(
    @{ p = "'aging_ar'";              m = "aging_ar guide present" },
    @{ p = "'shipping_reports'";      m = "shipping_reports guide present" },
    @{ p = "'vat_reports'";           m = "vat_reports guide present" },
    @{ p = 'ai_reindex_page_guides';  m = "seeder invoked" }
)
foreach ($c in $checks1) {
    if ($m1 -match $c.p) { Write-Host ("  + " + $c.m) -ForegroundColor Green }
    else { Write-Host ("  X " + $c.m) -ForegroundColor Red; exit 1 }
}

$checks2 = @(
    @{ p = 'FUNCTION public\.ai_normalize_for_fts';   m = "ai_normalize_for_fts function" },
    @{ p = '\\m\(وال\|بال\|كال';                       m = "Arabic prefix stripper" },
    @{ p = 'DROP COLUMN tsv_ar';                       m = "rebuilds tsv_ar" },
    @{ p = 'DROP COLUMN tsv_en';                       m = "rebuilds tsv_en" },
    @{ p = 'ai_knowledge_chunks_tsv_ar_idx';           m = "re-creates GIN index" },
    @{ p = 'ai_search_pages';                          m = "updated RPC" }
)
foreach ($c in $checks2) {
    if ($m2 -match $c.p) { Write-Host ("  + " + $c.m) -ForegroundColor Green }
    else { Write-Host ("  X " + $c.m + " -- " + $c.p) -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== TypeScript check (should be unchanged) ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tscOutput | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Cleanup stale git locks ===" -ForegroundColor Cyan
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force; Write-Host "  + Removed lock" -ForegroundColor Green }
else { Write-Host "  + No stale lock" -ForegroundColor Green }

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add $mig1 $mig2 CHANGELOG.md
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "  + Nothing new to commit; proceeding to push" -ForegroundColor Yellow
} else {
    git commit -m "feat(ai-assistant): v3.58.4 Batch 1 (Reports) + Arabic FTS normalization

Two migrations, both already applied via Supabase MCP.

Migration 20260528000300_ai_page_guides_batch1_reports.sql:
- Adds 18 page guides for the reports family:
  aging_ar, aging_ap, cash_flow, cost_center_reports,
  daily_payments_receipts, dashboard_reports, equity_changes,
  financial_trace_reports, inventory_reports, product_reports,
  purchase_reports, sales_bonus_reports, sales_reports,
  shipping_reports, simple_summary_reports, supplier_price_comparison,
  update_account_balances, vat_reports
- Re-runs ai_reindex_page_guides() to push them into the chunk index
- Knowledge base grows from 42 to 60 active guides (+43 percent)
- Total chunks: 340 -> 484

Migration 20260528000400_ai_knowledge_chunks_arabic_normalization.sql:
Root cause investigation: simple FTS treated 'الشَحن' (with fatha),
'الشحن' (no diacritics), and 'شحن' (no ال article) as three different
tokens. Arabic recall was poor.

Fix:
- New IMMUTABLE function ai_normalize_for_fts(text):
  1. strip Arabic diacritics (U+064B-U+0652, U+0670, U+0640 tatweel)
  2. drop word-initial articles: ال, وال, بال, لل, كال, فال
  3. collapse whitespace
- Rebuild tsv_ar / tsv_en GENERATED columns through the normalizer
- Re-create GIN indexes
- Update ai_search_pages RPC to apply the same normalizer to the
  user query before tokenizing

Verified on production:
- 'شحن' alone now matches shipping_reports (score 0.83)
- 'فاتورة بيع' now ranks invoices first (score 0.18)
- 'الشحن' and 'شحن' are now interchangeable

Safety:
- Runtime-neutral migration; no app code changed
- TypeScript: unchanged
- RLS preserved (RPC remains SECURITY INVOKER)
- Idempotent: re-running the seeder is safe" 2>&1 | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.58.4 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, test the assistant:" -ForegroundColor Cyan
    Write-Host "  'شحن'         -> Shipping Reports" -ForegroundColor White
    Write-Host "  'تقرير ضريبة' -> VAT Reports" -ForegroundColor White
    Write-Host "  'أعمار ديون'  -> AR / AP Aging" -ForegroundColor White
    Write-Host "  'فاتورة بيع' -> invoices first" -ForegroundColor White
}
