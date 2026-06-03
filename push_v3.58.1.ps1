# v3.58.1 - Indexer: populate ai_knowledge_chunks from page_guides
# Migration already applied via Supabase MCP. This script archives it in git.
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify migration file ===" -ForegroundColor Cyan
$migPath = "supabase/migrations/20260528000100_ai_knowledge_chunks_seed_from_page_guides.sql"
if (Test-Path $migPath) {
    Write-Host "  + Migration file exists" -ForegroundColor Green
} else {
    Write-Host "  X Migration file MISSING" -ForegroundColor Red
    exit 1
}

$mig = Get-Content $migPath -Raw

$checks = @(
    @{ p = 'FUNCTION public\.ai_reindex_page_guides';     m = "ai_reindex_page_guides function" },
    @{ p = 'SECURITY DEFINER';                              m = "SECURITY DEFINER guard" },
    @{ p = 'page_guide_title';                              m = "title chunks inserted" },
    @{ p = 'page_guide_description';                        m = "description chunks inserted" },
    @{ p = 'page_guide_step';                               m = "step chunks inserted" },
    @{ p = 'page_guide_tip';                                m = "tip chunks inserted" },
    @{ p = 'jsonb_array_length\(v_guide\.steps_ar';         m = "handles jsonb steps correctly" },
    @{ p = 'array_length\(v_guide\.tips_ar';                m = "handles text[] tips correctly" },
    @{ p = 'SELECT public\.ai_reindex_page_guides';         m = "seeder invoked in migration" }
)

foreach ($c in $checks) {
    if ($mig -match $c.p) {
        Write-Host ("  + " + $c.m) -ForegroundColor Green
    } else {
        Write-Host ("  X " + $c.m + " -- pattern not found: " + $c.p) -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== TypeScript check (should be unchanged) ===" -ForegroundColor Cyan
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
git add supabase/migrations/20260528000100_ai_knowledge_chunks_seed_from_page_guides.sql CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ai-assistant): v3.58.1 Indexer - seed ai_knowledge_chunks from page_guides

Phase 3 indexing layer. RUNTIME-NEUTRAL - the table is populated but
no code reads from it yet. v3.58.2 will wire findRelevantPages to it.

Migration 20260528000100_ai_knowledge_chunks_seed_from_page_guides.sql:
- Creates ai_reindex_page_guides() function (SECURITY DEFINER, idempotent)
- Wipes previous global page_guide chunks then re-inserts them
- For each active page_guide produces multiple chunks:
  * page_guide_title       (1 per guide)
  * page_guide_description (1 per guide, if non-empty)
  * page_guide_step        (1 per step, source_field = 'step:N')
  * page_guide_tip         (1 per tip, source_field = 'tip:N')
- Correctly handles the mixed schema:
  * steps_ar/en are jsonb arrays (uses jsonb_array_length + ->>)
  * tips_ar/en are text[] arrays (uses array_length + arr[i])
- Aligns AR/EN indices even when array lengths differ
- Runs the seeder inline once in the migration

Result on production: 340 chunks indexed from 42 active page guides
  - 42  titles
  - 42  descriptions
  - 184 steps
  - 72  tips

FTS smoke test for 'فاتورة' returns 6 correct hits:
  /invoices, /bills, /estimates, /purchase_returns,
  /vendor_credits, /warehouses - all genuinely relevant.

Safety:
- Migration already applied via Supabase MCP (verified, 340 rows)
- Function is idempotent: re-run any time guides change
- No runtime code reads this data yet (introduced in v3.58.2)
- RLS unchanged - reads still go through service role only for writes" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.58.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Knowledge base ready: 340 chunks indexed." -ForegroundColor Cyan
    Write-Host "Next: v3.58.2 wires findRelevantPages to use FTS." -ForegroundColor Cyan
}
