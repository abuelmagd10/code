# v3.56.3 - Cross-Page Knowledge Search (without Ollama or pgvector)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify new files ===" -ForegroundColor Cyan

if (Test-Path "lib/ai/cross-page-search.ts") {
    Write-Host "  + lib/ai/cross-page-search.ts exists" -ForegroundColor Green
} else {
    Write-Host "  X lib/ai/cross-page-search.ts MISSING" -ForegroundColor Red
    exit 1
}

if (Test-Path "app/api/ai/find-page/route.ts") {
    Write-Host "  + app/api/ai/find-page/route.ts exists" -ForegroundColor Green
} else {
    Write-Host "  X app/api/ai/find-page/route.ts MISSING" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Verify markers in guide-panel.tsx ===" -ForegroundColor Cyan
$panel = Get-Content "components/ai-assistant/guide-panel.tsx" -Raw

$checks = @(
    @{ p = 'import type \{ PageSuggestion \} from "@/lib/ai/cross-page-search"'; m = "PageSuggestion type imported" },
    @{ p = 'relatedPages\?: PageSuggestion\[\]';                                  m = "ChatMessage extended with relatedPages" },
    @{ p = 'relatedPagesTitle: "ربما تقصد إحدى هذه الصفحات"';                    m = "Arabic label present" },
    @{ p = 'relatedPagesTitle: "You might be looking for"';                       m = "English label present" },
    @{ p = '/api/ai/find-page\?q=';                                                m = "find-page API called from client" },
    @{ p = 'function RelatedPagesBlock\(';                                         m = "RelatedPagesBlock component present" }
)

foreach ($c in $checks) {
    if ($panel -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== Verify cross-page-search.ts content ===" -ForegroundColor Cyan
$cps = Get-Content "lib/ai/cross-page-search.ts" -Raw

$cpsChecks = @(
    @{ p = 'findRelevantPages';   m = "findRelevantPages exported" },
    @{ p = 'tokenize';            m = "tokenize helper present" },
    @{ p = 'STOP_WORDS_AR';       m = "Arabic stop words present" },
    @{ p = 'pageKeyToRoute';      m = "page key -> route mapping present" },
    @{ p = '\.from\("page_guides"\)'; m = "queries page_guides table" }
)

foreach ($c in $cpsChecks) {
    if ($cps -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m) -ForegroundColor Red
        exit 1
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
git add lib/ai/cross-page-search.ts `
        app/api/ai/find-page/route.ts `
        components/ai-assistant/guide-panel.tsx `
        CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ai-assistant): v3.56.3 Cross-Page Knowledge Search

When the user asks something that isn't about the current page,
the assistant now searches all 91 registered pages and suggests
the right one. Works WITHOUT Ollama or pgvector.

New files:
- lib/ai/cross-page-search.ts (170 lines)
  * findRelevantPages(supabase, query, currentPageKey, lang)
  * SQL ILIKE on page_guides title + description
  * Arabic + English stop words
  * Score: title +3, description +2 per token
  * Excludes the current page
  * Returns top 3 matches
  * Respects RLS

- app/api/ai/find-page/route.ts (~50 lines)
  * GET endpoint with auth + company check
  * Read-only

Updated components/ai-assistant/guide-panel.tsx:
- Import PageSuggestion type
- ChatMessage extended with relatedPages
- After handleSend completes, fetch /api/ai/find-page in parallel
  (silent on failure)
- Attach matches to the latest assistant message
- New RelatedPagesBlock renders suggestions as clickable cards
- Labels:
  * AR: 'ربما تقصد إحدى هذه الصفحات' / 'افتح الصفحة'
  * EN: 'You might be looking for' / 'Open page'

Safety:
- Zero changes to existing /api/ai/* endpoints
- Zero changes to DB / migrations
- Zero changes to lib/ai/copilot-service.ts
- Read-only operation respecting RLS
- Silent failure (does not block chat)
- TypeScript: OK" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.56.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel rebuild, test on /settings:" -ForegroundColor Cyan
    Write-Host "  Ask: 'كيف اضيف شركة شحن'" -ForegroundColor White
    Write-Host "  Below the assistant reply -> a new card:" -ForegroundColor White
    Write-Host "    'ربما تقصد إحدى هذه الصفحات'" -ForegroundColor White
    Write-Host "    [Suppliers / Shipping / etc]" -ForegroundColor White
    Write-Host "  Click any card -> navigates to that page" -ForegroundColor White
}
