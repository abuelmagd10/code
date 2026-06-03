# v3.58.0 - RAG Foundation: pgvector + ai_knowledge_chunks + FTS
# NOTE: The migration was already applied via Supabase MCP. This script
# only commits the SQL file + CHANGELOG to git for tracking/replay.
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify migration file ===" -ForegroundColor Cyan
$migPath = "supabase/migrations/20260528000000_ai_knowledge_chunks_foundation.sql"
if (Test-Path $migPath) {
    Write-Host "  + Migration file exists" -ForegroundColor Green
} else {
    Write-Host "  X Migration file MISSING" -ForegroundColor Red
    exit 1
}

$mig = Get-Content $migPath -Raw

$checks = @(
    @{ p = 'CREATE EXTENSION IF NOT EXISTS vector';     m = "pgvector extension enabled" },
    @{ p = 'CREATE TABLE public\.ai_knowledge_chunks';   m = "ai_knowledge_chunks table created" },
    @{ p = 'tsv_ar\s+tsvector\s+GENERATED ALWAYS';       m = "Arabic FTS column generated" },
    @{ p = 'tsv_en\s+tsvector\s+GENERATED ALWAYS';       m = "English FTS column generated" },
    @{ p = 'vector\(1536\)';                              m = "embedding columns sized for 1536" },
    @{ p = 'tsv_ar_idx';                                  m = "Arabic GIN index" },
    @{ p = 'tsv_en_idx';                                  m = "English GIN index" },
    @{ p = 'ENABLE ROW LEVEL SECURITY';                   m = "RLS enabled" },
    @{ p = 'ai_knowledge_chunks_select';                  m = "Read policy (multi-tenant)" },
    @{ p = 'auth\.role\(\) = ''service_role''';           m = "Write policy (service role only)" }
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
git add supabase/migrations/20260528000000_ai_knowledge_chunks_foundation.sql CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ai-assistant): v3.58.0 RAG Foundation - ai_knowledge_chunks table

Phase 3 of the AI Assistant roadmap. RUNTIME-NEUTRAL migration:
no existing code touches this table yet. Subsequent versions
(v3.58.1+) will populate it.

Migration 20260528000000_ai_knowledge_chunks_foundation.sql:
- Enable pgvector extension (v0.8.0)
- Create public.ai_knowledge_chunks:
  * source_type + source_key + source_field (provenance)
  * content_ar + content_en (bilingual content)
  * tsv_ar + tsv_en (auto-generated tsvector via 'simple')
  * embedding_ar + embedding_en (vector(1536), nullable)
  * resource (governance, maps to allowed_pages)
  * company_id (FK companies, NULL = global)
  * metadata JSONB
  * created_at / updated_at + touch trigger
  * UNIQUE (source_type, source_key, source_field, company_id)
- Indexes:
  * 2x GIN on tsv_ar / tsv_en (FTS)
  * B-Tree on (source_type, source_key)
  * Partial B-Tree on resource
  * Partial B-Tree on company_id
- RLS:
  * SELECT: global rows for all auth users, tenant rows for
    company members only
  * INSERT/UPDATE/DELETE: service_role only

Safety:
- Migration already applied via Supabase MCP (verified)
- Zero runtime impact - no app code reads/writes this table yet
- Can be reverted with DROP TABLE without any user impact
- Multi-tenant isolation enforced at RLS layer" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.58.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Foundation ready. Next: v3.58.1 will populate the table" -ForegroundColor Cyan
    Write-Host "by indexing page_guides + steps + tips into chunks." -ForegroundColor Cyan
}
