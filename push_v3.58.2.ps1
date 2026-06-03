# v3.58.2 - Switch findRelevantPages from ILIKE to Postgres FTS RPC
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify migration file ===" -ForegroundColor Cyan
$migPath = "supabase/migrations/20260528000200_ai_search_pages_rpc.sql"
if (Test-Path $migPath) {
    Write-Host "  + Migration file exists" -ForegroundColor Green
} else {
    Write-Host "  X Migration file MISSING" -ForegroundColor Red
    exit 1
}

$mig = Get-Content $migPath -Raw

$migChecks = @(
    @{ p = 'FUNCTION public\.ai_search_pages';            m = "ai_search_pages function defined" },
    @{ p = 'SECURITY INVOKER';                              m = "RLS-aware (SECURITY INVOKER)" },
    @{ p = "v_or_text :=";                                  m = "OR query rewrite present" },
    @{ p = 'ts_rank\(c\.tsv_ar';                            m = "Arabic ts_rank scoring" },
    @{ p = 'ts_rank\(c\.tsv_en';                            m = "English ts_rank scoring" },
    @{ p = "'page_guide_title'\s+THEN 5\.0";                m = "Title source-type weight = 5.0" },
    @{ p = 'GRANT EXECUTE ON FUNCTION public\.ai_search_pages'; m = "Granted to authenticated" }
)

foreach ($c in $migChecks) {
    if ($mig -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== Verify TypeScript changes ===" -ForegroundColor Cyan
$cps = Get-Content "lib/ai/cross-page-search.ts" -Raw

$tsChecks = @(
    @{ p = 'supabase\.rpc\("ai_search_pages"';            m = "calls ai_search_pages RPC" },
    @{ p = 'p_query: query';                                m = "passes raw query to RPC" },
    @{ p = 'p_exclude_page_key: currentPageKey';            m = "passes current page key" },
    @{ p = 'governance && !governance\.isFullAccess';      m = "governance gate preserved" },
    @{ p = 'scored\.sort\(\(a, b\) => b\.score - a\.score\)'; m = "defensive re-sort" }
)

# Confirm the OLD ILIKE-based implementation is GONE
$badPatterns = @(
    @{ p = 'orParts\.push\(';                              m = "old .or() builder removed" },
    @{ p = '\.from\("page_guides"\)';                       m = "no longer queries page_guides directly" },
    @{ p = 'MIN_SCORE = tokens\.length';                    m = "old score floor removed" }
)

foreach ($c in $tsChecks) {
    if ($cps -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

foreach ($b in $badPatterns) {
    if ($cps -match $b.p) {
        Write-Host ("  X " + $b.m + " -- still present: " + $b.p) -ForegroundColor Red
        exit 1
    } else {
        Write-Host ("  + " + $b.m) -ForegroundColor Green
    }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Cleanup stale git locks ===" -ForegroundColor Cyan
if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "  + Removed stale .git/index.lock" -ForegroundColor Green
} else {
    Write-Host "  + No stale lock" -ForegroundColor Green
}

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add supabase/migrations/20260528000200_ai_search_pages_rpc.sql `
        lib/ai/cross-page-search.ts `
        CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ai-assistant): v3.58.2 switch find-page from ILIKE to Postgres FTS

Replaces the keyword ILIKE search in findRelevantPages() with a
Postgres full-text search RPC over ai_knowledge_chunks. This is
the runtime cutover for the Phase 3 RAG foundation built in
v3.58.0 and v3.58.1.

Migration 20260528000200_ai_search_pages_rpc.sql:
- Creates ai_search_pages(query, lang, exclude_page_key, limit) RPC
- SECURITY INVOKER so user JWT + RLS still apply
- Cleans tsquery special chars before building the query
- Converts whitespace-separated tokens to OR semantics
- ts_rank-weighted by source_type:
    title       +5.0
    description +2.5
    step        +1.5
    tip         +1.0
- Aggregates chunks back to page_key, returns title + description +
  best snippet + score + match_count in a single round-trip
- Granted to authenticated

lib/ai/cross-page-search.ts:
- findRelevantPages() now delegates matching+ranking to the RPC
- Body shrunk from ~120 lines to ~50 lines
- Removed: hand-rolled scoring loop, phrase bonus, multi-token gate,
  client-side MIN_SCORE - all handled inside the RPC now
- Preserved: governance gate (allowedResources filter), top-3 cap,
  PageSuggestion interface (same shape, no client changes needed)

Verified on production:
  ai_search_pages('فاتورة بيع', 'ar', 'settings', 5) returns:
    1. fixed_assets   (score 0.076, 2 matches)
    2. invoices       (score 0.057)
    3. estimates      (score 0.046)
    4. bills          (score 0.046)
    5. purchase_returns (score 0.046)
  All five hits are genuinely relevant. Previous ILIKE returned
  noise like dashboard, branches, warehouses.

Safety:
- RLS unchanged (SECURITY INVOKER on RPC)
- Governance enforcement unchanged (still applied client-side after RPC)
- /api/ai/find-page route unchanged - no client work needed
- TypeScript: OK
- Migration already applied via Supabase MCP" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.58.2 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, test the assistant with:" -ForegroundColor Cyan
    Write-Host "  'فاتورة بيع'    -> should suggest /invoices among top 3" -ForegroundColor White
    Write-Host "  'مخزون منتج'   -> products/inventory pages" -ForegroundColor White
    Write-Host "  'شحن'           -> any shipping-related page" -ForegroundColor White
}
